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
import { initSelectionWindow } from "./ui/selectionWindow.js";
import { createEditSelectionHandlers } from "./selection/selectionEdit.js";
import { createViewSelectionHandlers } from "./selection/selectionView.js";
import { createInteractionManager } from "./selection/interactionManager.js";
import { initLangWindow } from "./ui/langWindow.js";
import { initTurnWindow } from "./ui/turnWindow.js";

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
const tokensCopyBtn = document.getElementById("tokens-copy");
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
const selectionRoadBtn = document.getElementById("selection-road");
const selectionRaiseBtn = document.getElementById("selection-raise");
const selectionLowerBtn = document.getElementById("selection-lower");
const selectionZeroBtn = document.getElementById("selection-zero");
const selectionExportBtn = document.getElementById("selection-export");
const canvasEventShield = document.getElementById("canvas-event-shield");

const { log, logClass } = initLogger();
const interactionManager = createInteractionManager({ logClass });
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
const defaultGridFontScale = 0.9;
const savedGridFontScale = (() => {
  const raw = parseFloat(localStorage.getItem("grid-font-scale"));
  return Number.isFinite(raw) ? raw : defaultGridFontScale;
})();
const fallbackScript = `
# Provide your own script here
`;
const heatHeightSlider = document.getElementById("heat-height");
const heatHeightValue = document.getElementById("heat-height-value");
const moveSpeedSlider = document.getElementById("move-speed-scale");
const moveSpeedValue = document.getElementById("move-speed-scale-value");
const gridFontSlider = document.getElementById("grid-font-scale");
const gridFontValue = document.getElementById("grid-font-scale-value");
const tokenScaleSlider = document.getElementById("token-scale");
const tokenScaleValue = document.getElementById("token-scale-value");
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
const scriptsRunSelectedBtn = document.getElementById("scripts-run-selected");
const scriptsRunEditorBtn = document.getElementById("scripts-run-editor");
const dbOpenBtn = document.getElementById("db-open");
const dbWindow = document.getElementById("db-window");
const camSlotButtons = document.querySelectorAll("[data-cam-slot]");
const clearCamViewsBtn = document.getElementById("clear-cam-views");
const turnOpenBtn = document.getElementById("turn-open");
const turnCloseBtn = document.getElementById("turn-close");
const turnWindow = document.getElementById("turn-window");
const turnRollInitBtn = document.getElementById("turn-roll-init");
let memHud = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const roleBadge = document.getElementById("role-badge");
const runtimeStats = document.getElementById("runtime-stats");

const getClientRole = () => {
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  const roleParam = (url.searchParams.get("role") || "").toLowerCase();
  if (roleParam === "player") return "player";
  if (roleParam === "dm") return "dm";
  if (url.searchParams.has("cl")) return "player";
  if (path === "player") return "player";
  if (path === "dm") return "dm";
  return "dm";
};

const clientRole = getClientRole();
const isDM = clientRole === "dm";
let lastSyncedVersion = -1;
let lastRefreshToken = null;
const hideForPlayer = (el) => {
  if (el) el.style.display = "none";
};
const showForDM = (el) => {
  if (el && isDM) el.style.display = "";
};

if (!isDM) {
  camSlotButtons.forEach((btn) => (btn.style.display = "none"));
  if (clearCamViewsBtn) clearCamViewsBtn.style.display = "none";
  hideForPlayer(dbOpenBtn);
  hideForPlayer(paramsOpenBtn);
  hideForPlayer(selectionOpenBtn);
  hideForPlayer(scriptsOpenBtn);
  hideForPlayer(langOpenBtn);
  hideForPlayer(turnOpenBtn);
  hideForPlayer(viewToggleBtn);
  scriptsWindow?.classList?.remove("open");
  langWindow?.classList?.remove("open");
  dbWindow?.classList?.remove("open");
  paramsWindow?.classList?.remove("open");
  selectionWindow?.classList?.remove("open");
} else {
  showForDM(scriptsOpenBtn);
  showForDM(langOpenBtn);
  showForDM(dbOpenBtn);
  showForDM(paramsOpenBtn);
  showForDM(selectionOpenBtn);
  showForDM(turnOpenBtn);
  camSlotButtons.forEach((btn) => showForDM(btn));
  showForDM(clearCamViewsBtn);
}

