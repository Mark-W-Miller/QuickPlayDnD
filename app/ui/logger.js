const safeJsonParse = (val, fallback) => {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

export const initLogger = ({
  maxEntries = 200,
  maxStored = 2000,
  storageKey = "log-window-state",
  historyKey = "log-history",
  classKey = "log-enabled-classes"
} = {}) => {
  const logEl = document.getElementById("log");
  const logOpenBtn = document.getElementById("log-open");
  const logCloseBtn = document.getElementById("log-close");
  const logClearBtn = document.getElementById("log-clear");
  const logCopyBtn = document.getElementById("log-copy");
  const logWindow = document.getElementById("log-window");
  const dbOpenBtn = document.getElementById("db-open");
  const dbCloseBtn = document.getElementById("db-close");
  const dbWindow = document.getElementById("db-window");
  const dbBody = document.getElementById("db-body");
  const MIN_W = 320;
  const MIN_H = 220;
  const DB_MIN_W = 360;
  const DB_MIN_H = 240;
  const state = {
    entries: [],
    classes: new Set(),
    enabledClasses: new Set()
  };

  const coercePx = (val, fallback, min) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return `${Math.max(n, min)}px`;
  };

  const persistState = (winState) => {
    const saved = safeJsonParse(localStorage.getItem(storageKey) || "{}", {});
    const merged = { ...saved, ...winState };
    localStorage.setItem(storageKey, JSON.stringify(merged));
  };
  const persistDbState = (winState) => {
    const saved = safeJsonParse(localStorage.getItem("db-window-state") || "{}", {});
    localStorage.setItem("db-window-state", JSON.stringify({ ...saved, ...winState }));
  };

  const persistHistory = () => {
    try {
      localStorage.setItem(historyKey, JSON.stringify(state.entries.slice(0, maxStored)));
    } catch {
      /* ignore */
    }
  };

  const persistEnabled = () => {
    try {
      localStorage.setItem(classKey, JSON.stringify(Array.from(state.enabledClasses)));
    } catch {
      /* ignore */
    }
  };

  const loadEnabled = () => {
    const saved = safeJsonParse(localStorage.getItem(classKey) || "[]", []);
    if (Array.isArray(saved) && saved.length) saved.forEach((c) => state.enabledClasses.add(c));
  };

  const loadHistory = () => {
    const saved = safeJsonParse(localStorage.getItem(historyKey) || "[]", []);
    if (Array.isArray(saved)) state.entries = saved.slice(0, maxStored);
  };

  loadHistory();
  loadEnabled();
  // Fixed list of known classes; do not pull from storage for initialization.
  const bootstrapClasses = ["INFO", "BUILD", "CAMERA", "3DLOAD", "SELECTION", "MOVE", "ERROR"];
  bootstrapClasses.forEach((c) => state.classes.add(c));
  // Respect saved enabled classes; if none saved, enable defaults.
  if (!state.enabledClasses.size) {
    bootstrapClasses.forEach((c) => state.enabledClasses.add(c));
  }

  const applyState = (saved = {}) => {
    if (!logWindow) return;
    if (saved.left !== undefined && saved.top !== undefined) {
      logWindow.style.left = `${saved.left}px`;
      logWindow.style.top = `${saved.top}px`;
      logWindow.style.right = "auto";
      logWindow.style.bottom = "auto";
    }
    logWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    logWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
    if (saved.z) logWindow.style.zIndex = String(saved.z);
  };

  const openLogWindow = () => {
    if (!logWindow) return;
    logWindow.classList.add("open");
    const saved = safeJsonParse(localStorage.getItem(storageKey) || "{}", {});
    applyState(saved);
    persistState({ open: true });
  };

  const closeLogWindow = () => {
    if (!logWindow) return;
    logWindow.classList.remove("open");
    const prev = safeJsonParse(localStorage.getItem(storageKey) || "{}", {});
    const rect = logWindow.getBoundingClientRect();
    persistState({
      left: rect.width ? rect.left : prev.left,
      top: rect.height ? rect.top : prev.top,
      width: rect.width ? `${rect.width}px` : prev.width,
      height: rect.height ? `${rect.height}px` : prev.height,
      open: false,
      z: Number(logWindow.style.zIndex) || undefined
    });
  };

  const renderEntries = () => {
    if (!logEl) return;
    logEl.innerHTML = "";
    const enabled = state.enabledClasses.size ? state.enabledClasses : null;
    const visible = state.entries
      .filter((e) => {
        if (e.class === "ERROR") return true;
        return !enabled || enabled.has(e.class);
      })
      .slice(-maxEntries); // keep chronological order
    visible.forEach((entry) => {
      const div = document.createElement("div");
      div.className = "log-entry";
      const tag = document.createElement("span");
      tag.className = "log-tag";
      tag.textContent = entry.class || "INFO";
      const text = document.createElement("span");
      text.className = "log-text";
      text.textContent = `${new Date(entry.time).toLocaleTimeString()} — ${entry.msg}`;
      if (entry.class === "ERROR") div.classList.add("log-error");
      div.appendChild(tag);
      div.appendChild(text);
      logEl.appendChild(div);
    });
    if (visible.length) {
      logEl.scrollTop = logEl.scrollHeight;
    }
    return visible;
  };

  const ensureClass = (cls) => {
    if (!cls) return;
    if (!state.classes.has(cls)) {
      state.classes.add(cls);
      state.enabledClasses.add(cls);
      buildClassFilters();
      persistEnabled();
    }
    if (cls === "ERROR") state.enabledClasses.add(cls);
  };

  const logClass = (cls, msg, data = null) => {
    const entry = {
      class: cls || "INFO",
      msg,
      time: Date.now(),
      data
    };
    ensureClass(entry.class);
    state.entries.push(entry);
    if (state.entries.length > maxStored) state.entries.shift();
    persistHistory();
    renderEntries();
  };

  const log = (msg) => logClass("INFO", msg);

  const classFilterContainer = document.createElement("div");
  classFilterContainer.className = "log-filters";

  const buildClassFilters = () => {
    if (!classFilterContainer) return;
    classFilterContainer.innerHTML = "";
    const classes = Array.from(state.classes).sort();
    classes.forEach((cls) => {
      const id = `log-filter-${cls}`;
      const label = document.createElement("label");
      label.className = "log-filter";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.checked = state.enabledClasses.size === 0 || state.enabledClasses.has(cls);
      cb.addEventListener("change", () => {
        if (cb.checked) state.enabledClasses.add(cls);
        else state.enabledClasses.delete(cls);
        persistEnabled();
        renderEntries();
      });
      label.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = cls;
      label.appendChild(span);
      classFilterContainer.appendChild(label);
    });
    if (logWindow) {
      logWindow.querySelector(".log-window-header")?.appendChild(classFilterContainer);
    }
  };

  // Drag handling for log window
  if (logWindow) {
    const logHeader = logWindow.querySelector(".log-window-header");
    let draggingLog = false;
    let dragOffsetLog = { x: 0, y: 0 };
    const bringToFront = () => {
      const next = (window.__winZCounter || 9000) + 1;
      window.__winZCounter = next;
      logWindow.style.zIndex = String(next);
    };
    const onLogMove = (e) => {
      if (!draggingLog) return;
      const x = e.clientX - dragOffsetLog.x;
      const y = e.clientY - dragOffsetLog.y;
      logWindow.style.left = `${x}px`;
      logWindow.style.top = `${y}px`;
      logWindow.style.right = "auto";
      logWindow.style.bottom = "auto";
    };
    const endLogDrag = () => {
      if (!draggingLog) return;
      draggingLog = false;
      window.removeEventListener("mousemove", onLogMove);
      window.removeEventListener("mouseup", endLogDrag);
      const rect = logWindow.getBoundingClientRect();
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        z: Number(logWindow.style.zIndex) || undefined
      });
    };
    if (logHeader) {
      logHeader.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        bringToFront();
        draggingLog = true;
        const rect = logWindow.getBoundingClientRect();
        dragOffsetLog = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        window.addEventListener("mousemove", onLogMove);
        window.addEventListener("mouseup", endLogDrag);
      });
    }

    logWindow.addEventListener("focusin", bringToFront, true);
    logWindow.addEventListener(
      "mousedown",
      (e) => {
        if (e.target.closest(".log-window")) bringToFront();
      },
      true
    );
  }

  const attachDbWindow = () => {
    if (!dbOpenBtn || !dbWindow || !dbBody) return;
    const header = dbWindow.querySelector(".db-window-header");
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };
    const bringToFrontDb = () => {
      const next = (window.__winZCounter || 9000) + 1;
      window.__winZCounter = next;
      dbWindow.style.zIndex = String(next);
      persistDb({ z: next });
    };

    const applyDbState = (saved = {}) => {
      if (saved.left !== undefined && saved.top !== undefined) {
        dbWindow.style.left = `${saved.left}px`;
        dbWindow.style.top = `${saved.top}px`;
        dbWindow.style.right = "auto";
        dbWindow.style.bottom = "auto";
      }
      dbWindow.style.width = saved.width ? coercePx(saved.width, `${DB_MIN_W}px`, DB_MIN_W) : `${DB_MIN_W}px`;
      dbWindow.style.height = saved.height ? coercePx(saved.height, `${DB_MIN_H}px`, DB_MIN_H) : `${DB_MIN_H}px`;
    };

    const persistDb = (winState) => {
      const saved = safeJsonParse(localStorage.getItem("db-window-state") || "{}", {});
      localStorage.setItem("db-window-state", JSON.stringify({ ...saved, ...winState }));
    };

    const onMove = (e) => {
      if (!dragging) return;
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      dbWindow.style.left = `${x}px`;
      dbWindow.style.top = `${y}px`;
      dbWindow.style.right = "auto";
      dbWindow.style.bottom = "auto";
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", endDrag);
      const rect = dbWindow.getBoundingClientRect();
      persistDb({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`
      });
    };

    if (header) {
      header.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        bringToFrontDb();
        dragging = true;
        const rect = dbWindow.getBoundingClientRect();
        dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", endDrag);
      });
    }

    const savedDb = safeJsonParse(localStorage.getItem("db-window-state") || "{}", {});
    if (savedDb.open) {
      applyDbState(savedDb);
      dbWindow.classList.add("open");
    }

    dbOpenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (dbWindow.classList.contains("open")) {
        const rect = dbWindow.getBoundingClientRect();
        persistDb({
          left: rect.left,
          top: rect.top,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          open: false
        });
        dbWindow.classList.remove("open");
        return;
      }
      const saved = safeJsonParse(localStorage.getItem("db-window-state") || "{}", {});
      applyDbState(saved);
      dbWindow.classList.add("open");
      persistDb({ open: true });
      dbBody.innerText = JSON.stringify(localStorage, null, 2);
    });

    if (dbCloseBtn) {
      dbCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const rect = dbWindow.getBoundingClientRect();
        persistDb({
          left: rect.left,
          top: rect.top,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          open: false
        });
        dbWindow.classList.remove("open");
      });
    }

    dbWindow.addEventListener("focusin", bringToFrontDb, true);
    dbWindow.addEventListener(
      "mousedown",
      (e) => {
        if (e.target.closest(".db-window")) bringToFrontDb();
      },
      true
    );
  };

  if (logOpenBtn) {
    logOpenBtn.addEventListener("click", () => {
      if (logWindow?.classList.contains("open")) {
        closeLogWindow();
      } else {
        openLogWindow();
      }
    });
  }
  if (logCloseBtn) logCloseBtn.addEventListener("click", closeLogWindow);
  if (logClearBtn) logClearBtn.addEventListener("click", () => {
    state.entries = [];
    persistHistory();
    renderEntries();
  });
  if (logCopyBtn) logCopyBtn.addEventListener("click", async () => {
    const visible = renderEntries();
    const lines = (visible || []).map((e) => `${e.class || "INFO"} ${new Date(e.time).toLocaleTimeString()} ${e.msg}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
    } catch {
      /* ignore */
    }
  });

  buildClassFilters();
  renderEntries();
  attachDbWindow();

  const savedLog = safeJsonParse(localStorage.getItem(storageKey) || "{}", {});
  if (savedLog.open) {
    applyState(savedLog);
    logWindow?.classList.add("open");
  }

  return { log, logClass, classFilterContainer };
};
