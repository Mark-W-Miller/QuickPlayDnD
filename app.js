import * as THREE from "three";
import { buildAxisArena } from "./axes.js";
import { updateHeightMapFromHeights, sampleHeightMap, rebuildHeightMesh } from "./heightmap.js";
import { initLogger } from "./logger.js";
import { createCameraManager } from "./camera.js";
import { createSceneBuilder } from "./buildScene.js";
import { parseScript } from "./parser.js";
import { state, safeJsonParse, safeStorageGet, safeStorageSet } from "./state.js";
import { createScriptRunner } from "./scriptRunner.js";
import { overlayGridOnTexture as overlayGridOnTextureFn } from "./overlay/overlayGridOnTexture.js";
import { cropTextureToOverlay as cropTextureToOverlayFn } from "./overlay/cropTextureToOverlay.js";
import { setBackground as setBackgroundFn } from "./overlay/background.js";
import { createScriptTreeManager } from "./ui/scriptTree.js";
import { createAnimationLoop } from "./animation/animation.js";

const canvas = document.getElementById("map-canvas");
const inputEl = document.getElementById("script-input");
const arenaGridToggle = document.getElementById("arena-grid");
const textureToggle = document.getElementById("show-texture");
const heightToggle = document.getElementById("show-height");
const overlayGridToggle = document.getElementById("show-overlay-grid");
const overlayLabelToggle = document.getElementById("show-overlay-labels");
const modelsToggle = document.getElementById("show-models");
const tokensOpenBtn = document.getElementById("tokens-open");
const tokensCloseBtn = document.getElementById("tokens-close");
const tokensWindow = document.getElementById("tokens-window");
const tokensBody = document.getElementById("tokens-body");
const paramsOpenBtn = document.getElementById("params-open");
const paramsCloseBtn = document.getElementById("params-close");
const paramsWindow = document.getElementById("params-window");
const savedArenaGrid = (() => {
  return safeJsonParse(localStorage.getItem("arena-grid") || "false", false);
})();
const savedTexture = (() => {
  return safeJsonParse(localStorage.getItem("show-texture") || "true", true);
})();
const savedHeight = (() => {
  return safeJsonParse(localStorage.getItem("show-heightmap") || "true", true);
})();
const savedOverlayGrid = (() => {
  return safeJsonParse(localStorage.getItem("show-overlay-grid") || "true", true);
})();
const savedOverlayLabels = (() => {
  return safeJsonParse(localStorage.getItem("show-overlay-labels") || "true", true);
})();
const savedModels = (() => {
  return safeJsonParse(localStorage.getItem("show-models") || "true", true);
})();
const fallbackScript = `
# Provide your own script here
`;
const heatHeightSlider = document.getElementById("heat-height");
const heatHeightValue = document.getElementById("heat-height-value");
const moveSpeedSlider = document.getElementById("move-speed-scale");
const moveSpeedValue = document.getElementById("move-speed-scale-value");
const mapPanel = document.querySelector(".map-panel");
const appEl = document.querySelector(".app");
const resizer = document.getElementById("sidebar-resizer");
const hResizer = document.getElementById("sidebar-h-resizer");
const topPanel = document.getElementById("top-panel");
const scriptTreeEl = document.getElementById("script-tree");
const showTestToggle = document.getElementById("show-test-dirs");
let memHud = null;

const initMemHud = () => {
  memHud = document.createElement("div");
  memHud.id = "mem-hud";
  memHud.textContent = "mem: --";
  document.body.appendChild(memHud);
};
const camSlotButtons = document.querySelectorAll("[data-cam-slot]");
const clearCamViewsBtn = document.getElementById("clear-cam-views");
const currentMapLabel = document.getElementById("current-map-label");

const textureCanvas = document.createElement("canvas");
const textureCtx = textureCanvas.getContext("2d", { willReadFrequently: true });

const webglCanvas = document.createElement("canvas");
webglCanvas.id = "map-webgl";
mapPanel.appendChild(webglCanvas);

state.heightMap.showMesh = savedHeight;
state.showModels = savedModels;