if (roleBadge) {
  roleBadge.textContent = `Role: ${isDM ? "DM" : "Player"}`;
}
if (isDM) {
  if (scriptsOpenBtn) scriptsOpenBtn.style.display = "";
  if (langOpenBtn) langOpenBtn.style.display = "";
}

const fetchAndApplyLatestState = async () => {
  if (isDM || !scriptRunner) return;
  try {
    const since = Number.isFinite(lastSyncedVersion) ? lastSyncedVersion : -1;
    const res = await fetch(`/api/state?since=${since}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Number.isFinite(data.refreshToken)) {
      if (lastRefreshToken === null) {
        lastRefreshToken = data.refreshToken;
      } else if (data.refreshToken !== lastRefreshToken) {
        logClass?.("INFO", "Server requested refresh; reloading player");
        window.location.reload();
        return;
      }
    }
    const nextVersion = Number.isFinite(data.version) ? data.version : lastSyncedVersion;
    if (Array.isArray(data.instructions) && data.instructions.length) {
      // If this is an initial sync, clear local state first to avoid drift.
      if (since < 0) {
        scriptRunner.applyInstructions([{ type: "reset" }]);
      }
      scriptRunner.applyInstructions(data.instructions);
      if (typeof state.renderTokensWindow === "function") state.renderTokensWindow();
      logClass?.(
        "UPDATE",
        `Synced state version ${nextVersion} (${data.instructions.length} instructions)`
      );
    }
    if (Number.isFinite(nextVersion)) lastSyncedVersion = Math.max(lastSyncedVersion, nextVersion);
  } catch (err) {
    logClass?.("WARN", `State sync failed: ${err.message}`);
  }
};

const startPlayerSync = () => {
  if (isDM) return;
  const runSync = () => {
    if (!scriptRunner) return;
    fetchAndApplyLatestState();
  };
  runSync();
  setInterval(runSync, 250);
};

const initMemHud = () => {
  memHud = runtimeStats || null;
  if (memHud) memHud.textContent = "heap -- | tex -- | geo --";
};
const currentMapLabel = document.getElementById("current-map-label");

const textureCanvas = document.createElement("canvas");
const textureCtx = textureCanvas.getContext("2d", { willReadFrequently: true });

const webglCanvas = document.createElement("canvas");
webglCanvas.id = "map-webgl";
mapPanel.appendChild(webglCanvas);

state.heightMap.showMesh = savedHeight;
state.showModels = savedModels;
state.gridRefFontScale = Math.min(3, Math.max(0.25, savedGridFontScale));
state.tokenScale = parseFloat(localStorage.getItem("token-scale") || "1") || 1;
state.heightMap.heightScale = parseFloat(localStorage.getItem("height-map-scale") || `${state.heightMap.heightScale || 1}`) || 1;

const coercePx = (val, fallback, min) => {
  const n = parseFloat(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${Math.max(n, min)}px`;
};

const updateCanvasShield = () => {
  if (canvasEventShield) {
    canvasEventShield.style.pointerEvents = interactionMode === "edit" ? "auto" : "none";
  }
};

// Token hover tooltip
const tokenTooltip = document.createElement("div");
tokenTooltip.className = "token-tooltip";
tokenTooltip.style.display = "none";
document.body.appendChild(tokenTooltip);
let hoverTokenId = null;
let hoverTimer = null;
let lastHoverEvent = null;
let lastBroadcastTooltip = null;
const TOOLTIP_DELAY_MS = 1000;
const hideTokenTooltip = () => {
  tokenTooltip.style.display = "none";
  hoverTokenId = null;
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (isDM && typeof pushServerState === "function" && lastBroadcastTooltip !== null) {
    pushServerState([{ type: "tooltip", tokenId: lastBroadcastTooltip, show: false }]);
    lastBroadcastTooltip = null;
  }
};
const showTokenTooltip = (token, x, y) => {
  if (!token) return hideTokenTooltip();
  const infoLines = [];
  if (token.id) infoLines.push(`ID: ${token.id}`);
  if (token.info) infoLines.push(token.info);
  if (token.type) infoLines.push(`Type: ${token.type}`);
  if (token.faction) infoLines.push(`Faction: ${token.faction}`);
  if (Number.isFinite(token.hp)) {
    const hpLine = token.hpMax ? `HP: ${token.hp}/${token.hpMax}` : `HP: ${token.hp}`;
    infoLines.push(hpLine);
  }
  if (token.speed) infoLines.push(`Speed: ${token.speed}`);
  tokenTooltip.innerHTML = `
    <div class="token-tooltip-name">${token.name || token.id || "?"}</div>
    ${infoLines.map((l) => `<div class="token-tooltip-line">${l}</div>`).join("")}
  `;
  tokenTooltip.style.left = `${x + 12}px`;
  tokenTooltip.style.top = `${y + 12}px`;
  tokenTooltip.style.display = "block";
  if (isDM && typeof pushServerState === "function") {
    if (lastBroadcastTooltip !== token.id) {
      const normX = window.innerWidth ? x / window.innerWidth : null;
      const normY = window.innerHeight ? y / window.innerHeight : null;
      pushServerState([{ type: "tooltip", tokenId: token.id, show: true, x, y, normX, normY }]);
      lastBroadcastTooltip = token.id;
    }
  }
};
const scheduleTokenTooltip = (tokenId, event) => {
  if (hoverTokenId === tokenId) return;
  hoverTokenId = tokenId;
  if (hoverTimer) clearTimeout(hoverTimer);
  if (!tokenId) {
    hideTokenTooltip();
    return;
  }
  lastHoverEvent = event;
  hoverTimer = setTimeout(() => {
    const token = (state.tokens || []).find((t) => t.id === tokenId);
    if (!token || !lastHoverEvent) return hideTokenTooltip();
    showTokenTooltip(token, lastHoverEvent.clientX, lastHoverEvent.clientY);
  }, TOOLTIP_DELAY_MS);
};
// expose for scriptRunner-driven tooltips (players)
state.showTokenTooltip = (token, x, y) => showTokenTooltip(token, x ?? 24, y ?? 24);
state.hideTokenTooltip = () => hideTokenTooltip();

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
    respectTextureToggle: isDM, // Players should honor DM view params, not local toggle defaults.
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
interactionManager.attachControls(three.controls);

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
  if (!isDM) return;
  if (!scriptRunner) return;
  try {
    await scriptRunner.runSelectedScripts({ runIfNoneFallback });
    if (turnWindowApi && isDM) turnWindowApi.fetchSuggestions?.();
  } catch (err) {
    log(`Failed to run selected scripts: ${err.message}`);
  }
};

const runCurrentScript = () => {
  if (!isDM) return;
  if (!scriptRunner) return;
  scriptRunner.runScriptText(inputEl.value).then(() => {
    if (turnWindowApi && isDM) turnWindowApi.fetchSuggestions?.();
  }).catch((err) => {
    log(`Failed to run script: ${err.message}`);
  });
};

const loadExampleScript = async (path, fallback, autoRun = false, meta = {}) => {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    inputEl.value = text.trim();
    log(`Loaded script: ${path}`);
    if (meta.type === "map" && currentMapLabel) currentMapLabel.textContent = path;
    if (autoRun && isDM) runCurrentScript();
  } catch (err) {
    if (fallback) {
      inputEl.value = fallback.trim();
      log(`Loaded fallback script (failed to load ${path})`);
      if (meta.type === "map") {
        if (currentMapLabel) currentMapLabel.textContent = "Fallback map";
        logClass?.("INFO", "Applied fallback map as last-map-script");
      }
      if (autoRun && isDM) runCurrentScript();
    } else {
      log(`Failed to load example ${path}: ${err.message}`);
    }
  }
};

