/**
 * The Goban Studio icon family.
 *
 * One visual language: a 20×20 grid, 1.5 px stroke, round caps and joins,
 * content kept inside 2.5–17.5 so icons sit evenly next to each other. Solid
 * marks (dots, the black stone) use `fill="currentColor"`; everything else is
 * stroked. Each entry is the inner markup only; wrap it with ICON_ATTRS or
 * call iconSVG():
 *
 *   <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"
 *        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">…</svg>
 */

export const ICON_ATTRS = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.5",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

const dot = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const f = (v) => +v.toFixed(2);

function gear() {
  const cx = 10;
  const cy = 10;
  const teeth = 8;
  const ro = 7.1;
  const ri = 5.35;
  const step = (Math.PI * 2) / teeth;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    const p = (ang, r) => `${f(cx + Math.cos(ang) * r)} ${f(cy + Math.sin(ang) * r)}`;
    pts.push(p(a - step * 0.32, ri), p(a - step * 0.19, ro), p(a + step * 0.19, ro), p(a + step * 0.32, ri));
  }
  return `<path d="M${pts.join("L")}Z"/><circle cx="10" cy="10" r="2.4"/>`;
}

const bulbBody = `<path d="M7.4 13.25c0-1.8-2.65-2.85-2.65-5.75a5.25 5.25 0 0 1 10.5 0c0 2.9-2.65 3.95-2.65 5.75z"/><path d="M7.75 16.5h4.5"/>`;

