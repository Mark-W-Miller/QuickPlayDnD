import { createWindowFrame } from "./windowFrame.js";

export function initDmWindow({ dmOpenBtn, dmCloseBtn, dmWindow, rollInitBtn, state, scriptRunner, pushServerState, logClass }) {
  if (!dmOpenBtn || !dmWindow || !rollInitBtn || !scriptRunner || !pushServerState) return;

  const header = dmWindow.querySelector(".dm-window-header");
  const resizeHandle = dmWindow.querySelector(".dm-window-resize");

  createWindowFrame({
    rootEl: dmWindow,
    openBtn: dmOpenBtn,
    closeBtn: dmCloseBtn,
    resizeHandle,
    header,
    storageKey: "dm-window-state",
    minWidth: 220,
    minHeight: 140,
    defaultLeft: Math.max(16, window.innerWidth - 320),
    defaultTop: 120,
    roleAware: true
  });

  const rollInitiative = () => {
    const pairs = (state.tokens || []).map((t) => ({
      id: t.id,
      value: Math.floor(Math.random() * 20) + 1
    }));
    const instructions = [{ type: "initiative-set", pairs }];
    scriptRunner.applyInstructions(instructions);
    pushServerState(instructions);
    logClass?.("INFO", `Rolled initiative for ${pairs.length} token(s)`);
  };

  rollInitBtn.addEventListener("click", rollInitiative);

  return { rollInitiative };
}
