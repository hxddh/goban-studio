/**
 * Modal sheets: new game, settings, onboarding, shortcuts, confirm, rename.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BLACK, WHITE, RULESETS, defaultKomi, formatPoints, rulesetById } from "../rules.js";
import { currentLadder, installed, nearest, suggestHandicap } from "../engine.js";
import { LANG_IDS, LANG_NAMES, t } from "../i18n.js";
import { APP_VERSION } from "../version.js";
import * as U from "../update.js";
import * as Models from "../models.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { rankLabel } from "./play.jsx";
import { estimateLabel } from "./estimate-label.js";
import { Button, Icon, IconButton, MOD, SHIFT, Segmented, Stepper, Switch } from "./parts.jsx";
import { boardKeyRows, a11yKeyRows } from "../a11y.js";

export function Sheets() {
  const sheet = state.sheet;
  if (!sheet) return null;
  const map = { newGame: NewGameSheet, settings: SettingsSheet, onboarding: Onboarding, shortcuts: ShortcutsSheet, confirm: ConfirmSheet, rename: RenameSheet };
  const Comp = map[sheet.kind];
  return Comp ? <Comp {...sheet} /> : null;
}

function Modal({ title, children, footer, wide, onClose = C.closeSheet, labelledBy, class: cls = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    // Focus the intended control, or the sheet itself (no stray focus ring
    // on the close button when nothing is primary).
    const first = ref.current?.querySelector("[data-autofocus]") || ref.current?.querySelector("button.primary") || ref.current;
    first?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);
  const onKey = (e) => {
    if (e.key !== "Tab") return;
    const items = [...ref.current.querySelectorAll("button:not([disabled]), input:not([disabled]), select, [tabindex='0']")];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div class="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`sheet ${wide ? "wide" : ""} ${cls}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelledBy || "sheet-title"} ref={ref} onKeyDown={onKey}>
        {title && (
          <header class="sheet-head">
            <h2 id="sheet-title">{title}</h2>
            {onClose && <IconButton icon="close" label={t("common.close")} onClick={onClose} />}
          </header>
        )}
        <div class="sheet-body">{children}</div>
        {footer && <footer class="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- new game */

// The standard board first; the smaller ones are quicker games.
const PRESETS = [
  { size: 19, key: "full" },
  { size: 13, key: "medium" },
  { size: 9, key: "quick" },
];