const coercePx = (val, fallback, min) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${Math.max(n, min)}px`;
};

const three = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  boardMesh: null,
  gridHelper: null,
  meshGroup: null,
  tokenGroup: null,
  ambient: null,
  directional: null,
  boardTexture: null,
  originMarker: null,
  arenaGrid: null
};

const { log, logClass } = initLogger();
let scriptRunner = null;

const overlayGridOnTexture = (map) =>
  overlayGridOnTextureFn(map, {
    textureCanvas,
    textureCtx,
    overlayGridToggle,
    overlayLabelToggle,
    state,
    logClass
  });

const cropTextureToOverlay = () =>
  cropTextureToOverlayFn({
    textureCanvas,
    textureCtx,
    state,
    logClass
  });


const setBackground = (url) =>
  setBackgroundFn(url, {
    state,
    textureCanvas,
    textureCtx,
    textureToggle,
    updateBoardScene,
    render,
    log,
    logClass,
    three,
    webglCanvas,
    overlayGridToggle,
    overlayLabelToggle
  });


const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const sceneBuilder = createSceneBuilder({
  state,
  three,
  mapPanel,
  webglCanvas,
  textureCanvas,
  textureCtx,
  arenaGridToggle,
  textureToggle,
  heightToggle,
  rebuildHeightMesh,
  updateHeightMapFromHeights,
  sampleHeightMap,
  clamp,
  logClass
});
const { initThree, updateBoardScene, clearGroup, render3d, resizeRenderer, updateEffects3d, updateTokens3d } =
  sceneBuilder;
const cameraManager = createCameraManager({ three, state, textureCanvas, clamp, logClass });

const buildDefaultMap = () => {
  const cols = 100;
  const rows = 80;
  const size = 10;
  const heights = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h =
        Math.sin(c * 0.08) * 2 +
        Math.cos(r * 0.06) * 1.5 +
        Math.sin((c + r) * 0.04) * 1.2;
      heights[`${c},${r}`] = h;
    }
  }
  state.map = {
    id: "default-map",
    name: "Default Grid",
    gridSizePx: size,
    gridType: "square",
    cols,
    rows,
    backgroundUrl: "images/grid-default-map.png",
    heights
  };
};

const render = () => {
  const map = state.map;
  if (!map) return;
  canvas.style.display = "none";
  webglCanvas.style.display = "block";
  resizeRenderer();
  render3d();
};

const scriptTreeManager = createScriptTreeManager({
  scriptTreeEl,
  showTestToggle,
  inputEl,
  log,
  logClass,
  safeJsonParse,
  safeStorageGet,
  safeStorageSet
});

const runSelectedScripts = async ({ runIfNoneFallback = true } = {}) => {
  if (!scriptRunner) return;
  await scriptRunner.runSelectedScripts({ runIfNoneFallback });
};

const runCurrentScript = () => {
  if (!scriptRunner) return;
  scriptRunner.runScriptText(inputEl.value);
};

const loadExampleScript = async (path, fallback, autoRun = false, meta = {}) => {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    inputEl.value = text.trim();
    log(`Loaded script: ${path}`);
    if (meta.type === "map" && currentMapLabel) currentMapLabel.textContent = path;
    if (autoRun) runCurrentScript();
  } catch (err) {
    if (fallback) {
      inputEl.value = fallback.trim();
      log(`Loaded fallback script (failed to load ${path})`);
      if (meta.type === "map") {
        if (currentMapLabel) currentMapLabel.textContent = "Fallback map";
        logClass?.("INFO", "Applied fallback map as last-map-script");
      }
      if (autoRun) runCurrentScript();
    } else {
      log(`Failed to load example ${path}: ${err.message}`);
    }
  }
};

document.getElementById("run-btn").addEventListener("click", () => {
  runCurrentScript();
});

const runSelectedBtn = document.getElementById("run-selected-btn");
if (runSelectedBtn) {
  runSelectedBtn.addEventListener("click", () => {
    runSelectedScripts({ runIfNoneFallback: false });
  });
}

// Run script on Ctrl+Enter when the textarea is focused.
if (inputEl) {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCurrentScript();
    }
  });
}

document.getElementById("clear-btn").addEventListener("click", () => {
  scriptRunner.applyInstructions([{ type: "clear", scope: "tokens" }]);
});

const syncHeatControls = () => {
  heatHeightValue.textContent = `${state.heightMap.heightScale.toFixed(1)}x`;
};

const syncMoveSpeedControls = () => {
  moveSpeedValue.textContent = `${state.moveSpeedScale.toFixed(2)}x`;
};

let tokenTableData = [];
let lastTokenSelectIndex = null;
const renderTokensWindow = () => {
  if (!tokensBody) return;
  const tokens = [...(state.tokens || [])].sort((a, b) => a.id.localeCompare(b.id));
  tokenTableData = tokens;
  const table = document.createElement("table");
  table.className = "token-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>ID</th><th>Type</th><th>Col</th><th>Row</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  tokens.forEach((t, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.index = idx;
    tr.dataset.id = t.id;
    if (state.selectedTokenIds?.has(t.id)) tr.classList.add("selected");
    const col = Number.isFinite(t.col) ? Math.round(t.col) : t.col;
    const row = Number.isFinite(t.row) ? Math.round(t.row) : t.row;
    tr.innerHTML = `<td>${t.id}</td><td>${t.defId}</td><td>${col}</td><td>${row}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tokensBody.innerHTML = "";
  tokensBody.appendChild(table);
};