document.getElementById("run-btn").addEventListener("click", () => {
  if (isDM) runCurrentScript();
});

const runSelectedBtn = document.getElementById("run-selected-btn");
if (runSelectedBtn) {
  runSelectedBtn.addEventListener("click", () => {
    if (isDM) runSelectedScripts({ runIfNoneFallback: false });
    if (turnWindowApi && isDM) turnWindowApi.fetchSuggestions?.();
  });
}

// Run script on Ctrl+Enter when the textarea is focused.
if (inputEl) {
  inputEl.addEventListener("keydown", (e) => {
    if (!isDM) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runCurrentScript();
    }
  });
}

const clearBtn = document.getElementById("clear-btn");

const syncHeatControls = () => {
  heatHeightValue.textContent = `${state.heightMap.heightScale.toFixed(2)} units/click`;
};

const syncMoveSpeedControls = () => {
  moveSpeedValue.textContent = `${state.moveSpeedScale.toFixed(2)}x`;
};

const syncGridFontControls = () => {
  if (!gridFontValue) return;
  const pct = Math.round((state.gridRefFontScale || defaultGridFontScale) * 100);
  gridFontValue.textContent = `${pct}%`;
};

const syncTokenScaleControls = () => {
  if (!tokenScaleValue) return;
  tokenScaleValue.textContent = `${(state.tokenScale || 1).toFixed(2)}x`;
};

