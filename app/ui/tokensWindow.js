import { createWindowFrame } from "./windowFrame.js";

export function initTokensWindow({
  tokensOpenBtn,
  tokensCloseBtn,
  tokensCopyBtn,
  tokensWindow,
  tokensBody,
  state,
  coercePx,
  safeJsonParse,
  refreshTokenHighlights
}) {
  if (!tokensOpenBtn || !tokensWindow || !tokensBody) return;
  const header = tokensWindow.querySelector(".tokens-window-header");
  const resizeHandle = tokensWindow.querySelector(".tokens-window-resize");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const MIN_W = 320;
  const MIN_H = 240;
  let lastSelectIndex = null;

  createWindowFrame({
    rootEl: tokensWindow,
    openBtn: tokensOpenBtn,
    closeBtn: tokensCloseBtn,
    resizeHandle,
    header,
    storageKey: "token-window-state",
    minWidth: MIN_W,
    minHeight: MIN_H,
    defaultLeft: Math.max(20, window.innerWidth - 480),
    defaultTop: 120,
    roleAware: true
  });

  const renderList = () => {
    const base = [...(state.tokens || [])].sort((a, b) => {
      const weight = (t) => {
        const f = (t.faction || "").toLowerCase();
        if (f === "pc") return 0;
        if (f === "ally") return 1;
        if (f === "npc" || f === "enemy") return 2;
        return 3;
      };
      const wA = weight(a);
      const wB = weight(b);
      return wA === wB ? (a.id || "").localeCompare(b.id || "") : wA - wB;
    });
    tokensBody.innerHTML = "";
    base.forEach((t, idx) => {
      const row = document.createElement("div");
      row.className = "token-row";
      row.dataset.index = idx;
      const faction = (t.faction || "").toLowerCase();
      const tokenType = (t.type || "").toLowerCase();
      const isObject = t.id?.startsWith("OBJ-") || tokenType === "object" || tokenType === "structure";
      if (isObject) row.classList.add("faction-obj");
      else if (faction === "pc") row.classList.add("faction-pc");
      else if (faction === "ally") row.classList.add("faction-ally");
      else if (faction === "enemy" || faction === "npc" || faction === "hostile") row.classList.add("faction-enemy");
      row.innerHTML = `
        <span class="token-id">${t.id || ""}</span>
        <span class="token-name">${t.name || t.id || ""}</span>
        <span class="token-pos">${typeof t.col === "number" && typeof t.row === "number" ? `${t.col},${t.row}` : "?"}</span>
        <span class="token-hp">${t.hp ?? "?"}${t.hpMax ? `/` + t.hpMax : ""}</span>
      `;
      row.addEventListener("click", () => {
        lastSelectIndex = idx;
        if (typeof state.refreshTokenHighlights === "function") state.refreshTokenHighlights();
      });
      tokensBody.appendChild(row);
    });
  };

  state.renderTokensWindow = () => renderList();
  renderList();

  if (tokensCopyBtn) {
    tokensCopyBtn.addEventListener("click", () => {
      const ids = (state.tokens || []).map((t) => t.id).join(", ");
      navigator.clipboard?.writeText?.(ids);
    });
  }
}