// Build script runner once dependencies are available.
scriptRunner = createScriptRunner({
  parseScript,
  setBackground,
  updateBoardScene,
  render,
  renderTokensWindow,
  clearGroup,
  log,
  logClass,
  scriptTreeManager
});

createAnimationLoop({
  state,
  logClass,
  sceneBuilder,
  render3d,
  updateEffects3d,
  three,
  memHudGetter: () => memHud
});

const refreshTokenHighlights = () => {
  if (!state.lastBoard) return;
  const { boardWidth, boardDepth, surfaceY, cellUnit } = state.lastBoard;
  if (updateTokens3d) updateTokens3d(boardWidth, boardDepth, surfaceY, cellUnit);
  if (render3d) render3d();
};

heatHeightSlider.addEventListener("input", (e) => {
  state.heightMap.heightScale = parseFloat(e.target.value) || 1;
  syncHeatControls();
  updateBoardScene();
  render();
});

moveSpeedSlider.addEventListener("input", (e) => {
  state.moveSpeedScale = parseFloat(e.target.value) || 1;
  syncMoveSpeedControls();
});

const setCameraPreset = (preset) => {
  cameraManager.setCameraPreset(preset, render3d);
};

const refreshCamSlotIndicators = () => {
  camSlotButtons.forEach((btn) => {
    const slot = btn.getAttribute("data-cam-slot");
    const stored = localStorage.getItem(`camera-slot-${slot}`);
    if (stored) btn.classList.add("cam-set");
    else btn.classList.remove("cam-set");
  });
};

const applyCamSlot = (slot) => {
  const raw = localStorage.getItem(`camera-slot-${slot}`);
  if (!raw) return;
  const parsed = safeJsonParse(raw, null);
  if (!parsed) return;
  cameraManager.transitionToCamera(parsed, render3d);
};

const saveCamSlot = (slot) => {
  const payload = cameraManager.getCurrentCamera();
  try {
    localStorage.setItem(`camera-slot-${slot}`, JSON.stringify(payload));
    refreshCamSlotIndicators();
    if (logClass) logClass("CAMERA", `Saved view slot ${slot}`, payload);
  } catch {
    /* ignore */
  }
};

camSlotButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const slot = btn.getAttribute("data-cam-slot");
    const has = localStorage.getItem(`camera-slot-${slot}`);
    if (has) applyCamSlot(slot);
    else saveCamSlot(slot);
  });
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const slot = btn.getAttribute("data-cam-slot");
    saveCamSlot(slot);
  });
});

if (clearCamViewsBtn) {
  clearCamViewsBtn.addEventListener("click", () => {
    camSlotButtons.forEach((btn) => {
      const slot = btn.getAttribute("data-cam-slot");
      localStorage.removeItem(`camera-slot-${slot}`);
    });
    refreshCamSlotIndicators();
    if (logClass) logClass("CAMERA", "Cleared all camera view slots");
  });
}

if (arenaGridToggle) {
  arenaGridToggle.addEventListener("change", () => {
    localStorage.setItem("arena-grid", arenaGridToggle.checked);
    updateBoardScene();
    render();
  });
}