const applyViewParams = (params = {}, { broadcast = false, persist = true } = {}) => {
  let needsScene = false;
  let needsBackground = false;
  if (params.heightScale !== undefined) {
    state.heightMap.heightScale = Number(params.heightScale) || 1;
    if (heatHeightSlider) heatHeightSlider.value = state.heightMap.heightScale;
    syncHeatControls();
    if (persist) localStorage.setItem("height-map-scale", state.heightMap.heightScale.toString());
    needsScene = true;
  }
  if (params.tokenScale !== undefined) {
    state.tokenScale = Number(params.tokenScale) || 1;
    if (tokenScaleSlider) tokenScaleSlider.value = state.tokenScale;
    syncTokenScaleControls();
    if (persist) localStorage.setItem("token-scale", state.tokenScale.toString());
    needsScene = true;
  }
  if (params.arenaGrid !== undefined && arenaGridToggle) {
    arenaGridToggle.checked = !!params.arenaGrid;
    if (persist) localStorage.setItem("arena-grid", arenaGridToggle.checked ? "true" : "false");
    needsScene = true;
  }
  if (params.showTexture !== undefined && textureToggle) {
    textureToggle.checked = !!params.showTexture;
    if (persist) localStorage.setItem("show-texture", textureToggle.checked ? "true" : "false");
    needsScene = true;
    needsBackground = true;
  }
  if (params.showHeight !== undefined && heightToggle) {
    heightToggle.checked = !!params.showHeight;
    state.heightMap.showMesh = heightToggle.checked;
    if (persist) localStorage.setItem("show-heightmap", heightToggle.checked ? "true" : "false");
    needsScene = true;
  }
  if (params.showOverlayGrid !== undefined && overlayGridToggle) {
    overlayGridToggle.checked = !!params.showOverlayGrid;
    if (persist) localStorage.setItem("show-overlay-grid", overlayGridToggle.checked ? "true" : "false");
    needsScene = true;
    needsBackground = true;
  }
  if (params.showOverlayLabels !== undefined && overlayLabelToggle) {
    overlayLabelToggle.checked = !!params.showOverlayLabels;
    if (persist) localStorage.setItem("show-overlay-labels", overlayLabelToggle.checked ? "true" : "false");
    needsScene = true;
    needsBackground = true;
  }
  if (params.showModels !== undefined && modelsToggle) {
    modelsToggle.checked = !!params.showModels;
    state.showModels = modelsToggle.checked;
    if (persist) localStorage.setItem("show-models", modelsToggle.checked ? "true" : "false");
    needsScene = true;
  }
  if (needsBackground && state.map?.backgroundUrl) {
    setBackground(state.map.backgroundUrl);
  } else if (needsScene) {
    updateBoardScene();
    render();
  }
  if (broadcast && isDM && typeof pushServerState === "function") {
    pushServerState([{ type: "view-params", params }]);
  }
};

const requestServerInstructions = async (scriptText) => {
  const res = await fetch("/api/run-script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script: scriptText || "" })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.instructions)) {
    throw new Error("Invalid response payload");
  }
  return { instructions: data.instructions, fromServer: true };
};


const pushServerState = async (instructions) => {
  if (!isDM || !Array.isArray(instructions) || !instructions.length) return;
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions })
    });
  } catch (err) {
    logClass?.("WARN", `Push state failed: ${err.message}`);
  }
};

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const instr = [{ type: "clear", scope: "tokens" }];
    scriptRunner.applyInstructions(instr);
    pushServerState(instr);
  });
}

// Build script runner once dependencies are available.
scriptRunner = createScriptRunner({
  parseScript,
  fetchInstructions: requestServerInstructions,
  pushInstructions: pushServerState,
  setBackground,
  setCameraState: (camera) => cameraManager.transitionToCamera(camera, render3d),
  updateBoardScene,
  render,
  clearGroup,
  log,
  logClass,
  scriptTreeManager
});

let turnWindowApi = null;

