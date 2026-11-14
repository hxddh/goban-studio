/**
 * The frame of every sheet: a centred dialog over a scrim, with its title,
 * its body and its footer; it keeps the focus inside and gives it back.
 */
import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n.js";
import * as C from "./controller.js";
import { IconButton } from "./parts.jsx";

/**
 * The frame of a sheet. `onClose` is what its close button and a click
 * outside do; `onEscape` (a sheet opened from another sheet) is what Esc
 * does instead of closing every sheet.
 * @param {{ title?: any, children?: any, footer?: any, wide?: boolean, onClose?: () => any, onEscape?: () => any, labelledBy?: string, class?: string }} props
 */
export function Modal({ title, children, footer, wide, onClose = C.closeSheet, onEscape, labelledBy, class: cls = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = /** @type {HTMLElement | null} */ (document.activeElement);
    // Focus the intended control, or the sheet itself (no stray focus ring
    // on the close button when nothing is primary).
    const first = ref.current?.querySelector("[data-autofocus]") || ref.current?.querySelector("button.primary") || ref.current;
    first?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);
  const onKey = (e) => {
    if (e.key === "Escape" && onEscape) {
      // Before the page's own Esc (app.jsx), which would close the sheet outright.
      e.stopPropagation();
      e.preventDefault();
      return onEscape();
    }
    if (e.key !== "Tab") return;
    const items = [...ref.current.querySelectorAll("button:not([disabled]), input:not([disabled]), select, [tabindex='0']")];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div class="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`sheet ${wide ? "wide" : ""} ${cls}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelledBy || "sheet-title"} ref={ref} onKeyDown={onKey}>
        {title && (
          <header class="sheet-head">
            <h2 id="sheet-title">{title}</h2>
            {onClose && <IconButton icon="close" label={t("common.close")} onClick={onClose} />}
          </header>
        )}
        <div class="sheet-body">{children}</div>
        {footer && <footer class="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}
