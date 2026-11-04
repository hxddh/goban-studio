/**
 * v7: background work, shown quietly. Settings → Opponents and analysis
 * lists what the engine scheduler is doing in the background (scheduler.js
 * jobs: a game being analysed, a report, "Analyse all", a review pass), each
 * with its progress and a Stop button. Nothing is shown when idle.
 */
import { useEffect, useState } from "preact/hooks";
import * as Engine from "../engine.js";
import { t } from "../i18n.js";
import { Button } from "./parts.jsx";

/** Re-render while mounted whenever a job starts, moves or ends. */
export function useJobs() {
  const [, force] = useState(0);
  useEffect(() => Engine.sched.onChange(() => force((n) => n + 1)), []);
  return Engine.sched.listJobs();
}

/** "Analysing your game against ≈ 12 kyu — 40%". */
export function jobText(job) {
  const title = typeof job.title === "function" ? job.title() : String(job.title || "");
  return t("sched.progress", [title, Math.round((job.progress || 0) * 100)]);
}

export function BackgroundGroup() {
  const jobs = useJobs();
  if (!jobs.length) return null;
  return (
    <section class="settings-group bg-jobs" aria-live="polite">
      <h3>{t("sched.title")}</h3>
      <ul class="bg-job-list">
        {jobs.map((job) => {
          const pct = Math.round((job.progress || 0) * 100);
          const title = typeof job.title === "function" ? job.title() : String(job.title || "");
          return (
            <li class="bg-job" data-kind={job.kind}>
              <div class="bg-job-text">
                <span>{jobText(job)}</span>
                <div class="progress" role="progressbar" aria-label={title} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
              <Button size="sm" kind="ghost" aria-label={t("sched.cancelJob", [title])} onClick={() => Engine.sched.cancelJob(job.id)}>
                {t("sched.cancel")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
