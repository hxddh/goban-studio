/**
 * Window chrome (docs/design.md §3, §7): the sidebar with the four spaces
 * (Today, Play, Practice, Library) and Settings,
 * and the toolbar every place starts with — back/forward, breadcrumbs and
 * title, then the place's own actions. On macOS the toolbar shares its row
 * with the traffic lights and drags the window.
 */
import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Icon, IconButton, MOD } from "./parts.jsx";
import { StatusChip } from "./status-chip.jsx";

/** How each space looks in the sidebar; which spaces there are, and their order, is spaces.js SPACES (one list). */
const SPACE_LOOK = {
  today: { icon: "today", key: "nav.today" },
  play: { icon: "play", key: "nav.play" },
  practice: { icon: "practice", key: "nav.practice" },
  library: { icon: "library", key: "nav.library" },
};
export const SPACES = C.SPACES.map((id) => ({ id, ...SPACE_LOOK[id] }));

/**
 * The app's mark, drawn in the board's colours (the CSS variables theme.js
 * sets), so it dims with the board in the dark theme and follows the
 * high-contrast style.
 */
export function Mark({ size = 18 }) {
  return (
    <svg class="sb-mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect class="mark-board" width="64" height="64" rx="14.5" />
      <path class="mark-line" d="M20.5 3V61M3 20.5H61M43.5 3V61M3 43.5H61" />
      <circle class="mark-black" cx="20.5" cy="20.5" r="10.5" />
      <circle class="mark-white" cx="43.5" cy="43.5" r="10.5" />
    </svg>
  );
}

/** Narrow windows (the board's panel is a bar under the board): styles.css uses the same width. */
const NARROW_QUERY = "(max-width: 860px)";

/** Whether the window is narrow now; follows resizes. */
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(NARROW_QUERY);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    on();
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

/**
 * Something a narrow window keeps behind a disclosure (the move list
 * under the game bar): in a wide window its children as they are, in a
 * narrow one a closed row with `label` that opens them.
 */
export function NarrowFold({ label, children }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  if (!narrow) return children;
  return (
    <div class={`narrow-fold ${open ? "open" : ""}`}>
      <button type="button" class="disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? "down" : "next"} size={14} /> {label}
      </button>
      {open && children}
    </div>
  );
}

export function Sidebar() {
  return (
    <nav class="sidebar" aria-label={t("nav.main")}>
      <div class="sb-top" data-drag>
        <span class="sb-brand">
          <Mark size={18} />
          <span>Goban Studio</span>
        </span>
      </div>
      <ul class="sb-list">
        {SPACES.map((sp, i) => (
          <li>
            <button
              type="button"
              class={`sb-item ${state.space === sp.id ? "on" : ""}`}
              aria-current={state.space === sp.id ? "page" : undefined}
              title={`${t(sp.key)} (${MOD}${i + 1})`}
              onClick={() => C.goSpace(sp.id)}
            >
              <Icon name={sp.icon} size={18} />
              <span>{t(sp.key)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div class="sb-foot">
        <StatusChip />
        <button type="button" class="sb-item" title={`${t("nav.settings")} (${MOD},)`} onClick={() => C.openSheet("settings")}>
          <Icon name="gear" size={18} />
          <span>{t("nav.settings")}</span>
        </button>
      </div>
    </nav>
  );
}

/**
 * The toolbar. `crumbs` are links back up the hierarchy; `title` is the
 * current place (list pages leave it out and show a large title instead);
 * children are the actions, right-aligned — at most one primary.
 * @param {{ crumbs?: { label: any, onClick?: () => any }[], title?: any, titleLang?: string, sub?: any, children?: any, class?: string }} props
 */
export function Toolbar({ crumbs = [], title, titleLang = null, sub, children, class: cls = "" }) {
  return (
    <header class={`toolbar ${cls}`} data-drag>
      <div class="tb-nav">
        <IconButton icon="back" label={`${t("nav.back")} (${MOD}[)`} onClick={C.back} disabled={!C.canGoBack()} />
        <IconButton icon="forward" label={`${t("nav.forward")} (${MOD}])`} onClick={C.forward} disabled={!C.canGoForward()} />
      </div>
      <div class="tb-title">
        {crumbs.map((c) => (
          <>
            <button type="button" class="crumb" onClick={c.onClick}>
              {c.label}
            </button>
            <Icon name="next" size={12} />
          </>
        ))}
        {title && <h1 lang={titleLang || undefined}>{title}</h1>}
        {sub && <span class="tb-sub">{sub}</span>}
      </div>
      <div class="tb-actions">{children}</div>
    </header>
  );
}

export function isFocus() {
  return !!state.settings.focus && C.boardShown();
}
