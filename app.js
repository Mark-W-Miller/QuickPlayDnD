import * as THREE from "three";
import { buildAxisArena } from "./axes.js";
import { updateHeightMapFromHeights, sampleHeightMap, rebuildHeightMesh } from "./heightmap.js";
import { tokenTemplates, buildTemplateSvg, ensureTemplateDef } from "./tokens.js";
import { initLogger } from "./logger.js";
import { createCameraManager } from "./camera.js";
import { createSceneBuilder } from "./buildScene.js";

const canvas = document.getElementById("map-canvas");
const inputEl = document.getElementById("script-input");
const scriptPicker = document.getElementById("script-picker");
const arenaGridToggle = document.getElementById("arena-grid");
const textureToggle = document.getElementById("show-texture");
const heightToggle = document.getElementById("show-height");
const overlayGridToggle = document.getElementById("show-overlay-grid");
const overlayLabelToggle = document.getElementById("show-overlay-labels");
const debugToggle = document.getElementById("show-debug");
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
const savedDebugScripts = (() => {
  return safeJsonParse(localStorage.getItem("show-debug-scripts") || "false", false);
})();
const savedScriptPath = (() => {
  try {
    return localStorage.getItem("last-script-path");
  } catch {
    return null;
  }
})();
const savedMapScript = (() => {
  try {
    return localStorage.getItem("last-map-script");
  } catch {
    return null;
  }
})();
const savedPopScript = (() => {
  try {
    return localStorage.getItem("last-pop-script");
  } catch {
    return null;
  }
})();
const fallbackScript = `
# Provide your own script here
`;
const heatHeightSlider = document.getElementById("heat-height");
const heatHeightValue = document.getElementById("heat-height-value");
const mapPanel = document.querySelector(".map-panel");
const appEl = document.querySelector(".app");
const resizer = document.getElementById("sidebar-resizer");
const camSlotButtons = document.querySelectorAll("[data-cam-slot]");
const clearCamViewsBtn = document.getElementById("clear-cam-views");
const currentMapLabel = document.getElementById("current-map-label");

const textureCanvas = document.createElement("canvas");
const textureCtx = textureCanvas.getContext("2d", { willReadFrequently: true });

const webglCanvas = document.createElement("canvas");
webglCanvas.id = "map-webgl";
mapPanel.appendChild(webglCanvas);
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
  }
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

const coordToIndex = (coord) => {
  const match = /^([A-Z])(\d+)$/i.exec(coord.trim());
  if (!match) return null;
  const [, colChar, rowStr] = match;
  return { col: colChar.toUpperCase().charCodeAt(0) - 65, row: Number(rowStr) - 1 };
};

