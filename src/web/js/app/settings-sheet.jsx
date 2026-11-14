/**
 * Settings: a source list of panes and one pane shown, none taller than
 * the sheet; and the level sheet the You pane opens.
 */
import { useEffect, useState } from "preact/hooks";
import { RULESETS, rulesetById } from "../rules.js";
import { LANG_IDS, LANG_NAMES, t, tn } from "../i18n.js";
import { hasNative } from "../host.js";
import { APP_VERSION } from "../version.js";
import * as U from "../update.js";
import * as Models from "../models.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { estimateLabel } from "./estimate-label.js";
import { Button, Icon, Segmented, Switch } from "./parts.jsx";
import { Modal } from "./modal.jsx";
import { EngineRow } from "./engine-row.jsx";

/* --------------------------------------------------------------- settings */

export const SETTINGS_PANES = [
  { id: "general", icon: "gear", key: "settings.pane.general" },
  { id: "board", icon: "grid", key: "settings.pane.board" },
  { id: "playing", icon: "play", key: "settings.pane.playing" },
  { id: "you", icon: "target", key: "settings.pane.you" },
  { id: "engines", icon: "download", key: "settings.pane.engines" },
  { id: "data", icon: "save", key: "settings.pane.data" },
  { id: "about", icon: "info", key: "settings.pane.about" },
];

/**
 * Settings (docs/design.md §7): a source list of panes on the left, one
 * pane at a time on the right — like the system's own settings window.
 * No pane is taller than the sheet (scripts/ui-tests/shell-sheets.mjs).
 */
export function SettingsSheet({ pane: open, focus }) {
  // "engine" was the networks' place at the end of Playing; it is the Engines pane.
  const want = open === "engine" ? "engines" : open;
  const [pane, setPane] = useState(want && SETTINGS_PANES.some((p) => p.id === want) ? want : state.ui.settingsPane);
  const choose = (id) => {
    state.ui.settingsPane = id;
    setPane(id);
  };
  const onListKey = (e) => {
    const i = SETTINGS_PANES.findIndex((p) => p.id === pane);
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = SETTINGS_PANES[(i + d + SETTINGS_PANES.length) % SETTINGS_PANES.length];
    choose(next.id);
    e.currentTarget.querySelector(`[data-pane="${next.id}"]`)?.focus();
  };
  const Pane = PANES[pane];
  return (
    <Modal title={t("nav.settings")} wide class="settings-sheet">
      <div class="settings-split">
        <nav class="settings-nav" aria-label={t("nav.settings")} role="tablist" aria-orientation="vertical" onKeyDown={onListKey}>
          {SETTINGS_PANES.map((p) => (
            <button
              type="button"
              role="tab"
              data-pane={p.id}
              aria-selected={pane === p.id}
              tabIndex={pane === p.id ? 0 : -1}
              class={`settings-tab ${pane === p.id ? "on" : ""}`}
              onClick={() => choose(p.id)}
            >
              <Icon name={p.icon} size={16} />
              <span>{t(p.key)}</span>
            </button>
          ))}
        </nav>
        <div class="settings-pane" data-pane={pane} role="tabpanel" aria-label={t(SETTINGS_PANES.find((p) => p.id === pane).key)}>
          <Pane focus={focus} />
        </div>
      </div>
    </Modal>
  );
}

/** A row: its label on the left, one control on the right. */
function Row({ label, children }) {
  return (
    <div class="row">
      <span>{label}</span>
      {children}
    </div>
  );
}

function GeneralPane() {
  const s = state.settings;
  const set = C.setSetting;
  return (
    <>
      <section class="settings-group">
        <h3>{t("settings.language")}</h3>
        <div class="lang-grid" role="radiogroup" aria-label={t("settings.language")}>
          {LANG_IDS.map((id) => (
            <button type="button" role="radio" aria-checked={s.lang === id} class={s.lang === id ? "on" : ""} lang={id} onClick={() => set("lang", id)}>
              {LANG_NAMES[id]}
            </button>
          ))}
        </div>
      </section>
      <section class="settings-group">
        <h3>{t("settings.look")}</h3>
        <Row label={t("settings.appearance")}>
          <Segmented
            label={t("settings.appearance")}
            value={s.appearance}
            onChange={(v) => set("appearance", v)}
            options={[
              { value: "auto", label: t("settings.auto") },
              { value: "light", label: t("settings.light") },
              { value: "dark", label: t("settings.dark") },
            ]}
          />
        </Row>
        <Switch label={t("a11y.largeText")} checked={!!s.largeText} onChange={(v) => set("largeText", v)} />
      </section>
      <section class="settings-group">
        <h3>{t("settings.soundGroup")}</h3>
        <Row label={t("settings.sound")}>
          {/* Changing it plays one stone at the new volume (ctl-core.js setSetting). */}
          <Segmented class="volume" label={t("settings.sound")} value={s.volume} onChange={(v) => set("volume", v)} options={VOLUMES.map((v) => ({ value: v, label: t("settings.volume." + v) }))} />
        </Row>
      </section>
    </>
  );
}
const VOLUMES = ["off", "quiet", "normal", "loud"];

