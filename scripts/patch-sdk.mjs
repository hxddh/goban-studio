/**
 * Patch the installed Native SDK's macOS host so app menus keep the system
 * menus.
 *
 * Why: in @native-sdk/cli 0.11.0, and still in 0.11.1,
 * `-[NativeSdkAppKitHost setMenusWithTitles:…]`
 * (src/platform/macos/appkit_host.m) builds a brand-new menu bar holding
 * the application menu plus the app's own menus only. The default bar from
 * `-buildMenuBar` disappears with it: File → Close Window, Edit → Undo/Redo/
 * Cut/Copy/Paste/Select All (responder-chain actions that text fields in the
 * web view rely on), View → Enter Full Screen and Window → Minimize/Zoom.
 *
 * What: `-buildMenuBar` is split, without changing its output, into two
 * helpers — `-gobanAddLeadingSystemMenusToMenu:` (File, Edit) and
 * `-gobanAddTrailingSystemMenusToMenu:` (View, Window). `setMenusWithTitles:`
 * then lays the bar out as
 *
 *     App · File · Edit · <app menus…> · View · Window
 *
 * and turns off auto-enabling on the app menus so each item's `enabled`
 * flag is honoured (every item targets the host, which would otherwise
 * always enable it).
 *
 * How: plain text surgery on exact anchors from SDK 0.11.0 (unchanged in
 * 0.11.1). The script is idempotent (a marker comment records that the
 * file is patched) and fails loudly — non-zero exit, naming the missing anchor — if the SDK source
 * does not look the way this patch expects, so an SDK upgrade cannot
 * silently drop the system menus again.
 *
 * Usage: node scripts/patch-sdk.mjs [<sdk-root>]
 *   <sdk-root> defaults to $SDK_PATH, then `npm root -g`/@native-sdk/cli.
 *   --check   only report whether the file is patched (exit 1 if not).
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const MARKER = "/* goban-studio: system menus kept around app menus (scripts/patch-sdk.mjs) */";

function fail(message) {
  console.error(`patch-sdk: ${message}`);
  process.exit(1);
}

function sdkRoot(arg) {
  if (arg) return arg;
  if (process.env.SDK_PATH) return process.env.SDK_PATH;
  try {
    const root = execSync("npm root -g", { encoding: "utf8" }).trim();
    return path.join(root, "@native-sdk", "cli");
  } catch {
    return "";
  }
}

/** Index of `needle` in `text` after `from`; fails if missing. */
function find(text, needle, from, what) {
  const at = text.indexOf(needle, from);
  if (at < 0) fail(`anchor not found: ${what}\n  expected: ${JSON.stringify(needle.slice(0, 120))}`);
  return at;
}