const parseKeyValues = (input) => {
  const regex = /(\w+)=("[^"]*"|'[^']*'|[^\s]+)/g;
  const out = {};
  let m;
  while ((m = regex.exec(input)) !== null) {
    const [, key, rawVal] = m;
    out[key.toLowerCase()] = rawVal.replace(/^['"]|['"]$/g, "");
  }
  return out;
};

const overlayGridOnTexture = (map) => {
  if (!textureCtx || !textureCanvas || !map || !textureCanvas.width || !textureCanvas.height) return;
  if (overlayGridToggle && !overlayGridToggle.checked) return;
  const cols = Math.max(1, map.cols || 1);
  const rows = Math.max(1, map.rows || 1);
  textureCtx.save();
  textureCtx.strokeStyle = "rgba(255,255,255,0.35)";
  textureCtx.lineWidth = 1;
  if (map.gridType === "hex") {
    const sqrt3 = Math.sqrt(3);
    // Fit width exactly; rows may extend or clip vertically as needed.
    const s = Math.max(1, textureCanvas.width / (sqrt3 * (cols + 0.5)));
    const hexW = sqrt3 * s;
    const hexH = 2 * s;
    const rowStep = hexH * 0.75;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = hexW * (c + 0.5 * (r & 1)) + hexW / 2;
        const cy = rowStep * r + hexH / 2;
        textureCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i + Math.PI / 6;
          const px = cx + s * Math.cos(ang);
          const py = cy + s * Math.sin(ang);
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
  }
  textureCtx.restore();
};

const parseScript = (script) => {
  const lines = script.split(/\r?\n/);
  const instructions = [];
  let pendingHeight = "";

  const flushHeight = () => {
    if (!pendingHeight.trim()) return;
    instructions.push({ type: "height-raw", raw: pendingHeight });
    pendingHeight = "";
  };

  for (const raw of lines) {
    logClass("PARSE", `Line: "${raw}"`);
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    let match;
    if ((match = /^BACKGROUND\s+(.+)$/i.exec(line))) {
      instructions.push({ type: "background", url: match[1].trim() });
      continue;
    }
    if ((match = /^GRID\s+(square|hex)\s+SIZE\s+(\d+)$/i.exec(line))) {
      instructions.push({ type: "grid", grid: match[1].toLowerCase(), size: Number(match[2]) });
      continue;
    }
    if ((match = /^BOARD\s+(\d+)[xX](\d+)$/i.exec(line))) {
      instructions.push({ type: "board", cols: Number(match[1]), rows: Number(match[2]) });
      continue;
    }
    if ((match = /^SPRITE\s+DEF\s+(\w+)\s+(.+)$/i.exec(line))) {
      const code = match[1].toUpperCase();
      const kv = parseKeyValues(match[2]);
      instructions.push({
        type: "sprite-def",
        def: {
          id: code,
          code,
          name: kv.name || code,
          category: kv.category || "Object",
          svgUrl: kv.url || kv.svg || "",
          baseSize: kv.size ? Number(kv.size) : 1,
          colorTint: kv.tint
        }
      });
      continue;
    }
    if ((match = /^PLACE\s+(\w+)\s+@\s+([A-Z0-9,\s]+)$/i.exec(line))) {
      const code = match[1].toUpperCase();
      const coords = match[2]
        .split(",")
        .map((c) => coordToIndex(c))
        .filter(Boolean);
      if (coords.length) instructions.push({ type: "place", code, coords });
      continue;
    }
    if ((match = /^CREATE\s+(\w[\w-]+)\s+(.+?)\s+@\s+([A-Z0-9,\s]+)$/i.exec(line))) {
      const templateId = match[1];
      const kv = parseKeyValues(match[2]);
      const coords = match[3]
        .split(",")
        .map((c) => coordToIndex(c))
        .filter(Boolean);
      if (coords.length) {
        instructions.push({
          type: "create",
          templateId,
          kv,
          coords
        });
      }
      continue;
    }
    if ((match = /^HEIGHT\s*(.*)$/i.exec(line))) {
      // Finish any prior HEIGHT block before starting a new one.
      flushHeight();
      pendingHeight = match[1].trim();
      continue;
    }
    // Continuation lines for HEIGHT data (lines that look like coord=val pairs).
    if (/^[A-Z]\d+=/i.test(line) && pendingHeight !== "") {
      pendingHeight = `${pendingHeight},${line}`;
      continue;
    }
    // On any other instruction, flush accumulated HEIGHT data first.
    flushHeight();
    // Debug log for every instruction line we recognized so far.
    if ((match = /^MOVE\s+(\w+)\s+TO\s+([A-Z]\d+)$/i.exec(line))) {
      const coord = coordToIndex(match[2]);
      if (coord) instructions.push({ type: "move", tokenId: match[1], coord });
      continue;
    }
    if ((match = /^REMOVE\s+(\w+)$/i.exec(line))) {
      instructions.push({ type: "remove", tokenId: match[1] });
      continue;
    }
    if (/^REMOVE\s+HEIGHTMAP$/i.test(line)) {
      instructions.push({ type: "remove-heightmap" });
      continue;
    }
    if ((match = /^CLEAR\s+(TOKENS|ALL)$/i.exec(line))) {
      instructions.push({ type: "clear", scope: match[1].toLowerCase() });
      continue;
    }
    if (/^RESET$/i.test(line)) {
      instructions.push({ type: "reset" });
      continue;
    }
  }
  flushHeight();
  return instructions;
};

const applyInstructions = (instructions) => {
  let working = JSON.parse(JSON.stringify(state));

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
        break;
      }
      case "grid": {
        const map = ensureMap();
        working.map = { ...map, gridType: instr.grid, gridSizePx: instr.size };
        break;
      }
      case "board": {
        const map = ensureMap();
        working.map = { ...map, cols: instr.cols, rows: instr.rows };
        ensureRandomHeights(working.map);
        break;
      }
      case "sprite-def": {
        addDef(instr.def);
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
            row: coord.row
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
        upsertToken({ ...token, col: instr.coord.col, row: instr.coord.row });
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
        break;
      }
      case "height": {
        instr.entries.forEach(({ col, row, h }) => setHeight(col, row, h));
        break;
      }
      case "remove-heightmap": {
        const map = ensureMap();
        map.heights = {};
        map.disableRandomHeights = true;
        state.heightMap.grid = [];
        break;
      }
      case "create": {
        const def = ensureTemplateDef(working, instr.templateId, addDef);
        if (!def) {
          log(`Unknown template ${instr.templateId}`);
          return;
        }
        const baseId = instr.kv.id || def.code;
        const initials = (instr.kv.initials || baseId.slice(0, 2)).toUpperCase().slice(0, 3);
        const bg = instr.kv.bg || tokenTemplates[instr.templateId]?.bg;
        const fg = instr.kv.fg || tokenTemplates[instr.templateId]?.fg;
        const svgUrl = buildTemplateSvg(instr.templateId, { bg, fg, initials });
        const existingCount = working.tokens.filter((t) => t.id.startsWith(baseId)).length;
        instr.coords.forEach((coord, idx) => {
          upsertToken({
            id: `${baseId}-${existingCount + idx + 1}`,
            defId: def.id,
            mapId: working.map.id,
            col: coord.col,
            row: coord.row,
            initials,
            svgUrl
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
  if (state.map?.backgroundUrl) {
    setBackground(state.map.backgroundUrl, { silent: true });
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

const setBackground = (url, opts = {}) => {
  const { silent } = opts;
  if (!url) {
    if (!silent) log("No background URL provided");
    return;
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
    // Match the canvas exactly to the image; lets the board size follow the texture.
    textureCanvas.width = img.width;
    textureCanvas.height = img.height;
    textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
    textureCtx.drawImage(img, 0, 0, img.width, img.height);
    // If cols/rows are known, update grid size so cell spacing matches the new texture width.
    if (state.map.cols > 0) {
      state.map.gridSizePx = textureCanvas.width / state.map.cols;
      if (state.map.gridType === "hex") {
        const sqrt3 = Math.sqrt(3);
        const s = textureCanvas.width / (sqrt3 * (state.map.cols + 0.5));
        const hexH = 2 * s;
        const rowStep = hexH * 0.75;
        const rowsFromTex = Math.ceil((textureCanvas.height - hexH) / rowStep) + 1;
        if (rowsFromTex !== state.map.rows) {
          state.map.rows = rowsFromTex;
          logClass("DIM", `app.js:554 Adjusted hex rows=${rowsFromTex} from texture ${img.width}x${img.height}`);
        }
      } else {
        const colsFromTex = Math.ceil(textureCanvas.width / state.map.gridSizePx);
        const rowsFromTex = Math.ceil(textureCanvas.height / state.map.gridSizePx);
        if (colsFromTex !== state.map.cols || rowsFromTex !== state.map.rows) {
          state.map.cols = colsFromTex;
          state.map.rows = rowsFromTex;
          logClass(
            "DIM",
            `app.js:561 Adjusted board to cols=${colsFromTex} rows=${rowsFromTex} from texture ${img.width}x${img.height}`
          );
        }
      }
    }
    overlayGridOnTexture(state.map);
    updateBoardScene();
    render();
  };
  img.onerror = () => {
    if (!silent) log("Failed to load background");
    render();
  };
  img.src = url;
  if (!silent) log(`Background set: ${url}`);
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
const { initThree, updateBoardScene, clearGroup, render3d, resizeRenderer } = sceneBuilder;
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

const runCurrentScript = () => {
  const instructions = parseScript(inputEl.value);
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
      if (meta.type === "map" && currentMapLabel) currentMapLabel.textContent = "Fallback map";
      if (autoRun) runCurrentScript();
    } else {
      log(`Failed to load example ${path}: ${err.message}`);
    }
  }
};

document.getElementById("run-btn").addEventListener("click", () => {
  runCurrentScript();
});

if (scriptPicker) {
  const defaultScripts = [
    { file: "map-hex.txt", type: "map", name: "Hex Board" },
    { file: "map-grid.txt", type: "map", name: "Grid Board" },
    { file: "pop-first-team.txt", type: "pop", name: "First Team" },
    { file: "pop-templates.txt", type: "pop", name: "Template Samples" },
    { file: "move-templates.txt", type: "move", name: "Template Moves" }
  ];
  const populateScripts = async () => {
    let entries = defaultScripts;
    try {
      const res = await fetch("scripts/index.json");
      if (res.ok) {
        const parsed = await res.json();
        if (Array.isArray(parsed) && parsed.length) entries = parsed;
      }
    } catch (err) {
      console.warn("Failed to load script manifest, using defaults", err);
    }
    scriptPicker.innerHTML = "";
    const debugOn = debugToggle ? debugToggle.checked : false;
    const savedVals = new Set([savedMapScript, savedPopScript, savedScriptPath].filter(Boolean));
    entries
      .filter((f) => f && f.file && f.file.endsWith(".txt"))
      .forEach((entry) => {
        const isDebug = !!entry.debug;
        if (!debugOn && isDebug && !savedVals.has(`scripts/${entry.file}`)) return;
        let labelPrefix = "Script:";
        if (entry.type === "map") labelPrefix = "Map:";
        else if (entry.type === "pop") labelPrefix = "Pop:";
        else if (entry.type === "move") labelPrefix = "Move:";
        const option = document.createElement("option");
        option.value = `scripts/${entry.file}`;
        option.dataset.type = entry.type || "script";
        option.dataset.debug = isDebug ? "true" : "false";
        option.textContent = `${labelPrefix} ${entry.name || entry.file}`;
        scriptPicker.appendChild(option);
      });

    const availableValues = entries.map((e) => `scripts/${e.file}`);
    const pickExisting = (val) => (val && availableValues.includes(val) ? val : null);
    const mapChoice = pickExisting(savedMapScript) || pickExisting("scripts/map-hex.txt") || scriptPicker.options[0]?.value;
    const popChoice =
      pickExisting(savedPopScript) ||
      availableValues.find((v) => entries.find((e) => `scripts/${e.file}` === v && e.type === "pop")) ||
      null;

    // Run map first, then pop. Keep picker on pop if we ran one, else on map.
    if (mapChoice) {
      scriptPicker.value = mapChoice;
      const type = scriptPicker.selectedOptions[0]?.dataset?.type || "script";
      loadExampleScript(mapChoice, fallbackScript, true, { type });
    }
    if (popChoice) {
      scriptPicker.value = popChoice;
      const type = scriptPicker.selectedOptions[0]?.dataset?.type || "script";
      loadExampleScript(popChoice, fallbackScript, true, { type });
    }
  };

  populateScripts();
  scriptPicker.addEventListener("reload-scripts", populateScripts);
  scriptPicker.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val) {
      const type = e.target.selectedOptions[0]?.dataset?.type || "script";
      if (type === "map") {
        localStorage.setItem("last-map-script", val);
        if (currentMapLabel) currentMapLabel.textContent = val;
      } else if (type === "pop") {
        localStorage.setItem("last-pop-script", val);
      } else {
        localStorage.setItem("last-script-path", val);
      }
      loadExampleScript(val, fallbackScript, true, { type });
    }
  });
}

document.getElementById("clear-btn").addEventListener("click", () => {
  applyInstructions([{ type: "clear", scope: "tokens" }]);
});

const syncHeatControls = () => {
  heatHeightValue.textContent = `${state.heightMap.heightScale.toFixed(1)}x`;
};

heatHeightSlider.addEventListener("input", (e) => {
  state.heightMap.heightScale = parseFloat(e.target.value) || 1;
  syncHeatControls();
  updateBoardScene();
  render();
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
  cameraManager.applyCameraPayload(parsed);
  render3d();
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

camSlotButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const slot = btn.getAttribute("data-cam-slot");
    const has = localStorage.getItem(`camera-slot-${slot}`);
    if (has) applyCamSlot(slot);
    else saveCamSlot(slot);
  })
);

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
    if (state.map?.backgroundUrl) setBackground(state.map.backgroundUrl, { silent: true });
    updateBoardScene();
    render();
  });
}
if (overlayLabelToggle) {
  overlayLabelToggle.checked = savedOverlayLabels;
  overlayLabelToggle.addEventListener("change", () => {
    localStorage.setItem("show-overlay-labels", overlayLabelToggle.checked);
    if (state.map?.backgroundUrl) setBackground(state.map.backgroundUrl, { silent: true });
    updateBoardScene();
    render();
  });
}
if (debugToggle) {
  debugToggle.checked = !!savedDebugScripts;
  debugToggle.addEventListener("change", () => {
    localStorage.setItem("show-debug-scripts", debugToggle.checked);
    if (scriptPicker && scriptPicker.options.length) {
      // Rebuild scripts list respecting debug toggle.
      scriptPicker.dispatchEvent(new Event("reload-scripts"));
    }
  });
}

// Sidebar drag-to-resize
if (resizer && appEl) {
  let isResizing = false;
  const minW = 240;
  const maxW = 520;
  const onMove = (e) => {
    if (!isResizing) return;
    const rect = appEl.getBoundingClientRect();
    const newWidth = clamp(e.clientX - rect.left, minW, maxW);
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
}

buildDefaultMap();
setBackground(state.map.backgroundUrl, { silent: true });
syncHeatControls();
initThree();
updateBoardScene();
cameraManager.applySavedCamera();
cameraManager.attachControlListeners(render3d);
render();

if (arenaGridToggle) {
  arenaGridToggle.checked = !!savedArenaGrid;
}

refreshCamSlotIndicators();

refreshCamSlotIndicators();
