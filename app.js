import * as THREE from "three";
import { buildAxisArena } from "./axes.js";
import { updateHeightMapFromHeights, sampleHeightMap, rebuildHeightMesh } from "./heightmap.js";
import { tokenTemplates, buildTemplateSvg, ensureTemplateDef } from "./tokens.js";
import { initLogger } from "./logger.js";
import { createCameraManager } from "./camera.js";
import { createSceneBuilder } from "./buildScene.js";
import { parseScript, coordToIndex } from "./parser.js";

const canvas = document.getElementById("map-canvas");
const inputEl = document.getElementById("script-input");
const arenaGridToggle = document.getElementById("arena-grid");
const textureToggle = document.getElementById("show-texture");
const heightToggle = document.getElementById("show-height");
const overlayGridToggle = document.getElementById("show-overlay-grid");
const overlayLabelToggle = document.getElementById("show-overlay-labels");
const tokensOpenBtn = document.getElementById("tokens-open");
const tokensCloseBtn = document.getElementById("tokens-close");
const tokensWindow = document.getElementById("tokens-window");
const tokensBody = document.getElementById("tokens-body");
const paramsOpenBtn = document.getElementById("params-open");
const paramsCloseBtn = document.getElementById("params-close");
const paramsWindow = document.getElementById("params-window");
const safeJsonParse = (val, fallback) => {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};
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
let selectedLeaf = null;
const scriptManifest = new Map();
let isBuildingTree = false;
let treeAutoRunDone = false;
const SELECTED_ROW_KEY = "script-tree-selected-row";
const safeStorageGet = (key, fallback = null) => {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
};
const safeStorageSet = (key, val) => {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
};
const camSlotButtons = document.querySelectorAll("[data-cam-slot]");
const clearCamViewsBtn = document.getElementById("clear-cam-views");
const currentMapLabel = document.getElementById("current-map-label");

const textureCanvas = document.createElement("canvas");
const textureCtx = textureCanvas.getContext("2d", { willReadFrequently: true });

const webglCanvas = document.createElement("canvas");
webglCanvas.id = "map-webgl";
mapPanel.appendChild(webglCanvas);
const overlayCenters = new Map(); // key `${c},${r}` -> {x,y}

const state = {
  map: {
    id: "default",
    name: "Default",
    gridSizePx: 48,
    gridType: "square",
    cols: 20,
    rows: 12,
    backgroundUrl: "",
    heights: {}
  },
  tokenDefs: [],
  tokens: [],
  viewMode: "3d",
  heightMap: {
    showVolumes: false,
    showMesh: savedHeight,
    heightScale: 3,
    grid: [],
    maxThreat: 1,
    maxSupport: 1
  },
  overlayCenters,
  activeMoves: [],
  activeEffects: [],
  moveSpeedScale: 1
};

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

