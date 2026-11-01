/**
 * Small shared pieces: icons, buttons, segmented controls, the board.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BoardView } from "../board.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import { ICONS } from "./icons.js";

const PATHS = {
  today: '<rect x="3" y="4" width="14" height="13" rx="2.5"/><path d="M3 8h14M7 2.5v3M13 2.5v3"/><circle cx="10" cy="12.5" r="1.6"/>',
  forward: '<path d="M8.5 4.5L14 10l-5.5 5.5"/>',
  branch: '<circle cx="6" cy="4.5" r="1.6"/><circle cx="6" cy="15.5" r="1.6"/><circle cx="14" cy="8" r="1.6"/><path d="M6 6.1v7.8M14 9.6c0 3-8 2-8 4.3"/>',
  sparkle: '<path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
  play: '<rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M7.7 3v14M12.3 3v14M3 7.7h14M3 12.3h14"/>',
  practice: '<path d="M3.5 5.2c2.2-1 4.4-1 6.5.4 2.1-1.4 4.3-1.4 6.5-.4v10c-2.2-1-4.4-1-6.5.4-2.1-1.4-4.3-1.4-6.5-.4z"/><path d="M10 5.6v10"/>',
  library: '<rect x="3.5" y="3" width="4" height="14" rx="1"/><rect x="8.5" y="3" width="4" height="14" rx="1"/><path d="M14 4.2l3.2.8-2.6 12-3.1-.8"/>',
  gear: '<circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2M10 15.4v2M2.6 10h2M15.4 10h2M4.8 4.8l1.4 1.4M13.8 13.8l1.4 1.4M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4"/>',
  keyboard: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.5 8h1M9.5 8h1M13.5 8h1M5.5 11h1M8 12.2h4M13.5 11h1"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  undo: '<path d="M7 5L3.8 8.2 7 11.4"/><path d="M4.2 8.2H12a4 4 0 0 1 0 8H8.5"/>',
  pass: '<path d="M3.5 10h12"/><path d="M12 6.5l3.5 3.5-3.5 3.5"/>',
  more: '<circle cx="5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15" cy="10" r="1.2"/>',
  first: '<path d="M5 4.5v11M15 5.5l-6 4.5 6 4.5z"/>',
  prev: '<path d="M12.5 4.5L7 10l5.5 5.5"/>',
  next: '<path d="M7.5 4.5L13 10l-5.5 5.5"/>',
  last: '<path d="M15 4.5v11M5 5.5l6 4.5-6 4.5z"/>',
  back: '<path d="M11.5 4.5L6 10l5.5 5.5"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
  eye: '<path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2"/>',
  target: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.5"/>',
  bulb: '<path d="M7.5 15.5h5M8 17.5h4"/><path d="M7.6 13.5c-1.6-1-2.6-2.6-2.6-4.4a5 5 0 0 1 10 0c0 1.8-1 3.4-2.6 4.4"/>',
  flag: '<path d="M5 17.5V3"/><path d="M5 3.5h9l-1.6 3.2L14 10H5z"/>',
  save: '<path d="M4 4h9.5L16 6.5V16H4z"/><path d="M7 4v4h6V4M7 16v-5h6v5"/>',
  download: '<path d="M10 3.5v9"/><path d="M6.5 9l3.5 3.5L13.5 9"/><path d="M4 16h12"/>',
  upload: '<path d="M10 13V4"/><path d="M6.5 7.5L10 4l3.5 3.5"/><path d="M4 16h12"/>',
  trash: '<path d="M4.5 6h11"/><path d="M8 6V4h4v2"/><path d="M6 6l.7 10h6.6L14 6"/>',
  edit: '<path d="M4 16l1-4L13 4l3 3-8 8z"/>',
  focus: '<path d="M3.5 7.5V3.5h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/>',
  chart: '<path d="M3 16.5h14"/><path d="M4.5 13l3.5-4 3 2.5 4.5-6"/>',
  replay: '<path d="M4 10a6 6 0 1 0 1.8-4.3"/><path d="M4 3.5v3h3"/>',
  search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l3.5 3.5"/>',
  down: '<path d="M5 7.5l5 5 5-5"/>',
  resume: '<path d="M7 4.5l8 5.5-8 5.5z"/>',
  flame: '<path d="M10 17c-3 0-5-2-5-4.8 0-3.2 3-4.6 3-8.2 2.6 1.4 4 3.4 4 5.6.8-.6 1.3-1.5 1.4-2.6 1.4 1.4 1.6 3 1.6 5.2C15 15 13 17 10 17z"/>',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg class="icon" viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || PATHS[name] || ICONS.more || PATHS.more }} />
  );
}

export function Button({ kind = "secondary", icon, children, onClick, disabled, title, size, class: cls = "", ...rest }) {
  return (
    <button type="button" class={`btn ${kind} ${size || ""} ${cls}`} onClick={onClick} disabled={disabled} title={title} aria-label={title || undefined} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, onClick, disabled, active, class: cls = "", ...rest }) {
  return (
    <button type="button" class={`icon-btn ${active ? "on" : ""} ${cls}`} onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active === undefined ? undefined : !!active} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Segmented({ value, options, onChange, label, class: cls = "" }) {
  return (
    <div class={`segmented ${cls}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.value} class={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <label class="row switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  );
}

export function Stepper({ value, min, max, step = 1, onChange, format = (v) => v, label }) {
  const clamp = (v) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <output>{format(value)}</output>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
        +
      </button>
    </div>
  );
}

export function Stone({ color, size = 14 }) {
  return <span class={`stone ${color > 0 ? "b" : "w"}`} style={{ width: size + "px", height: size + "px" }} aria-hidden="true" />;
}

export function GradeDots({ grade, max = 5 }) {
  return (
    <span class="grade-dots" title={t("practice.grade", [grade])} aria-label={t("practice.grade", [grade])}>
      {Array.from({ length: max }, (_, i) => (
        <i class={i < grade ? "on" : ""} />
      ))}
    </span>
  );
}

/** Popover menu anchored to a "more" button. */
export function MoreMenu({ id, items, label }) {
  const open = state.menu === id;
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) update({ menu: null });
    };
    setTimeout(() => document.addEventListener("pointerdown", close), 0);
    ref.current?.querySelector("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const onKey = (e) => {
    const list = [...ref.current.querySelectorAll("[role=menuitem]:not([disabled])")];
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      update({ menu: null });
    }
  };
  return (
    <div class="menu-wrap" ref={ref} onKeyDown={onKey}>
      <IconButton icon="more" label={label || t("common.more")} aria-haspopup="menu" aria-expanded={open} onClick={() => update({ menu: open ? null : id })} />
      {open && (
        <div class="menu" role="menu">
          {items.filter(Boolean).map((it) =>
            it === "-" ? (
              <hr />
            ) : (
              <button
                type="button"
                role="menuitem"
                class={it.danger ? "danger" : ""}
                disabled={it.disabled}
                onClick={() => {
                  update({ menu: null });
                  it.onClick();
                }}
              >
                {it.icon && <Icon name={it.icon} size={16} />}
                <span>{it.label}</span>
                {it.kbd && <kbd>{it.kbd}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
export const MOD = isMac ? "⌘" : "Ctrl+";
export const SHIFT = isMac ? "⇧" : "Shift+";

/**
 * The board. `model` is a BoardView model patch; the canvas is created once
 * and updated in place.
 */
export function Board({ model, onPlay, onHover, label }) {
  const canvas = useRef(null);
  const view = useRef(null);
  const handlers = useRef({ onPlay, onHover });
  handlers.current = { onPlay, onHover };
  useEffect(() => {
    view.current = new BoardView(canvas.current, {
      onPlay: (x, y) => handlers.current.onPlay?.(x, y),
      onHover: (v) => {
        const r = handlers.current.onHover?.(v);
        if (view.current && typeof r === "boolean") view.current.model.hoverValid = r;
      },
    });
    return () => view.current?.destroy();
  }, []);
  useEffect(() => {
    view.current?.setModel({ ...model, flatStones: !!state.settings?.flatStones });
    window.__board = view.current;
  });
  const onKey = (e) => {
    const bv = view.current;
    if (!bv || !bv.model.interactive) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      bv.moveCursor(d[0], d[1]);
      setCursorLabel(bv.model.cursor);
    } else if ((e.key === "Enter" || e.key === " ") && bv.model.cursor) {
      e.preventDefault();
      e.stopPropagation();
      handlers.current.onPlay?.(bv.model.cursor.x, bv.model.cursor.y);
    }
  };
  const [cursorLabel, setCursorLabelState] = useState("");
  const setCursorLabel = (c) => {
    if (!c) return;
    const size = view.current.model.size;
    const letters = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
    const v = view.current.model.board?.[c.y]?.[c.x];
    setCursorLabelState(`${letters[c.x]}${size - c.y}${v ? " · " + t(v > 0 ? "common.black" : "common.white") : ""}`);
  };
  return (
    <div class="board-frame">
      <canvas
        ref={canvas}
        class="board"
        tabIndex={0}
        role="application"
        aria-roledescription={t("a11y.board")}
        aria-label={label || t("a11y.boardHelp")}
        onKeyDown={onKey}
        onBlur={() => {
          if (view.current) {
            view.current.model.cursor = null;
            view.current.draw();
          }
        }}
      />
      <span class="sr-only" aria-live="polite">
        {cursorLabel}
      </span>
    </div>
  );
}

/** Mini board thumbnail from a compact "b/w/." string. */
export function Thumb({ thumb, size }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !thumb || !size) return;
    const px = 76;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = px * dpr;
    c.height = px * dpr;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const cell = px / size;
    g.fillStyle = getComputedStyle(c).getPropertyValue("--thumb-board") || "#e2c08d";
    g.fillRect(0, 0, px, px);
    g.strokeStyle = "rgba(60,40,20,0.35)";
    g.lineWidth = 0.5;
    g.beginPath();
    for (let i = 0; i < size; i++) {
      const p = cell * (i + 0.5);
      g.moveTo(cell / 2, p);
      g.lineTo(px - cell / 2, p);
      g.moveTo(p, cell / 2);
      g.lineTo(p, px - cell / 2);
    }
    g.stroke();
    for (let i = 0; i < thumb.length; i++) {
      const ch = thumb[i];
      if (ch === ".") continue;
      const x = i % size;
      const y = Math.floor(i / size);
      g.fillStyle = ch === "b" ? "#1d1d1b" : "#f7f4ec";
      g.beginPath();
      g.arc(cell * (x + 0.5), cell * (y + 0.5), cell * 0.47, 0, Math.PI * 2);
      g.fill();
      if (ch === "w") {
        g.strokeStyle = "rgba(0,0,0,0.25)";
        g.stroke();
      }
    }
  }, [thumb, size]);
  return <canvas ref={ref} class="thumb" aria-hidden="true" />;
}

/** Count up to a number, for the score. */
export function CountUp({ value, start = 0, format = (v) => v }) {
  const [shown, setShown] = useState(start);
  const from = useRef(start);
  useEffect(() => {
    const t0 = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round((a + (b - a) * e) * 2) / 2);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}
