/**
 * False here, where the content modules are imported whole (tests,
 * scripts). scripts/bundle.mjs replaces this module with `true` in the app,
 * whose content modules hold only the start-up index (see ../content.js).
 */
export const LAZY = false;
