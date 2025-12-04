import * as THREE from "three";
import { buildAxisArena } from "./graphics/axes.js";
import { updateHeightMapFromHeights, sampleHeightMap, rebuildHeightMesh } from "./graphics/heightmap.js";
import { initLogger } from "./ui/logger.js";
import { createCameraManager } from "./ui/camera.js";
import { createSceneBuilder } from "./graphics/buildScene.js";
import { parseScript } from "./language/parser.js";
import { state, safeJsonParse, safeStorageGet, safeStorageSet } from "./state.js";
import { createScriptRunner } from "./language/scriptRunner.js";
import { overlayGridOnTexture as overlayGridOnTextureFn } from "./graphics/overlay/overlayGridOnTexture.js";
import { cropTextureToOverlay as cropTextureToOverlayFn } from "./graphics/overlay/cropTextureToOverlay.js";
import { setBackground as setBackgroundFn } from "./graphics/overlay/background.js";
import { createScriptTreeManager } from "./ui/scriptTree.js";
import { createAnimationLoop } from "./graphics/animation.js";
import { initParamsWindow } from "./ui/paramsWindow.js";
import { initTokensWindow } from "./ui/tokensWindow.js";
import { initScriptsWindow } from "./ui/scriptsWindow.js";
import { initLangWindow } from "./ui/langWindow.js";
import { initSelectionWindow } from "./ui/selectionWindow.js";
import { createEditSelectionHandlers } from "./selection/selectionEdit.js";
import { createViewSelectionHandlers } from "./selection/selectionView.js";

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
const selectionOpenBtn = document.getElementById("selection-open");
const selectionCloseBtn = document.getElementById("selection-close");
const selectionWindow = document.getElementById("selection-window");
const selectionClearBtn = document.getElementById("selection-clear");
const selectionText = document.getElementById("selection-text");
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
const scriptsOpenBtn = document.getElementById("scripts-open");
const scriptsCloseBtn = document.getElementById("scripts-close");
const scriptsWindow = document.getElementById("scripts-window");
const langOpenBtn = document.getElementById("lang-open");
const langCloseBtn = document.getElementById("lang-close");
const langWindow = document.getElementById("lang-window");
const viewToggleBtn = document.getElementById("view-toggle");
let memHud = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

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
    overlayLabelToggle,
    onReady: () => {
      // After a map load, prefer restoring the last saved camera; if unavailable, fall back to top preset.
      if (state.cameraResetPending) state.cameraResetPending = false;
      const restored = cameraManager.applySavedCamera();
      if (!restored) cameraManager.setCameraPreset("top", render3d);
    }
  });


const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
let interactionMode = "view"; // view | edit
const applyControlMode = (mode) => {
  const enabled = mode === "view";
  if (three.controls) {
    three.controls.enabled = true;
    three.controls.enablePan = true;
    three.controls.enableZoom = true;
    // rotate only in view
    three.controls.enableRotate = enabled;
  }
};
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
const {
  initThree,
  updateBoardScene,
  clearGroup,
  render3d,
  resizeRenderer,
  updateEffects3d,
  updateTokens3d,
  updateSelectionHighlights
} = sceneBuilder;
const cameraManager = createCameraManager({ three, state, textureCanvas, clamp, logClass });

