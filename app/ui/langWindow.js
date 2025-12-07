import { createWindowFrame } from "./windowFrame.js";

export function initLangWindow({ langOpenBtn, langCloseBtn, langWindow }) {
  if (!langOpenBtn || !langWindow) return;

  createWindowFrame({
    rootEl: langWindow,
    openBtn: langOpenBtn,
    closeBtn: langCloseBtn,
    resizeHandle: langWindow.querySelector(".lang-window-resize"),
    header: langWindow.querySelector(".lang-window-header"),
    storageKey: "lang-window-state",
    minWidth: 500,
    minHeight: 360,
    defaultLeft: 80,
    defaultTop: 140,
    roleAware: true
  });
}