if (textureToggle) {
  textureToggle.checked = savedTexture;
  textureToggle.addEventListener("change", () => {
    localStorage.setItem("show-texture", textureToggle.checked);
    updateBoardScene();
    render();
  });
}
if (heightToggle) {
  heightToggle.checked = savedHeight;
  heightToggle.addEventListener("change", () => {
    state.heightMap.showMesh = heightToggle.checked;
    localStorage.setItem("show-heightmap", heightToggle.checked);
    updateBoardScene();
    render();
  });
}
if (overlayGridToggle) {
  overlayGridToggle.checked = savedOverlayGrid;
  overlayGridToggle.addEventListener("change", () => {
    localStorage.setItem("show-overlay-grid", overlayGridToggle.checked);
    if (state.map?.backgroundUrl) setBackground(state.map.backgroundUrl);
    updateBoardScene();
    render();
  });
}
if (overlayLabelToggle) {
  overlayLabelToggle.checked = savedOverlayLabels;
  overlayLabelToggle.addEventListener("change", () => {
    localStorage.setItem("show-overlay-labels", overlayLabelToggle.checked);
    if (state.map?.backgroundUrl) setBackground(state.map.backgroundUrl);
    updateBoardScene();
    render();
  });
}
if (modelsToggle) {
  modelsToggle.checked = savedModels;
  modelsToggle.addEventListener("change", () => {
    state.showModels = modelsToggle.checked;
    localStorage.setItem("show-models", modelsToggle.checked);
    updateBoardScene();
    render();
  });
}

// Parameters window (fixed size, draggable)
if (paramsOpenBtn && paramsWindow) {
  const header = paramsWindow.querySelector(".params-window-header");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

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

  paramsOpenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (paramsWindow.classList.contains("open")) paramsWindow.classList.remove("open");
    else paramsWindow.classList.add("open");
  });
  if (paramsCloseBtn) {
    paramsCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      paramsWindow.classList.remove("open");
    });
  }
}

// Tokens window (movable/resizable, persisted)
if (tokensOpenBtn && tokensWindow && tokensBody) {
  const header = tokensWindow.querySelector(".tokens-window-header");
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  const MIN_W = 320;
  const MIN_H = 240;

  const applyTokenWinState = (saved = {}) => {
    if (!tokensWindow) return;
    if (saved.left !== undefined && saved.top !== undefined) {
      tokensWindow.style.left = `${saved.left}px`;
      tokensWindow.style.top = `${saved.top}px`;
      tokensWindow.style.right = "auto";
      tokensWindow.style.bottom = "auto";
    }
    tokensWindow.style.width = saved.width ? coercePx(saved.width, `${MIN_W}px`, MIN_W) : `${MIN_W}px`;
    tokensWindow.style.height = saved.height ? coercePx(saved.height, `${MIN_H}px`, MIN_H) : `${MIN_H}px`;
  };

  const persistTokenWinState = (winState) => {
    const saved = safeJsonParse(localStorage.getItem("token-window-state") || "{}", {});
    localStorage.setItem("token-window-state", JSON.stringify({ ...saved, ...winState }));
  };

  const onMove = (e) => {
    if (!dragging) return;
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    tokensWindow.style.left = `${x}px`;
    tokensWindow.style.top = `${y}px`;
    tokensWindow.style.right = "auto";
    tokensWindow.style.bottom = "auto";
  };
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", endDrag);
    const rect = tokensWindow.getBoundingClientRect();
    persistTokenWinState({
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
      const rect = tokensWindow.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", endDrag);
    });
  }

  const resizeObserver = new ResizeObserver(() => {
    const rect = tokensWindow.getBoundingClientRect();
    persistTokenWinState({
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  });
  resizeObserver.observe(tokensWindow);

  tokensOpenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (tokensWindow.classList.contains("open")) {
      const rect = tokensWindow.getBoundingClientRect();
      persistTokenWinState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      tokensWindow.classList.remove("open");
      return;
    }
    const saved = safeJsonParse(localStorage.getItem("token-window-state") || "{}", {});
    applyTokenWinState(saved);
    renderTokensWindow();
    tokensWindow.classList.add("open");
    persistTokenWinState({ open: true });
  });
  if (tokensCloseBtn) {
    tokensCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const rect = tokensWindow.getBoundingClientRect();
      persistTokenWinState({
        left: rect.left,
        top: rect.top,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        open: false
      });
      tokensWindow.classList.remove("open");
    });
  }

  tokensBody.addEventListener("click", (e) => {
    const rowEl = e.target.closest("tr[data-index]");
    if (!rowEl) return;
    const idx = Number(rowEl.dataset.index);
    const token = tokenTableData[idx];
    if (!token) return;
    const selected = new Set(state.selectedTokenIds || []);
    const doRange = e.shiftKey && lastTokenSelectIndex != null;
    const toggle = e.metaKey || e.ctrlKey;

    if (doRange) {
      const [a, b] = [lastTokenSelectIndex, idx].sort((x, y) => x - y);
      if (!toggle) selected.clear();
      for (let i = a; i <= b; i++) {
        selected.add(tokenTableData[i].id);
      }
    } else if (toggle) {
      if (selected.has(token.id)) selected.delete(token.id);
      else selected.add(token.id);
      lastTokenSelectIndex = idx;
    } else {
      selected.clear();
      selected.add(token.id);
      lastTokenSelectIndex = idx;
    }
    state.selectedTokenIds = selected;
    renderTokensWindow();
    refreshTokenHighlights();
  });
}

