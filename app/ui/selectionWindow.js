import { createWindowFrame } from "./windowFrame.js";

export function initSelectionWindow({
  openBtn,
  closeBtn,
  clearBtn,
  windowEl,
  textarea,
  roadBtn,
  raiseBtn,
  lowerBtn,
  zeroBtn,
  exportBtn,
  onExportHeight,
  onAdjustHeight,
  onZeroHeight,
  getSelectionRefs
}) {
  if (!openBtn || !windowEl) return null;

  createWindowFrame({
    rootEl: windowEl,
    openBtn,
    closeBtn,
    resizeHandle: windowEl.querySelector(".selection-window-resize"),
    header: windowEl.querySelector(".selection-window-header"),
    storageKey: "selection-window-state",
    minWidth: 360,
    minHeight: 320,
    defaultLeft: 120,
    defaultTop: 160,
    roleAware: true
  });

  if (clearBtn && textarea) {
    clearBtn.addEventListener("click", () => {
      textarea.value = "";
    });
  }
  if (roadBtn && getSelectionRefs && onAdjustHeight) {
    roadBtn.addEventListener("click", () => {
      const refs = getSelectionRefs();
      if (refs && refs.length) onAdjustHeight(0, refs);
    });
  }
  if (raiseBtn && getSelectionRefs && onAdjustHeight) {
    raiseBtn.addEventListener("click", () => {
      const refs = getSelectionRefs();
      if (refs && refs.length) onAdjustHeight(1, refs);
    });
  }
  if (lowerBtn && getSelectionRefs && onAdjustHeight) {
    lowerBtn.addEventListener("click", () => {
      const refs = getSelectionRefs();
      if (refs && refs.length) onAdjustHeight(-1, refs);
    });
  }
  if (zeroBtn && getSelectionRefs && onZeroHeight) {
    zeroBtn.addEventListener("click", () => {
      const refs = getSelectionRefs();
      if (refs && refs.length) onZeroHeight(refs);
    });
  }
  if (exportBtn && onExportHeight && getSelectionRefs) {
    exportBtn.addEventListener("click", () => {
      onExportHeight(getSelectionRefs());
    });
  }

  return windowEl;
}
