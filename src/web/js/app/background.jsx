/**
 * Background work, shown quietly. There is no list of it any more
 * (the work is automatic and yields to the game); these helpers let a view
 * follow a job, e.g. a Library row's "Analysing… 40%".
 */
import { useEffect, useState } from "preact/hooks";
import * as Engine from "../engine.js";

/** Re-render while mounted whenever a job starts, moves or ends. */
export function useJobs() {
  const [, force] = useState(0);
  useEffect(() => Engine.sched.onChange(() => force((n) => n + 1)), []);
  return Engine.sched.listJobs();
}

