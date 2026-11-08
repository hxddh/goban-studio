/**
 * Small shared pieces: icons, buttons, segmented controls, the board.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BoardView, frameAspect } from "../board.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import { ICONS } from "./icons.js";
import { boardName } from "../a11y.js";
import { boardKey } from "./announcer.js";

export function Icon({ name, size = 18 }) {
  return (
    <svg class="icon" viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.more }} />
  );
}

export function Button({ kind = "secondary", icon, children, onClick, disabled, title, size, class: cls = "", ...rest }) {
  return (
    <button type="button" class={`btn ${kind} ${size || ""} ${cls}`} onClick={onClick} disabled={disabled} title={title} aria-label={title || undefined} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, label, onClick, disabled, active, size = 18, class: cls = "", ...rest }) {
  return (
    <button type="button" class={`icon-btn ${active ? "on" : ""} ${cls}`} onClick={onClick} disabled={disabled} title={label} aria-label={label} aria-pressed={active === undefined ? undefined : !!active} {...rest}>
      <Icon name={icon} size={size} />
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
    // v13: registered at once, so the cleanup always removes it. (A timer
    // here added it after a cleanup that ran first: a listener left behind
    // for every menu closed within the same tick.) The click that opened the
    // menu has already had its pointerdown, so it does not close it.
    document.addEventListener("pointerdown", close);
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
      ref.current.querySelector(".icon-btn")?.focus();
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
                  // Focus goes back to the menu button, so a sheet the item
                  // opens returns it there when it closes (v6 a11y).
                  ref.current?.querySelector(".icon-btn")?.focus();
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
    view.current?.setModel(model);
    window.__board = view.current;
  });
  // v6 a11y: the board's keys and what they say (announcer.js). Arrows and
  // the reading keys work on every board, playable or not.
  const [spoken, setSpoken] = useState("");
  const onKey = (e) => {
    const bv = view.current;
    const said = boardKey(e, bv);
    if (said === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (said === "play") handlers.current.onPlay?.(bv.model.cursor.x, bv.model.cursor.y);
    // A trailing zero-width space makes the same words speak again.
    else if (said) setSpoken((prev) => (prev === said ? said + "\u200b" : said));
  };
  return (
    <div class="board-area">
    <div class="board-frame" style={{ "--aspect": frameAspect(model) }}>
      <canvas
        ref={canvas}
        class="board"
        tabIndex={0}
        role="application"
        aria-label={label || boardName(model.size || 19)}
        aria-describedby="board-keys"
        onKeyDown={onKey}
        onBlur={() => {
          if (view.current) {
            view.current.model.cursor = null;
            view.current.draw();
          }
        }}
      />
      <span class="sr-only" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
      <span class="sr-only" id="board-keys">
        {t("a11y.keysHelp")}
      </span>
    </div>
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
    const css = getComputedStyle(c);
    g.fillStyle = css.getPropertyValue("--thumb-board").trim() || "#e4cb9a";
    g.fillRect(0, 0, px, px);
    g.strokeStyle = css.getPropertyValue("--thumb-line").trim() || "rgba(60,40,20,0.35)";
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
  }, [thumb, size, state.settings?.appearance]);
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
    // Reduced motion (§8): the final number at once (v6 a11y).
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(b);
      from.current = b;
      return;
    }
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

/**
 * v10: a problem's position, small: its diagram (solver.js notation, one
 * string per row) drawn as a square tile of 32 css px, so the rows of
 * Learn's path that share a title look different. Nothing before the
 * problem's part has arrived (content.js), the caller shows its icon.
 */
export function DiagramThumb({ diagram, label = "" }) {
  const ref = useRef(null);
  const key = Array.isArray(diagram) ? diagram.join("|") : "";
  useEffect(() => {
    const c = ref.current;
    if (!c || !key) return;
    const rows = diagram.map((r) => r.replace(/\s+/g, "").split(""));
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const px = 32;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = px * dpr;
    c.height = px * dpr;
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const css = getComputedStyle(c);
    const n = Math.max(w, h);
    const cell = px / n;
    const ox = (px - w * cell) / 2;
    const oy = (px - h * cell) / 2;
    g.fillStyle = css.getPropertyValue("--thumb-board").trim() || "#e4cb9a";
    g.fillRect(0, 0, px, px);
    g.strokeStyle = css.getPropertyValue("--thumb-line").trim() || "rgba(60,40,20,0.35)";
    g.lineWidth = 0.5;
    g.beginPath();
    for (let y = 0; y < h; y++) {
      g.moveTo(ox + cell / 2, oy + cell * (y + 0.5));
      g.lineTo(ox + cell * (w - 0.5), oy + cell * (y + 0.5));
    }
    for (let x = 0; x < w; x++) {
      g.moveTo(ox + cell * (x + 0.5), oy + cell / 2);
      g.lineTo(ox + cell * (x + 0.5), oy + cell * (h - 0.5));
    }
    g.stroke();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        const black = ch === "X" || ch === "x";
        if (!black && ch !== "O" && ch !== "o") continue;
        g.beginPath();
        g.arc(ox + cell * (x + 0.5), oy + cell * (y + 0.5), cell * 0.46, 0, Math.PI * 2);
        g.fillStyle = black ? "#1b1a17" : "#fbf8f1";
        g.fill();
        if (!black) {
          g.lineWidth = Math.max(0.5, cell * 0.08);
          g.strokeStyle = "rgba(27,26,23,0.45)";
          g.stroke();
        }
      }
    }
  }, [key]);
  return <canvas ref={ref} class="dthumb" width="32" height="32" role="img" aria-label={label} />;
}