function NewGameSheet({ prefill }) {
  const s = state.settings;
  const rec = C.recommendedGame();
  const [size, setSize] = useState(prefill?.size || s.boardSize || rec.size);
  const [tc, setTc] = useState(s.timeControl || "none");
  const [opponent, setOpponent] = useState("ai");
  const [color, setColor] = useState(BLACK);
  // v9: one axis, the ranks of the ladder (opponents.js); each shows the
  // measured rank of what plays it with the networks installed.
  const ranks = currentLadder();
  const startRank = nearest(prefill?.opponentRank ?? (s.autoStrength ? rec.opponentRank : s.opponentRank), installed()).rank;
  const [rankIdx, setRankIdx] = useState(Math.max(0, ranks.findIndex((e) => e.rank === startRank)));
  const choice = ranks[Math.min(rankIdx, ranks.length - 1)];
  const suggested = opponent === "ai" ? suggestHandicap(rec.rank, choice.label, size) : 0;
  const [advanced, setAdvanced] = useState(false);
  const [handicap, setHandicap] = useState(null);
  const [komi, setKomi] = useState(null);
  const [rules, setRules] = useState(prefill?.rules || s.defaultRules || "japanese");
  const h = handicap ?? (color === BLACK ? suggested : 0);
  const k = komi ?? defaultKomi(rules, h);
  const start = () =>
    C.newGame({ size, opponent, color, opponentRank: opponent === "ai" ? choice.rank : undefined, handicap: h, komi: k, rules, timeControl: tc, rememberSize: true });
  return (
    <Modal
      title={t("common.newGame")}
      wide
      footer={
        <>
          <Button kind="ghost" onClick={C.closeSheet}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" onClick={start}>
            {t("newGame.start")}
          </Button>
        </>
      }
    >
      <div class="preset-row" role="radiogroup" aria-label={t("newGame.board")}>
        {PRESETS.map((p) => (
          <button type="button" role="radio" aria-checked={size === p.size} class={`preset ${size === p.size ? "on" : ""}`} onClick={() => setSize(p.size)}>
            <MiniGrid size={p.size} />
            <strong>
              {p.size} × {p.size}
            </strong>
            <span>{t("newGame." + p.key)}</span>
          </button>
        ))}
      </div>

      <div class="form">
        <div class="row">
          <span>{t("newGame.opponent")}</span>
          <Segmented
            label={t("newGame.opponent")}
            value={opponent}
            onChange={setOpponent}
            options={[
              { value: "ai", label: t("newGame.computer") },
              { value: "human", label: t("newGame.twoPlayers") },
            ]}
          />
        </div>
        {opponent === "ai" && (
          <>
            <div class="row">
              <span>{t("newGame.strength")}</span>
              <div class="slider-field">
                <input
                  type="range"
                  min="0"
                  max={ranks.length - 1}
                  step="1"
                  value={rankIdx}
                  aria-label={t("newGame.strength")}
                  aria-valuetext={rankLabel(choice.label)}
                  onInput={(e) => {
                    setRankIdx(Number(e.currentTarget.value));
                    setHandicap(null);
                    setKomi(null);
                  }}
                />
                <output>{rankLabel(choice.label)}</output>
              </div>
            </div>
            <div class="row">
              <span>{t("newGame.yourColor")}</span>
              <Segmented
                label={t("newGame.yourColor")}
                value={color}
                onChange={(v) => {
                  setColor(v);
                  setHandicap(null);
                  setKomi(null);
                }}
                options={[
                  { value: BLACK, label: t("common.black") },
                  { value: WHITE, label: t("common.white") },
                  { value: "random", label: t("newGame.random") },
                ]}
              />
            </div>
          </>
        )}
        {!state.engine.available && opponent === "ai" && <p class="fine">{t("newGame.offline")}</p>}
        {suggested > 0 && handicap == null && color === BLACK && <p class="note">{t("newGame.suggested", [suggested])}</p>}

        <button type="button" class="disclosure" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
          <Icon name={advanced ? "down" : "next"} size={14} /> {t("newGame.advanced")}
          <span class="fine">
            {t(rulesetById(rules).labelKey)} · {t("newGame.advancedSummary", [h || t("common.none"), formatPoints(k)])}
          </span>
        </button>
        {advanced && (
          <>
            <div class="row">
          <span>{t("newGame.time")}</span>
          <Segmented
            label={t("newGame.time")}
            value={tc}
            onChange={setTc}
            options={[
              { value: "none", label: t("time.none") },
              { value: "move30", label: t("time.move30") },
              { value: "byoyomi", label: t("time.byoyomi") },
            ]}
          />
        </div>

            <div class="row">
              <span>{t("common.handicap")}</span>
              <Stepper
                label={t("common.handicap")}
                value={h}
                min={0}
                max={size === 9 ? 5 : 9}
                onChange={(v) => {
                  setHandicap(v === 1 ? (h === 0 ? 2 : 0) : v);
                  setKomi(null);
                }}
                format={(v) => (v ? v : t("common.none"))}
              />
            </div>
            <div class="row">
              <span>{t("common.komi")}</span>
              <Stepper label={t("common.komi")} value={k} min={0} max={9.5} step={0.5} onChange={setKomi} format={formatPoints} />
            </div>
            <div class="row">
              <span>{t("rules.title")}</span>
              <Segmented
                label={t("rules.title")}
                value={rules}
                onChange={(v) => {
                  setRules(v);
                  setKomi(null);
                }}
                options={RULESETS.map((r) => ({ value: r.id, label: t(r.labelKey) }))}
              />
            </div>
            <p class="fine">{t(rulesetById(rules).noteKey)}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

function MiniGrid({ size }) {
  const n = size === 9 ? 5 : size === 13 ? 7 : 10;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const p = 4 + (i * 32) / (n - 1);
    lines.push(<line x1="4" x2="36" y1={p} y2={p} />, <line y1="4" y2="36" x1={p} x2={p} />);
  }
  return (
    <svg class="mini-grid" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="0" y="0" width="40" height="40" rx="5" />
      {lines}
    </svg>
  );
}

/* --------------------------------------------------------------- settings */

const SETTINGS_PANES = [
  { id: "general", icon: "gear", key: "settings.pane.general" },
  { id: "board", icon: "grid", key: "settings.pane.board" },
  { id: "playing", icon: "play", key: "settings.pane.playing" },
  { id: "data", icon: "save", key: "settings.pane.data" },
  { id: "about", icon: "info", key: "settings.pane.about" },
];
/** The pane last shown; remembered for the session. */
let settingsPane = "general";

/**
 * Settings (docs/design.md §6): a source list of panes on the left, one
 * pane at a time on the right — like the system's own settings window.
 */
function SettingsSheet({ pane: open }) {
  const s = state.settings;
  const set = C.setSetting;
  // v8: the opponents' networks sit at the end of Playing (no pane of their own).
  const want = open === "engine" ? "playing" : open;
  const [pane, setPane] = useState(want && SETTINGS_PANES.some((p) => p.id === want) ? want : settingsPane);
  const choose = (id) => {
    settingsPane = id;
    setPane(id);
  };
  const rankOptions = [30, 25, 20, 15, 10, 5, 1, -1, -3];
  const rankText = (r) => (r == null ? t("settings.rankUnknown") : r > 0 ? t("rank.kyu", [r]) : t("rank.dan", [1 - r]));
  const onListKey = (e) => {
    const i = SETTINGS_PANES.findIndex((p) => p.id === pane);
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = SETTINGS_PANES[(i + d + SETTINGS_PANES.length) % SETTINGS_PANES.length];
    choose(next.id);
    e.currentTarget.querySelector(`[data-pane="${next.id}"]`)?.focus();
  };
  return (
    <Modal title={t("nav.settings")} wide class="settings-sheet">
      <div class="settings-split">
        <nav class="settings-nav" aria-label={t("nav.settings")} role="tablist" aria-orientation="vertical" onKeyDown={onListKey}>
          {SETTINGS_PANES.map((p) => (
            <button
              type="button"
              role="tab"
              data-pane={p.id}
              aria-selected={pane === p.id}
              tabIndex={pane === p.id ? 0 : -1}
              class={`settings-tab ${pane === p.id ? "on" : ""}`}
              onClick={() => choose(p.id)}
            >
              <Icon name={p.icon} size={16} />
              <span>{t(p.key)}</span>
            </button>
          ))}
        </nav>
        <div class="settings-pane" role="tabpanel" aria-label={t(SETTINGS_PANES.find((p) => p.id === pane).key)}>
          {pane === "general" && (
            <>
              <section class="settings-group">
                <h3>{t("settings.language")}</h3>
                <div class="lang-grid" role="radiogroup" aria-label={t("settings.language")}>
                  {LANG_IDS.map((id) => (
                    <button type="button" role="radio" aria-checked={s.lang === id} class={s.lang === id ? "on" : ""} lang={id} onClick={() => set("lang", id)}>
                      {LANG_NAMES[id]}
                    </button>
                  ))}
                </div>
              </section>
              <section class="settings-group">
                <h3>{t("settings.look")}</h3>
                <div class="row">
                  <span>{t("settings.appearance")}</span>
                  <Segmented
                    label={t("settings.appearance")}
                    value={s.appearance}
                    onChange={(v) => set("appearance", v)}
                    options={[
                      { value: "auto", label: t("settings.auto") },
                      { value: "light", label: t("settings.light") },
                      { value: "dark", label: t("settings.dark") },
                    ]}
                  />
                </div>
                <Switch label={t("settings.sound")} checked={s.sound} onChange={(v) => set("sound", v)} />
                <Switch label={t("a11y.largeText")} checked={!!s.largeText} onChange={(v) => set("largeText", v)} />
              </section>
            </>
          )}
          {pane === "board" && (
            <>
              <section class="settings-group">
                <h3>{t("settings.boardGroup")}</h3>
                <Switch label={t("settings.coordinates")} checked={s.coords} onChange={(v) => set("coords", v)} />
                <Switch label={t("settings.moveNumbers")} checked={s.numbers} onChange={(v) => set("numbers", v)} />
              </section>
            </>
          )}
          {pane === "playing" && (
            <>
              <section class="settings-group">
                <h3>{t("settings.playing")}</h3>
                <Switch label={t("settings.teaching")} checked={C.teachingOn()} onChange={(v) => set("teaching", v)} />
                <p class="fine">{t("settings.teachingHelp")}</p>
                <Switch label={t("settings.confirmMove")} checked={s.confirmMove} onChange={(v) => set("confirmMove", v)} />
                <Switch label={t("settings.showEval")} checked={s.showEval} onChange={(v) => set("showEval", v)} />
                <Switch label={t("settings.liveAnalysis")} checked={s.liveAnalysis} onChange={(v) => set("liveAnalysis", v)} />
                <Switch label={t("settings.autoStrength")} checked={s.autoStrength} onChange={(v) => set("autoStrength", v)} />
                <div class="row">
                  <span>{t("rules.default")}</span>
                  <Segmented label={t("rules.default")} value={s.defaultRules || "japanese"} onChange={(v) => set("defaultRules", v)} options={RULESETS.map((r) => ({ value: r.id, label: t(r.labelKey) }))} />
                </div>
              </section>
              <section class="settings-group">
                <h3>{t("settings.you")}</h3>
                {state.profile && (
                  <div class="row">
                    <span>{t("settings.estimated")}</span>
                    <strong title={t("strength.about")}>{estimateLabel(state.profile)}</strong>
                  </div>
                )}
                <div class="row">
                  <span>{t("settings.yourRank")}</span>
                  <select value={s.playerRank ?? ""} onChange={(e) => C.setPlayerRank(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))} aria-label={t("settings.yourRank")}>
                    <option value="">{t("settings.rankUnknown")}</option>
                    {rankOptions.map((r) => (
                      <option value={r}>{rankText(r)}</option>
                    ))}
                  </select>
                </div>
                <p class="fine">{t("settings.rankHelp")}</p>
              </section>
              <ModelsGroup />
            </>
          )}
          {pane === "data" && (
            <>
              <section class="settings-group">
                <h3>{t("backup.title")}</h3>
                <p class="fine">{t("backup.help")}</p>
                <div class="actions">
                  <Button icon="download" onClick={C.exportBackup}>
                    {t("backup.export")}
                  </Button>
                  <Button kind="ghost" icon="upload" onClick={C.importBackup}>
                    {t("backup.import")}
                  </Button>
                </div>
                <div class="actions">
                  <Button kind="danger" onClick={C.clearData}>
                    {t("settings.clearData")}
                  </Button>
                </div>
              </section>
            </>
          )}
          {pane === "about" && (
            <>
              <section class="settings-group">
                <h3>{t("settings.about")}</h3>
                <p class="about">
                  <strong>Goban Studio {APP_VERSION}</strong>
                  <span class="muted">
                    {state.engine.available ? t("settings.engineOn", [state.engine.name || "KataGo"]) : t("settings.engineOff")}
                  </span>
                  <span class="fine">{t("settings.offline")}</span>
                  <span class="fine">{t("settings.licenses")}: Goban Studio (MIT) · KataGo (MIT) · Moka (MIT) · @sabaki/go-board (MIT) · Preact (MIT)</span>
                </p>
                <UpdateRow />
                <Switch label={t("update.auto")} checked={!!s.autoUpdateCheck} onChange={(v) => set("autoUpdateCheck", v)} />
                <p class="fine">{t("update.autoHelp")}</p>
                <div class="actions">
                  <Button kind="ghost" icon="keyboard" onClick={() => C.openSheet("shortcuts")}>
                    {t("shortcuts.title")}
                  </Button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Optional downloads: the human-style opponent and the stronger network. */
function ModelsGroup() {
  useEffect(() => {
    C.refreshModels?.();
  }, []);
  const ms = state.models;
  return (
    <section class="settings-group">
      <h3>{t("models.title")}</h3>
      <p class="fine">{t("models.intro")}</p>
      {["human", "strong"].map((kind) => (
        <ModelRow kind={kind} one={ms?.[kind]} />
      ))}
      <p class="fine">{t("models.source")}</p>
    </section>
  );
}

function ModelRow({ kind, one }) {
  const mb = Models.megabytes(Models.MODELS[kind].bytes);
  const st = one?.status || "unavailable";
  const busy = st === "downloading" || st === "verifying";
  let line = "";
  if (st === "unavailable") line = t("models.unavailable");
  else if (st === "ready") line = t("models.ready");
  else if (st === "verifying") line = t("models.verifying");
  else if (st === "downloading") line = one.stalled ? t("models.stalled") : t("models.downloading", [Models.percent(one)]);
  else if (st === "partial") line = t("models.partial", [Models.percent(one)]);
  else if (st === "failed") line = C.modelErrorText(one);
  let action = null;
  if (st === "absent") action = <Button size="sm" icon="download" onClick={() => C.downloadModel(kind)}>{t("models.download", [mb])}</Button>;
  else if (st === "partial") action = <Button size="sm" onClick={() => C.downloadModel(kind)}>{t("models.resume")}</Button>;
  else if (st === "failed") action = <Button size="sm" onClick={() => C.downloadModel(kind)}>{t("models.retry")}</Button>;
  else if (busy) action = <Button size="sm" kind="ghost" onClick={() => C.cancelModelDownload(kind)}>{t("models.cancel")}</Button>;
  else if (st === "ready") action = <Button size="sm" kind="ghost" onClick={() => C.removeModel(kind)}>{t("models.remove")}</Button>;
  return (
    <div class="model-row">
      <div class="model-text">
        <strong>{t(`models.${kind}.name`)}</strong>
        <span class="fine">{t(`models.${kind}.desc`, [mb])}</span>
        {line && <span class={`model-status ${st}`} aria-live="polite">{line}</span>}
        {busy && (
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Models.percent(one)}>
            <i style={{ width: `${Models.percent(one)}%` }} />
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

/** "Check for updates…" with what the last check found. */
function UpdateRow() {
  const u = state.updateCheck;
  const can = C.canCheckUpdates();
  const st = u?.status;
  let text = "";
  if (st === "checking") text = t("update.checking");
  else if (st === "available") text = t("update.available", [u.latest]);
  else if (st === "downloading") text = t(u.step === "verify" ? "update.verifying" : u.step === "unpack" ? "update.unpacking" : "update.downloading", [u.latest]);
  else if (st === "ready") text = t("update.ready", [u.latest]);
  else if (st === "installing") text = t("update.installing");
  else if (st === "current") text = t("update.current", [u.current]);
  else if (st === "error") text = t("update.error");
  else if (!can) text = t("update.unavailable");
  const canInstall = st === "available" && u.install?.can;
  let action;
  if (st === "available")
    action = canInstall ? (
      <Button size="sm" icon="download" onClick={C.downloadUpdate}>
        {t("update.install")}
      </Button>
    ) : (
      <Button size="sm" icon="download" onClick={C.openReleasePage}>
        {t("update.download")}
      </Button>
    );
  else if (st === "downloading")
    action = (
      <Button size="sm" kind="ghost" onClick={C.cancelUpdate}>
        {t("update.cancel")}
      </Button>
    );
  else if (st === "ready")
    action = (
      <Button size="sm" kind="primary" onClick={C.applyUpdate}>
        {t("update.restart")}
      </Button>
    );
  else if (st !== "installing")
    action = (
      <Button size="sm" onClick={() => C.checkForUpdates()} disabled={!can || st === "checking"}>
        {t("update.check")}
      </Button>
    );
  return (
    <div class="update-block">
      <div class="row update-row">
        <span class={st === "available" || st === "ready" ? "" : "muted"} aria-live="polite">
          {text}
        </span>
        {action}
      </div>
      {st === "downloading" && (
        <div class="update-progress">
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((u.progress || 0) * 100)}>
            <i style={{ width: `${Math.round((u.progress || 0) * 100)}%` }} />
          </div>
          {u.total > 0 && <span class="fine">{t("update.progress", [U.formatBytes(u.received || 0), U.formatBytes(u.total)])}</span>}
        </div>
      )}
      {st === "ready" && <p class="fine">{t("update.restartHint")}</p>}
      {st === "available" && !canInstall && u.install?.blocked && <p class="fine">{t(U.installMessageKey(u.install.blocked))}</p>}
      {st === "available" && u.installError && <p class="fine">{t(U.installMessageKey(u.installError))}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- onboarding */

function Onboarding({ step = 0 }) {
  const s = state.settings;
  const [rank, setRank] = useState(15);
  const go = (n) => update((st) => (st.sheet = { kind: "onboarding", step: n }));
  return (
    <div class="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div class="drag" data-drag />
      <div class="ob-card">
        <img class="ob-mark" src="icon.png" width="72" height="72" alt="" />
        {step === 0 && (
          <>
            <h1 id="ob-title">{t("onboarding.welcome")}</h1>
            <p class="muted">{t("onboarding.lead")}</p>
            <div class="lang-grid big" role="radiogroup" aria-label={t("settings.language")}>
              {LANG_IDS.map((id) => (
                <button type="button" role="radio" lang={id} aria-checked={s.lang === id} class={s.lang === id ? "on" : ""} onClick={() => C.setSetting("lang", id)}>
                  {LANG_NAMES[id]}
                </button>
              ))}
            </div>
            <div class="actions center">
              <Button kind="primary" data-autofocus onClick={() => go(1)}>
                {t("common.continue")}
              </Button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h1 id="ob-title">{t("onboarding.question")}</h1>
            <div class="choice-list">
              <button type="button" class="choice" data-autofocus onClick={() => C.finishOnboarding("new")}>
                <strong>{t("onboarding.new")}</strong>
                <span>{t("onboarding.newHelp")}</span>
              </button>
              <button type="button" class="choice" onClick={() => C.finishOnboarding("rules")}>
                <strong>{t("onboarding.rules")}</strong>
                <span>{t("onboarding.rulesHelp")}</span>
              </button>
              <button type="button" class="choice" onClick={() => go(2)}>
                <strong>{t("onboarding.player")}</strong>
                <span>{t("onboarding.playerHelp")}</span>
              </button>
            </div>
            <button type="button" class="link" onClick={() => go(0)}>
              ← {t("common.back")}
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h1 id="ob-title">{t("onboarding.rankQuestion")}</h1>
            <div class="slider-field big">
              <input type="range" min="0" max="33" step="1" value={30 - rank} onInput={(e) => setRank(30 - Number(e.currentTarget.value))} aria-label={t("settings.yourRank")} aria-valuetext={rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank])} />
              <output>{rank > 0 ? t("rank.kyu", [rank]) : t("rank.dan", [1 - rank])}</output>
            </div>
            <p class="fine">{t("onboarding.rankHelp")}</p>
            <div class="actions center">
              <Button kind="ghost" onClick={() => go(1)}>
                {t("common.back")}
              </Button>
              <Button kind="primary" data-autofocus onClick={() => C.finishOnboarding("player", rank)}>
                {t("onboarding.play19")}
              </Button>
            </div>
          </>
        )}
        <p class="fine ob-foot">{t("onboarding.offline")}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- shortcuts */

function ShortcutsSheet() {
  const rows = [
    [`${MOD}N`, t("common.newGame")],
    [`${MOD}Z`, t("common.undo")],
    [`${SHIFT}${MOD}P`, t("common.pass")],
    [`${SHIFT}${MOD}H`, t("common.hint")],
    [`${MOD}.`, t("play.focus")],
    [`${MOD},`, t("nav.settings")],
    [`${MOD}1 / 2`, `${t("nav.play")} / ${t("nav.learn")}`],
    [`${MOD}[  ${MOD}]`, t("shortcuts.history")],
    ["← →", t("shortcuts.browse")],
    ["Enter", t("shortcuts.continue")],
    ["Tab · ↑↓←→ · Space", t("shortcuts.board")],
    ["Esc", t("shortcuts.close")],
    [`${MOD}/`, t("shortcuts.title")],
    ...a11yKeyRows(MOD),
  ];
  const groups = [
    [null, rows],
    [t("a11y.keysTitle"), boardKeyRows()],
  ];
  return (
    <Modal title={t("shortcuts.title")}>
      {groups.map(([head, list]) => (
        <section class="settings-group">
          {head && <h3>{head}</h3>}
          <dl class="shortcuts">
            {list.map(([k, v]) => (
              <>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  );
}

/* ---------------------------------------------------------------- confirm */

function ConfirmSheet({ title, body, confirm, danger, onConfirm }) {
  return (
    <Modal
      title={title}
      footer={
        <>
          <Button kind="ghost" onClick={C.closeSheet}>
            {t("common.cancel")}
          </Button>
          <Button
            kind={danger ? "danger-solid" : "primary"}
            class="primary"
            data-autofocus
            onClick={() => {
              update({ sheet: null });
              onConfirm?.();
            }}
          >
            {confirm || t("common.confirm")}
          </Button>
        </>
      }
    >
      {body ? <p class="muted">{body}</p> : null}
    </Modal>
  );
}

function RenameSheet({ id, name }) {
  const [value, setValue] = useState(name || "");
  const save = () => {
    C.renameRecord(id, value.trim());
    update({ sheet: null });
  };
  return (
    <Modal
      title={t("library.rename")}
      footer={
        <>
          <Button kind="ghost" onClick={C.closeSheet}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <input
        class="text-input"
        type="text"
        data-autofocus
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        maxLength={120}
        aria-label={title || t("library.rename")}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
    </Modal>
  );
}