const overlayGridOnTexture = (map) => {
  if (!textureCtx || !textureCanvas || !map || !textureCanvas.width || !textureCanvas.height) return;
  if (overlayGridToggle && !overlayGridToggle.checked) return;
  const cols = Math.max(1, map.cols || 1);
  const rows = Math.max(1, map.rows || 1);
  // Reset overlay bounds/centers each draw
  state.overlayBounds = null;
  state.overlayCenters?.clear();
  textureCtx.save();
  textureCtx.strokeStyle = "rgba(255,255,255,0.35)";
  textureCtx.lineWidth = 1;
  if (map.gridType === "hex") {
    const sqrt3 = Math.sqrt(3);
    // Fit both width and height: choose the smaller side-derived size.
    const cellW = textureCanvas.width / (cols + 0.5);
    const cellH = textureCanvas.height / (rows + 0.5);
    const sFromW = cellW / sqrt3;
    const sFromH = cellH / 1.5;
    const s = Math.max(1, Math.min(sFromW, sFromH));
    const hexW = sqrt3 * s;
    const hexH = 2 * s;
    const rowStep = hexH * 0.75;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = hexW * (c + 0.5 * (r & 1)) + hexW / 2;
          const cy = rowStep * r + hexH / 2;
          state.overlayCenters?.set(`${c},${r}`, { x: cx, y: cy });
        textureCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i + Math.PI / 6;
          const px = cx + s * Math.cos(ang);
          const py = cy + s * Math.sin(ang);
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
          if (i === 0) textureCtx.moveTo(px, py);
          else textureCtx.lineTo(px, py);
        }
        textureCtx.closePath();
        textureCtx.stroke();
        if (!overlayLabelToggle || overlayLabelToggle.checked) {
          textureCtx.fillStyle = "rgba(240,240,240,0.7)";
          textureCtx.font = "12px monospace";
          textureCtx.textAlign = "center";
          textureCtx.textBaseline = "middle";
          const label = `${String.fromCharCode(65 + c)}${r}`;
          textureCtx.fillText(label, cx, cy);
        }
      }
    }
    if (Number.isFinite(minX)) {
      state.overlayBounds = {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
      };
      logClass?.(
        "BUILD",
        `overlay hex bounds x=[${minX.toFixed(1)},${maxX.toFixed(1)}] w=${(maxX - minX).toFixed(
          1
        )} y=[${minY.toFixed(1)},${maxY.toFixed(1)}] h=${(maxY - minY).toFixed(1)}`
      );
    }
  } else {
    const cell = Math.min(textureCanvas.width / cols, textureCanvas.height / rows);
    for (let x = 0; x <= textureCanvas.width + cell; x += cell) {
      textureCtx.beginPath();
      textureCtx.moveTo(x, 0);
      textureCtx.lineTo(x, textureCanvas.height);
      textureCtx.stroke();
    }
    for (let y = 0; y <= textureCanvas.height + cell; y += cell) {
      textureCtx.beginPath();
      textureCtx.moveTo(0, y);
      textureCtx.lineTo(textureCanvas.width, y);
      textureCtx.stroke();
    }
    if (!overlayLabelToggle || overlayLabelToggle.checked) {
      textureCtx.fillStyle = "rgba(240,240,240,0.7)";
      textureCtx.font = "12px monospace";
      textureCtx.textAlign = "center";
      textureCtx.textBaseline = "middle";
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cell + cell / 2;
          const y = r * cell + cell / 2;
          const label = `${String.fromCharCode(65 + c)}${r}`;
          textureCtx.fillText(label, x, y);
        }
      }
    }
    // For square, overlay spans the full canvas
    state.overlayBounds = {
      minX: 0,
      minY: 0,
      maxX: textureCanvas.width,
      maxY: textureCanvas.height,
      width: textureCanvas.width,
      height: textureCanvas.height
    };
  }
  textureCtx.restore();
};

const cropTextureToOverlay = () => {
  const ob = state.overlayBounds;
  if (!ob) return;
  // Nothing to crop if the overlay already spans the canvas
  if (
    Math.round(ob.width) === Math.round(textureCanvas.width) &&
    Math.round(ob.height) === Math.round(textureCanvas.height) &&
    Math.round(ob.minX) === 0 &&
    Math.round(ob.minY) === 0
  ) {
    return;
  }
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.round(ob.width));
  crop.height = Math.max(1, Math.round(ob.height));
  const ctx = crop.getContext("2d");
  ctx.drawImage(textureCanvas, -ob.minX, -ob.minY);
  textureCanvas.width = crop.width;
  textureCanvas.height = crop.height;
  textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  textureCtx.drawImage(crop, 0, 0);

  // Shift overlay centers to the new origin.
  if (state.overlayCenters) {
    const entries = Array.from(state.overlayCenters.entries());
    state.overlayCenters.clear();
    entries.forEach(([key, val]) => {
      state.overlayCenters.set(key, { x: val.x - ob.minX, y: val.y - ob.minY });
    });
  }
  state.overlayBounds = { minX: 0, minY: 0, maxX: ob.width, maxY: ob.height, width: ob.width, height: ob.height };
  logClass?.(
    "BUILD",
    `cropTextureToOverlay: trimmed canvas to ${crop.width}x${crop.height} from overlay bounds`
  );
};

