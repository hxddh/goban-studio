/**
 * Goban Studio — entry point.
 *
 * Three places — Play, Practice, Library — around one board. The shell and
 * views live in app/; rules, SGF, the board renderer, the engine and the
 * problem solver are plain modules beside this file.
 */
import { start } from "./app/app.jsx";

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
