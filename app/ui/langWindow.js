const roleSuffix = (() => {
  try {
    const url = new URL(window.location.href);
    const roleParam = (url.searchParams.get("role") || "").toLowerCase();
    const path = url.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (roleParam === "player" || url.searchParams.has("cl") || path === "player") return "player";
    return "dm";
  } catch {
    return "dm";
  }
})();

const STORAGE_KEY = `lang-window-state-${roleSuffix}`;

const loadWinState = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

const saveWinState = (winState) => {
  try {
    const prev = loadWinState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...winState }));
  } catch {
    /* ignore */
  }
};

const coercePx = (val, fallback, min) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${Math.max(n, min)}px`;
};

const parseSize = (raw, fallback) => {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const deriveGeom = (saved, { minW, minH }) => {
  const width = parseSize(saved?.width, minW);
  const height = parseSize(saved?.height, minH);
  const left = typeof saved?.left === "number" ? saved.left : 20;
  const top = typeof saved?.top === "number" ? saved.top : 20;
  return { left, top, width, height };
};

const clampGeom = (geom) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampedLeft = Math.min(Math.max(geom.left, 0), Math.max(0, vw - geom.width));
  const clampedTop = Math.min(Math.max(geom.top, 0), Math.max(0, vh - geom.height));
  return { ...geom, left: clampedLeft, top: clampedTop };
};

export function initLangWindow({ langOpenBtn, langCloseBtn, langWindow }) {
  if (!langOpenBtn || !langWindow) return;
  const header = langWindow.querySelector(".lang-window-header");
  const resizeHandle = langWindow.querySelector(".lang-window-resize");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };
  const MIN_W = 500;
  const MIN_H = 360;
  const bringToFront = () => {
    const next = (window.__winZCounter || 9000) + 1;
    window.__winZCounter = next;
    langWindow.style.zIndex = String(next);
    persistState({ z: next });
  };

  const applyState = (saved = {}) => {
    if (saved.left !== undefined && saved.top !== undefined) {
      langWindow.style.left = `${saved.left}px`;
      langWindow.style.top = `${saved.top}px`;
      langWindow.style.right = "auto";
      langWindow.style.bottom = "auto";
    }
    langWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    langWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
    if (saved.z) langWindow.style.zIndex = String(saved.z);
  };

  const persistState = (winState) => {
    saveWinState(winState);
  };

  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    langWindow.style.left = `${x}px`;
    langWindow.style.top = `${y}px`;
    langWindow.style.right = "auto";
    langWindow.style.bottom = "auto";
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
    const rect = langWindow.getBoundingClientRect();
    persistState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      z: Number(langWindow.style.zIndex) || undefined
    });
  };

  if (header) {
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      bringToFront();
      dragging = true;
      const rect = langWindow.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

  langWindow.addEventListener("focusin", bringToFront);

  const onResizeMove = (e) => {
    if (!resizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(MIN_W, resizeStart.w + dx);
    const newH = Math.max(MIN_H, resizeStart.h + dy);
    langWindow.style.width = `${newW}px`;
    langWindow.style.height = `${newH}px`;
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", endResize);
    const rect = langWindow.getBoundingClientRect();
    persistState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      z: Number(langWindow.style.zIndex) || undefined
    });
  };

  if (resizeHandle) {
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      const rect = langWindow.getBoundingClientRect();
      resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", endResize);
    });
  }

  langOpenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (langWindow.classList.contains("open")) {
      const rect = langWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      langWindow.classList.remove("open");
      return;
    }
    const saved = loadWinState();
    applyState(saved);
    const rect = langWindow.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const savedW = saved?.width ? parseFloat(saved.width) || rect.width : rect.width;
    const savedH = saved?.height ? parseFloat(saved.height) || rect.height : rect.height;
    const baseLeft = saved?.left ?? rect.left;
    const baseTop = saved?.top ?? rect.top;
    const width = savedW || MIN_W;
    const height = savedH || MIN_H;
    const clampedLeft = Math.min(Math.max(baseLeft, 0), Math.max(0, vw - width));
    const clampedTop = Math.min(Math.max(baseTop, 0), Math.max(0, vh - height));
    const finalLeft = baseLeft < 0 || baseLeft + width > vw ? clampedLeft : baseLeft;
    const finalTop = baseTop < 0 || baseTop + height > vh ? clampedTop : baseTop;
    langWindow.style.left = `${finalLeft}px`;
    langWindow.style.top = `${finalTop}px`;
    langWindow.classList.add("open");
    langWindow.style.display = "flex";
    langWindow.style.flexDirection = "column";
    bringToFront();
    persistState({
      left: finalLeft,
      top: finalTop,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      open: true,
      z: Number(langWindow.style.zIndex) || undefined
    });
  });

  if (langCloseBtn) {
    langCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = langWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false,
        z: Number(langWindow.style.zIndex) || undefined
      });
      langWindow.classList.remove("open");
      langWindow.style.display = "none";
    });
  }

  const saved = loadWinState();
  if (saved.open) {
    applyState(saved);
    const rect = langWindow.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const savedW = saved?.width ? parseFloat(saved.width) || rect.width : rect.width;
    const savedH = saved?.height ? parseFloat(saved.height) || rect.height : rect.height;
    const baseLeft = saved?.left ?? rect.left;
    const baseTop = saved?.top ?? rect.top;
    const width = savedW || MIN_W;
    const height = savedH || MIN_H;
    const clampedLeft = Math.min(Math.max(baseLeft, 0), Math.max(0, vw - width));
    const clampedTop = Math.min(Math.max(baseTop, 0), Math.max(0, vh - height));
    const finalLeft = baseLeft < 0 || baseLeft + width > vw ? clampedLeft : baseLeft;
    const finalTop = baseTop < 0 || baseTop + height > vh ? clampedTop : baseTop;
    langWindow.style.left = `${finalLeft}px`;
    langWindow.style.top = `${finalTop}px`;
    langWindow.classList.add("open");
    langWindow.style.display = "flex";
    langWindow.style.flexDirection = "column";
    persistState({
      left: clampedLeft,
      top: clampedTop,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      open: true,
      z: Number(langWindow.style.zIndex) || undefined
    });
  }
}