const buildDefaultMap = () => {
  const cols = 20;
  const rows = 20;
  const size = 48;
  const heights = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      heights[`${c},${r}`] = 0;
    }
  }
  state.map = {
    id: "default-map",
    name: "Default Grid",
    gridSizePx: size,
    gridType: "square",
    cols,
    rows,
    backgroundUrl: "data/images/grid-default-map.png",
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


// Build script runner once dependencies are available.
scriptRunner = createScriptRunner({
  parseScript,
  setBackground,
  updateBoardScene,
  render,
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
  let payload = parsed.camera || parsed;
  // If the saved slot was normalized to a previous board size, rescale to the current one.
  const savedBoard = parsed.board;
  if (savedBoard && state.lastBoard) {
    const sx = state.lastBoard.boardWidth / (savedBoard.width || state.lastBoard.boardWidth);
    const sz = state.lastBoard.boardDepth / (savedBoard.depth || state.lastBoard.boardDepth);
    const scaleVec = (vec) => [vec[0] * sx, vec[1], vec[2] * sz];
    payload = {
      ...payload,
      position: scaleVec(payload.position || [0, 0, 0]),
      target: scaleVec(payload.target || [0, 0, 0])
    };
  }
  cameraManager.transitionToCamera(payload, render3d);
};

const saveCamSlot = (slot) => {
  const payload = cameraManager.getCurrentCamera();
  try {
    const board = state.lastBoard
      ? {
          width: state.lastBoard.cameraWidth || state.lastBoard.boardWidth,
          depth: state.lastBoard.cameraDepth || state.lastBoard.boardDepth
        }
      : null;
    localStorage.setItem(`camera-slot-${slot}`, JSON.stringify({ camera: payload, board }));
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
initParamsWindow({ paramsOpenBtn, paramsCloseBtn, paramsWindow });
initTokensWindow({
  tokensOpenBtn,
  tokensCloseBtn,
  tokensWindow,
  tokensBody,
  state,
  coercePx,
  safeJsonParse,
  refreshTokenHighlights
});
initScriptsWindow({ scriptsOpenBtn, scriptsCloseBtn, scriptsWindow });
initLangWindow({ langOpenBtn, langCloseBtn, langWindow });
const selectionWindowApi =
  initSelectionWindow({
    openBtn: selectionOpenBtn,
    closeBtn: selectionCloseBtn,
    clearBtn: selectionClearBtn,
    windowEl: selectionWindow,
    textarea: selectionText
  }) || { setContent: () => {}, bringToFront: () => {} };

const setInteractionMode = (mode) => {
  const next = mode === "edit" ? "edit" : "view";
  interactionMode = next;
  if (viewToggleBtn) viewToggleBtn.textContent = next === "view" ? "View" : "Edit";
  applyControlMode(next);
  logClass?.("INFO", `Mode changed to ${next}`);
  logClass?.("EDIT", `interactionMode=${interactionMode}`);
  // Update orbit mouse bindings: disable rotate on left drag in edit mode.
  if (three.controls) {
    three.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    three.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    three.controls.enablePan = interactionMode === "view"; // no pan in edit
    three.controls.enableRotate = interactionMode === "view"; // no rotate in edit
  }
};

const toggleMode = () => setInteractionMode(interactionMode === "view" ? "edit" : "view");

if (viewToggleBtn) {
  viewToggleBtn.textContent = "View";
  viewToggleBtn.addEventListener("click", toggleMode);
}

// Keyboard shortcuts: V for view, E for edit (or toggle if already in that state)
window.addEventListener("keydown", (e) => {
  if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key.toLowerCase() === "v") setInteractionMode("view");
  if (e.key.toLowerCase() === "e") setInteractionMode("edit");
  if (e.key === "Escape") {
    state.selectionCells = new Set();
    selectionWindowApi.setContent("");
    updateSelectionHighlights();
    render3d();
  }
  // Disable rotate orbit on left-click drag in edit mode by switching controls
  if (three.controls) {
    if (interactionMode === "edit") {
      three.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    } else {
      three.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    }
  }
});

// Initialize controls for the default mode
applyControlMode(interactionMode);

// Selection handling
const editSelect = createEditSelectionHandlers({
  canvas: webglCanvas,
  three,
  state,
  raycaster,
  pointer,
  logClass,
  selectionWindowApi,
  updateSelectionHighlights,
  render3d
});
const viewSelect = createViewSelectionHandlers({ three });

webglCanvas.addEventListener("mousedown", (e) => {
  const mode = interactionMode;
  if (mode === "edit") {
    if (e.button === 0 || e.button === 2) {
      const handled = editSelect.onDown(e.button, e.shiftKey, e);
      if (handled) e.preventDefault();
    }
  } else {
    viewSelect.onDown(e.button, e.shiftKey, e);
  }
});

webglCanvas.addEventListener("mouseup", (e) => {
  const mode = interactionMode;
  if (mode === "edit") {
    if (e.button === 0 || e.button === 2) {
      const handled = editSelect.onUp(e.button, e.shiftKey, e);
      if (handled) e.preventDefault();
    }
  } else {
    viewSelect.onUp(e.button, e.shiftKey, e);
  }
});

webglCanvas.addEventListener("mousemove", (e) => {
  const mode = interactionMode;
  if (mode === "edit") {
    if (e.buttons === 1) {
      const handled = editSelect.onMove(e);
      if (handled) e.preventDefault();
    }
  } else {
    viewSelect.onMove(e);
  }
});

if (selectionClearBtn) {
  selectionClearBtn.addEventListener("click", () => {
    state.selectionCells = new Set();
    selectionWindowApi.setContent("");
    updateSelectionHighlights();
  });
}

// Tokens window (movable/resizable, persisted)
// tokens window handled in ui/tokensWindow.js

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
