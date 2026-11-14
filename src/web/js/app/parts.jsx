/**
 * Small shared pieces: icons, buttons, segmented controls, the board, and
 * the pieces every view uses to say "loading", "that failed" and "done".
 *
 * Feedback, in one place (use these rather than inventing a local one):
 *
 * - Something happened, briefly: `toast(message, tone, ms?, opts?)` from
 *   store.js. Tones: "info", "success", "warning", "error" (an error stays
 *   until dismissed). One optional button:
 *     toast(t("library.deleted"), "info", { action: { label: t("common.undoAction"), run: restore }, onClose: (reason) => … })
 *   `key` shows one toast per key; `replace` swaps the old one for the new.
 *
 * - A view loads something itself: useAsync + <Async>.
 *     const games = useAsync(() => loadSomething(id), [id]);
 *     <Async state={games} label={t("task.loading")} error={t("task.failed")}>{(value) => <List items={value} />}</Async>
 *   useAsync returns { status: "loading" | "ready" | "error", slow, value,
 *   error, retry }. `slow` turns true ASYNC_DELAY ms after the load began,
 *   so a fast load never flashes a spinner; <Async> draws nothing until
 *   then, a <Loading> line after, an <ErrorCard compact> with Retry on
 *   failure, and children(value) once ready.
 *
 * - A click starts something in a controller (a file read, a content part
 *   fetched): `runTask(key, fn, { label, error })` from store.js. The shell
 *   shows it (feedback.jsx TaskNotice): nothing for 300 ms, then the label
 *   with a spinner, and on failure the error with Retry. To draw it in
 *   place instead (a spinner in the row that was clicked), read
 *   `taskOf(key)`: null, or { status: "loading" | "error", label, message,
 *   retry }.
 *
 * - Something broke: <ErrorCard title body actions /> is the one error
 *   surface (a page that could not render, a list that could not load).
 *   `actions` is [{ label, onClick, primary }]; `compact` is the inline
 *   size. feedback.jsx wraps pages and sheets in an <ErrorBoundary> that
 *   shows it, so a view does not need its own try/catch around rendering.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { BoardView, frameAspect } from "../board.js";
import { currentPalette, onBoardTheme } from "../theme.js";
import { fromDiagram as thumbFromDiagram, fromString as thumbFromString, paintThumb } from "../thumb.js";
import { t } from "../i18n.js";
import { state, update } from "./store.js";
import { ICONS } from "./icons.js";
import { boardName } from "../a11y.js";
import { boardKey } from "./announcer.js";
import { expose } from "./debug.js";

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

/* ----------------------------------------------- loading, errors, async */

/** A small turning ring (still, with reduced motion). */
export function Spinner({ size = 14 }) {
  return <span class="spinner" style={{ width: size + "px", height: size + "px" }} aria-hidden="true" />;
}

/** "Loading…" with a spinner, announced politely. */
export function Loading({ label }) {
  return (
    <p class="loading-line" role="status">
      <Spinner />
      <span>{label || t("task.loading")}</span>
    </p>
  );
}

/**
 * The one error surface: what happened in a sentence, and what to do.
 * `actions`: [{ label, onClick, primary }]. `compact`: the inline size (a
 * section that could not load), without the icon and the card's padding.
 */