const applyInstructions = (instructions) => {
  let working = JSON.parse(JSON.stringify(state));
  let mapChanged = false;

  const ensureMap = () => {
    if (working.map) return working.map;
    working.map = {
      id: "default-map",
      name: "Default Map",
      gridSizePx: 48,
      gridType: "square",
      cols: 20,
      rows: 12,
      backgroundUrl: "",
      heights: {}
    };
    ensureRandomHeights(working.map);
    return working.map;
  };

  const addDef = (def) => {
    const idx = working.tokenDefs.findIndex((d) => d.code === def.code);
    if (idx >= 0) working.tokenDefs[idx] = def;
    else working.tokenDefs.push(def);
  };

  const setHeight = (col, row, h) => {
    if (!working.map) working.map = ensureMap();
    if (!working.map.heights) working.map.heights = {};
    working.map.heights[`${col},${row}`] = h;
  };

  const upsertToken = (token) => {
    const idx = working.tokens.findIndex((t) => t.id === token.id);
    if (idx >= 0) working.tokens[idx] = token;
    else working.tokens.push(token);
  };

  const removeToken = (tokenId) => {
    const idx = working.tokens.findIndex((t) => t.id.startsWith(tokenId));
    if (idx >= 0) working.tokens.splice(idx, 1);
  };

  instructions.forEach((instr) => {
    switch (instr.type) {
      case "height-raw": {
        const raw = instr.raw || "";
        const pairs = raw
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        const entries = [];
        pairs.forEach((pair) => {
          const kvMatch = /^([A-Z]\d+)=(\-?\d+(?:\.\d+)?)$/i.exec(pair);
          if (kvMatch) {
            const coord = coordToIndex(kvMatch[1]);
            if (coord) entries.push({ ...coord, h: Number(kvMatch[2]) });
          }
        });
        entries.forEach(({ col, row, h }) => setHeight(col, row, h));
        // Log full height map for debugging
        const keys = Object.keys(working.map.heights || {});
        const preview = keys.slice(0, 5).map((k) => `${k}:${working.map.heights[k]}`);
        logClass(
          "BUILD",
          `app.js:182 Height map parsed: ${keys.length} entries. Sample: ${preview.join(", ")}`
        );
        break;
      }
      case "background": {
        const map = ensureMap();
        working.map = { ...map, backgroundUrl: instr.url };
        mapChanged = true;
        break;
      }
      case "map": {
        const map = ensureMap();
        const kv = instr.kv || {};
        if (kv.background || kv.bg) map.backgroundUrl = kv.background || kv.bg;
        if (kv.grid) map.gridType = kv.grid.toLowerCase();
        if (kv.size) map.gridSizePx = Number(kv.size);
        if (kv.board) {
          const boardMatch = /^(\d+)[xX](\d+)$/.exec(kv.board);
          if (boardMatch) {
            map.cols = Number(boardMatch[1]);
            map.rows = Number(boardMatch[2]);
          }
        }
        ensureRandomHeights(map);
        mapChanged = true;
        break;
      }
      case "grid": {
        const map = ensureMap();
        working.map = { ...map, gridType: instr.grid, gridSizePx: instr.size };
        mapChanged = true;
        break;
      }
      case "board": {
        const map = ensureMap();
        working.map = { ...map, cols: instr.cols, rows: instr.rows };
        ensureRandomHeights(working.map);
        mapChanged = true;
        break;
      }
      case "sprite-def": {
        addDef({ ...instr.def, speed: Number(instr.def.speed) || 12 });
        break;
      }
      case "place": {
        const def = working.tokenDefs.find((d) => d.code === instr.code);
        if (!def) {
          log(`Unknown sprite code ${instr.code}`);
          return;
        }
        const map = ensureMap();
        const existingCount = working.tokens.filter((t) => t.id.startsWith(def.code)).length;
        instr.coords.forEach((coord, idx) => {
          upsertToken({
            id: `${def.code}-${existingCount + idx + 1}`,
            defId: def.id,
            mapId: map.id,
            col: coord.col,
            row: coord.row,
            speed: def.speed || 12
          });
        });
        break;
      }
      case "move": {
        const token = working.tokens.find((t) => t.id.startsWith(instr.tokenId));
        if (!token) {
          log(`Token ${instr.tokenId} not found`);
          return;
        }
        state.activeMoves = state.activeMoves.filter((m) => !m.tokenId.startsWith(instr.tokenId));
        state.activeMoves.push({
          tokenId: token.id,
          from: { col: token.col, row: token.row },
          to: { col: instr.coord.col, row: instr.coord.row },
          speed: token.speed || 12,
          progress: 0
        });
        break;
      }
      case "attack": {
        const attacker = working.tokens.find((t) => t.id.startsWith(instr.attackerId));
        const target = working.tokens.find((t) => t.id.startsWith(instr.targetId));
        if (!attacker || !target) {
          log(`Attack failed: missing ${!attacker ? instr.attackerId : instr.targetId}`);
          return;
        }
        state.activeEffects.push({
          id: `fx-${Date.now()}-${Math.random()}`,
          type: instr.attackType || "physical",
          fromTokenId: attacker.id,
          toTokenId: target.id,
          speed: instr.speed || 12,
          duration: instr.duration || 600,
          age: 0
        });
        break;
      }
      case "effect": {
        state.activeEffects.push({
          id: `fx-${Date.now()}-${Math.random()}`,
          type: instr.effectType || "magic",
          fromCoord: instr.at,
          toCoord: instr.at,
          speed: instr.speed || 12,
          duration: instr.duration || 600,
          age: 0
        });
        break;
      }
      case "remove": {
        removeToken(instr.tokenId);
        break;
      }
      case "clear": {
        if (instr.scope === "tokens") {
          working.tokens = [];
        } else {
          working = { map: null, tokenDefs: [], tokens: [], viewMode: "3d" };
          mapChanged = true;
        }
        break;
      }
      case "reset": {
        working = { map: null, tokenDefs: [], tokens: [], viewMode: "3d" };
        if (three.boardTexture) {
          three.boardTexture.dispose();
          three.boardTexture = null;
        }
        clearGroup(three.meshGroup);
        clearGroup(three.tokenGroup);
        mapChanged = true;
        break;
      }
      case "height": {
        instr.entries.forEach(({ col, row, h }) => setHeight(col, row, h));
        mapChanged = true;
        break;
      }
      case "height-rows": {
        const map = ensureMap();
        const rows = instr.rows || [];
        let maxCols = map.cols || 0;
        rows.forEach((rowStr, rowIdx) => {
          const vals = rowStr.split(",").map((v) => Number(v.trim()));
          vals.forEach((h, colIdx) => {
            if (Number.isFinite(h)) setHeight(colIdx, rowIdx, h);
          });
          if (vals.length > maxCols) maxCols = vals.length;
        });
        if (rows.length > (map.rows || 0)) map.rows = rows.length;
        if (maxCols > (map.cols || 0)) map.cols = maxCols;
        mapChanged = true;
        break;
      }
      case "remove-heightmap": {
        const map = ensureMap();
        map.heights = {};
        map.disableRandomHeights = true;
        state.heightMap.grid = [];
        mapChanged = true;
        break;
      }
      case "create": {
        const templateKey = instr.templateId;
        const templateKeyLower = templateKey?.toLowerCase();
        const templateKeyUpper = templateKey?.toUpperCase();
        const svgTemplate = instr.svgTemplateId || instr.templateId;
        // Prefer an existing sprite def that matches the templateId; otherwise fall back to built-ins.
        let def = working.tokenDefs.find(
          (d) =>
            d.id?.toLowerCase?.() === templateKeyLower ||
            d.code === templateKeyUpper ||
            d.id === templateKey ||
            d.code?.toLowerCase?.() === templateKeyLower
        );
        if (!def) {
          def = ensureTemplateDef(working, templateKeyLower || templateKey, addDef);
        }
        if (!def) {
          log(`Unknown template ${templateKey}`);
          return;
        }
        const map = ensureMap();
        const baseId = instr.kv.id || def.code;
        const initials = (instr.kv.initials || baseId.slice(0, 2)).toUpperCase().slice(0, 3);
        const svgKey = svgTemplate?.toLowerCase();
        const tplKey = templateKeyLower;
        const bg = instr.kv.bg || tokenTemplates[svgKey]?.bg || tokenTemplates[tplKey]?.bg;
        const fg = instr.kv.fg || tokenTemplates[svgKey]?.fg || tokenTemplates[tplKey]?.fg;
        const svgSource = tokenTemplates[svgKey] ? svgKey : tplKey || templateKey;
        const svgUrl = buildTemplateSvg(svgSource, { bg, fg, initials });
        const type = instr.kv.type || def.category || "Object";
        const size = Number(instr.kv.size) || def.baseSize || 1;
        const coords =
          instr.allCoords && map
            ? Array.from({ length: map.rows }, (_, r) =>
                Array.from({ length: map.cols }, (_, c) => ({ col: c, row: r }))
              ).flat()
            : instr.coords;
        const existingCount = working.tokens.filter((t) => t.id.startsWith(baseId)).length;
        coords.forEach((coord, idx) => {
          upsertToken({
            id: `${baseId}-${existingCount + idx + 1}`,
            defId: def.id,
            mapId: map.id,
            col: coord.col,
            row: coord.row,
            initials,
            svgUrl,
            speed: Number(instr.kv.speed) || def.speed || 12,
            type,
            size
          });
        });
        break;
      }
      default:
        break;
    }
  });

  ensureRandomHeights(working.map);
  state.map = working.map;
  state.tokenDefs = working.tokenDefs;
  state.tokens = working.tokens;
  renderTokensWindow();
  if (mapChanged) logClass?.("INFO", "Map updated");
  if (state.map?.backgroundUrl) {
    setBackground(state.map.backgroundUrl);
    log(`Applied ${instructions.length} instruction(s)`);
    return;
  }
  if (!state.map) {
    log(`Applied ${instructions.length} instruction(s)`);
    return;
  }
  updateBoardScene();
  render();
  log(`Applied ${instructions.length} instruction(s)`);
};