function BoardPane() {
  const s = state.settings;
  const set = C.setSetting;
  return (
    <>
      <section class="settings-group">
        <h3>{t("settings.boardGroup")}</h3>
        <Row label={t("settings.boardStyle")}>
          <Segmented
            class="board-style"
            label={t("settings.boardStyle")}
            value={s.boardStyle}
            onChange={(v) => set("boardStyle", v)}
            options={[
              { value: "standard", label: t("settings.boardStyle.standard") },
              { value: "contrast", label: t("settings.boardStyle.contrast") },
            ]}
          />
        </Row>
        <p class="fine">{t("settings.boardStyleHelp")}</p>
        <Switch label={t("settings.coordinates")} checked={s.coords} onChange={(v) => set("coords", v)} />
        {s.coords && <Switch label={t("settings.coordsAround")} checked={!!s.coordsAround} onChange={(v) => set("coordsAround", v)} />}
        <Switch label={t("settings.tallBoard")} checked={!!s.tallBoard} onChange={(v) => set("tallBoard", v)} />
        <Switch label={t("settings.moveNumbers")} checked={s.numbers} onChange={(v) => set("numbers", v)} />
        <Switch label={t("settings.lastMove")} checked={s.lastMoveMark !== false} onChange={(v) => set("lastMoveMark", v)} />
      </section>
      <section class="settings-group">
        <h3>{t("settings.placing")}</h3>
        <Switch label={t("settings.confirmMove")} checked={s.confirmMove} onChange={(v) => set("confirmMove", v)} />
        <Switch label={t("settings.confirmProblemMove")} checked={!!s.confirmProblemMove} onChange={(v) => set("confirmProblemMove", v)} />
        <p class="fine">{t("settings.confirmProblemMoveHelp")}</p>
      </section>
    </>
  );
}

function PlayingPane() {
  const s = state.settings;
  const set = C.setSetting;
  const rules = C.defaultRules();
  return (
    <>
      <section class="settings-group">
        <h3>{t("settings.playing")}</h3>
        <Switch label={t("settings.teaching")} checked={C.teachingOn()} onChange={(v) => set("teaching", v)} />
        <p class="fine">{t("settings.teachingHelp")}</p>
        <Switch label={t("settings.showEval")} checked={s.showEval} onChange={(v) => set("showEval", v)} />
        <Switch label={t("settings.liveAnalysis")} checked={s.liveAnalysis} onChange={(v) => set("liveAnalysis", v)} />
        <Switch label={t("settings.autoStrength")} checked={s.autoStrength} onChange={(v) => set("autoStrength", v)} />
      </section>
      <section class="settings-group">
        <h3>{t("rules.title")}</h3>
        <Row label={t("rules.default")}>
          <Segmented class="default-rules" label={t("rules.default")} value={rules} onChange={(v) => set("defaultRules", v)} options={RULESETS.map((r) => ({ value: r.id, label: t(r.labelKey) }))} />
        </Row>
        <p class="fine">{t(rulesetById(rules).noteKey)}</p>
      </section>
    </>
  );
}

/** The estimate, where it comes from, and the way to change where it starts. */
function YouPane({ focus }) {
  const s = state.settings;
  const e = state.profile ? C.playerEstimate() : null;
  return (
    <>
      <section class="settings-group">
        <h3>{t("settings.you")}</h3>
        <div class="row level-row">
          <span>{t("settings.estimated")}</span>
          <strong class="level-now">{state.profile ? estimateLabel(state.profile) : t("settings.rankUnknown")}</strong>
          <Button size="sm" data-change-level data-autofocus={focus === "level" ? true : undefined} onClick={() => C.openSheet("level")}>
            {t("settings.level.change")}
          </Button>
        </div>
        <p class="fine">{e && e.games > 0 ? `${tn("settings.level.fromGames", e.games)} ${t("strength.about")}` : `${t("settings.level.fromYou")} ${t("strength.about")}`}</p>
      </section>
      <section class="settings-group">
        <h3>{t("settings.practiceGroup")}</h3>
        <Row label={t("settings.daily")}>
          <Segmented class="daily-size" label={t("settings.daily")} value={s.dailySize} onChange={(v) => C.setSetting("dailySize", v)} options={[3, 5, 10].map((n) => ({ value: n, label: t("settings.daily.n", [n]) }))} />
        </Row>
        <p class="fine">{t("settings.dailyHelp")}</p>
      </section>
    </>
  );
}

