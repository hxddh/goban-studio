/**
 * The Goban Studio mark: two stones in kosumi, the diagonal step, on a
 * plain board seen from straight above. One wide cell of grid (two lines
 * each way), a matte slate black stone at the upper left and a shell white
 * stone at the lower right, each on an intersection, each with a soft
 * contact shadow. No wood grain, no perspective.
 *
 * The same construction drives assets/icon.svg (the app icon, 1024 canvas
 * on the macOS grid: an 824 body with a 100 margin), assets/icon.png (that
 * SVG rendered by make-assets in Chromium) and src/web/assets/brand.svg (the
 * small mark for the sidebar: the same picture without blur filters).
 */

/** Icon geometry in a 1024 canvas. */
export const ICON = (() => {
  const body = { x: 100, y: 100, size: 824, radius: 186 };
  const cell = 300;
  const half = cell / 2;
  const lines = [512 - half, 512 + half];
  const r = Math.round(cell * 0.45);
  return { body, cell, lines, r, black: [512 - half, 512 - half], white: [512 + half, 512 + half] };
})();

const f = (v) => +v.toFixed(2);

const DEFS = `
    <linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#efd9ad"/><stop offset="1" stop-color="#ddba85"/>
    </linearGradient>
    <radialGradient id="bk" cx=".36" cy=".32" r=".78">
      <stop offset="0" stop-color="#55565b"/><stop offset=".22" stop-color="#2c2d30"/><stop offset=".62" stop-color="#151517"/><stop offset="1" stop-color="#060607"/>
    </radialGradient>
    <radialGradient id="wh" cx=".36" cy=".32" r=".8">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f7f5f0"/><stop offset=".85" stop-color="#e4dfd4"/><stop offset="1" stop-color="#cdc6b7"/>
    </radialGradient>
    <radialGradient id="rimDark" cx=".5" cy=".5" r=".5">
      <stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/>
    </radialGradient>
    <radialGradient id="rimWhite" cx=".5" cy=".5" r=".5">
      <stop offset=".8" stop-color="#6b5a3a" stop-opacity="0"/><stop offset="1" stop-color="#6b5a3a" stop-opacity=".22"/>
    </radialGradient>
    <radialGradient id="spec" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bounce" x1="0" y1="0" x2="1" y2="1">
      <stop offset=".55" stop-color="#d9a860" stop-opacity="0"/><stop offset="1" stop-color="#d9a860" stop-opacity=".18"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".05" stop-color="#fff" stop-opacity="0"/><stop offset=".95" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/>
    </linearGradient>`;

/** One stone. `blur` false for the small mark (no filters at 18 px). */
function stone(cx, cy, r, color, blur) {
  let s = "";
  if (blur) {
    s += `<circle cx="${f(cx + r * 0.07)}" cy="${f(cy + r * 0.12)}" r="${r}" fill="#3b2508" opacity=".30" filter="url(#blurL)"/>`;
    s += `<circle cx="${f(cx + r * 0.03)}" cy="${f(cy + r * 0.05)}" r="${f(r * 0.99)}" fill="#2a1a06" opacity=".38" filter="url(#blurS)"/>`;
  } else {
    s += `<circle cx="${f(cx + r * 0.06)}" cy="${f(cy + r * 0.1)}" r="${r}" fill="#3b2508" opacity=".28"/>`;
  }
  if (color === "black") {
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bk)"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rimDark)"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bounce)"/>`;
    if (blur) {
      const x = f(cx - r * 0.34), y = f(cy - r * 0.4);
      s += `<ellipse cx="${x}" cy="${y}" rx="${f(r * 0.26)}" ry="${f(r * 0.16)}" fill="url(#spec)" opacity=".30" transform="rotate(-35 ${x} ${y})" filter="url(#blurS)"/>`;
    }
  } else {
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#wh)"/>`;
    if (blur) {
      // The shell's faint parallel bands.
      const bands = Array.from({ length: 8 }, (_, i) => {
        const k = i + 1;
        const y = cy - r + k * r * 0.24;
        return `<path d="M${f(cx - r)} ${f(y)} Q${cx} ${f(y + r * 0.1)} ${f(cx + r)} ${f(y)}" stroke="#a69b84" stroke-opacity=".035" stroke-width="3" fill="none"/>`;
      }).join("");
      s += `<clipPath id="shell"><circle cx="${cx}" cy="${cy}" r="${r - 1}"/></clipPath><g clip-path="url(#shell)" transform="rotate(-18 ${cx} ${cy})">${bands}</g>`;
    }
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rimWhite)"/>`;
    if (blur) {
      const x = f(cx - r * 0.32), y = f(cy - r * 0.38);
      s += `<ellipse cx="${x}" cy="${y}" rx="${f(r * 0.3)}" ry="${f(r * 0.18)}" fill="url(#spec)" opacity=".75" transform="rotate(-35 ${x} ${y})" filter="url(#blurS)"/>`;
    }
  }
  return s;
}

/** Vector app icon (1024 canvas). */
export function iconSVG() {
  const { body: b, lines, r, black, white } = ICON;
  const grid = lines.map((v) => `<path d="M${v} ${b.y}V${b.y + b.size}M${b.x} ${v}H${b.x + b.size}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>Goban Studio</title>
  <defs>${DEFS}
    <filter id="blurS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="blurL" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".22"/></filter>
    <clipPath id="body"><rect x="${b.x}" y="${b.y}" width="${b.size}" height="${b.size}" rx="${b.radius}"/></clipPath>
  </defs>
  <g filter="url(#drop)"><g clip-path="url(#body)">
    <rect x="${b.x}" y="${b.y}" width="${b.size}" height="${b.size}" fill="url(#board)"/>
    <g stroke="#5b4220" stroke-opacity=".40" stroke-width="3.4">${grid}</g>
    ${stone(black[0], black[1], r, "black", true)}
    ${stone(white[0], white[1], r, "white", true)}
    <rect x="${b.x}" y="${b.y}" width="${b.size}" height="${b.size}" fill="url(#edge)"/>
  </g></g>
</svg>
`;
}

/** The small mark (sidebar): the icon's body on a 64 square, no filters, no margin. */
export function brandSVG() {
  const { body: b, lines, r, black, white } = ICON;
  const s = 64 / b.size;
  const at = (v) => f((v - b.x) * s);
  const grid = lines.map((v) => `<path d="M${at(v)} 0V64M0 ${at(v)}H64"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <title>Goban Studio</title>
  <defs>${DEFS}
    <clipPath id="body"><rect width="64" height="64" rx="${f(b.radius * s)}"/></clipPath>
  </defs>
  <g clip-path="url(#body)">
    <rect width="64" height="64" fill="url(#board)"/>
    <g stroke="#5b4220" stroke-opacity=".40" stroke-width="0.6">${grid}</g>
    ${stone(at(black[0]), at(black[1]), f(r * s), "black", false)}
    ${stone(at(white[0]), at(white[1]), f(r * s), "white", false)}
  </g>
</svg>
`;
}

/** HTML page that renders the vector icon to a 1024 PNG in Chromium (make-assets). */
export function iconHTML() {
  const svg = iconSVG();
  return `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c" width="1024" height="1024"></canvas>
<script>
window.done = (async () => {
  const img = new Image();
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(${JSON.stringify(svg)})));
  await img.decode();
  const c = document.getElementById("c").getContext("2d");
  c.drawImage(img, 0, 0, 1024, 1024);
  return document.getElementById("c").toDataURL("image/png").split(",")[1];
})();
</script></body></html>`;
}
