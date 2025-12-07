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

const STORAGE_KEY = `scripts-window-state-${roleSuffix}`;

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
  const persistFromRect = () => {
    const rect = scriptsWindow.getBoundingClientRect();
    persistState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      open: scriptsWindow.classList.contains("open"),
      z: Number(scriptsWindow.style.zIndex) || undefined
    });
  };
  const bringToFront = () => {
    const next = (window.__winZCounter || 9000) + 1;
    window.__winZCounter = next;
    scriptsWindow.style.zIndex = String(next);
    persistState({ z: next });
  };

  const applyState = (saved = {}) => {
    if (saved.left !== undefined && saved.top !== undefined) {
      scriptsWindow.style.left = `${saved.left}px`;
      scriptsWindow.style.top = `${saved.top}px`;
      scriptsWindow.style.right = "auto";
      scriptsWindow.style.bottom = "auto";
    }
    scriptsWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    scriptsWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
    if (saved.z) scriptsWindow.style.zIndex = String(saved.z);
  };

  const persistState = (winState) => {
    saveWinState(winState);
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
    persistFromRect();
  };

  if (header) {
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      bringToFront();
      dragging = true;
      const rect = scriptsWindow.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

  scriptsWindow.addEventListener("focusin", bringToFront, true);
  scriptsWindow.addEventListener(
    "mousedown",
    (e) => {
      // ignore native scrollbar drags, but catch everything else
      if (e.target.closest(".scripts-window")) bringToFront();
    },
    true
  );

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
    persistFromRect();
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
        open: false,
        z: Number(scriptsWindow.style.zIndex) || undefined
      });
      scriptsWindow.classList.remove("open");
      scriptsWindow.style.display = "none";
      return;
    }
    const saved = loadWinState();
    const geom = deriveGeom(saved, { minW: MIN_W, minH: MIN_H });
    scriptsWindow.style.width = `${geom.width}px`;
    scriptsWindow.style.height = `${geom.height}px`;
    scriptsWindow.style.left = `${geom.left}px`;
    scriptsWindow.style.top = `${geom.top}px`;
    scriptsWindow.classList.add("open");
    scriptsWindow.style.display = "flex";
    scriptsWindow.style.flexDirection = "column";
    bringToFront();
    persistState({
      ...geom,
      width: `${geom.width}px`,
      height: `${geom.height}px`,
      open: true,
      z: Number(scriptsWindow.style.zIndex) || undefined
    });
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
        open: false,
        z: Number(scriptsWindow.style.zIndex) || undefined
      });
      scriptsWindow.classList.remove("open");
      scriptsWindow.style.display = "none";
    });
  }

  const saved = loadWinState();
  if (saved.open) {
    const geom = deriveGeom(saved, { minW: MIN_W, minH: MIN_H });
    scriptsWindow.style.width = `${geom.width}px`;
    scriptsWindow.style.height = `${geom.height}px`;
    scriptsWindow.style.left = `${geom.left}px`;
    scriptsWindow.style.top = `${geom.top}px`;
    scriptsWindow.classList.add("open");
    scriptsWindow.style.display = "flex";
    scriptsWindow.style.flexDirection = "column";
    persistState({
      ...geom,
      width: `${geom.width}px`,
      height: `${geom.height}px`,
      open: true,
      z: Number(scriptsWindow.style.zIndex) || undefined
    });
  }
}