function DataPane() {
  return (
    <>
      <section class="settings-group">
        <h3>{t("backup.title")}</h3>
        <p class="fine">{t("backup.help")}</p>
        <div class="actions wrap">
          <Button icon="download" onClick={C.exportBackup}>
            {t("backup.export")}
          </Button>
          <Button kind="ghost" icon="upload" onClick={C.importBackup}>
            {t("backup.import")}
          </Button>
        </div>
        <UndoRestoreRow />
      </section>
      {hasNative() && (
        <section class="settings-group">
          <h3>{t("settings.folderGroup")}</h3>
          <p class="fine">{t("settings.dataKept")}</p>
          <div class="actions">
            <Button kind="ghost" icon="folder" data-reveal onClick={C.revealDataFolder}>
              {t("settings.reveal")}
            </Button>
          </div>
        </section>
      )}
      <section class="settings-group">
        <h3>{t("settings.eraseGroup")}</h3>
        <div class="actions">
          <Button kind="danger" onClick={C.clearData}>
            {t("settings.clearData")}
          </Button>
        </div>
      </section>
    </>
  );
}

function AboutPane() {
  const s = state.settings;
  return (
    <>
      <section class="settings-group">
        <h3>{t("settings.about")}</h3>
        <p class="about">
          <strong>Goban Studio {APP_VERSION}</strong>
          <span class="fine">{t("settings.offline")}</span>
          <span class="fine">{t("common.labelValue", [t("settings.licenses"), "Goban Studio (MIT) · KataGo (MIT) · KataGo networks (CC0; downloads: KataGo Neural Network License) · Moka (MIT) · @sabaki/go-board (MIT) · Preact (MIT)"])}</span>
        </p>
      </section>
      <section class="settings-group">
        <h3>{t("settings.updatesGroup")}</h3>
        <UpdateRow />
        <Switch label={t("update.auto")} checked={!!s.autoUpdateCheck} onChange={(v) => C.setSetting("autoUpdateCheck", v)} />
        <p class="fine">{t("update.autoHelp")}</p>
      </section>
      <section class="settings-group">
        <div class="actions">
          <Button kind="ghost" icon="keyboard" onClick={() => C.openSheet("shortcuts")}>
            {t("shortcuts.title")}
          </Button>
        </div>
      </section>
    </>
  );
}

/**
 * Your level, changed by hand (Settings → You → Change…): the same
 * question onboarding asks. Saving starts the estimate again from the
 * answer (boot.js setPlayerRank); both ways out go back to Settings.
 */
export function LevelSheet() {
  const start = state.profile ? C.playerEstimate().rank : state.settings.playerRank;
  const [rank, setRank] = useState(Math.max(-8, Math.min(30, Math.round(start ?? 30))));
  // Back to where it was opened, with the focus on the button that opened it.
  const back = () => C.openSheet("settings", { pane: "you", focus: "level" });
  const text = rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank]);
  return (
    <Modal
      title={t("onboarding.rankQuestion")}
      onClose={back}
      onEscape={back}
      footer={
        <>
          <Button kind="ghost" onClick={back}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            data-save-level
            onClick={() => {
              C.setPlayerRank(rank);
              back();
            }}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div class="slider-field big">
        <input type="range" data-autofocus min="0" max="38" step="1" value={30 - rank} onInput={(e) => setRank(30 - Number(e.currentTarget.value))} aria-label={t("settings.you")} aria-valuetext={text} />
        <output>{text}</output>
      </div>
      <p class="fine">{t("settings.level.help")}</p>
    </Modal>
  );
}

/**
 * Engines: what plays and analyses now, and the optional KataGo networks
 * (the human-style opponent and the stronger network) with their progress.
 */
function EnginesPane() {
  useEffect(() => {
    C.refreshModels?.();
  }, []);
  const ms = state.models;
  return (
    <>
      <section class="settings-group">
        <h3>{t("settings.pane.engines")}</h3>
        <EngineRow />
      </section>
      <section class="settings-group models-group">
        <h3>{t("models.title")}</h3>
        {/* One paragraph, so the pane fits at 1200×800 with larger text. */}
        <p class="fine">
          {t("models.intro")} {t("models.source")}
        </p>
        {["human", "strong"].map((kind) => (
          <ModelRow kind={kind} one={ms?.[kind]} />
        ))}
      </section>
    </>
  );
}

const PANES = { general: GeneralPane, board: BoardPane, playing: PlayingPane, you: YouPane, engines: EnginesPane, data: DataPane, about: AboutPane };