// DM controls window (DM only)
if (isDM) {
  const rollInitiative = () => {
    const pairs = (state.tokens || []).map((t) => ({
      id: t.id,
      value: Math.floor(Math.random() * 20) + 1
    }));
    pairs.sort((a, b) => (b.value || 0) - (a.value || 0));
    const instructions = [{ type: "initiative-set", pairs }];
    scriptRunner.applyInstructions(instructions);
    pushServerState(instructions);
    const topId = pairs[0]?.id;
    if (topId) applySelection([topId], { broadcast: true });
    if (turnWindowApi && isDM) turnWindowApi.fetchSuggestions?.();
    logClass?.("INFO", `Rolled initiative for ${pairs.length} token(s)`);
  };
 turnWindowApi = initTurnWindow({
   openBtn: turnOpenBtn,
   closeBtn: turnCloseBtn,
   windowEl: turnWindow,
   isDM,
   rollInitiative,
   logClass,
    scriptRunner,
    state
 });
// Disabled: Refresh players on DM reload caused flicker. If needed, re-enable deliberately.
} else {
  if (turnWindow) turnWindow.classList.remove("open");
  hideForPlayer(turnWindow);
}

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
state.refreshTokenHighlights = refreshTokenHighlights;
state.applyViewParamsFromRemote = (params) => applyViewParams(params, { broadcast: false, persist: true });

const applySelection = (ids, { broadcast = true } = {}) => {
  const next = new Set(Array.isArray(ids) ? ids : []);
  state.selectedTokenIds = next;
  if (typeof state.renderTokensWindow === "function") state.renderTokensWindow();
  refreshTokenHighlights();
  if (broadcast && isDM && typeof pushServerState === "function") {
    pushServerState([{ type: "selection", ids: Array.from(next) }]);
  }
};

heatHeightSlider.addEventListener("input", (e) => {
  const val = parseFloat(e.target.value) || 1;
  applyViewParams({ heightScale: val }, { broadcast: true });
});

moveSpeedSlider.addEventListener("input", (e) => {
  state.moveSpeedScale = parseFloat(e.target.value) || 1;
  syncMoveSpeedControls();
});

if (gridFontSlider) {
  gridFontSlider.value = state.gridRefFontScale;
  syncGridFontControls();
  gridFontSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    const clamped = Math.min(3, Math.max(0.25, Number.isFinite(val) ? val : defaultGridFontScale));
    state.gridRefFontScale = clamped;
    localStorage.setItem("grid-font-scale", clamped.toString());
    syncGridFontControls();
    if (state.map?.backgroundUrl) setBackground(state.map.backgroundUrl);
    updateBoardScene();
    render();
  });
}

if (tokenScaleSlider) {
  tokenScaleSlider.value = state.tokenScale;
  syncTokenScaleControls();
  tokenScaleSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    const clamped = Math.min(2.5, Math.max(0.4, Number.isFinite(val) ? val : 1));
    applyViewParams({ tokenScale: clamped }, { broadcast: true });
  });
}

const broadcastCameraState = (camera) => {
  if (!isDM || !camera || typeof pushServerState !== "function") return;
  pushServerState([{ type: "camera-state", camera }]);
};

const setCameraPreset = (preset) => {
  cameraManager.setCameraPreset(preset, render3d);
  const cam = cameraManager.getCurrentCamera();
  broadcastCameraState(cam);
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
  if (isDM && scriptRunner) {
    scriptRunner.applyInstructions([{ type: "camera-state", camera: payload }]);
    broadcastCameraState(payload);
  } else {
    cameraManager.transitionToCamera(payload, render3d);
  }
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
    applyViewParams({ arenaGrid: arenaGridToggle.checked }, { broadcast: true });
  });
}

if (textureToggle) {
  textureToggle.checked = savedTexture;
  textureToggle.addEventListener("change", () => {
    applyViewParams({ showTexture: textureToggle.checked }, { broadcast: true });
  });
}
if (heightToggle) {
  heightToggle.checked = savedHeight;
  heightToggle.addEventListener("change", () => {
    applyViewParams({ showHeight: heightToggle.checked }, { broadcast: true });
  });
}
if (overlayGridToggle) {
  overlayGridToggle.checked = savedOverlayGrid;
  overlayGridToggle.addEventListener("change", () => {
    applyViewParams({ showOverlayGrid: overlayGridToggle.checked }, { broadcast: true });
  });
}
if (overlayLabelToggle) {
  overlayLabelToggle.checked = savedOverlayLabels;
  overlayLabelToggle.addEventListener("change", () => {
    applyViewParams({ showOverlayLabels: overlayLabelToggle.checked }, { broadcast: true });
  });
}
if (modelsToggle) {
  modelsToggle.checked = savedModels;
  modelsToggle.addEventListener("change", () => {
    applyViewParams({ showModels: modelsToggle.checked }, { broadcast: true });
  });
}

