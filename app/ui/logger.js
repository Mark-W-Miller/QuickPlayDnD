import { createWindowFrame } from "./windowFrame.js";

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
  const resolvedStorageKey = `${storageKey}-${roleSuffix}`;
  const resolvedHistoryKey = `${historyKey}-${roleSuffix}`;
  const resolvedClassKey = `${classKey}-${roleSuffix}`;

  const logEl = document.getElementById("log");
  const logOpenBtn = document.getElementById("log-open");
  const logCloseBtn = document.getElementById("log-close");
  const logClearBtn = document.getElementById("log-clear");
  const logCopyBtn = document.getElementById("log-copy");
  const logWindow = document.getElementById("log-window");
  const classFilterContainer = document.createElement("div");
  classFilterContainer.className = "log-filters";
  const state = {
    entries: [],
    classes: new Set(),
    enabledClasses: new Set()
  };

  const persistHistory = () => {
    try {
      localStorage.setItem(resolvedHistoryKey, JSON.stringify(state.entries.slice(0, maxStored)));
    } catch {
      /* ignore */
    }
  };

  const persistEnabled = () => {
    try {
      localStorage.setItem(resolvedClassKey, JSON.stringify(Array.from(state.enabledClasses)));
    } catch {
      /* ignore */
    }
  };

  const loadEnabled = () => {
    const saved = safeJsonParse(localStorage.getItem(resolvedClassKey) || "[]", []);
    if (Array.isArray(saved) && saved.length) saved.forEach((c) => state.enabledClasses.add(c));
  };

  const loadHistory = () => {
    const saved = safeJsonParse(localStorage.getItem(resolvedHistoryKey) || "[]", []);
    if (Array.isArray(saved)) state.entries = saved.slice(0, maxStored);
  };

  loadHistory();
  loadEnabled();
  const bootstrapClasses = ["INFO", "BUILD", "CAMERA", "3DLOAD", "SELECTION", "MOVE", "ERROR", "UPDATE", "WARN"];
  bootstrapClasses.forEach((c) => state.classes.add(c));
  if (!state.enabledClasses.size) {
    bootstrapClasses.forEach((c) => state.enabledClasses.add(c));
  }

  const renderEntries = () => {
    if (!logEl) return;
    logEl.innerHTML = "";
    const enabled = state.enabledClasses.size ? state.enabledClasses : null;
    const visible = state.entries
      .filter((e) => {
        if (e.class === "ERROR") return true;
        return !enabled || enabled.has(e.class);
      })
      .slice(-maxEntries);
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
    if (visible.length) logEl.scrollTop = logEl.scrollHeight;
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
    const entry = { class: cls || "INFO", msg, time: Date.now(), data };
    ensureClass(entry.class);
    state.entries.push(entry);
    if (state.entries.length > maxStored) state.entries.shift();
    persistHistory();
    renderEntries();
  };

  const log = (msg) => logClass("INFO", msg);

  const buildClassFilters = () => {
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
      const target = logWindow.querySelector(".log-window-header-bottom") || logWindow.querySelector(".log-window-header");
      target?.appendChild(classFilterContainer);
    }
  };

  if (logCopyBtn) {
    logCopyBtn.addEventListener("click", async () => {
      const visible = renderEntries();
      const lines = (visible || []).map((e) => `${e.class || "INFO"} ${new Date(e.time).toLocaleTimeString()} ${e.msg}`);
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
      } catch {
        /* ignore */
      }
    });
  }
  if (logClearBtn) {
    logClearBtn.addEventListener("click", () => {
      state.entries = [];
      persistHistory();
      renderEntries();
    });
  }
  if (logOpenBtn) {
    logOpenBtn.addEventListener("click", () => {
      if (logWindow?.classList.contains("open")) {
        logFrame?.close();
      } else {
        logFrame?.open();
      }
    });
  }
  if (logCloseBtn) {
    logCloseBtn.addEventListener("click", () => {
      logFrame?.close();
    });
  }

  buildClassFilters();
  renderEntries();

  let logFrame = null;
  if (logWindow) {
    logFrame = createWindowFrame({
      rootEl: logWindow,
      openBtn: null,
      closeBtn: null,
      resizeHandle: null,
      header: logWindow.querySelector(".log-window-header-top") || logWindow.querySelector(".log-window-header"),
      storageKey: resolvedStorageKey,
      minWidth: 320,
      minHeight: 220,
      defaultLeft: 16,
      defaultTop: 16,
      roleAware: false
    });
    const savedLog = safeJsonParse(localStorage.getItem(resolvedStorageKey) || "{}", {});
    if (savedLog.open) {
      logFrame.open();
    }
  }

  return { log, logClass, classFilterContainer };
};
