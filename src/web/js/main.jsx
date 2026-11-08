/**
 * Goban Studio — entry point.
 *
 * Four spaces — Today, Play, Practice and Library (v12; Practice keeps
 * the internal id "learn") — around one board, over one store (data/)
 * and one player model (model/). The shell and views live in
 * app/, play/ and learn/; rules, SGF, the board renderer, the engine and
 * the problem solver are plain modules beside this file.
 */
import { start } from "./app/app.jsx";

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
