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
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const MIN_W = 320;
  const MIN_H = 240;
  let lastSelectIndex = null;

  const bringToFront = () => {
    const next = (window.__winZCounter || 9000) + 1;
    window.__winZCounter = next;
    tokensWindow.style.zIndex = String(next);
    persistTokenWinState({ z: next });
  };

  let renderList = [];
  let sortState = { col: "default", dir: 1 };

  const renderTokensWindow = () => {
    const base = [...(state.tokens || [])].sort((a, b) => {
      const weight = (t) => {
        const f = (t.faction || "").toLowerCase();
        if (f === "pc") return 0;
        if (f === "ally") return 1;
        if (f === "npc" || f === "enemy") return 2;
        return 3; // objects/others
      };
      const wA = weight(a);
      const wB = weight(b);
      if (wA !== wB) return wA - wB;
      return a.id.localeCompare(b.id);
    });
    const hasInit = base.some((t) => Number.isFinite(t.initiative));
    if (hasInit) {
      // Prefer initiative ordering whenever present.
      sortState = { col: "init", dir: 1 };
    } else if (sortState.col === "init") {
      // If no init values remain, fall back to default ordering.
      sortState = { col: "default", dir: 1 };
    }
    const tokens = base.slice().sort((a, b) => {
      if (sortState.col === "default") return 0;
      const dir = sortState.dir;
      if (sortState.col === "id") return dir * a.id.localeCompare(b.id);
      if (sortState.col === "grid") {
        const ref = (t) => {
          const colIdx = Number.isFinite(t.col) ? Math.round(t.col) : t.col;
          const colLetter = Number.isFinite(colIdx) ? String.fromCharCode(65 + colIdx) : "Z";
          const row = Number.isFinite(t.row) ? Math.round(t.row) : 9999;
          return `${colLetter}${row.toString().padStart(4, "0")}`;
        };
        return dir * ref(a).localeCompare(ref(b));
      }
      if (sortState.col === "hp") {
        const dmg = (t) => {
          const max = Number.isFinite(t.hpMax) ? t.hpMax : Number.isFinite(t.hp) ? t.hp : 0;
          const cur = Number.isFinite(t.remainingHp) ? t.remainingHp : max;
          return Math.max(0, max - cur);
        };
        const diff = dmg(b) - dmg(a); // most damage first by default
        return dir * diff;
      }
      if (sortState.col === "init") {
        const ia = Number.isFinite(a.initiative) ? a.initiative : 0;
        const ib = Number.isFinite(b.initiative) ? b.initiative : 0;
        return dir * (ib - ia); // higher init first
      }
      return 0;
    });
    renderList = tokens;
    const table = document.createElement("table");
    table.className = "token-table";
    const thead = document.createElement("thead");
    thead.innerHTML =
      '<tr><th data-col="id">ID</th><th data-col="grid">Grid</th><th data-col="hp">Dam/HP</th><th data-col="init">Init</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    tokens.forEach((t, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.index = idx;
      tr.dataset.id = t.id;
      const faction = (t.faction || "").toLowerCase();
      const tokenType = (t.type || "").toLowerCase();
      const isObject = t.id?.startsWith("OBJ-") || tokenType === "object" || tokenType === "structure";
      if (isObject) tr.classList.add("faction-obj");
      else if (faction === "pc") tr.classList.add("faction-pc");
      else if (faction === "ally") tr.classList.add("faction-ally");
      else if (faction === "enemy" || faction === "npc" || faction === "hostile") tr.classList.add("faction-enemy");
      else tr.classList.add("faction-obj");
      if (state.selectedTokenIds?.has(t.id)) tr.classList.add("selected");
      const colIdx = Number.isFinite(t.col) ? Math.round(t.col) : t.col;
      const colLetter = Number.isFinite(colIdx) ? String.fromCharCode(65 + colIdx) : colIdx;
      const row = Number.isFinite(t.row) ? Math.round(t.row) : t.row;
      const gridRef = colLetter !== undefined && row !== undefined ? `${colLetter}${row}` : "";
      const hpMax = Number.isFinite(t.hpMax) ? t.hpMax : Number.isFinite(t.hp) ? t.hp : null;
      const hpCur = Number.isFinite(t.remainingHp) ? t.remainingHp : Number.isFinite(t.hp) ? t.hp : hpMax;
      const damage = hpMax != null && hpCur != null ? Math.max(0, hpMax - hpCur) : null;
      const infoFull = t.info || "";
      const infoPreview = infoFull.split(";")[0];
      const display = damage != null ? `${damage}/${hpMax}` : infoPreview;
      const infoTitle = infoFull || display;
      const initVal = t.initiative != null ? t.initiative : "-";
      tr.innerHTML = `<td>${t.id}</td><td>${gridRef}</td><td title="${infoTitle}">${display}</td><td>${initVal}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tokensBody.innerHTML = "";
    tokensBody.appendChild(table);

    // Wire up sortable headers
    table.querySelectorAll("th[data-col]").forEach((th) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const col = th.getAttribute("data-col");
        if (!col) return;
        if (sortState.col === col) sortState = { col, dir: -sortState.dir };
        else sortState = { col, dir: 1 };
        renderTokensWindow();
      });
    });
  };
  // Expose to other modules so they can refresh after token changes.
  state.renderTokensWindow = renderTokensWindow;

  const applyTokenWinState = (saved = {}) => {
    if (!tokensWindow) return;
    if (saved.left !== undefined && saved.top !== undefined) {
      tokensWindow.style.left = `${saved.left}px`;
      tokensWindow.style.top = `${saved.top}px`;
      tokensWindow.style.right = "auto";
      tokensWindow.style.bottom = "auto";
    }
    tokensWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    tokensWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
    if (saved.z) tokensWindow.style.zIndex = String(saved.z);
  };

  const persistTokenWinState = (winState) => {
    const saved = safeJsonParse(localStorage.getItem("token-window-state") || "{}", {});
    localStorage.setItem("token-window-state", JSON.stringify({ ...saved, ...winState }));
  };

  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    tokensWindow.style.left = `${x}px`;
    tokensWindow.style.top = `${y}px`;
    tokensWindow.style.right = "auto";
    tokensWindow.style.bottom = "auto";
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
    const rect = tokensWindow.getBoundingClientRect();
    persistTokenWinState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      z: Number(tokensWindow.style.zIndex) || undefined
    });
  };
  if (header) {
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      bringToFront();
      dragging = true;
      const rect = tokensWindow.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

  tokensWindow.addEventListener("focusin", bringToFront);

  const resizeHandle = tokensWindow.querySelector(".tokens-window-resize");
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
  const onResizeMove = (e) => {
    if (!resizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(MIN_W, resizeStart.w + dx);
    const newH = Math.max(MIN_H, resizeStart.h + dy);
    tokensWindow.style.width = `${newW}px`;
    tokensWindow.style.height = `${newH}px`;
  };
  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", endResize);
    const rect = tokensWindow.getBoundingClientRect();
    persistTokenWinState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      z: Number(tokensWindow.style.zIndex) || undefined
    });
  };
  if (resizeHandle) {
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      const rect = tokensWindow.getBoundingClientRect();
      resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", endResize);
    });
  }

  const resizeObserver = new ResizeObserver(() => {
    const rect = tokensWindow.getBoundingClientRect();
    persistTokenWinState({
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  });
  resizeObserver.observe(tokensWindow);

  tokensOpenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (tokensWindow.classList.contains("open")) {
      const rect = tokensWindow.getBoundingClientRect();
      persistTokenWinState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      tokensWindow.classList.remove("open");
      return;
    }
    const saved = safeJsonParse(localStorage.getItem("token-window-state") || "{}", {});
    applyTokenWinState(saved);
    renderTokensWindow();
    tokensWindow.classList.add("open");
    bringToFront();
    persistTokenWinState({ open: true, z: Number(tokensWindow.style.zIndex) || undefined });
  });

  if (tokensCloseBtn) {
    tokensCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = tokensWindow.getBoundingClientRect();
      persistTokenWinState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      tokensWindow.classList.remove("open");
    });
  }

  if (tokensCopyBtn) {
    tokensCopyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const tokens = [...(state.tokens || [])].sort((a, b) => a.id.localeCompare(b.id));
      const lines = tokens.map((t) => {
        const col = Number.isFinite(t.col) ? String.fromCharCode(65 + Math.round(t.col)) : t.col;
        const row = Number.isFinite(t.row) ? Math.round(t.row) : t.row;
        return `${t.id} ${col}${row}`;
      });
      const text = lines.join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // fallback: select and copy via textarea
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    });
  }

  tokensBody.addEventListener("click", (e) => {
    const rowEl = e.target.closest("tr[data-id]");
    if (!rowEl) return;
    const tokId = rowEl.dataset.id;
    const tokens = renderList;
    const idx = tokens.findIndex((t) => t.id === tokId);
    if (idx === -1) return;
    const token = tokens[idx];
    if (!token) return;
    const selected = new Set(state.selectedTokenIds || []);
    const doRange = e.shiftKey && lastSelectIndex != null;
    const toggle = e.metaKey || e.ctrlKey;

    if (doRange) {
      const [a, b] = [lastSelectIndex, idx].sort((x, y) => x - y);
      if (!toggle) selected.clear();
      for (let i = a; i <= b; i++) {
        selected.add(tokens[i].id);
      }
    } else if (toggle) {
      if (selected.has(token.id)) selected.delete(token.id);
      else selected.add(token.id);
      lastSelectIndex = idx;
    } else {
      selected.clear();
      selected.add(token.id);
      lastSelectIndex = idx;
    }
    state.selectedTokenIds = selected;
    renderTokensWindow();
    refreshTokenHighlights();
  });

  // Sort handlers
  tokensBody.parentElement?.querySelectorAll(".token-table th[data-col]").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-col");
      if (!col) return;
      if (sortState.col === col) sortState = { col, dir: -sortState.dir };
      else sortState = { col, dir: 1 };
      renderTokensWindow();
    });
  });

  // Restore on init if previously open
  const saved = safeJsonParse(localStorage.getItem("token-window-state") || "{}", {});
  if (saved.open) {
    applyTokenWinState(saved);
    renderTokensWindow();
    tokensWindow.classList.add("open");
  }
}