// Parameters window (fixed size, draggable)
initParamsWindow({ paramsOpenBtn, paramsCloseBtn, paramsWindow });
initTokensWindow({
  tokensOpenBtn,
  tokensCloseBtn,
  tokensCopyBtn,
  tokensWindow,
  tokensBody,
  state,
  coercePx,
  safeJsonParse,
  refreshTokenHighlights,
  onSelectionChange: (ids) => applySelection(ids, { broadcast: true })
});
initScriptsWindow({ scriptsOpenBtn, scriptsCloseBtn, scriptsWindow });
initLangWindow({ langOpenBtn, langCloseBtn, langWindow });
const refToIndex = (ref) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref || "");
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  col -= 1; // convert to 0-based
  const row = Number(m[2]);
  return { col, row };
};

const adjustSelectionHeights = (delta, refs) => {
  const map = state.map;
  if (!map || !Array.isArray(refs) || !refs.length) return;
  map.heights = map.heights || {};
  const step = state.heightMap.heightScale || 1;
  refs.forEach((ref) => {
    const idx = refToIndex(ref);
    if (!idx) return;
    const key = `${idx.col},${idx.row}`;
    const current = Number(map.heights[key]) || 0;
    const next = Math.max(0, current + delta * step);
    map.heights[key] = next;
  });
  logClass?.("EDIT", `Adjusted heights by ${delta * step} for ${refs.length} cell(s)`);
  updateBoardScene();
  updateSelectionHighlights();
  render3d();
};

const zeroSelectionHeights = () => {
  const map = state.map;
  if (!map) return;
  // Zero the entire map.
  map.heights = {};
  logClass?.("EDIT", "Zeroed entire heightmap");
  updateBoardScene();
  updateSelectionHighlights();
  render3d();
};

const exportHeightMap = () => {
  const map = state.map;
  if (!map) return "";
  const rows = Math.max(1, map.rows || 1);
  const cols = Math.max(1, map.cols || 1);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const rowVals = [];
    for (let c = 0; c < cols; c++) {
      rowVals.push(Number(map.heights?.[`${c},${r}`]) || 0);
    }
    lines.push(rowVals.join(","));
  }
  return `HEIGHT_START\n${lines.join("\n")}\nHEIGHT_END`;
};

const selectionWindowApi =
  initSelectionWindow({
    openBtn: selectionOpenBtn,
    closeBtn: selectionCloseBtn,
    clearBtn: selectionClearBtn,
    windowEl: selectionWindow,
    textarea: selectionText,
    roadBtn: selectionRoadBtn,
    raiseBtn: selectionRaiseBtn,
    lowerBtn: selectionLowerBtn,
    zeroBtn: selectionZeroBtn,
    exportBtn: selectionExportBtn,
    onExportHeight: exportHeightMap,
    onAdjustHeight: adjustSelectionHeights,
    onZeroHeight: zeroSelectionHeights,
    getSelectionRefs: () => Array.from(state.selectionCells || [])
  }) || { setContent: () => {}, bringToFront: () => {} };

const setInteractionMode = (mode) => {
  if (!isDM && mode !== "view") return interactionMode;
  const next = interactionManager.setMode(mode);
  interactionMode = next;
  if (viewToggleBtn) viewToggleBtn.textContent = next === "view" ? "View" : "Edit";
  applyControlMode(next);
  logClass?.("INFO", `Mode changed to ${next}`);
  logClass?.("EDIT", `interactionMode=${interactionMode}`);
  // Clamp OrbitControls behavior per mode
  if (three.controls) {
    three.controls.mouseButtons.LEFT = interactionMode === "edit" ? null : THREE.MOUSE.ROTATE;
    three.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    three.controls.enableZoom = true; // wheel zoom always ok
    if (interactionMode === "view") {
      three.controls.enabled = true;
      three.controls.enableRotate = true;
      three.controls.enablePan = true;
    } else {
      // Edit: disable rotate; allow pan via right-click only.
      three.controls.enabled = true;
      three.controls.enableRotate = false;
      three.controls.enablePan = true;
    }
  }
  updateCanvasShield();
};

const toggleMode = () => setInteractionMode(interactionMode === "view" ? "edit" : "view");

