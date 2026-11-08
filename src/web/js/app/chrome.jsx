/**
 * Window chrome (docs/design.md §3, §7): the sidebar with the four spaces
 * (v12: Today, Play, Practice, Library) and Settings,
 * and the toolbar every place starts with — back/forward, breadcrumbs and
 * title, then the place's own actions. On macOS the toolbar shares its row
 * with the traffic lights and drags the window.
 */
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { Icon, IconButton, MOD } from "./parts.jsx";

/** How each space looks in the sidebar; which spaces there are, and their order, is controller.js SPACES (v13: one list). */
const SPACE_LOOK = {
  today: { icon: "today", key: "nav.today" },
  play: { icon: "play", key: "nav.play" },
  learn: { icon: "practice", key: "nav.learn" },
  library: { icon: "library", key: "nav.library" },
};
export const SPACES = C.SPACES.map((id) => ({ id, ...SPACE_LOOK[id] }));

export function Sidebar() {
  return (
    <nav class="sidebar" aria-label={t("nav.main")}>
      <div class="sb-top" data-drag>
        <span class="sb-brand">
          <img class="sb-mark" src="assets/brand.svg" width="18" height="18" alt="" />
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
 */
export function Toolbar({ crumbs = [], title, sub, children, class: cls = "" }) {
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
        {title && <h1>{title}</h1>}
        {sub && <span class="tb-sub">{sub}</span>}
      </div>
      <div class="tb-actions">{children}</div>
    </header>
  );
}

export function isFocus() {
  return !!state.settings.focus && C.boardShown();
}
