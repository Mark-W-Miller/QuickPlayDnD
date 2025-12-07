const getRoleSuffix = () => {
  try {
    const url = new URL(window.location.href);
    const roleParam = (url.searchParams.get("role") || "").toLowerCase();
    const path = url.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
    if (roleParam === "player" || url.searchParams.has("cl") || path === "player") return "player";
    return "dm";
  } catch {
    return "dm";
  }
};

const parseSize = (raw, fallback) => {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const deriveGeom = (saved = {}, { minW, minH, defaultLeft = 20, defaultTop = 20 }) => {
  const width = parseSize(saved.width, minW);
  const height = parseSize(saved.height, minH);
  const left = typeof saved.left === "number" ? saved.left : defaultLeft;
  const top = typeof saved.top === "number" ? saved.top : defaultTop;
  return { left, top, width, height };
};

const clampGeom = (geom) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampedLeft = Math.min(Math.max(geom.left, 0), Math.max(0, vw - geom.width));
  const clampedTop = Math.min(Math.max(geom.top, 0), Math.max(0, vh - geom.height));
  return { ...geom, left: clampedLeft, top: clampedTop };
};

export function createWindowFrame({
  rootEl,
  openBtn,
  closeBtn,
  resizeHandle,
  header,
  storageKey,
  minWidth,
  minHeight,
  defaultLeft = 20,
  defaultTop = 20,
  roleAware = true
}) {
  if (!rootEl) return null;
  const roleSuffix = roleAware ? getRoleSuffix() : "";
  const fullKey = roleSuffix ? `${storageKey}-${roleSuffix}` : storageKey;
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  let resizing = false;
  let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

  const loadState = () => {
    try {
      return JSON.parse(localStorage.getItem(fullKey) || "{}") || {};
    } catch {
      return {};
    }
  };

  const saveState = (winState) => {
    try {
      const prev = loadState();
      localStorage.setItem(fullKey, JSON.stringify({ ...prev, ...winState }));
    } catch {
      /* ignore */
    }
  };

  const applyGeom = (geom) => {
    rootEl.style.width = `${geom.width}px`;
    rootEl.style.height = `${geom.height}px`;
    rootEl.style.left = `${geom.left}px`;
    rootEl.style.top = `${geom.top}px`;
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";
  };

  const persistFromRect = (extra = {}) => {
    const rect = rootEl.getBoundingClientRect();
    saveState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      open: rootEl.classList.contains("open"),
      z: Number(rootEl.style.zIndex) || undefined,
      ...extra
    });
  };

  const bringToFront = () => {
    const next = (window.__winZCounter || 9000) + 1;
    window.__winZCounter = next;
    rootEl.style.zIndex = String(next);
    saveState({ z: next });
  };

  const loadGeom = () => clampGeom(deriveGeom(loadState(), { minW: minWidth, minH: minHeight, defaultLeft, defaultTop }));

  const attachDrag = () => {
    if (!header) return;
    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      bringToFront();
      dragging = true;
      const rect = rootEl.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onDragMove);
      window.addEventListener("mouseup", endDrag);
    });
  };

  const onDragMove = (e) => {
    if (!dragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    rootEl.style.left = `${x}px`;
    rootEl.style.top = `${y}px`;
    rootEl.style.right = "auto";
    rootEl.style.bottom = "auto";
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", endDrag);
    persistFromRect();
  };

  const onResizeMove = (e) => {
    if (!resizing) return;
    const dx = e.clientX - resizeStart.x;
    const dy = e.clientY - resizeStart.y;
    const newW = Math.max(minWidth, resizeStart.w + dx);
    const newH = Math.max(minHeight, resizeStart.h + dy);
    rootEl.style.width = `${newW}px`;
    rootEl.style.height = `${newH}px`;
  };

  const endResize = () => {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", endResize);
    persistFromRect();
  };

  const attachResize = () => {
    if (!resizeHandle) return;
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      const rect = rootEl.getBoundingClientRect();
      resizeStart = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      window.addEventListener("mousemove", onResizeMove);
      window.addEventListener("mouseup", endResize);
    });
  };

  const openWindow = () => {
    const geom = loadGeom();
    applyGeom(geom);
    rootEl.classList.add("open");
    rootEl.style.display = "flex";
    rootEl.style.flexDirection = "column";
    bringToFront();
    saveState({
      ...geom,
      width: `${geom.width}px`,
      height: `${geom.height}px`,
      open: true,
      z: Number(rootEl.style.zIndex) || undefined
    });
  };

  const closeWindow = () => {
    const rect = rootEl.getBoundingClientRect();
    saveState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      open: false,
      z: Number(rootEl.style.zIndex) || undefined
    });
    rootEl.classList.remove("open");
    rootEl.style.display = "none";
  };

  const attachOpenClose = () => {
    if (openBtn) {
      openBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (rootEl.classList.contains("open")) {
          closeWindow();
        } else {
          openWindow();
        }
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        closeWindow();
      });
    }
  };

  rootEl.addEventListener("focusin", bringToFront, true);
  attachDrag();
  attachResize();
  attachOpenClose();

  const saved = loadState();
  if (saved.open) openWindow();

  return {
    bringToFront,
    open: openWindow,
    close: closeWindow,
    save: persistFromRect
  };
}
