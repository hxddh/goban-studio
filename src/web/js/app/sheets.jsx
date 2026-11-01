/**
 * Modal sheets: new game, settings, onboarding, shortcuts, confirm, rename.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { BLACK, WHITE, formatPoints } from "../rules.js";
import { STRENGTHS, suggestHandicap } from "../engine.js";
import { LANG_IDS, LANG_NAMES, t } from "../i18n.js";
import { APP_VERSION } from "../version.js";
import { state, update } from "./store.js";
import * as C from "./controller.js";
import { rankLabel, ratingLabel } from "./play.jsx";
import { Button, Icon, IconButton, MOD, SHIFT, Segmented, Stepper, Stone, Switch } from "./parts.jsx";

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
  const [strengthIdx, setStrengthIdx] = useState(Math.max(0, STRENGTHS.findIndex((x) => x.id === (prefill?.strength || (s.autoStrength ? rec.strength : s.strength)))));
  const strength = STRENGTHS[strengthIdx].id;
  const suggested = opponent === "ai" ? suggestHandicap(rec.rank, strength, size) : 0;
  const [advanced, setAdvanced] = useState(false);
  const [handicap, setHandicap] = useState(null);
  const [komi, setKomi] = useState(null);
  const h = handicap ?? (color === BLACK ? suggested : 0);
  const k = komi ?? (h > 0 ? 0.5 : 6.5);
  const start = () =>
    C.newGame({ size, opponent, color, strength: opponent === "ai" ? strength : undefined, handicap: h, komi: k, timeControl: tc, rememberSize: true });
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
                  max={STRENGTHS.length - 1}
                  step="1"
                  value={strengthIdx}
                  aria-label={t("newGame.strength")}
                  aria-valuetext={rankLabel(strength)}
                  onInput={(e) => {
                    setStrengthIdx(Number(e.currentTarget.value));
                    setHandicap(null);
                    setKomi(null);
                  }}
                />
                <output>{rankLabel(strength)}</output>
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
          <span class="fine">{t("newGame.advancedSummary", [h || t("common.none"), formatPoints(k)])}</span>
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
            <p class="fine">{t("newGame.rules")}</p>
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

function SettingsSheet() {
  const s = state.settings;
  const set = C.setSetting;
  const rankOptions = [30, 25, 20, 15, 10, 5, 1, -1, -3];
  const rankText = (r) => (r == null ? t("settings.rankUnknown") : r > 0 ? t("rank.kyu", [r]) : t("rank.dan", [1 - r]));
  return (
    <Modal title={t("nav.settings")} wide>
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
        <div class="row">
          <span>{t("settings.board")}</span>
          <div class="swatches" role="radiogroup" aria-label={t("settings.board")}>
            {["plain", "wood", "ink"].map((m) => (
              <button type="button" role="radio" aria-checked={s.board === m} class={`swatch ${m} ${s.board === m ? "on" : ""}`} onClick={() => set("board", m)}>
                <i />
                <span>{t("settings.material." + m)}</span>
              </button>
            ))}
          </div>
        </div>
        <Switch label={t("settings.flatStones")} checked={!!s.flatStones} onChange={(v) => set("flatStones", v)} />
        <Switch label={t("settings.coordinates")} checked={s.coords} onChange={(v) => set("coords", v)} />
        <Switch label={t("settings.moveNumbers")} checked={s.numbers} onChange={(v) => set("numbers", v)} />
        <Switch label={t("settings.sound")} checked={s.sound} onChange={(v) => set("sound", v)} />
      </section>
      <section class="settings-group">
        <h3>{t("settings.playing")}</h3>
        <Switch label={t("settings.teaching")} checked={C.teachingOn()} onChange={(v) => set("teaching", v)} />
        <p class="fine">{t("settings.teachingHelp")}</p>
        <Switch label={t("settings.confirmMove")} checked={s.confirmMove} onChange={(v) => set("confirmMove", v)} />
        <Switch label={t("settings.showEval")} checked={s.showEval} onChange={(v) => set("showEval", v)} />
        <Switch label={t("settings.liveAnalysis")} checked={s.liveAnalysis} onChange={(v) => set("liveAnalysis", v)} />
        <Switch label={t("settings.autoStrength")} checked={s.autoStrength} onChange={(v) => set("autoStrength", v)} />
      </section>
      <section class="settings-group">
        <h3>{t("settings.you")}</h3>
        {state.progress.rating && (
          <div class="row">
            <span>{t("settings.estimated")}</span>
            <strong>{ratingLabel(state.progress.rating.r)}</strong>
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
          <Button kind="danger" onClick={C.clearData}>
            {t("settings.clearData")}
          </Button>
        </div>
      </section>
    </Modal>
  );
}

/** "Check for updates…" with what the last check found. */
function UpdateRow() {
  const u = state.updateCheck;
  const can = C.canCheckUpdates();
  let text = "";
  if (u?.status === "checking") text = t("update.checking");
  else if (u?.status === "available") text = t("update.available", [u.latest]);
  else if (u?.status === "current") text = t("update.current", [u.current]);
  else if (u?.status === "error") text = t("update.error");
  else if (!can) text = t("update.unavailable");
  return (
    <div class="row update-row">
      <span class={u?.status === "available" ? "" : "muted"} aria-live="polite">
        {text}
      </span>
      {u?.status === "available" ? (
        <Button size="sm" icon="download" onClick={C.openReleasePage}>
          {t("update.download")}
        </Button>
      ) : (
        <Button size="sm" onClick={() => C.checkForUpdates()} disabled={!can || u?.status === "checking"}>
          {t("update.check")}
        </Button>
      )}
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
        <div class="ob-mark" aria-hidden="true">
          <Stone color={1} size={30} />
          <Stone color={-1} size={30} />
        </div>
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
    [`${MOD}1 / 2 / 3 / 4`, `${t("nav.today")} / ${t("nav.play")} / ${t("nav.practice")} / ${t("nav.library")}`],
    [`${MOD}[  ${MOD}]`, t("shortcuts.history")],
    ["← →", t("shortcuts.browse")],
    ["Enter", t("shortcuts.continue")],
    ["Tab · ↑↓←→ · Space", t("shortcuts.board")],
    ["Esc", t("shortcuts.close")],
    [`${MOD}/`, t("shortcuts.title")],
  ];
  return (
    <Modal title={t("shortcuts.title")}>
      <dl class="shortcuts">
        {rows.map(([k, v]) => (
          <>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </>
        ))}
      </dl>
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
        maxLength={120}
        aria-label={t("library.rename")}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
    </Modal>
  );
}
