/**
 * What follows a lesson, a problem, a drill or a bridge game.
 *
 * Today's session and the placement quiz (./session.js, ./placement.js)
 * decide that; the controllers that play those things
 * (app/practice-ctl.js, app/capture-ctl.js) only report here, so they do
 * not import the modules that open them. Without a listener a call does
 * nothing: a problem opened on its own is just a problem.
 */
/** @type {(...args: any[]) => void} */
const nothing = () => {};

export const flow = {
  /** An item of the path is done: (kind, id?). */
  itemDone: nothing,
  /** A lesson was finished: (lessonId). */
  lessonFinished: nothing,
  /** Go on with today's session. */
  continuePath: nothing,
  /** A placement problem was answered at first sight: (id, solved). */
  placementAnswer: nothing,
  /** Go on with the placement quiz. */
  continuePlacement: nothing,
};

/** Listen: a module names the calls it answers, once, when it loads. */
export function onFlow(handlers) {
  Object.assign(flow, handlers);
}