// Sidebar drag-to-resize
if (resizer && appEl) {
  let isResizing = false;
  const minW = 240;
  const onMove = (e) => {
    if (!isResizing) return;
    const rect = appEl.getBoundingClientRect();
    // Allow the panel to grow to roughly half (or more) of the viewport width.
    const dynamicMax = Math.max(minW, window.innerWidth * 0.8);
    const newWidth = clamp(e.clientX - rect.left, minW, dynamicMax);
    document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
    resizeRenderer();
  };
  const end = () => {
    isResizing = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", end);
  };
  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isResizing = true;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", end);
  });
  window.addEventListener("mouseup", () => {
    const current = getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width");
    if (current) safeStorageSet("ui-sidebar-width", current.trim());
  });
}

// Horizontal drag-to-resize for top panel vs console panel
if (hResizer && topPanel && appEl) {
  let isHResizing = false;
  const minH = 100;
  const onMove = (e) => {
    if (!isHResizing) return;
    const appRect = appEl.getBoundingClientRect();
    const headerEl = document.querySelector(".header");
    const headerRect = headerEl?.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(appEl).gap || "0") || 0;
    const startY = (headerRect?.bottom ?? appRect.top) + gap;
    const rawHeight = e.clientY - startY;
    const maxH = Math.max(minH, window.innerHeight * 0.6);
    const newHeight = clamp(rawHeight, minH, maxH);
    document.documentElement.style.setProperty("--top-panel-height", `${newHeight}px`);
  };
  const end = () => {
    isHResizing = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", end);
    const current = getComputedStyle(document.documentElement).getPropertyValue("--top-panel-height");
    if (current) safeStorageSet("ui-top-height", current.trim());
  };
  hResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isHResizing = true;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", end);
  });
}

buildDefaultMap();
setBackground(state.map.backgroundUrl);
syncHeatControls();
syncMoveSpeedControls();
initMemHud();
initThree();
updateBoardScene();
cameraManager.applySavedCamera();
cameraManager.attachControlListeners(render3d);
render();
scriptTreeManager.loadScriptManifest(() => runSelectedScripts({ runIfNoneFallback: false }));

// Apply saved UI sizing defaults
const savedTopHeight = safeStorageGet("ui-top-height", null);
if (savedTopHeight) {
  document.documentElement.style.setProperty("--top-panel-height", savedTopHeight);
} else {
  document.documentElement.style.setProperty("--top-panel-height", "40%");
}
const savedSidebarWidth = safeStorageGet("ui-sidebar-width", null);
if (savedSidebarWidth) {
  document.documentElement.style.setProperty("--sidebar-width", savedSidebarWidth);
}

// Restore test toggle
if (showTestToggle) {
  const saved = safeStorageGet("ui-show-test-dirs", "false") === "true";
  showTestToggle.checked = saved;
  showTestToggle.addEventListener("change", () => {
    safeStorageSet("ui-show-test-dirs", showTestToggle.checked ? "true" : "false");
    scriptTreeManager.loadScriptManifest(() => runSelectedScripts({ runIfNoneFallback: false }));
  });
}

if (arenaGridToggle) {
  arenaGridToggle.checked = !!savedArenaGrid;
}

refreshCamSlotIndicators();

refreshCamSlotIndicators();