const setBackground = (url) => {
  if (!url) {
    log("No background URL provided");
    return;
  }
  if (textureToggle) {
    textureToggle.checked = true;
    localStorage.setItem("show-texture", "true");
  }
  state.map = state.map || {
    id: "default",
    name: "Default",
    gridSizePx: 48,
    gridType: "square",
    cols: 20,
    rows: 12,
    backgroundUrl: ""
  };
  state.map.backgroundUrl = url;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    // Match the canvas to the image, but clamp to GPU texture limits to avoid GL_INVALID_VALUE uploads.
    const detectMaxTex = () => {
      if (three.renderer?.capabilities?.maxTextureSize) return three.renderer.capabilities.maxTextureSize;
      // Fallback query if renderer not ready yet.
      try {
        const gl =
          webglCanvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
          webglCanvas.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ||
          webglCanvas.getContext("experimental-webgl");
        if (gl) return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
      } catch {}
      return 2048;
    };
    const maxTexSize = detectMaxTex();
    // If map dims and grid size are known, target the canvas to the map geometry; otherwise base on image.
    let targetW = img.width;
    let targetH = img.height;
    if (state.map.cols && state.map.rows && state.map.gridSizePx) {
      if (state.map.gridType === "hex") {
        const sqrt3 = Math.sqrt(3);
        targetW = sqrt3 * (state.map.cols + 0.5) * state.map.gridSizePx;
        targetH = (1.5 * state.map.rows + 0.5) * state.map.gridSizePx;
      } else {
        targetW = state.map.cols * state.map.gridSizePx;
        targetH = state.map.rows * state.map.gridSizePx;
      }
    }
    const scale =
      maxTexSize && Math.max(targetW, targetH) > maxTexSize
        ? maxTexSize / Math.max(targetW, targetH)
        : 1;
    const drawW = Math.max(1, Math.round(targetW * scale));
    const drawH = Math.max(1, Math.round(targetH * scale));
    textureCanvas.width = drawW;
    textureCanvas.height = drawH;
    textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
    textureCtx.drawImage(img, 0, 0, drawW, drawH);
    logClass?.(
      "INFO",
      `Background loaded ${img.width}x${img.height}, target=${targetW.toFixed(1)}x${targetH.toFixed(
        1
      )} drawn ${drawW}x${drawH}`
    );
    logClass?.(
      "BUILD",
      `app.js:540 maxTex=${maxTexSize || "?"} scale=${scale.toFixed(4)} final=${drawW}x${drawH}`
    );
    // If cols/rows are known, infer gridSize from texture width; keep declared rows/cols to avoid distortion.
    if (state.map.cols > 0) {
      if (state.map.gridType === "hex") {
        const sqrt3 = Math.sqrt(3);
        const s = textureCanvas.width / (sqrt3 * (state.map.cols + 0.5));
        state.map.gridSizePx = s;
        logClass?.(
          "BUILD",
          `app.js:548 Inferred hex size=${s.toFixed(2)} from tex ${img.width}x${img.height} cols=${state.map.cols}`
        );
      } else {
        const cell = textureCanvas.width / state.map.cols;
        state.map.gridSizePx = cell;
        logClass?.(
          "BUILD",
          `app.js:552 Inferred square size=${cell.toFixed(2)} from tex ${img.width}x${img.height} cols=${state.map.cols}`
        );
      }
    }
    overlayGridOnTexture(state.map);
    cropTextureToOverlay();
    updateBoardScene();
    render();
  };
  img.onerror = () => {
    logClass?.("ERROR", `Failed to load background ${url}`);
    log(`Failed to load background ${url}`);
    render();
  };
  img.src = url;
  log(`Background set: ${url}`);
};


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
const { initThree, updateBoardScene, clearGroup, render3d, resizeRenderer, updateEffects3d } = sceneBuilder;
const cameraManager = createCameraManager({ three, state, textureCanvas, clamp, logClass });