export function ErrorCard({ title, body, actions = [], compact = false, ...rest }) {
  return (
    <div class={`error-card ${compact ? "compact" : ""}`} role="alert" {...rest}>
      {!compact && <Icon name="error" size={22} />}
      <div class="error-text">
        {title && <strong>{title}</strong>}
        {body && <p>{body}</p>}
      </div>
      {actions.length > 0 && (
        <div class="actions">
          {actions.map((a) => (
            <Button kind={a.primary ? "primary" : "secondary"} size={compact ? "sm" : undefined} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** How long a load runs before it is called slow (and shows a spinner). */
export const ASYNC_DELAY = 300;

/**
 * Run `fn()` (a promise) when the component mounts and whenever `deps`
 * change. Returns { status, slow, value, error, retry }; see the top of
 * this file. A result that arrives after the deps changed is dropped.
 */
export function useAsync(fn, deps = []) {
  const [turn, setTurn] = useState(0);
  const [s, setS] = useState({ status: "loading", slow: false, value: undefined, error: null });
  useEffect(() => {
    let live = true;
    setS((prev) => ({ ...prev, status: "loading", slow: false, error: null }));
    const timer = setTimeout(() => live && setS((prev) => (prev.status === "loading" ? { ...prev, slow: true } : prev)), ASYNC_DELAY);
    let p;
    try {
      p = Promise.resolve(fn());
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      (value) => live && setS({ status: "ready", slow: false, value, error: null }),
      (error) => {
        console.warn("load failed:", error);
        if (live) setS({ status: "error", slow: false, value: undefined, error });
      },
    ).finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [...deps, turn]);
  return { ...s, retry: () => setTurn((n) => n + 1) };
}

/** Draw a useAsync state: nothing, then <Loading>, then the error with Retry or children(value). */
export function Async({ state: s, label, error, children }) {
  if (s.status === "ready") return typeof children === "function" ? children(s.value) : children;
  if (s.status === "error") return <ErrorCard compact body={error || t("task.failed")} actions={[{ label: t("common.retry"), onClick: s.retry }]} />;
  return s.slow ? <Loading label={label} /> : null;
}

/** Popover menu anchored to a "more" button. */
/**
 * A menu under a button: the "more" button of a row by default; with
 * `text`, a quiet button that says the choice in force (an order). An item
 * with `checked` (true or false) is one of a set of choices and shows a
 * check when it is the one.
 */
export function MoreMenu({ id, items, label, icon = "more", text = null }) {
  const open = state.menu === id;
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) update({ menu: null });
    };
    // Registered at once, so the cleanup always removes it. (A timer
    // here added it after a cleanup that ran first: a listener left behind
    // for every menu closed within the same tick.) The click that opened the
    // menu has already had its pointerdown, so it does not close it.
    document.addEventListener("pointerdown", close);
    // The first item that can be chosen (a disabled first item cannot take the focus).
    ref.current?.querySelector("[role^=menuitem]:not([disabled])")?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const onKey = (e) => {
    // Only an open menu takes keys: with the menu closed and the focus on
    // its button, Esc and the arrows belong to the page (a sheet, a review).
    if (!open) return;
    const list = [...ref.current.querySelectorAll("[role^=menuitem]:not([disabled])")];
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      ref.current.querySelector("[aria-haspopup]")?.focus();
      update({ menu: null });
    }
  };
  const toggle = () => update({ menu: open ? null : id });
  return (
    <div class="menu-wrap" ref={ref} onKeyDown={onKey}>
      {text ? (
        <button type="button" class="btn ghost sm menu-btn" aria-label={t("common.labelValue", [label, text])} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <Icon name={icon} size={16} />
          <span>{text}</span>
        </button>
      ) : (
        <IconButton icon={icon} label={label || t("common.more")} aria-haspopup="menu" aria-expanded={open} onClick={toggle} />
      )}
      {open && (
        <div class="menu" role="menu">
          {items.filter(Boolean).map((it) =>
            it === "-" ? (
              <hr />
            ) : (
              <button
                type="button"
                role={it.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={it.checked === undefined ? undefined : !!it.checked}
                class={it.danger ? "danger" : ""}
                disabled={it.disabled}
                onClick={() => {
                  // Focus goes back to the menu button, so a sheet the item
                  // opens returns it there when it closes.
                  ref.current?.querySelector("[aria-haspopup]")?.focus();
                  update({ menu: null });
                  it.onClick();
                }}
              >
                {it.checked !== undefined && (it.checked ? <Icon name="check" size={16} /> : <span class="menu-blank" />)}
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
  // Layout effects, not effects: the board must know what it may do (take
  // a move, show this position) in the same commit as the page, not at the
  // next frame. A click in between (the player's turn has come, the board
  // still says it is the computer's) was dropped.
  useLayoutEffect(() => {
    view.current = new BoardView(canvas.current, {
      onPlay: (x, y) => handlers.current.onPlay?.(x, y),
      onHover: (v) => {
        const r = handlers.current.onHover?.(v);
        if (view.current && typeof r === "boolean") view.current.model.hoverValid = r;
      },
    });
    return () => view.current?.destroy();
  }, []);
  useLayoutEffect(() => {
    // The last-move mark is a setting of the board, whatever the page.
    view.current?.setModel({ ...model, lastMark: state.settings?.lastMoveMark !== false });
    expose("__board", view.current);
  });
  // The board's keys and what they say (announcer.js). Arrows and
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

/** The board palette in force (theme.js), as a key that changes with the theme and the board style. */
function usePaletteKey() {
  const [key, setKey] = useState(currentPalette().key);
  useEffect(() => onBoardTheme(() => setKey(currentPalette().key)), []);
  return key;
}

/**
 * Mini board thumbnail from a compact "b/w/." string (one character per
 * point, data/games.js thumbnail). Drawn by the shared renderer (thumb.js)
 * at the size CSS gives the canvas, in the board's colours.
 */
export function Thumb({ thumb, size }) {
  const ref = useRef(null);
  const palette = usePaletteKey();
  useEffect(() => {
    if (!thumb || !size) return;
    paintThumb(ref.current, thumbFromString(thumb, size), 76);
  }, [thumb, size, palette]);
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
    // Reduced motion (§8): the final number at once.
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
 * A problem's position, small: its diagram (solver.js notation, one
 * string per row) drawn as a square tile of 32 css px, so the rows of
 * Practice's path that share a title look different. Nothing before the
 * problem's part has arrived (content.js), the caller shows its icon.
 */
export function DiagramThumb({ diagram, label = "", size = 32 }) {
  const ref = useRef(null);
  const key = Array.isArray(diagram) ? diagram.join("|") : "";
  const palette = usePaletteKey();
  useEffect(() => {
    if (!key) return;
    paintThumb(ref.current, thumbFromDiagram(diagram), size);
  }, [key, palette, size]);
  return <canvas ref={ref} class="dthumb" width={size} height={size} style={{ width: `${size}px`, height: `${size}px` }} role="img" aria-label={label} />;
}
