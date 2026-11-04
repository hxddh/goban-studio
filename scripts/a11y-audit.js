// v6 a11y: the in-page accessibility audit used by scripts/ui-test.mjs.
// This file is one function expression; the test evaluates its source in
// the page (no dependency is shipped). It returns a list of problems:
//   name      an interactive element without an accessible name
//   dup-id    an id used more than once
//   ref       aria-labelledby / -describedby / -controls naming a missing id
//   pointer   something that looks clickable but cannot be reached by keyboard
//   img       a canvas or svg image without a name (or aria-hidden)
//   landmark  no <main>, or a place without a level-one heading
//   expanded  a disclosure button (aria-controls) without aria-expanded
function a11yAudit({ minContrast = 3 } = {}) {
  const out = [];
  const shown = (el) => {
    if (!el.isConnected) return false;
    if (el.closest("[aria-hidden='true'], [hidden], .sr-only")) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const text = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  const nameOf = (el) => {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const s = by
        .split(/\s+/)
        .map((id) => text(document.getElementById(id)))
        .join(" ")
        .trim();
      if (s) return s;
    }
    const aria = (el.getAttribute("aria-label") || "").trim();
    if (aria) return aria;
    if (el.labels && el.labels.length) {
      const s = [...el.labels].map(text).join(" ").trim();
      if (s) return s;
    }
    const own = text(el);
    if (own) return own;
    if (el.tagName === "INPUT" && (el.placeholder || el.value) && el.type !== "checkbox") return el.placeholder || el.value;
    return (el.getAttribute("title") || "").trim();
  };
  const describe = (el) => {
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls ? "." + cls : ""} "${text(el).slice(0, 30)}"`;
  };
  const INTERACTIVE = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=radio], [role=tab], [role=menuitem], [role=switch], [role=slider], [role=checkbox], [role=link], [role=option], [tabindex]:not([tabindex='-1'])";
  const scope = document.querySelector(".scrim") || document;
  for (const el of scope.querySelectorAll(INTERACTIVE)) {
    if (!shown(el) || el.matches(".sheet[tabindex='-1']")) continue;
    if (!nameOf(el)) out.push({ kind: "name", el: describe(el) });
    if (el.hasAttribute("aria-controls") && !el.hasAttribute("aria-expanded") && el.getAttribute("role") !== "tab") out.push({ kind: "expanded", el: describe(el) });
  }
  const ids = new Map();
  for (const el of document.querySelectorAll("[id]")) ids.set(el.id, (ids.get(el.id) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push({ kind: "dup-id", el: id + " ×" + n });
  for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const id of el.getAttribute(attr).split(/\s+/)) if (id && !document.getElementById(id)) out.push({ kind: "ref", el: `${describe(el)} ${attr}=${id}` });
    }
  }
  // Clickable-looking things that the keyboard cannot reach. Only the
  // outermost pointer element is reported; labels wrap their own inputs,
  // and the board and charts have keyboard equivalents of their own.
  for (const el of scope.querySelectorAll("body *")) {
    if (!shown(el) || el instanceof SVGElement && el.tagName !== "svg") continue;
    if (getComputedStyle(el).cursor !== "pointer") continue;
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer") continue;
    if (el.matches(INTERACTIVE) || el.closest(INTERACTIVE) || el.closest("label") || el.querySelector(INTERACTIVE) || el.matches("canvas.board, .scrim")) continue;
    // Charts and the game tree are pictures you can also click; the review
    // navigation (arrows, Home/End, the position slider) does the same.
    if (el.matches("svg[role=img]") || el.closest("svg[role=img]")) continue;
    if (el.closest("[data-a11y-pointer-only]")) continue;
    out.push({ kind: "pointer", el: describe(el) });
  }
  for (const el of scope.querySelectorAll("canvas, svg")) {
    if (!shown(el) || el.closest("button, [role=img] svg") || el.getAttribute("aria-hidden") === "true") continue;
    if (el.tagName === "svg" && el.closest(INTERACTIVE)) continue;
    if (!nameOf(el) && !el.getAttribute("aria-label")) out.push({ kind: "img", el: describe(el) });
  }
  // Contrast (docs/design.md §10): no text below 3:1 against what is behind
  // it (tertiary text is the floor; body and secondary text sit well above).
  // Computed colours come as rgb()/rgba(), or as color(srgb r g b / a) with
  // 0–1 channels when the stylesheet mixes them (color-mix, e.g. hover).
  const rgba = (s) => {
    const srgb = s.match(/color\(srgb\s+([^)]+)\)/);
    if (srgb) {
      const p = srgb[1].split(/[ /]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none" && !/gradient/.test(cs.backgroundImage)) return null; // an image: unknown
      const c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const walker = document.createTreeWalker(scope === document ? document.body : scope, NodeFilter.SHOW_TEXT);
  const done = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || done.has(el) || !n.textContent.trim()) continue;
    done.add(el);
    if (!shown(el) || el.closest("[disabled], [aria-disabled='true'], option, .chart-tip")) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 1) continue;
    const bg = backdrop(el);
    const fg = rgba(cs.color);
    if (!bg || !fg) continue;
    const c = over(fg, bg);
    const L1 = lum(c);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < minContrast) out.push({ kind: "contrast", el: `${describe(el)} ${ratio.toFixed(2)}:1` });
  }
  if (!document.querySelector("main")) out.push({ kind: "landmark", el: "no <main>" });
  if (scope === document && !document.querySelector(".place h1, main h1")) out.push({ kind: "landmark", el: "no h1 in the place" });
  return out;
}
