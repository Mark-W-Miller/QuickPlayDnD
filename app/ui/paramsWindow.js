import { createWindowFrame } from "./windowFrame.js";

export function initParamsWindow({ paramsOpenBtn, paramsCloseBtn, paramsWindow }) {
  if (!paramsOpenBtn || !paramsWindow) return;

  createWindowFrame({
    rootEl: paramsWindow,
    openBtn: paramsOpenBtn,
    closeBtn: paramsCloseBtn,
    resizeHandle: null,
    header: paramsWindow.querySelector(".params-window-header"),
    storageKey: "params-window-state",
    minWidth: 320,
    minHeight: 260,
    defaultLeft: Math.max(20, window.innerWidth - 420),
    defaultTop: Math.max(20, window.innerHeight - 360),
    roleAware: true
  });
}
