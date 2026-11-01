/**
 * The Goban Studio mark: two stones in kosumi, the diagonal step.
 *
 * Geometry (unit = one grid cell c): the stones sit on diagonally adjacent
 * intersections, so their centres are c·√2 apart along 45°. Each stone's
 * radius is c/√2 less a hairline gap, so the two discs are tangent at the
 * centre of the cell they share. The same construction drives brand.svg,
 * icon.svg and icon.png.
 */
const INK = "#1b1a17";
const SHELL = "#fbf8f1";

/** Brand mark on a 64-unit square: transparent background. */
export function brandSVG() {
  const c = 23.2;
  const d = c / 2;
  const gap = 1.9;
  const r = c / Math.SQRT2 - gap / 2;
  const sw = 3.2;
  const f = (v) => +v.toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <title>Goban Studio</title>
  <circle cx="${f(32 - d)}" cy="${f(32 - d)}" r="${f(r)}" fill="${INK}"/>
  <circle cx="${f(32 + d)}" cy="${f(32 + d)}" r="${f(r - sw / 2)}" fill="${SHELL}" stroke="${INK}" stroke-width="${sw}"/>
</svg>
`;
}

/** Icon geometry in a 1024 canvas (macOS grid: 824 body, 100 margin). */
export const ICON = (() => {
  const body = { x: 100, y: 100, size: 824, radius: 186 };
  const c = 200;
  const d = c / 2;
  const r = c / Math.SQRT2 - 6;
  const lines = [212, 412, 612, 812];
  return { body, c, d, r, lines, black: [512 - d, 512 - d], white: [512 + d, 512 + d] };
})();

/** Vector app icon: wood body, a corner of grid, the two stones. */
export function iconSVG() {
  const { body, r, lines, black, white } = ICON;
  const b = body;
  const lineEls = lines
    .map((v) => `<path d="M${v} ${b.y}V${b.y + b.size}M${b.x} ${v}H${b.x + b.size}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#ecc68a"/>
      <stop offset="0.55" stop-color="#deb173"/>
      <stop offset="1" stop-color="#cf9d5d"/>
    </linearGradient>
    <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6e0" stop-opacity="0.55"/>
      <stop offset="0.12" stop-color="#fff6e0" stop-opacity="0"/>
      <stop offset="0.9" stop-color="#5a3510" stop-opacity="0"/>
      <stop offset="1" stop-color="#5a3510" stop-opacity="0.28"/>
    </linearGradient>
    <radialGradient id="black" cx="0.36" cy="0.3" r="0.78">
      <stop offset="0" stop-color="#4a4b4e"/>
      <stop offset="0.5" stop-color="#1c1c1e"/>
      <stop offset="1" stop-color="#09090a"/>
    </radialGradient>
    <radialGradient id="white" cx="0.36" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#f3f1ea"/>
      <stop offset="1" stop-color="#c9c6bd"/>
    </radialGradient>
    <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.7" stop-color="#3a2108" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#3a2108" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="body"><rect x="${b.x}" y="${b.y}" width="${b.size}" height="${b.size}" rx="${b.radius}"/></clipPath>
  </defs>
  <g clip-path="url(#body)">
    <rect x="${b.x}" y="${b.y}" width="${b.size}" height="${b.size}" fill="url(#wood)"/>
    <g stroke="#3b250f" stroke-opacity="0.62" stroke-width="7" fill="none">${lineEls}</g>
    <circle cx="${black[0] + r * 0.1}" cy="${black[1] + r * 0.16}" r="${r * 1.1}" fill="url(#shadow)"/>
    <circle cx="${white[0] + r * 0.1}" cy="${white[1] + r * 0.16}" r="${r * 1.1}" fill="url(#shadow)"/>
    <circle cx="${black[0]}" cy="${black[1]}" r="${r}" fill="url(#black)"/>
    <circle cx="${white[0]}" cy="${white[1]}" r="${r}" fill="url(#white)"/>
    <rect x="${b.x}" y="${b.y}" width="${b.size}" height="${b.size}" fill="url(#lip)"/>
  </g>
</svg>
`;
}

/**
 * HTML page that composes the raster app icon from the generated kaya
 * texture and stone sprites (rendered by make-assets in Chromium).
 */
export function iconHTML({ kaya, black, white }) {
  const { body, r, lines, black: B, white: W } = ICON;
  return `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c" width="1024" height="1024"></canvas>
<script>
const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
window.done = (async () => {
  const [kaya, black, white] = await Promise.all([load(${JSON.stringify(kaya)}), load(${JSON.stringify(black)}), load(${JSON.stringify(white)})]);
  const c = document.getElementById("c").getContext("2d");
  c.imageSmoothingQuality = "high";
  const b = ${JSON.stringify(body)};
  // Soft drop shadow under the tile, as in the macOS icon grid.
  c.save();
  c.shadowColor = "rgba(0,0,0,0.28)"; c.shadowBlur = 28; c.shadowOffsetY = 10;
  c.beginPath(); c.roundRect(b.x, b.y, b.size, b.size, b.radius); c.fillStyle = "#d9ae72"; c.fill();
  c.restore();
  c.save();
  c.beginPath(); c.roundRect(b.x, b.y, b.size, b.size, b.radius); c.clip();
  // A 1.2x crop of the board texture keeps the grain fine at icon size.
  c.drawImage(kaya, 300, 300, 1400, 1400, b.x, b.y, b.size, b.size);
  c.strokeStyle = "rgba(52, 31, 10, 0.66)"; c.lineWidth = 7; c.lineCap = "butt";
  for (const v of ${JSON.stringify(lines)}) {
    c.beginPath(); c.moveTo(v, b.y); c.lineTo(v, b.y + b.size); c.stroke();
    c.beginPath(); c.moveTo(b.x, v); c.lineTo(b.x + b.size, v); c.stroke();
  }
  const r = ${r};
  for (const [x, y, img] of [[${B[0]}, ${B[1]}, black], [${W[0]}, ${W[1]}, white]]) {
    const g = c.createRadialGradient(x + r * 0.1, y + r * 0.16, r * 0.7, x + r * 0.1, y + r * 0.16, r * 1.14);
    g.addColorStop(0, "rgba(45, 24, 4, 0.5)"); g.addColorStop(1, "rgba(45, 24, 4, 0)");
    c.fillStyle = g; c.beginPath(); c.arc(x + r * 0.1, y + r * 0.16, r * 1.14, 0, Math.PI * 2); c.fill();
  }
  c.drawImage(black, ${B[0]} - r, ${B[1]} - r, 2 * r, 2 * r);
  c.drawImage(white, ${W[0]} - r, ${W[1]} - r, 2 * r, 2 * r);
  // Bevel: a light lip on top, a darker one at the bottom.
  const lip = c.createLinearGradient(0, b.y, 0, b.y + b.size);
  lip.addColorStop(0, "rgba(255, 246, 224, 0.5)"); lip.addColorStop(0.08, "rgba(255, 246, 224, 0)");
  lip.addColorStop(0.92, "rgba(70, 40, 10, 0)"); lip.addColorStop(1, "rgba(70, 40, 10, 0.3)");
  c.fillStyle = lip; c.fillRect(b.x, b.y, b.size, b.size);
  c.restore();
  return document.getElementById("c").toDataURL("image/png").split(",")[1];
})();
</script></body></html>`;
}
