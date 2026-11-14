/**
 * Settings → Engines, first group: which KataGo build runs, why the faster
 * one was given up if it was, and Measure speed (engine-diag.js). The
 * diagnostics are read each time the pane opens and after a measurement
 * (which may be what starts the process, and so what falls back).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { currentLang, t } from "../i18n.js";
import * as Diag from "../engine-diag.js";
import { state } from "./store.js";
import { Button } from "./parts.jsx";

/** The last results, kept while the app runs so the pane shows them when it opens again. */
let lastResults = null;

export function EngineRow() {
  const [diag, setDiag] = useState(null);
  const [measuring, setMeasuring] = useState(false);
  const [results, setResults] = useState(lastResults);
  const run = useRef(null);
  useEffect(() => {
    let live = true;
    Diag.diagnostics().then((d) => live && setDiag(d));
    return () => {
      live = false;
      run.current?.abort();
    };
  }, []);

  const measure = async () => {
    const ctl = new AbortController();
    run.current = ctl;
    setMeasuring(true);
    setResults(null);
    const done = [];
    for (const engine of Diag.speedEngines(diag)) {
      const r = await Diag.measure(engine, { signal: ctl.signal });
      if (!r) break;
      done.push(r);
    }
    if (ctl.signal.aborted) return;
    run.current = null;
    lastResults = done.length ? done : null;
    setResults(lastResults);
    setMeasuring(false);
    setDiag((await Diag.diagnostics()) || diag);
  };
  const stop = () => {
    run.current?.abort();
    run.current = null;
    setMeasuring(false);
  };

  if (!diag) return <p class="muted">{state.engine.available ? t("settings.engineOn", [state.engine.name || "KataGo"]) : t("settings.engineOff")}</p>;
  const fallback = Diag.fallbackKey(diag.fallback);
  return (
    <div class="engine-diag">
      <div class="row engine-row">
        <div class="engine-text">
          <span class="muted" data-engine-build={diag.build || ""}>
            {Diag.engineLine(diag, t)}
          </span>
          {(measuring || results) && (
            <span class="fine engine-speed" data-engine-speed aria-live="polite">
              {measuring ? t("engineDiag.measuring") : Diag.speedLine(results, t, currentLang())}
            </span>
          )}
        </div>
        {measuring ? (
          <Button size="sm" kind="ghost" onClick={stop}>
            {t("engineDiag.stop")}
          </Button>
        ) : (
          <Button size="sm" data-measure-speed onClick={measure}>
            {t("engineDiag.measure")}
          </Button>
        )}
      </div>
      {fallback && (
        <p class="fine" data-engine-fallback>
          {t(fallback)}
        </p>
      )}
    </div>
  );
}