export function patchSource(src) {
  if (src.includes(MARKER)) return { src, changed: false };

  // 1. Split -buildMenuBar into leading (File, Edit) and trailing (View,
  //    Window) helpers. Its own output stays identical.
  const buildHead =
    "- (void)buildMenuBar {\n" +
    "    NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@\"\"];\n" +
    "    [NSApp setMainMenu:mainMenu];\n" +
    "    [self addApplicationMenuToMenu:mainMenu];\n";
  const buildStart = find(src, buildHead, 0, "-buildMenuBar prologue");
  const bodyStart = buildStart + buildHead.length;
  const viewAnchor = "    // The View menu carries web items only";
  const viewAt = find(src, viewAnchor, bodyStart, "-buildMenuBar View menu comment");
  const windowsTail = "    [NSApp setWindowsMenu:windowMenu];\n}\n";
  const tailAt = find(src, windowsTail, viewAt, "-buildMenuBar epilogue ([NSApp setWindowsMenu:windowMenu])");
  const leading = src.slice(bodyStart, viewAt);
  const trailing = src.slice(viewAt, tailAt) + "    [NSApp setWindowsMenu:windowMenu];\n";
  if (!leading.includes("@selector(performClose:)") || !leading.includes("@selector(copy:)")) {
    fail("-buildMenuBar no longer builds File/Edit before the View menu");
  }
  if (!trailing.includes("@selector(toggleFullScreen:)") || !trailing.includes("@selector(performMiniaturize:)")) {
    fail("-buildMenuBar no longer builds View/Window after the View comment");
  }
  const helpers =
    MARKER + "\n" +
    "- (void)gobanAddLeadingSystemMenusToMenu:(NSMenu *)mainMenu {\n" +
    leading.replace(/\n+$/, "\n") +
    "}\n\n" +
    "- (void)gobanAddTrailingSystemMenusToMenu:(NSMenu *)mainMenu {\n" +
    trailing +
    "}\n\n";
  const newBuild =
    buildHead +
    "    [self gobanAddLeadingSystemMenusToMenu:mainMenu];\n" +
    "    [self gobanAddTrailingSystemMenusToMenu:mainMenu];\n" +
    "}\n";
  src = src.slice(0, buildStart) + helpers + newBuild + src.slice(tailAt + windowsTail.length);

  // 2. setMenusWithTitles: keep the system menus around the app's menus.
  const setDecl = "- (void)setMenusWithTitles:(const char *const *)menuTitles";
  let defAt = -1;
  for (let at = src.indexOf(setDecl); at >= 0; at = src.indexOf(setDecl, at + 1)) {
    const lineEnd = src.indexOf("\n", at);
    if (src.slice(at, lineEnd).trimEnd().endsWith("{")) {
      defAt = at;
      break;
    }
  }
  if (defAt < 0) fail("anchor not found: -setMenusWithTitles: definition");
  const defEnd = find(src, "\n}\n", defAt, "-setMenusWithTitles: closing brace") + 1;
  let method = src.slice(defAt, defEnd);
  const appMenu = "    [self addApplicationMenuToMenu:mainMenu];\n";
  if (!method.includes(appMenu)) fail("anchor not found: setMenusWithTitles: application menu call");
  method = method.replace(appMenu, appMenu + "    [self gobanAddLeadingSystemMenusToMenu:mainMenu];\n");
  const submenu = "        [topItem setSubmenu:menu];\n";
  if (!method.includes(submenu)) fail("anchor not found: setMenusWithTitles: [topItem setSubmenu:menu]");
  method = method.replace(submenu, submenu + "        menu.autoenablesItems = NO;\n");
  method = method + "    [self gobanAddTrailingSystemMenusToMenu:mainMenu];\n";
  // `method` ended right before the method's closing "}\n"; the trailing
  // call now sits inside it, after the app menus loop.
  src = src.slice(0, defAt) + method + src.slice(defEnd);
  return { src, changed: true };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const root = sdkRoot(args.find((a) => !a.startsWith("--")));
  if (!root) fail("cannot locate the Native SDK (pass its root or set SDK_PATH)");
  const file = path.join(root, "src", "platform", "macos", "appkit_host.m");
  if (!fs.existsSync(file)) fail(`missing ${file}`);
  const before = fs.readFileSync(file, "utf8");
  if (check) {
    const ok = before.includes(MARKER);
    console.log(`patch-sdk: ${file} is ${ok ? "patched" : "NOT patched"}`);
    process.exit(ok ? 0 : 1);
  }
  const { src, changed } = patchSource(before);
  if (!changed) {
    console.log(`patch-sdk: already patched: ${file}`);
    return;
  }
  // Sanity: the result must define both helpers once and call them from
  // both menu builders.
  const count = (needle) => src.split(needle).length - 1;
  if (count("- (void)gobanAddLeadingSystemMenusToMenu:") !== 1 || count("- (void)gobanAddTrailingSystemMenusToMenu:") !== 1) {
    fail("helper definitions are not unique after patching");
  }
  if (count("[self gobanAddLeadingSystemMenusToMenu:mainMenu]") !== 2 || count("[self gobanAddTrailingSystemMenusToMenu:mainMenu]") !== 2) {
    fail("helpers are not called from both -buildMenuBar and -setMenusWithTitles:");
  }
  fs.writeFileSync(file, src);
  console.log(`patch-sdk: patched ${file}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("patch-sdk.mjs")) main();
