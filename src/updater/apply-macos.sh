#!/bin/sh
# Goban Studio update helper (macOS), v5.
#
# The running app writes this file from its own embedded copy (it is never
# downloaded), starts it detached, and quits once this script has proved it
# runs. This script then:
#
#   0. (v13) takes the installation's lock — a directory
#      "<parent>/.<name>.goban-lock" holding this script's pid; another
#      helper for the same app (a live pid) means this one changes nothing —
#      and creates the "started" marker the app is waiting for. The marker
#      is created exclusively: if the app already gave up waiting and
#      claimed it, this helper exits without touching anything;
#   1. waits for the app process to exit;
#   2. copies the verified, unpacked new app next to the installed one
#      (same volume, so the swap is two renames);
#   3. renames the installed app to a hidden backup and the copy into its
#      place, keeping the installed name (e.g. "Goban Studio.app");
#   4. opens the new app with --goban-update-ack=<file> and waits for the
#      new app to write that file (it does once its page is up);
#   5. on success removes the backup; on any failure puts the old app back
#      and opens it with --goban-update-failed.
#
# Usage:
#   apply-macos.sh <app-pid> <installed.app> <staged.app> <ack-file> <log-file> [ack-timeout-s] [cleanup-dir] [started-file]
#
# Exit codes: 0 updated; 1 rolled back (old app restored); 2 nothing was
# changed (bad arguments, another helper holds the lock, the app gave up
# waiting, the app did not exit, the copy failed); 3 the rollback itself
# failed (the old app is left at the backup path, logged).
#
# Environment: GOBAN_UPDATE_EXIT_TIMEOUT (seconds to wait for the app to
# exit, default 300) is read so the CI tests can shorten it; nothing else.

set -u
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
umask 022
trap '' HUP INT

APP_PID=${1:-}
TARGET=${2:-}
STAGED=${3:-}
ACK=${4:-}
LOG=${5:-/dev/null}
ACK_TIMEOUT=${6:-90}
CLEANUP=${7:-}
STARTED=${8:-}
EXIT_TIMEOUT=${GOBAN_UPDATE_EXIT_TIMEOUT:-300}

log() {
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" "$*" >> "$LOG" 2>/dev/null
}

