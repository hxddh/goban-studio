/**
 * This week at a glance, for Today: games finished, problems solved,
 * lessons finished and the change in level since the week began (Monday
 * 00:00 local time). Pure: everything comes from the arguments.
 */
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function weekSummary(progress, games, now = new Date()) {
  const since = weekStart(now);
  const played = (games || []).filter((g) => g.source !== "import" && g.result && (g.finishedAt ?? g.updatedAt ?? 0) >= since).length;
  const solved = Object.values(progress?.problems || {}).filter((p) => p?.solved && (p.last || 0) >= since).length;
  const lessons = Object.values(progress?.lessons || {}).filter((l) => l?.done && (l.at || 0) >= since).length;
  const hist = progress?.rating?.history || [];
  let delta = null;
  if (hist.length) {
    const before = [...hist].reverse().find((h) => (h.at || 0) < since) || hist[0];
    const last = hist[hist.length - 1];
    if (last && before && last !== before) delta = Math.round(last.r - before.r);
  }
  return { since, played, solved, lessons, delta };
}