const ensureRandomHeights = (map) => {
  if (!map) return;
  if (map.disableRandomHeights) return;
  const hasHeights = map.heights && Object.keys(map.heights).length > 0;
  if (hasHeights) return;
  map.heights = {};
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      // Default to flat surface when no heights are provided to avoid unintended wobble.
      map.heights[`${c},${r}`] = 0;
    }
  }
};
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

const buildScriptTree = async (entries) => {
  if (!scriptTreeEl) return;
  isBuildingTree = true;
  scriptTreeEl.innerHTML = "";
  const savedTreeState = safeJsonParse(localStorage.getItem("script-tree-state") || "{}", {});
  const openSet = new Set(savedTreeState.open || []);
  const checkedSet = new Set(savedTreeState.checked || []);
  scriptManifest.clear();
  const includeTests = showTestToggle ? showTestToggle.checked : false;
  const dirMeta = new Map();
  entries.forEach((entry) => {
    if (entry?.dir) {
      dirMeta.set(entry.dir.split("/")[0], { testOnly: !!entry.testOnly });
    }
  });
  const root = {};
  entries.forEach((entry) => {
    if (!entry?.file) return;
    const topDir = entry.file.split("/")[0];
    const topDirMeta = dirMeta.get(topDir);
    if ((entry.testOnly || topDirMeta?.testOnly) && !includeTests) return;
    scriptManifest.set(entry.file, entry.type || "script");
    const parts = entry.file.split("/");
    let node = root;
    parts.forEach((part, idx) => {
      if (!node[part]) node[part] = { children: {}, entries: [] };
      if (idx === parts.length - 1) node[part].entries.push(entry);
      node = node[part].children;
    });
  });

  const renderNode = (name, nodeObj, path) => {
    const details = document.createElement("details");
    details.open = openSet.has(path) || openSet.size === 0; // default open unless stored closed
    details.dataset.path = path;
    const summary = document.createElement("summary");
    summary.textContent = name;
    summary.addEventListener("click", async () => {
      // On opening, populate textarea with the first file under this folder
      if (details.open) return; // already open; this click will close
      const first = nodeObj.entries?.[0];
      if (!first) return;
      try {
        const res = await fetch(`scripts/${first.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (inputEl) inputEl.value = text.trim();
        logClass?.("INFO", `Loaded script ${first.file} into editor`);
      } catch (err) {
        log(`Failed to load script ${first.file}: ${err.message}`);
      }
    });
    details.appendChild(summary);
    details.addEventListener("toggle", () => {
      persistTreeState();
    });

    // Files directly under this folder
    nodeObj.entries.forEach((entry) => {
      const leaf = document.createElement("div");
      leaf.className = "script-leaf";
      leaf.dataset.file = entry.file;
      leaf.dataset.type = entry.type || "script";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "script-check";
      checkbox.checked = checkedSet.has(entry.file);
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        persistTreeState();
      });
      const info = document.createElement("span");
      info.className = "info";
      info.textContent = `${entry.name || entry.file} (${(entry.type || "script").toUpperCase()})`;
      leaf.appendChild(checkbox);
      leaf.appendChild(info);
      leaf.addEventListener("click", async () => {
        if (selectedLeaf) selectedLeaf.classList.remove("selected");
        selectedLeaf = leaf;
        leaf.classList.add("selected");
        safeStorageSet(SELECTED_ROW_KEY, entry.file);
        await loadScriptIntoEditor(entry.file);
      });
      details.appendChild(leaf);
    });

    // Child directories
    Object.keys(nodeObj.children)
      .sort()
      .forEach((childName) => {
        const childPath = `${path}/${childName}`;
        details.appendChild(renderNode(childName, nodeObj.children[childName], childPath));
      });
    return details;
  };

  Object.keys(root)
    .sort()
    .forEach((key) => {
      scriptTreeEl.appendChild(renderNode(key, root[key], key));
    });
  isBuildingTree = false;
  // Auto-run once on initial load
  if (!treeAutoRunDone) {
    treeAutoRunDone = true;
    runSelectedScripts({ runIfNoneFallback: false });
  }

  // Restore last selected row into editor
  const lastSelected = safeStorageGet(SELECTED_ROW_KEY, null);
  if (lastSelected) {
    const targetLeaf = scriptTreeEl.querySelector(`.script-leaf[data-file="${lastSelected}"]`);
    if (targetLeaf) {
      if (selectedLeaf) selectedLeaf.classList.remove("selected");
      selectedLeaf = targetLeaf;
      selectedLeaf.classList.add("selected");
      await loadScriptIntoEditor(lastSelected);
    }
  }
};

const persistTreeState = () => {
  if (!scriptTreeEl) return;
  const open = Array.from(scriptTreeEl.querySelectorAll("details[data-path]"))
    .filter((d) => d.open)
    .map((d) => d.dataset.path);
  const checked = Array.from(scriptTreeEl.querySelectorAll(".script-check"))
    .filter((c) => c.checked)
    .map((c) => c.closest(".script-leaf")?.dataset?.file || c.dataset.file || "")
    .filter(Boolean);
  const payload = { open, checked };
  safeStorageSet("script-tree-state", JSON.stringify(payload));
};

const loadScriptManifest = async () => {
  try {
    const res = await fetch("scripts/index.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) await buildScriptTree(data);
  } catch (err) {
    console.warn("Failed to load scripts/index.json", err);
  }
};

const getCheckedScripts = () => {
  const nodes = scriptTreeEl ? Array.from(scriptTreeEl.querySelectorAll(".script-check:checked")) : [];
  return nodes
    .map((cb) => {
      const leaf = cb.closest(".script-leaf");
      if (!leaf) return null;
      return {
        file: leaf.dataset.file,
        type: leaf.dataset.type || scriptManifest.get(leaf.dataset.file) || "script"
      };
    })
    .filter((v) => v && v.file);
};

const loadScriptIntoEditor = async (file) => {
  if (!file) return;
  try {
    const res = await fetch(`scripts/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (inputEl) inputEl.value = text.trim();
    logClass?.("INFO", `Loaded script ${file} into editor`);
  } catch (err) {
    log(`Failed to load script ${file}: ${err.message}`);
  }
};

const runSelectedScripts = async ({ runIfNoneFallback = true } = {}) => {
  const checked = getCheckedScripts();
  if (!checked.length) {
    if (runIfNoneFallback) runCurrentScript();
    return;
  }
  const priority = { map: 0, pop: 1, move: 2, script: 3 };
  const ordered = [...checked].sort((a, b) => (priority[a.type] ?? 3) - (priority[b.type] ?? 3));
  for (const item of ordered) {
    try {
      const res = await fetch(`scripts/${item.file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const instructions = parseScript(text, { logClass });
      if (!instructions.length) {
        log(`No instructions in ${item.file}`);
        continue;
      }
      applyInstructions(instructions);
      logClass?.("INFO", `Ran ${item.type} script ${item.file}`);
    } catch (err) {
      log(`Failed to run ${item.file}: ${err.message}`);
    }
  }
};

let lastAnimTime = null;
const stepActiveMoves = (dt) => {
  let changed = false;
  state.activeMoves = state.activeMoves.filter((move) => {
    const token = state.tokens.find((t) => t.id.startsWith(move.tokenId));
    if (!token) return false;
    const dx = move.to.col - token.col;
    const dz = move.to.row - token.row;
    const dist = Math.hypot(dx, dz);
    const speed = Math.max(0.01, token.speed || move.speed || 12);
    if (dist < 1e-4) {
      token.col = move.to.col;
      token.row = move.to.row;
      changed = true;
      return false;
    }
    const step = speed * dt * (state.moveSpeedScale || 1);
    const ratio = Math.min(1, step / dist);
    token.col += dx * ratio;
    token.row += dz * ratio;
    changed = true;
    if (ratio >= 1) {
      token.col = move.to.col;
      token.row = move.to.row;
      return false;
    }
    return true;
  });
  return changed;
};

const tick = (ts) => {
  if (lastAnimTime == null) lastAnimTime = ts;
  const dt = (ts - lastAnimTime) / 1000;
  lastAnimTime = ts;
  const moved = stepActiveMoves(dt);
  if (state.lastBoard) {
    const { boardWidth, boardDepth, surfaceY, cellUnit } = state.lastBoard;
    if (moved) {
      sceneBuilder.updateTokens3d(boardWidth, boardDepth, surfaceY, cellUnit);
      render3d();
    }
    state.activeEffects = state.activeEffects.filter((fx) => {
      fx.age += dt * (state.moveSpeedScale || 1);
      return fx.age <= (fx.duration || 600);
    });
    updateEffects3d(boardWidth, boardDepth, surfaceY, cellUnit);
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

const runCurrentScript = () => {
  const instructions = parseScript(inputEl.value, { logClass });
  if (!instructions.length) {
    log("No instructions parsed");
    return;
  }
  applyInstructions(instructions);
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
  applyInstructions([{ type: "clear", scope: "tokens" }]);
});

const syncHeatControls = () => {
  heatHeightValue.textContent = `${state.heightMap.heightScale.toFixed(1)}x`;
};

const syncMoveSpeedControls = () => {
  moveSpeedValue.textContent = `${state.moveSpeedScale.toFixed(2)}x`;
};

const renderTokensWindow = () => {
  if (!tokensBody) return;
  const lines = (state.tokens || [])
    .map((t) => {
      const col = Number.isFinite(t.col) ? t.col.toFixed(2) : t.col;
      const row = Number.isFinite(t.row) ? t.row.toFixed(2) : t.row;
      return `${t.id} (${t.defId}) @ (${col},${row}) speed=${t.speed || 0}`;
    })
    .sort((a, b) => a.localeCompare(b));
  tokensBody.textContent = lines.join("\n");
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
initThree();
updateBoardScene();
cameraManager.applySavedCamera();
cameraManager.attachControlListeners(render3d);
render();
loadScriptManifest();

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
    loadScriptManifest();
  });
}

if (arenaGridToggle) {
  arenaGridToggle.checked = !!savedArenaGrid;
}

refreshCamSlotIndicators();

refreshCamSlotIndicators();
