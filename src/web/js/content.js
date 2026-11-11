/**
 * The course, the problems and the classic games, loaded in two steps.
 *
 * The first screen only needs what lists and plans read: the course's
 * units and lesson titles, each problem's id, topic, theme and shape, its
 * measured grade, and each classic's title, players, date and result. That
 * index is in the start-up script. The rest — lesson steps, problem
 * diagrams, titles and hints, classic records and notes — is in three
 * files beside index.html (content/course.json, problems.json,
 * classics.json), fetched once on idle after start-up or on first use,
 * whichever comes first, and merged into the same objects: an array or
 * object read from here before stays the one to use after.
 *
 * scripts/bundle.mjs builds both halves from the content modules with
 * content-split.js. Unbundled (tests, scripts) the modules are imported
 * whole and every part is loaded from the start.
 *
 *   loaded("course")          is that part here?
 *   ready("course")           a promise of it (ready() for every part)
 *   withContent("course", f)  f() now when it is here, else once it is
 *   preload()                 every part, one after the other, on idle
 *
 * Parts: "course" (lesson steps), "problems" (problem bodies),
 * "classics" (records and notes).
 */
import { COURSE } from "./content/course.js";
import { PROBLEMS, THEMES, SHAPES } from "./content/problems.js";
import GRADES from "./content/problem-grades.json";
import { CLASSICS } from "./content/classics.js";
import { LAZY } from "./content/lazy.js";
import { PARTS, mergePart } from "./content-split.js";

export { COURSE, PROBLEMS, THEMES, SHAPES, GRADES, CLASSICS, PARTS };

const have = new Set(LAZY ? [] : PARTS);
const pending = {};

export function loaded(part) {
  return have.has(part);
}

export function ready(part) {
  if (!part) return Promise.all(PARTS.map((p) => ready(p)));
  if (have.has(part)) return Promise.resolve();
  if (!pending[part]) {
    pending[part] = fetch(`content/${part}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`content/${part}.json: ${r.status}`))))
      .then((body) => {
        mergePart(part, body, { course: COURSE, problems: PROBLEMS, classics: CLASSICS });
        have.add(part);
      })
      .catch((error) => {
        // The next use asks again.
        delete pending[part];
        console.warn(`Content "${part}" could not be loaded.`, error);
        throw error;
      });
  }
  return pending[part];
}

/**
 * How a wait for a part is shown. `wait(part, load)` runs `load()` (a
 * promise of the part) and resolves with true once the part is here, or
 * with anything else when it could not be loaded and nobody asked again.
 * The app sets it at boot (app/controller.js: a "loading" notice once the
 * wait is slow, an error with Retry when it fails; Retry calls load again).
 * Without one a part that fails to load is only logged.
 */
let waiter = null;
export function onContentWait(fn) {
  waiter = typeof fn === "function" ? fn : null;
}

/**
 * f() at once when `part` is here; otherwise once it has arrived. What
 * asked for it is something the player did, so the wait and a failure are
 * shown (onContentWait); a Retry that succeeds runs f() then.
 */
export function withContent(part, fn) {
  if (have.has(part)) return fn();
  let out;
  const load = () =>
    ready(part).then(() => {
      // Each successful load (the first, or a retry) carries on with what
      // was asked. An error in f is f's own, not a failure to load: it is
      // thrown on, outside this promise.
      try {
        out = fn();
      } catch (e) {
        setTimeout(() => {
          throw e;
        }, 0);
      }
      return true;
    });
  const wait = waiter ? Promise.resolve(waiter(part, load)) : load();
  return wait.then(() => out, () => undefined);
}

/**
 * Load every part on idle, one after the other (started once at boot).
 * `onArrive(part)` runs after each part is merged, so a view that showed
 * the index alone (Practice's path reads problem titles) can draw again.
 */
export function preload(onArrive = () => {}) {
  if (have.size === PARTS.length || typeof window === "undefined") return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  const next = (i) => {
    if (i >= PARTS.length) return;
    idle(() => ready(PARTS[i]).then(() => onArrive(PARTS[i]), () => {}).then(() => next(i + 1)), { timeout: 3000 });
  };
  next(0);
}
