const STORAGE_KEY = "params-window-state";

const coercePx = (val, fallback, min) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${Math.max(n, min)}px`;
};

export function initParamsWindow({ paramsOpenBtn, paramsCloseBtn, paramsWindow }) {
  if (!paramsOpenBtn || !paramsWindow) return;
  const header = paramsWindow.querySelector(".params-window-header");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const MIN_W = 280;
  const MIN_H = 200;
  let resizeHandle = paramsWindow.querySelector(".params-window-resize");
  if (!resizeHandle) {
    resizeHandle = document.createElement("div");
    resizeHandle.className = "params-window-resize";
    resizeHandle.setAttribute("aria-label", "Resize");
    paramsWindow.appendChild(resizeHandle);
  }
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

  const applyState = (saved = {}) => {
    if (!paramsWindow) return;
    if (saved.left !== undefined && saved.top !== undefined) {
      paramsWindow.style.left = `${saved.left}px`;
      paramsWindow.style.top = `${saved.top}px`;
      paramsWindow.style.right = "auto";
      paramsWindow.style.bottom = "auto";
    }
    paramsWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    paramsWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
  };

  const persistState = (winState) => {
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...winState }));
    } catch {
      /* ignore */
    }
  };

  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    paramsWindow.style.left = `${x}px`;
    paramsWindow.style.top = `${y}px`;
    paramsWindow.style.right = "auto";
    paramsWindow.style.bottom = "auto";
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
    const rect = paramsWindow.getBoundingClientRect();
    persistState({
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
      const rect = paramsWindow.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

  const onResizeMove = (e) => {
    if (!resizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(MIN_W, resizeStart.w + dx);
    const newH = Math.max(MIN_H, resizeStart.h + dy);
    paramsWindow.style.width = `${newW}px`;
    paramsWindow.style.height = `${newH}px`;
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", endResize);
    const rect = paramsWindow.getBoundingClientRect();
    persistState({
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
      const rect = paramsWindow.getBoundingClientRect();
      resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", endResize);
    });
  }

  paramsOpenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (paramsWindow.classList.contains("open")) {
      const rect = paramsWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      paramsWindow.classList.remove("open");
    } else {
      const saved = (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        } catch {
          return {};
        }
      })();
      applyState(saved);
      paramsWindow.classList.add("open");
      persistState({ open: true });
    }
  });

  if (paramsCloseBtn) {
    paramsCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = paramsWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      paramsWindow.classList.remove("open");
    });
  }

  // Restore state on init if previously open
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  if (saved.open) {
    applyState(saved);
    paramsWindow.classList.add("open");
  }
}
