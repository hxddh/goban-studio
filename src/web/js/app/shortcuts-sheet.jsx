/**
 * The keyboard shortcuts, read from the one table (shortcuts.js).
 */
import { t } from "../i18n.js";
import { MOD, SHIFT } from "./parts.jsx";
import { boardKeyRows, a11yKeyRows } from "../a11y.js";
import { shortcutRows } from "./shortcuts.js";
import { Modal } from "./modal.jsx";

/* -------------------------------------------------------------- shortcuts */

export function ShortcutsSheet() {
  // The same table the key handler matches against (shortcuts.js).
  const rows = [...shortcutRows({ mod: MOD, shift: SHIFT, t }), ...a11yKeyRows(MOD)];
  const groups = [
    [null, rows],
    [t("a11y.keysTitle"), boardKeyRows()],
  ];
  return (
    <Modal title={t("shortcuts.title")}>
      {groups.map(([head, list]) => (
        <section class="settings-group">
          {head && <h3>{head}</h3>}
          <dl class="shortcuts">
            {list.map(([k, v]) => (
              <>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  );
}
