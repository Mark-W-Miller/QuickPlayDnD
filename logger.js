const safeJsonParse = (val, fallback) => {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

export const initLogger = ({ maxEntries = 50, maxStored = 300, storageKey = "log-window-state", historyKey = "log-history" } = {}) => {
  const logEl = document.getElementById("log");
  const logOpenBtn = document.getElementById("log-open");
  const logCloseBtn = document.getElementById("log-close");
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
    entries: []
  };

  const coercePx = (val, fallback, min) => {
    const n = parseFloat(val);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return `${Math.max(n, min)}px`;
  };

  const persistState = (winState) => {
    const saved = safeJsonParse(localStorage.getItem(storageKey) || "{}", {});
    localStorage.setItem(storageKey, JSON.stringify({ ...saved, ...winState }));
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

  const loadHistory = () => {
    const saved = safeJsonParse(localStorage.getItem(historyKey) || "[]", []);
    if (Array.isArray(saved)) state.entries = saved.slice(0, maxStored);
  };

  const applyState = (saved = {}) => {
    if (!logWindow) return;
    if (saved.left !== undefined && saved.top !== undefined) {
      logWindow.style.left = `${saved.left}px`;
      logWindow.style.top = `${saved.top}px`;
      logWindow.style.right = "auto";
      logWindow.style.bottom = "auto";
    } else {
      logWindow.style.left = "";
      logWindow.style.top = "";
      logWindow.style.right = "";
      logWindow.style.bottom = "";
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
    const rect = logWindow.getBoundingClientRect();
    persistState({
      left: rect.left,
      top: rect.top,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      open: false
    });
  };

  const log = (msg) => {
    logWithClass("INFO", msg);
  };

  const renderEntry = (entry, { prepend = true } = {}) => {
    if (!logEl) return;
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
    if (prepend && logEl.firstChild) logEl.insertBefore(div, logEl.firstChild);
    else logEl.appendChild(div);
    while (logEl.children.length > maxEntries) logEl.removeChild(logEl.lastChild);
  };

  const logWithClass = (cls, msg, data = null) => {
    const entry = {
      class: cls || "INFO",
      msg,
      time: Date.now(),
      data
    };
    state.entries.unshift(entry);
    if (state.entries.length > maxStored) state.entries.length = maxStored;
    persistHistory();
    renderEntry(entry, { prepend: true });
  };

  // Wire buttons
  if (logOpenBtn) {
    logOpenBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openLogWindow();
    });
  }
  if (logCloseBtn) {
    logCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeLogWindow();
    });
  }
  if (dbOpenBtn && dbWindow && dbBody) {
    dbOpenBtn.addEventListener("click", (e) => {
      e.preventDefault();
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

    const saveState = () => {
      const rect = logWindow.getBoundingClientRect();
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
  for (let i = state.entries.length - 1; i >= 0; i--) {
    renderEntry(state.entries[i], { prepend: false });
  }

  return { log, logClass: logWithClass, openLogWindow, closeLogWindow };
};

export const readLogHistory = (historyKey = "log-history") =>
  safeJsonParse(localStorage.getItem(historyKey) || "[]", []);
