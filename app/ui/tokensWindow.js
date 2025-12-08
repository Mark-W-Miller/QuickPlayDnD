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
  refreshTokenHighlights,
  onSelectionChange
}) {
  if (!tokensOpenBtn || !tokensWindow || !tokensBody) return;
  const header = tokensWindow.querySelector(".tokens-window-header");
  const resizeHandle = tokensWindow.querySelector(".tokens-window-resize");
  const MIN_W = 320;
  const MIN_H = 240;
  let lastSelectIndex = null;
  let currentTokens = [];

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
    currentTokens = base;
    tokensBody.innerHTML = "";
    const table = document.createElement("table");
    table.className = "token-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Pos</th>
        <th>Init</th>
        <th>HP</th>
      </tr>
    `;
    const tbody = document.createElement("tbody");
    const selected = new Set(state.selectedTokenIds || []);
    base.forEach((t, idx) => {
      const row = document.createElement("tr");
      row.dataset.index = idx;
      const faction = (t.faction || "").toLowerCase();
      const tokenType = (t.type || "").toLowerCase();
      const isObject = t.id?.startsWith("OBJ-") || tokenType === "object" || tokenType === "structure";
      if (isObject) row.classList.add("faction-obj");
      else if (faction === "pc") row.classList.add("faction-pc");
      else if (faction === "ally") row.classList.add("faction-ally");
      else if (faction === "enemy" || faction === "npc" || faction === "hostile") row.classList.add("faction-enemy");
      if (selected.has(t.id)) row.classList.add("selected");
      const pos =
        typeof t.col === "number" && typeof t.row === "number" ? `${t.col},${t.row}` : "?";
      const initVal = t.initiative ?? t.init ?? "";
      row.innerHTML = `
        <td class="token-id">${t.id || ""}</td>
        <td class="token-name">${t.name || t.id || ""}</td>
        <td class="token-pos">${pos}</td>
        <td class="token-init">${initVal === "" ? "" : initVal}</td>
        <td class="token-hp">${t.hp ?? "?"}${t.hpMax ? `/` + t.hpMax : ""}</td>
      `;
      row.addEventListener("click", (e) => {
        const current = new Set(state.selectedTokenIds || []);
        const id = t.id;
        if (e.shiftKey && lastSelectIndex !== null && currentTokens[lastSelectIndex]) {
          const start = Math.min(lastSelectIndex, idx);
          const end = Math.max(lastSelectIndex, idx);
          current.clear();
          for (let i = start; i <= end; i++) {
            const tok = currentTokens[i];
            if (tok?.id) current.add(tok.id);
          }
        } else if (e.metaKey || e.ctrlKey) {
          if (current.has(id)) current.delete(id);
          else current.add(id);
          lastSelectIndex = idx;
        } else {
          current.clear();
          current.add(id);
          lastSelectIndex = idx;
        }
        if (onSelectionChange) onSelectionChange(Array.from(current));
        else {
          state.selectedTokenIds = current;
          if (typeof state.refreshTokenHighlights === "function") state.refreshTokenHighlights();
          renderList();
        }
      });
      tbody.appendChild(row);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    tokensBody.appendChild(table);
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
