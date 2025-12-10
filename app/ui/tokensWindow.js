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

  const refFromColRow = (c, r) => {
    if (!Number.isFinite(c) || !Number.isFinite(r)) return "";
    let col = Math.floor(c) + 1;
    let letters = "";
    while (col > 0) {
      const rem = (col - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      col = Math.floor((col - 1) / 26);
    }
    return `${letters}${Math.floor(r) + 1}`;
  };

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
      const initA = Number.isFinite(a.initiative) ? a.initiative : Number.isFinite(a.init) ? a.init : null;
      const initB = Number.isFinite(b.initiative) ? b.initiative : Number.isFinite(b.init) ? b.init : null;
      if (initA !== null && initB !== null && initA !== initB) {
        return initB - initA; // higher first
      }
      if (initA !== null && initB === null) return -1;
      if (initA === null && initB !== null) return 1;
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
        <th>Init</th>
        <th>Name</th>
        <th>Pos</th>
        <th>HP</th>
        <th>ID</th>
      </tr>
    `;
    const tbody = document.createElement("tbody");
    const selected = new Set(state.selectedTokenIds || []);
    base.forEach((t, idx) => {
      const row = document.createElement("tr");
      row.dataset.index = idx;
      row.dataset.id = t.id || "";
      const faction = (t.faction || "").toLowerCase();
      const tokenType = (t.type || "").toLowerCase();
      const isObject = t.id?.startsWith("OBJ-") || tokenType === "object" || tokenType === "structure";
      if (isObject) row.classList.add("faction-obj");
      else if (faction === "pc") row.classList.add("faction-pc");
      else if (faction === "ally") row.classList.add("faction-ally");
      else if (faction === "enemy" || faction === "npc" || faction === "hostile") row.classList.add("faction-enemy");
      if (selected.has(t.id)) row.classList.add("selected");
      const pos =
        typeof t.col === "number" && typeof t.row === "number" ? refFromColRow(t.col, t.row) : "?";
      const initVal = t.initiative ?? t.init ?? "";
      row.innerHTML = `
        <td class="token-init">${initVal === "" ? "" : initVal}</td>
        <td class="token-name">${t.name || t.id || ""}</td>
        <td class="token-pos"><strong>${pos}</strong></td>
        <td class="token-hp">${t.hp ?? "?"}${t.hpMax ? `/` + t.hpMax : ""}</td>
        <td class="token-id">${t.id || ""}</td>
      `;
      row.addEventListener("click", () => {
        const selectedIds = [t.id];
        lastSelectIndex = idx;
        if (onSelectionChange) onSelectionChange(selectedIds);
        else {
          state.selectedTokenIds = new Set(selectedIds);
          if (typeof state.refreshTokenHighlights === "function") state.refreshTokenHighlights();
          renderList();
        }
      });
      row.addEventListener("dblclick", () => {
        state.logClass?.("INFO", `Focus token ${t.id} from tokens window`);
        window.dispatchEvent(new CustomEvent("focus-token", { detail: { id: t.id } }));
      });
      tbody.appendChild(row);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    tokensBody.appendChild(table);

    // Scroll the first selected token into view.
    const firstSelected = selected.values().next().value;
    if (firstSelected) {
      const row = tbody.querySelector(`tr[data-id="${firstSelected}"]`);
      if (row && typeof row.scrollIntoView === "function") {
        row.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    }
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
