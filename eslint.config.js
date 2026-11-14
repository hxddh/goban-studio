/**
 * Static checks (`npm run lint`): the mistakes a parser and a scope analysis
 * can see without running anything — a name that is not defined, a variable
 * nobody reads, a duplicate key, code after a return.
 *
 * The page (src/web) is browser code bundled by esbuild with Preact's
 * automatic JSX runtime; scripts/ is Node. ESLint parses JSX itself and
 * counts a component used in JSX as used, so no JSX plugin is needed.
 * Generated files are not checked.
 */
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

const rules = {
  "no-undef": "error",
  "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-dupe-else-if": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",
  "no-const-assign": "error",
  "no-import-assign": "error",
  "no-self-assign": "error",
  "no-func-assign": "error",
  "no-class-assign": "error",
  "no-unsafe-negation": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  eqeqeq: ["error", "smart"],
};

export default [
  {
    ignores: ["node_modules/", "frontend/", "zig-out/", ".zig-cache/", "src/web/js/bundle.js", "src/web/js/content-lazy/", "src/web/moka/", "tests/", "docs/", "engine/"],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["src/web/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // webkitAudioContext: Safari's older name for AudioContext (audio.js checks for it).
      globals: { ...globals.browser, webkitAudioContext: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    // Hooks: called in order, and every effect lists what it reads, so it
    // re-runs when that changes. useAsync (app/parts.jsx) takes deps too.
    rules: { ...rules, "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": ["error", { additionalHooks: "^useAsync$" }] },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // The interface tests pass functions to the page (page.evaluate), so
      // the scripts name browser globals too.
      globals: { ...globals.node, ...globals.browser },
    },
    rules,
  },
  {
    // One function expression, evaluated in the page by scripts/ui-test.mjs.
    files: ["scripts/a11y-audit.js"],
    rules: { "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", varsIgnorePattern: "^a11yAudit$", caughtErrors: "none" }] },
  },
];