export const ICONS = {
  // Places
  today: `<rect x="3" y="4.25" width="14" height="12.5" rx="2.5"/><path d="M3 8.25h14M7 2.75v3M13 2.75v3"/>${dot(10, 12.5, 1.5)}`,
  play: `<rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M3 10h4.25M12.75 10H17M10 3v4.25M10 12.75V17"/><circle cx="10" cy="10" r="2.75" fill="currentColor"/>`,
  practice: `<path d="M10 5.6C8.4 4.4 6.2 3.9 3.5 4.1v11.4c2.7-.2 4.9.3 6.5 1.5 1.6-1.2 3.8-1.7 6.5-1.5V4.1c-2.7-.2-4.9.3-6.5 1.5z"/><path d="M10 5.6V17"/>`,
  library: `<rect x="3.25" y="3.5" width="3.5" height="13" rx="1"/><rect x="8.25" y="3.5" width="3.5" height="13" rx="1"/><path d="M13.4 4.6l3.1-.6 2.1 11.8-3.1.6z"/>`,
  gear: gear(),
  keyboard: `<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.75 8.25h0M8.6 8.25h0M11.4 8.25h0M14.25 8.25h0M5.75 11.75h0M14.25 11.75h0M8.25 11.75h3.5"/>`,

  // Actions
  plus: `<path d="M10 4.25v11.5M4.25 10h11.5"/>`,
  undo: `<path d="M7.5 4.75 4 8.25l3.5 3.5"/><path d="M4 8.25h8a4.1 4.1 0 0 1 0 8.2H9"/>`,
  redo: `<path d="M12.5 4.75 16 8.25l-3.5 3.5"/><path d="M16 8.25H8a4.1 4.1 0 0 0 0 8.2h3"/>`,
  pass: `<path d="M3.5 13.5c1.1-4.4 3.5-6.75 6.5-6.75 2.6 0 4.7 1.75 6 5"/><path d="M16.6 8.6 16 11.75l-3.1-.75"/><path d="M3.5 16.5h13"/>`,
  more: `${dot(4.75, 10, 1.25)}${dot(10, 10, 1.25)}${dot(15.25, 10, 1.25)}`,
  check: `<path d="M4.25 10.5 8.25 14.5 15.75 5.75"/>`,
  close: `<path d="M5 5l10 10M15 5 5 15"/>`,
  save: `<path d="M3.75 5.25a1.5 1.5 0 0 1 1.5-1.5h7.5l3.5 3.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M7 3.75v3.5h5M6.5 16.25v-4.5h7v4.5"/>`,
  download: `<path d="M10 3.5v9.25"/><path d="M6 8.75l4 4 4-4"/><path d="M4 16.5h12"/>`,
  upload: `<path d="M10 13V3.75"/><path d="M6 7.75l4-4 4 4"/><path d="M4 16.5h12"/>`,
  // Records in and out: import (into the tray), export (out of the box), a picture, the clipboard.
  tray: `<path d="M10 3.25v8.5"/><path d="M6.75 8.5 10 11.75l3.25-3.25"/><path d="M3.5 11.5v3.25a1.75 1.75 0 0 0 1.75 1.75h9.5a1.75 1.75 0 0 0 1.75-1.75V11.5"/>`,
  share: `<path d="M10 12V3.25"/><path d="M6.75 6.25 10 3l3.25 3.25"/><path d="M6.5 8.75H5.25A1.75 1.75 0 0 0 3.5 10.5v4.75A1.75 1.75 0 0 0 5.25 17h9.5a1.75 1.75 0 0 0 1.75-1.75V10.5a1.75 1.75 0 0 0-1.75-1.75H13.5"/>`,
  image: `<rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.25" cy="8" r="1.25"/><path d="M3.5 14.5l4-4 3 3 2.25-2.25 3.75 3.75"/>`,
  clipboard: `<rect x="4.5" y="4" width="11" height="13" rx="2"/><path d="M7.75 4v-.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V4"/><path d="M7.5 9h5M7.5 12h3.5"/>`,
  trash: `<path d="M3.5 5.5h13"/><path d="M7.75 5.5V4.25a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V5.5"/><path d="M5.25 5.5l.75 10.1a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4l.75-10.1"/><path d="M8.5 8.75v5M11.5 8.75v5"/>`,
  edit: `<path d="M12.6 4.15a1.6 1.6 0 0 1 2.25 0l1 1a1.6 1.6 0 0 1 0 2.25L7.25 16H4v-3.25z"/><path d="M11 5.75l3.25 3.25"/>`,
  search: `<circle cx="8.75" cy="8.75" r="5.25"/><path d="M12.6 12.6l3.9 3.9"/>`,
  focus: `<path d="M3.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2M13 3.5h2A1.5 1.5 0 0 1 16.5 5v2M16.5 13v2a1.5 1.5 0 0 1-1.5 1.5h-2M7 16.5H5A1.5 1.5 0 0 1 3.5 15v-2"/><circle cx="10" cy="10" r="2.5"/>`,
  replay: `<path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6"/><path d="M5.4 2.75v2.65h2.65"/><path d="M8.6 7.6v4.8l3.9-2.4z"/>`,
  resume: `<path d="M6.5 4.6v10.8a.75.75 0 0 0 1.15.63l8.3-5.4a.75.75 0 0 0 0-1.26l-8.3-5.4a.75.75 0 0 0-1.15.63z"/>`,

  // Navigation
  first: `<path d="M5 4.5v11"/><path d="M14.5 4.75 9.25 10l5.25 5.25"/>`,
  prev: `<path d="M12.5 4.5 7 10l5.5 5.5"/>`,
  next: `<path d="M7.5 4.5 13 10l-5.5 5.5"/>`,
  last: `<path d="M15 4.5v11"/><path d="M5.5 4.75 10.75 10 5.5 15.25"/>`,
  back: `<path d="M16 10H4.25"/><path d="M8.75 5.25 4 10l4.75 4.75"/>`,
  forward: `<path d="M4 10h11.75"/><path d="M11.25 5.25 16 10l-4.75 4.75"/>`,
  down: `<path d="M5 7.5l5 5 5-5"/>`,

  // Review and hints
  eye: `<path d="M2.5 10s2.75-5.25 7.5-5.25S17.5 10 17.5 10s-2.75 5.25-7.5 5.25S2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.5"/>`,
  target: `<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.75"/>${dot(10, 10, 1)}`,
  bulb: bulbBody,
  "lightbulb-off": `${bulbBody}<path d="M3.25 3.25l13.5 13.5"/>`,
  flag: `<path d="M5 17V3.5"/><path d="M5 4h9.75l-2.25 3.75 2.25 3.75H5"/>`,
  chart: `<path d="M3.5 3.5v13h13"/><path d="M6.5 12.5l3-3.5 2.5 2 4-5"/>`,
  flame: `<path d="M10 17.25c-2.9 0-5-2-5-4.75 0-2.75 2-4 2.6-6.4.9 1.4 1.7 2.1 2.6 2.4.3-2-.1-3.7-.9-5.25 3.6 1.5 5.7 5.2 5.7 9.1 0 2.9-2.1 4.9-5 4.9z"/>`,
  clock: `<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.75 1.75"/>`,
  branch: `<circle cx="6" cy="4.75" r="1.75"/><circle cx="6" cy="15.25" r="1.75"/><circle cx="14" cy="6.75" r="1.75"/><path d="M6 6.5v7"/><path d="M14 8.5c0 3.25-3.1 3.6-6.5 5.4"/>`,
  sparkle: `<path d="M9 5Q9.8 10.2 15 11Q9.8 11.8 9 17Q8.2 11.8 3 11Q8.2 10.2 9 5z"/><path d="M15.25 2.75v3M13.75 4.25h3"/>`,
  shield: `<path d="M10 2.75 16 5v4.6c0 3.7-2.5 6.45-6 7.65-3.5-1.2-6-3.95-6-7.65V5z"/><path d="M7.25 10l2 2 3.5-4"/>`,
  trophy: `<path d="M6.5 3.5h7v4.5a3.5 3.5 0 0 1-7 0z"/><path d="M6.5 5H4.25v.75a2.75 2.75 0 0 0 2.6 2.75M13.5 5h2.25v.75a2.75 2.75 0 0 1-2.6 2.75"/><path d="M10 11.5v3.25M7 16.75h6"/>`,

  // Sound
  volume: `<path d="M3.5 7.75h2.5L9.75 4.5v11L6 12.25H3.5z"/><path d="M12.75 7.5a3.5 3.5 0 0 1 0 5M15 5.25a6.6 6.6 0 0 1 0 9.5"/>`,
  mute: `<path d="M3.5 7.75h2.5L9.75 4.5v11L6 12.25H3.5z"/><path d="M13 8l4 4M17 8l-4 4"/>`,

  // Board
  "stone-black": `<circle cx="10" cy="10" r="6.25" fill="currentColor"/>`,
  "stone-white": `<circle cx="10" cy="10" r="6.25"/>`,
  folder: `<path d="M2.75 6.25a1.5 1.5 0 0 1 1.5-1.5h3.1l1.9 2h6.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z"/>`,
  grid: `<rect x="3.5" y="3.5" width="13" height="13" rx="2"/><path d="M3.5 7.83h13M3.5 12.17h13M7.83 3.5v13M12.17 3.5v13"/>`,
  list: `<path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9"/>${dot(4, 5.5)}${dot(4, 10)}${dot(4, 14.5)}`,
  info: `<circle cx="10" cy="10" r="7"/><path d="M10 9.25v4.5"/>${dot(10, 6.6)}`,
  // Feedback (toasts, error cards)
  warning: `<path d="M10 3.4 17.1 15.6a.6.6 0 0 1-.52.9H3.42a.6.6 0 0 1-.52-.9z"/><path d="M10 8.25v3.75"/>${dot(10, 14.1)}`,
  error: `<circle cx="10" cy="10" r="7"/><path d="M10 6.25v4.5"/>${dot(10, 13.4)}`,
};

/** A complete <svg> string for `name` (empty string if unknown). */
export function iconSVG(name, { size = 20, title = "", className = "" } = {}) {
  const body = ICONS[name];
  if (body == null) return "";
  const attrs = Object.entries(ICON_ATTRS)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const a11y = title ? `role="img" aria-label="${title.replace(/"/g, "&quot;")}"` : `aria-hidden="true"`;
  const cls = className ? ` class="${className}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ${attrs} ${a11y}${cls}>${title ? `<title>${title}</title>` : ""}${body}</svg>`;
}