function ModelRow({ kind, one }) {
  const mb = Models.megabytes(Models.MODELS[kind].bytes);
  const st = one?.status || "unavailable";
  const busy = st === "downloading" || st === "verifying";
  let line = "";
  if (st === "unavailable") line = t("models.unavailable");
  else if (st === "ready") line = t("models.ready");
  else if (st === "verifying") line = t("models.verifying");
  else if (st === "downloading") line = one.stalled ? t("models.stalled") : t("models.downloading", [Models.percent(one)]);
  else if (st === "partial") line = t("models.partial", [Models.percent(one)]);
  else if (st === "failed") line = C.modelErrorText(one);
  let action = null;
  if (st === "absent") action = <Button size="sm" icon="download" onClick={() => C.downloadModel(kind)}>{t("models.download", [mb])}</Button>;
  else if (st === "partial") action = <Button size="sm" onClick={() => C.downloadModel(kind)}>{t("models.resume")}</Button>;
  else if (st === "failed") action = <Button size="sm" onClick={() => C.downloadModel(kind)}>{t("models.retry")}</Button>;
  else if (busy) action = <Button size="sm" kind="ghost" onClick={() => C.cancelModelDownload(kind)}>{t("models.cancel")}</Button>;
  else if (st === "ready") action = <Button size="sm" kind="ghost" onClick={() => C.removeModel(kind)}>{t("models.remove")}</Button>;
  return (
    <div class="model-row">
      <div class="model-text">
        <strong>{t(`models.${kind}.name`)}</strong>
        <span class="fine">{t(`models.${kind}.desc`, [mb])}</span>
        {line && <span class={`model-status ${st}`} aria-live="polite">{line}</span>}
        {busy && (
          <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Models.percent(one)}>
            <i style={{ width: `${Models.percent(one)}%` }} />
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

/** "Check for updates…" with what the last check found. */
function UpdateRow() {
  const u = state.updateCheck;
  const can = C.canCheckUpdates();
  const st = u?.status;
  let text = "";
  if (st === "checking") text = t("update.checking");
  else if (st === "available") text = t("update.available", [u.latest]);
  else if (st === "downloading") text = t(u.step === "verify" ? "update.verifying" : u.step === "unpack" ? "update.unpacking" : "update.downloading", [u.latest]);
  else if (st === "ready") text = t("update.ready", [u.latest]);
  else if (st === "installing") text = t("update.installing");
  else if (st === "current") text = t("update.current", [u.current]);
  else if (st === "error") text = t("update.error");
  else if (!can) text = t("update.unavailable");
  const canInstall = st === "available" && u.install?.can;
  let action;
  if (st === "available")
    action = canInstall ? (
      <Button size="sm" icon="download" onClick={C.downloadUpdate}>
        {t("update.install")}
      </Button>
    ) : (
      <Button size="sm" icon="download" onClick={C.openReleasePage}>
        {t("update.download")}
      </Button>
    );
  else if (st === "downloading")
    action = (
      <Button size="sm" kind="ghost" onClick={C.cancelUpdate}>
        {t("update.cancel")}
      </Button>
    );
  else if (st === "ready")
    action = (
      <Button size="sm" kind="primary" onClick={C.applyUpdate}>
        {t("update.restart")}
      </Button>
    );
  else if (st !== "installing")
    action = (
      <Button size="sm" onClick={() => C.checkForUpdates()} disabled={!can || st === "checking"}>
        {t("update.check")}
      </Button>
    );
  return (
    <div class="update-block">
      <div class="row update-row">
        <span class={st === "available" || st === "ready" ? "" : "muted"} aria-live="polite">
          {text}
        </span>
        {action}
      </div>
      {st === "downloading" && (
        <div class="update-progress">
          <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((u.progress || 0) * 100)}>
            <i style={{ width: `${Math.round((u.progress || 0) * 100)}%` }} />
          </div>
          {u.total > 0 && <span class="fine">{t("update.progress", [U.formatBytes(u.received || 0), U.formatBytes(u.total)])}</span>}
        </div>
      )}
      {st === "ready" && <p class="fine">{t("update.restartHint")}</p>}
      {st === "available" && !canInstall && u.install?.blocked && <p class="fine">{t(U.installMessageKey(u.install.blocked))}</p>}
      {st === "available" && u.installError && <p class="fine">{t(U.installMessageKey(u.installError))}</p>}
    </div>
  );
}

/**
 * The last backup restore can be undone from its snapshot (data/backup.js)
 * — for 30 days, and until a new backup is exported.
 */
function UndoRestoreRow() {
  const snap = C.restoreSnapshot();
  if (!snap) return null;
  let when = "";
  try {
    const lang = state.settings.lang;
    when = new Date(snap.at).toLocaleString(lang === "zh" ? "zh-CN" : lang, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (_) {}
  return (
    <>
      <div class="actions">
        <Button kind="ghost" icon="undo" data-undo-restore onClick={C.undoRestore}>
          {t("backup.undoRestore.row", [when])}
        </Button>
      </div>
      <p class="fine">{t("settings.undoRestoreNote")}</p>
    </>
  );
}
