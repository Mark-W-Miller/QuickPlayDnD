const STORAGE_KEY = "scripts-window-state";

const coercePx = (val, fallback, min) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${Math.max(n, min)}px`;
};

export function initScriptsWindow({ scriptsOpenBtn, scriptsCloseBtn, scriptsWindow }) {
  if (!scriptsOpenBtn || !scriptsWindow) return;
  const header = scriptsWindow.querySelector(".scripts-window-header");
  const resizeHandle = scriptsWindow.querySelector(".scripts-window-resize");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
  const MIN_W = 360;
  const MIN_H = 300;

  const applyState = (saved = {}) => {
    if (saved.left !== undefined && saved.top !== undefined) {
      scriptsWindow.style.left = `${saved.left}px`;
      scriptsWindow.style.top = `${saved.top}px`;
      scriptsWindow.style.right = "auto";
      scriptsWindow.style.bottom = "auto";
    }
    scriptsWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    scriptsWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
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
    scriptsWindow.style.left = `${x}px`;
    scriptsWindow.style.top = `${y}px`;
    scriptsWindow.style.right = "auto";
    scriptsWindow.style.bottom = "auto";
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
    const rect = scriptsWindow.getBoundingClientRect();
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
      const rect = scriptsWindow.getBoundingClientRect();
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
    scriptsWindow.style.width = `${newW}px`;
    scriptsWindow.style.height = `${newH}px`;
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", endResize);
    const rect = scriptsWindow.getBoundingClientRect();
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
      const rect = scriptsWindow.getBoundingClientRect();
      resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", endResize);
    });
  }

  scriptsOpenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (scriptsWindow.classList.contains("open")) {
      const rect = scriptsWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      scriptsWindow.classList.remove("open");
      return;
    }
    const saved = (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch {
        return {};
      }
    })();
    applyState(saved);
    scriptsWindow.classList.add("open");
    persistState({ open: true });
  });

  if (scriptsCloseBtn) {
    scriptsCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = scriptsWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      scriptsWindow.classList.remove("open");
    });
  }

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  if (saved.open) {
    applyState(saved);
    scriptsWindow.classList.add("open");
  }
}
