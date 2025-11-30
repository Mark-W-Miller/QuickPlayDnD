const safeJsonParse = (val, fallback) => {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

export const initLogger = ({
  maxEntries = 50,
  maxStored = 300,
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

  // Load persisted history and class filters, then bootstrap defaults.
  loadHistory();
  loadEnabled();
  const bootstrapClasses = ["INFO", "DIM", "BUILD", "PARSE", "CAMERA", "3DLOAD"];
  bootstrapClasses.forEach((c) => state.classes.add(c));
  if (!state.enabledClasses.size) bootstrapClasses.forEach((c) => state.enabledClasses.add(c));

  const applyState = (saved = {}) => {
    if (!logWindow) return;
    if (saved.left !== undefined && saved.top !== undefined) {
      logWindow.style.left = `${saved.left}px`;
      logWindow.style.top = `${saved.top}px`;
      logWindow.style.right = "auto";
      logWindow.style.bottom = "auto";
    }
    if (saved.width) logWindow.style.width = coercePx(saved.width, `${MIN_W}px`, MIN_W);
    else logWindow.style.width = `${MIN_W}px`;
    if (saved.height) logWindow.style.height = coercePx(saved.height, `${MIN_H}px`, MIN_H);
    else logWindow.style.height = `${MIN_H}px`;
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
      open: false
    });
  };

  const renderEntries = () => {
    if (!logEl) return;
    logEl.innerHTML = "";
    const enabled = state.enabledClasses.size ? state.enabledClasses : null;
    const visible = state.entries
      .slice(0, maxEntries)
      .filter((e) => !enabled || enabled.has(e.class))
      .sort((a, b) => b.time - a.time);
    visible.forEach((entry) => {
      const div = document.createElement("div");
      div.className = "log-entry";
      const tag = document.createElement("span");
      tag.className = "log-tag";
      tag.textContent = entry.class || "INFO";
      const text = document.createElement("span");
      text.className = "log-text";
      text.textContent = `${new Date(entry.time).toLocaleTimeString()} — ${entry.msg}`;
      div.appendChild(tag);
      div.appendChild(text);
      logEl.appendChild(div);
    });
    return visible;
  };

  const ensureClass = (cls) => {
    if (!cls) return;
    if (!state.classes.has(cls)) {
      state.classes.add(cls);
      if (!state.enabledClasses.size) state.enabledClasses.add(cls);
      buildClassFilters();
    }
  };

  const logClass = (cls, msg, data = null) => {
    const entry = {
      class: cls || "INFO",
      msg,
      time: Date.now(),
      data
    };
    ensureClass(entry.class);
    state.entries.unshift(entry);
    if (state.entries.length > maxStored) state.entries.length = maxStored;
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
  };

  // Wire buttons
  if (logOpenBtn) {
    logOpenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (logWindow?.classList.contains("open")) closeLogWindow();
      else openLogWindow();
    });
  }
  if (logCloseBtn) {
    logCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeLogWindow();
    });
  }
  if (logClearBtn) {
    logClearBtn.addEventListener("click", () => {
      state.entries = [];
      persistHistory();
      renderEntries();
    });
  }
  if (logCopyBtn) {
    logCopyBtn.addEventListener("click", async () => {
      const visible = renderEntries() || [];
      const text = visible
        .map((e) => `[${new Date(e.time).toLocaleTimeString()}][${e.class}] ${e.msg}`)
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* ignore */
      }
    });
  }
  if (dbOpenBtn && dbWindow && dbBody) {
    dbOpenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (dbWindow.classList.contains("open")) {
        dbWindow.classList.remove("open");
        return;
      }
      const entries = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        entries.push({ key, value: localStorage.getItem(key) });
      }
      dbBody.textContent = entries
        .map((kv) => `${kv.key}: ${kv.value}`)
        .sort((a, b) => a.localeCompare(b))
        .join("\n");
      const saved = safeJsonParse(localStorage.getItem("db-window-state") || "{}", {});
      if (saved.left !== undefined && saved.top !== undefined) {
        dbWindow.style.left = `${saved.left}px`;
        dbWindow.style.top = `${saved.top}px`;
        dbWindow.style.right = "auto";
        dbWindow.style.bottom = "auto";
      }
      dbWindow.style.width = saved.width ? coercePx(saved.width, `${DB_MIN_W}px`, DB_MIN_W) : `${DB_MIN_W}px`;
      dbWindow.style.height = saved.height ? coercePx(saved.height, `${DB_MIN_H}px`, DB_MIN_H) : `${DB_MIN_H}px`;
      dbWindow.classList.add("open");
      persistDbState({ open: true });
    });
  }
  if (dbCloseBtn && dbWindow) {
    dbCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      dbWindow.classList.remove("open");
      const rect = dbWindow.getBoundingClientRect();
      persistDbState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
    });
  }

  // Dragging
  if (logWindow) {
    const header = logWindow.querySelector(".log-window-header");
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };
    const resizeObserver = new ResizeObserver(() => {
      const rect = logWindow.getBoundingClientRect();
      persistState({ width: `${rect.width}px`, height: `${rect.height}px` });
    });
    resizeObserver.observe(logWindow);

    const saveState = () => {
      const rect = logWindow.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      persistState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: logWindow.classList.contains("open")
      });
    };

    const onMove = (e) => {
      if (!dragging) return;
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      logWindow.style.left = `${x}px`;
      logWindow.style.top = `${y}px`;
      logWindow.style.right = "auto";
      logWindow.style.bottom = "auto";
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", endDrag);
      saveState();
    };

    if (header) {
      header.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        dragging = true;
        const rect = logWindow.getBoundingClientRect();
        dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", endDrag);
      });
    }
    // Insert filters panel below header
    if (classFilterContainer && !classFilterContainer.parentElement) {
      logWindow.insertBefore(classFilterContainer, logWindow.querySelector(".log-body"));
    }

    // Restore saved state on init
    const saved = safeJsonParse(localStorage.getItem(storageKey) || "{}", {});
    applyState(saved);
    if (saved.open) logWindow.classList.add("open");
  }

  // DB window drag/restore
  if (dbWindow) {
    const header = dbWindow.querySelector(".db-window-header");
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };

    const saveState = () => {
      const rect = dbWindow.getBoundingClientRect();
      persistDbState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: dbWindow.classList.contains("open")
      });
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
      saveState();
    };

    if (header) {
      header.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        dragging = true;
        const rect = dbWindow.getBoundingClientRect();
        dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", endDrag);
      });
    }

    const savedDb = safeJsonParse(localStorage.getItem("db-window-state") || "{}", {});
    if (savedDb.left !== undefined) dbWindow.style.left = `${savedDb.left}px`;
    if (savedDb.top !== undefined) dbWindow.style.top = `${savedDb.top}px`;
    if (savedDb.width) dbWindow.style.width = coercePx(savedDb.width, `${DB_MIN_W}px`, DB_MIN_W);
    if (savedDb.height) dbWindow.style.height = coercePx(savedDb.height, `${DB_MIN_H}px`, DB_MIN_H);
    if (savedDb.open) dbWindow.classList.add("open");
  }

  // Restore history into DOM from oldest to newest so ordering matches live logging.
  loadHistory();
  loadEnabled();
  state.entries.forEach((e) => ensureClass(e.class));
  buildClassFilters();
  for (let i = state.entries.length - 1; i >= 0; i--) {
    /* noop; rendering done after class restoration */
  }
  renderEntries();

  return { log, logClass, openLogWindow, closeLogWindow };
};

export const readLogHistory = (historyKey = "log-history") =>
  safeJsonParse(localStorage.getItem(historyKey) || "[]", []);
