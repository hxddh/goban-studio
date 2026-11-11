/**
 * UI strings, side by side in the four launch languages.
 *
 * One key, four values. The strings live in one file per area under
 * messages/; this module only merges them. A missing language is a test
 * failure, not a silent fallback; the test suite also checks that every key
 * the UI uses exists here and that each key prefix lives in one file.
 */
import { SHELL } from "./messages/shell.js";
import { PLAY } from "./messages/play.js";
import { REVIEW } from "./messages/review.js";
import { LIBRARY } from "./messages/library.js";
import { PRACTICE } from "./messages/practice.js";
import { CONTENT } from "./messages/content.js";

/** The area tables, by file name under messages/. */
export const MESSAGE_AREAS = { shell: SHELL, play: PLAY, review: REVIEW, library: LIBRARY, practice: PRACTICE, content: CONTENT };

/**
 * Languages whose strings are not in this module but in a file of their
 * own, read when the language is first shown (i18n.js loadLang). None here:
 * the tests and the tools read every language from the tables. The app's
 * script is built with English only and the other three listed
 * (scripts/bundle.mjs), so start-up parses one language.
 */
export const LAZY_LANGS = [];

export const MESSAGES = { ...SHELL, ...PLAY, ...REVIEW, ...LIBRARY, ...PRACTICE, ...CONTENT };
