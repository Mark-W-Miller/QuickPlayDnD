const STORAGE_KEY = "selection-window-state";

const coercePx = (val, fallback, min) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${Math.max(n, min)}px`;
};

export function initSelectionWindow({ openBtn, closeBtn, clearBtn, windowEl, textarea }) {
  if (!openBtn || !windowEl || !textarea) return null;
  const header = windowEl.querySelector(".selection-window-header");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const MIN_W = 260;
  const MIN_H = 180;
  let resizeHandle = windowEl.querySelector(".selection-window-resize");
  if (!resizeHandle) {
    resizeHandle = document.createElement("div");
    resizeHandle.className = "selection-window-resize";
    resizeHandle.setAttribute("aria-label", "Resize selection window");
    windowEl.appendChild(resizeHandle);
  }
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

  const applyState = (saved = {}) => {
    if (saved.left !== undefined && saved.top !== undefined) {
      windowEl.style.left = `${saved.left}px`;
      windowEl.style.top = `${saved.top}px`;
      windowEl.style.right = "auto";
      windowEl.style.bottom = "auto";
    }
    windowEl.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    windowEl.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
    if (saved.z) windowEl.style.zIndex = String(saved.z);
    if (saved.content !== undefined) textarea.value = saved.content;
  };

  const persistState = (winState) => {
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...winState }));
    } catch {
      /* ignore */
    }
  };

  const bringToFront = () => {
    const next = (window.__winZCounter || 9000) + 1;
    window.__winZCounter = next;
    windowEl.style.zIndex = String(next);
    persistState({ z: next });
  };

  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    windowEl.style.left = `${x}px`;
    windowEl.style.top = `${y}px`;
    windowEl.style.right = "auto";
    windowEl.style.bottom = "auto";
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
    const rect = windowEl.getBoundingClientRect();
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
      bringToFront();
      dragging = true;
      const rect = windowEl.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

  windowEl.addEventListener("focusin", bringToFront);

  const onResizeMove = (e) => {
    if (!resizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(MIN_W, resizeStart.w + dx);
    const newH = Math.max(MIN_H, resizeStart.h + dy);
    windowEl.style.width = `${newW}px`;
    windowEl.style.height = `${newH}px`;
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", endResize);
    const rect = windowEl.getBoundingClientRect();
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
      const rect = windowEl.getBoundingClientRect();
      resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", endResize);
    });
  }

  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (windowEl.classList.contains("open")) {
      const rect = windowEl.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false,
        content: textarea.value
      });
      windowEl.classList.remove("open");
    } else {
      const saved = (() => {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        } catch {
          return {};
        }
      })();
      applyState(saved);
      windowEl.classList.add("open");
      persistState({ open: true, content: textarea.value });
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = windowEl.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false,
        content: textarea.value
      });
      windowEl.classList.remove("open");
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      textarea.value = "";
      persistState({ content: "" });
    });
  }

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  applyState(saved);
  if (saved.open) windowEl.classList.add("open");

  const setContent = (text) => {
    textarea.value = text;
    persistState({ content: text });
  };

  return { setContent, bringToFront };
}
