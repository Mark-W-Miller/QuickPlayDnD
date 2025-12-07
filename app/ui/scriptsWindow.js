import { createWindowFrame } from "./windowFrame.js";

export function initScriptsWindow({ scriptsOpenBtn, scriptsCloseBtn, scriptsWindow }) {
  if (!scriptsOpenBtn || !scriptsWindow) return;

  createWindowFrame({
    rootEl: scriptsWindow,
    openBtn: scriptsOpenBtn,
    closeBtn: scriptsCloseBtn,
    resizeHandle: scriptsWindow.querySelector(".scripts-window-resize"),
    header: scriptsWindow.querySelector(".scripts-window-header"),
    storageKey: "scripts-window-state",
    minWidth: 360,
    minHeight: 300,
    defaultLeft: 64,
    defaultTop: 120,
    roleAware: true
  });
}