case "$APP_PID" in '' | *[!0-9]*) log "bad pid '$APP_PID'"; exit 2 ;; esac
case "$ACK_TIMEOUT" in '' | *[!0-9]*) ACK_TIMEOUT=90 ;; esac
case "$EXIT_TIMEOUT" in '' | *[!0-9]*) EXIT_TIMEOUT=300 ;; esac
case "$TARGET" in /*.app) ;; *) log "target is not an absolute .app path: '$TARGET'"; exit 2 ;; esac
case "$STAGED" in /*.app) ;; *) log "staged is not an absolute .app path: '$STAGED'"; exit 2 ;; esac
case "$ACK" in /*/goban-update-ack-*.txt) ;; *) log "bad ack path '$ACK'"; exit 2 ;; esac
case "$STARTED" in '' | /*/goban-update-started-*.txt) ;; *) log "bad started path '$STARTED'"; exit 2 ;; esac

PARENT=$(dirname "$TARGET")
NAME=$(basename "$TARGET")
NEW="$PARENT/.$NAME.goban-new-$$"
OLD="$PARENT/.$NAME.goban-old-$$"
FAILED="$PARENT/.$NAME.goban-failed-$$"
LOCK="$PARENT/.$NAME.goban-lock"

log "update: target=$TARGET staged=$STAGED pid=$APP_PID"

if [ ! -d "$TARGET/Contents/MacOS" ]; then log "installed app not found"; exit 2; fi
if [ ! -d "$STAGED/Contents/MacOS" ]; then log "staged app not found"; exit 2; fi

# 0. One helper per installation. mkdir is atomic; the pid inside tells a
# live holder from one that died (a stale lock is taken over). A lock whose
# pid is not written yet is someone else's for a minute.
take_lock() {
  if mkdir "$LOCK" 2>/dev/null; then
    echo "$$" > "$LOCK/pid"
    return 0
  fi
  other=$(cat "$LOCK/pid" 2>/dev/null)
  case "$other" in
    '' | *[!0-9]*)
      if [ -z "$(find "$LOCK" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then return 1; fi ;;
    *)
      if kill -0 "$other" 2>/dev/null; then return 1; fi ;;
  esac
  log "taking over a stale lock (pid '$other')"
  rm -rf "$LOCK" 2>/dev/null
  mkdir "$LOCK" 2>/dev/null || return 1
  echo "$$" > "$LOCK/pid"
}
release_lock() {
  if [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ]; then rm -rf "$LOCK" 2>/dev/null; fi
}
if ! take_lock; then
  log "another update helper is working on $TARGET; nothing changed"
  exit 2
fi
trap release_lock EXIT

# Tell the app this helper runs (it quits only then). Exclusive: if the app
# stopped waiting, it claimed the marker and this helper must not go on.
if [ -n "$STARTED" ]; then
  if ! ( set -C; printf 'started %s\n' "$$" > "$STARTED" ) 2>/dev/null; then
    log "the app stopped waiting for this helper; nothing changed"
    exit 2
  fi
fi

# 1. Wait for the app to quit.
waited=0
while kill -0 "$APP_PID" 2>/dev/null; do
  if [ "$waited" -ge $((EXIT_TIMEOUT * 2)) ]; then
    log "the app (pid $APP_PID) did not exit within ${EXIT_TIMEOUT}s; nothing changed"
    exit 2
  fi
  sleep 0.5
  waited=$((waited + 1))
done
log "app exited"

# Processes started from inside the installed bundle (KataGo) end with the
# app; give them a moment, then stop any that are left.
stop_bundle_processes() {
  bundle=$1
  ps -axo pid=,comm= 2>/dev/null | while read -r pid comm; do
    case "$comm" in "$bundle"/*) kill "$pid" 2>/dev/null && log "stopped $pid ($comm)" ;; esac
  done
}
sleep 1
stop_bundle_processes "$TARGET"

relaunch_old() {
  /usr/bin/open "$TARGET" --args --goban-update-failed >/dev/null 2>&1 || log "could not reopen the previous version"
}

# 2. Copy next to the installed app (same volume).
rm -rf "$NEW" 2>/dev/null
if ! ditto "$STAGED" "$NEW" 2>>"$LOG"; then
  log "copy failed; nothing changed"
  rm -rf "$NEW" 2>/dev/null
  relaunch_old
  exit 2
fi

# 3. Swap.
if ! mv "$TARGET" "$OLD" 2>>"$LOG"; then
  log "could not move the installed app aside; nothing changed"
  rm -rf "$NEW"
  relaunch_old
  exit 2
fi
if ! mv "$NEW" "$TARGET" 2>>"$LOG"; then
  log "could not move the new app into place; restoring"
  if mv "$OLD" "$TARGET" 2>>"$LOG"; then
    rm -rf "$NEW"
    relaunch_old
    exit 1
  fi
  log "ROLLBACK FAILED: the previous version is at $OLD"
  exit 3
fi
log "swapped; backup at $OLD"

rollback() {
  log "rolling back: $1"
  stop_bundle_processes "$TARGET"
  sleep 1
  if mv "$TARGET" "$FAILED" 2>>"$LOG" && mv "$OLD" "$TARGET" 2>>"$LOG"; then
    rm -rf "$FAILED"
    log "previous version restored"
    relaunch_old
    rm -f "$ACK"
    exit 1
  fi
  log "ROLLBACK FAILED: the previous version is at $OLD"
  exit 3
}

# 4. Launch the new app and wait for its acknowledgement.
rm -f "$ACK"
touch "$TARGET" 2>/dev/null
if ! /usr/bin/open -n "$TARGET" --args "--goban-update-ack=$ACK" >>"$LOG" 2>&1; then
  rollback "the new app could not be opened"
fi
waited=0
while [ ! -f "$ACK" ]; do
  if [ "$waited" -ge $((ACK_TIMEOUT * 2)) ]; then
    rollback "the new app did not start within ${ACK_TIMEOUT}s"
  fi
  sleep 0.5
  waited=$((waited + 1))
done

# 5. Done: the new app is running.
log "the new app started"
rm -rf "$OLD" 2>>"$LOG" || log "could not remove the backup at $OLD"
rm -f "$ACK"
if [ -n "$CLEANUP" ]; then
  case "$CLEANUP" in */GobanStudio-update) rm -rf "$CLEANUP" ;; esac
fi
log "update complete"
exit 0
