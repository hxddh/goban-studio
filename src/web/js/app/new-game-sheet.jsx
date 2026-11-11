/**
 * The New game sheet: board size, opponent, handicap, rules, time.
 */
import { useState } from "preact/hooks";
import { BLACK, WHITE, RULESETS, defaultKomi, formatPoints, rulesetById } from "../rules.js";
import { currentLadder, installed, nearest, suggestHandicap } from "../engine.js";
import { t } from "../i18n.js";
import { state } from "./store.js";
import * as C from "./controller.js";
import { rankLabel } from "./play.jsx";
import { Button, Icon, Segmented, Stepper } from "./parts.jsx";
import { Modal } from "./modal.jsx";

/* --------------------------------------------------------------- new game */

// The standard board first; the smaller ones are quicker games.
const PRESETS = [
  { size: 19, key: "full" },
  { size: 13, key: "medium" },
  { size: 9, key: "quick" },
];

export function NewGameSheet({ prefill }) {
  const s = state.settings;
  const rec = C.recommendedGame();
  // The recommended board, like the opponent: the remembered one only with the suggestion off.
  const [size, setSize] = useState(prefill?.size || (s.autoStrength ? rec.size : s.boardSize || rec.size));
  const [tc, setTc] = useState(s.timeControl || "none");
  const [opponent, setOpponent] = useState("ai");
  const [color, setColor] = useState(BLACK);
  // One axis, the ranks of the ladder (opponents.js); each shows the
  // measured rank of what plays it with the networks installed.
  const ranks = currentLadder();
  const startRank = nearest(prefill?.opponentRank ?? (s.autoStrength ? rec.opponentRank : s.opponentRank), installed()).rank;
  const [rankIdx, setRankIdx] = useState(Math.max(0, ranks.findIndex((e) => e.rank === startRank)));
  const choice = ranks[Math.min(rankIdx, ranks.length - 1)];
  const suggested = opponent === "ai" ? suggestHandicap(rec.rank, choice.label, size) : 0;
  const [advanced, setAdvanced] = useState(false);
  const [handicap, setHandicap] = useState(null);
  const [komi, setKomi] = useState(null);
  const [rules, setRules] = useState(prefill?.rules || C.defaultRules());
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
            <strong>{t("newGame.size", [p.size])}</strong>
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
        {/* The clock: the most-used choice after the board and the strength, so not behind More options. */}
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