if (viewToggleBtn) {
  viewToggleBtn.textContent = "View";
  if (isDM) viewToggleBtn.addEventListener("click", toggleMode);
  else viewToggleBtn.style.display = "none";
}

if (scriptsRunSelectedBtn) {
  if (isDM) {
    scriptsRunSelectedBtn.addEventListener("click", () => {
      runSelectedScripts({ runIfNoneFallback: false });
    });
  } else {
    scriptsRunSelectedBtn.style.display = "none";
  }
}

if (scriptsRunEditorBtn) {
  if (isDM) {
    scriptsRunEditorBtn.addEventListener("click", () => {
      runCurrentScript();
    });
  } else {
    scriptsRunEditorBtn.style.display = "none";
  }
}

// Keyboard shortcuts: V for view, E for edit (or toggle if already in that state)
if (isDM) {
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
  });
}

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
  render3d,
  onSelectionChange: (ids) => applySelection(ids, { broadcast: true })
});
const viewSelect = createViewSelectionHandlers({
  three,
  state,
  raycaster,
  pointer,
  logClass,
  refreshTokenHighlights,
  onSelectionChange: (ids) => applySelection(ids, { broadcast: true })
});
interactionManager.setHandlers({ edit: editSelect, view: viewSelect });
// Ensure shield state matches initial mode
updateCanvasShield();

webglCanvas.addEventListener("mousedown", (e) => {
  const mode = interactionMode;
  const handled = interactionManager.handleDown(e.button, e.shiftKey, e);
  if (handled) {
    e.preventDefault();
    if (e.button === 0) e.stopPropagation();
  }
}, true);

webglCanvas.addEventListener("mouseup", (e) => {
  const handled = interactionManager.handleUp(e.button, e.shiftKey, e);
  if (handled) {
    e.preventDefault();
    if (interactionMode === "edit" && e.button === 0) e.stopPropagation();
  }
}, true);

webglCanvas.addEventListener("mousemove", (e) => {
  const handled = interactionManager.handleMove(e);
  if (handled) {
    e.preventDefault();
    if (interactionMode === "edit" && e.buttons === 1) e.stopPropagation();
  }
}, true);

// Ensure shield state matches initial mode
updateCanvasShield();

// Hover detection for tokens (view-only; no click)
webglCanvas.addEventListener("pointermove", (e) => {
  if (!three?.tokenGroup || !three?.camera || !raycaster) return;
  const rect = three.renderer?.domElement?.getBoundingClientRect();
  if (!rect) return;
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, three.camera);
  const tokenHits = three.tokenGroup ? raycaster.intersectObjects(three.tokenGroup.children, true) : [];
  if (tokenHits.length) {
    const tokenObj = tokenHits[0].object;
    const tokenId = tokenObj.userData.tokenId || tokenObj.parent?.userData?.tokenId;
    if (tokenId) {
      scheduleTokenTooltip(tokenId, e);
      return;
    }
  }
  scheduleTokenTooltip(null, e);
});
webglCanvas.addEventListener("pointerleave", () => hideTokenTooltip());

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

let lastCamBroadcast = 0;
let pendingCamBroadcast = false;
const broadcastCurrentCamera = () => {
  if (!isDM) return;
  const cam = cameraManager.getCurrentCamera();
  broadcastCameraState(cam);
};
if (isDM && three.controls) {
  const scheduleBroadcast = () => {
    const now = Date.now();
    if (now - lastCamBroadcast > 300) {
      lastCamBroadcast = now;
      broadcastCurrentCamera();
    } else if (!pendingCamBroadcast) {
      pendingCamBroadcast = true;
      setTimeout(() => {
        pendingCamBroadcast = false;
        lastCamBroadcast = Date.now();
        broadcastCurrentCamera();
      }, 300);
    }
  };
  three.controls.addEventListener("change", scheduleBroadcast);
  three.controls.addEventListener("end", scheduleBroadcast);
}
render();
scriptTreeManager.loadScriptManifest(() => runSelectedScripts({ runIfNoneFallback: false }));
startPlayerSync();

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

// Listen for DM-selected token events (e.g., from Turn Actions window) without rebroadcasting to players.
window.addEventListener("dm-set-selection", (e) => {
  const ids = (e.detail && e.detail.ids) || [];
  const highlight = e.detail?.highlight || null;
  if (highlight === "active-turn") state.activeTurnIds = new Set(ids);
  else state.activeTurnIds = new Set();
  applySelection(ids, { broadcast: false });
});

