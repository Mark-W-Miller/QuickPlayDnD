export function initTokensWindow({
  tokensOpenBtn,
  tokensCloseBtn,
  tokensWindow,
  tokensBody,
  state,
  coercePx,
  safeJsonParse,
  renderTokensWindow,
  refreshTokenHighlights
}) {
  if (!tokensOpenBtn || !tokensWindow || !tokensBody) return;
  const header = tokensWindow.querySelector(".tokens-window-header");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const MIN_W = 320;
  const MIN_H = 240;
  let lastSelectIndex = null;

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
      height: `${rect.height}px`
    });
  };
  if (header) {
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      dragging = true;
      const rect = tokensWindow.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

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
      height: `${rect.height}px`
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
    persistTokenWinState({ open: true });
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

  tokensBody.addEventListener("click", (e) => {
    const rowEl = e.target.closest("tr[data-index]");
    if (!rowEl) return;
    const idx = Number(rowEl.dataset.index);
    const tokens = [...(state.tokens || [])].sort((a, b) => a.id.localeCompare(b.id));
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

  // Restore on init if previously open
  const saved = safeJsonParse(localStorage.getItem("token-window-state") || "{}", {});
  if (saved.open) {
    applyTokenWinState(saved);
    renderTokensWindow();
    tokensWindow.classList.add("open");
  }
}