const focusCameraOnToken = (tokenId) => {
  if (!tokenId) {
    logClass?.("CAMERA", "Focus token aborted: missing tokenId");
    return;
  }
  if (!state.lastBoard || !three.camera || !three.controls) {
    logClass?.("CAMERA", `Focus ${tokenId} aborted: missing camera/board`);
    return;
  }
  const token = (state.tokens || []).find((t) => t.id === tokenId || t.id?.startsWith?.(`${tokenId}-`));
  if (!token) {
    logClass?.("CAMERA", `Focus ${tokenId} aborted: token not found`);
    return;
  }
  const map = state.map || {};
  const lb = state.lastBoard;
  const boardWidth = Math.max(1, lb.cameraWidth || lb.boardWidth || 1);
  const boardDepth = Math.max(1, lb.cameraDepth || lb.boardDepth || 1);
  const surfaceY = lb.surfaceY || 0;
  const colRowMatch = /^([A-Z]+)(\d+)$/.exec(token.position || "");
  let col = Number.isFinite(token.col) ? token.col : null;
  let row = Number.isFinite(token.row) ? token.row : null;
  if (colRowMatch) {
    const colLetters = colRowMatch[1].toUpperCase();
    col = 0;
    for (let i = 0; i < colLetters.length; i++) col = col * 26 + (colLetters.charCodeAt(i) - 64);
    col -= 1;
    row = Number(colRowMatch[2]);
  }
  if (!Number.isFinite(col) || !Number.isFinite(row)) {
    logClass?.("CAMERA", `Focus ${tokenId} aborted: no position/col/row`, { token });
    return;
  }
  const computeHex = () => {
    const ob = state.overlayBounds;
    if (!ob || !map.cols || !map.rows) {
      logClass?.("CAMERA", "Hex focus fallback: missing overlay bounds");
      return null;
    }
    const originX = ob.minX;
    const originY = ob.minY;
    const spanW = ob.width;
    const spanH = ob.height;
    const cellW = spanW / (map.cols + 0.5);
    const cellH = spanH / (map.rows + 0.5);
    const rowBase = Math.floor(row);
    const isOdd = rowBase % 2 !== 1;
    const rowOffset = isOdd ? 0 : cellW * 0.5;
    const x = originX + (col + 0.5) * cellW + rowOffset;
    const z = originY + (row + 0.5) * cellH;
    return { x, z };
  };
  const computeGrid = () => {
    if (!map.cols || !map.rows) return null;
    const cellW = boardWidth / map.cols;
    const cellH = boardDepth / map.rows;
    const x = (col + 0.5) * cellW;
    const z = (row + 0.5) * cellH;
    return { x, z };
  };
  const placement = map.gridType === "hex" ? computeHex() || computeGrid() : computeGrid();
  if (!placement) {
    logClass?.("CAMERA", `Focus ${tokenId} aborted: no placement`);
    return;
  }
  const u = Math.min(1, Math.max(0, placement.x / Math.max(1, boardWidth)));
  const v = Math.min(1, Math.max(0, placement.z / Math.max(1, boardDepth)));
  const h = sampleHeightMap(state, u, v);
  const target = new THREE.Vector3(placement.x, surfaceY + h, placement.z);
  const currentTarget = three.controls.target.clone();
  const currentPos = three.camera.position.clone();
  let offset = currentPos.clone().sub(currentTarget);
  if (offset.lengthSq() < 1e-4) offset = new THREE.Vector3(10, 10, 10);
  const distance = offset.length();
  const dir = offset.clone().normalize();
  const newPos = target.clone().add(dir.multiplyScalar(distance));
  const payload = {
    position: newPos.toArray(),
    target: target.toArray(),
    distance
  };
  if (logClass) {
    logClass("CAMERA", `Focus token ${tokenId}`, {
      placement,
      currentPos: currentPos.toArray(),
      currentTarget: currentTarget.toArray(),
      position: payload.position,
      target: payload.target,
      distance
    });
  }
  cameraManager.transitionToCamera(payload, render3d);
};

window.addEventListener("focus-token", (e) => {
  const id = e.detail?.id;
  if (!id) {
    logClass?.("CAMERA", "Focus event missing id");
    return;
  }
  logClass?.("CAMERA", `Focus event received for ${id}`);
  focusCameraOnToken(id);
});
