import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { buildAxisArena } from "./axes.js";
import { updateHeightMapFromHeights, sampleHeightMap, rebuildHeightMesh } from "./heightmap.js";
import { tokenTemplates, buildTemplateSvg, ensureTemplateDef } from "./tokens.js";
import { initLogger } from "./logger.js";
import { createCameraManager } from "./camera.js";

const canvas = document.getElementById("map-canvas");
const inputEl = document.getElementById("script-input");
const scriptPicker = document.getElementById("script-picker");
const arenaGridToggle = document.getElementById("arena-grid");
const textureToggle = document.getElementById("show-texture");
const heightToggle = document.getElementById("show-height");
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

const parseScript = (script) => {
  const lines = script.split(/\r?\n/);
  const instructions = [];
  for (const raw of lines) {
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
    if ((match = /^HEIGHT\s+(.+)$/i.exec(line))) {
      const pairs = match[1].split(",").map((p) => p.trim()).filter(Boolean);
      const entries = [];
      pairs.forEach((pair) => {
        const kvMatch = /^([A-Z]\d+)=(\-?\d+(?:\.\d+)?)$/i.exec(pair);
        if (kvMatch) {
          const coord = coordToIndex(kvMatch[1]);
          if (coord) entries.push({ ...coord, h: Number(kvMatch[2]) });
        }
      });
      if (entries.length) instructions.push({ type: "height", entries });
      continue;
    }
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
    }
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
const clearGroup = (group) => {
  if (!group) return;
  group.children.forEach((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose && m.dispose());
      else child.material.dispose && child.material.dispose();
    }
  });
  group.clear();
};

const initThree = () => {
  if (three.renderer) return;
  three.scene = new THREE.Scene();
  three.scene.background = new THREE.Color(0x0a101a);

  three.renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true });
  three.renderer.shadowMap.enabled = true;
  three.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  three.renderer.setPixelRatio(window.devicePixelRatio || 1);

  const rect = mapPanel.getBoundingClientRect();
  three.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.01, 5000);
  three.camera.position.set(5.5, 9, 5.5);

  three.controls = new OrbitControls(three.camera, three.renderer.domElement);
  three.controls.enablePan = true;
  three.controls.enableDamping = false;
  three.controls.minDistance = 4;
  three.controls.maxDistance = 200;
  three.controls.minPolarAngle = 0.05;
  three.controls.maxPolarAngle = Math.PI / 2 - 0.05;
  three.controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };

  three.ambient = new THREE.AmbientLight(0xffffff, 1.2);
  three.scene.add(three.ambient);

  three.directional = new THREE.DirectionalLight(0xffffff, 1.2);
  three.directional.position.set(4, 8, 6);
  three.directional.castShadow = true;
  three.directional.shadow.mapSize.set(1024, 1024);
  three.directional.shadow.camera.near = 0.5;
  three.directional.shadow.camera.far = 40;
  three.scene.add(three.directional);

  three.boardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.3
    })
  );
  three.boardMesh.rotation.x = -Math.PI / 2;
  three.boardMesh.receiveShadow = true;
  three.scene.add(three.boardMesh);

  const originGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, 0.02, 0),
    new THREE.Vector3(0.5, 0.02, 0),
    new THREE.Vector3(0, 0.02, -0.5),
    new THREE.Vector3(0, 0.02, 0.5)
  ]);
  const originMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
  three.originMarker = new THREE.LineSegments(originGeo, originMat);
  three.scene.add(three.originMarker);

  const size = 40;
  const divisions = 40;
  const xy = new THREE.GridHelper(size, divisions, 0xffff00, 0xffff00);
  xy.rotation.x = Math.PI / 2;
  xy.position.set(0, 0, 0);
  const yz = new THREE.GridHelper(size, divisions, 0xffffff, 0xffffff);
  yz.rotation.z = Math.PI / 2;
  yz.position.set(0, 0, 0);
  const xz = new THREE.GridHelper(size, divisions, 0x00ff88, 0x00ff88);
  xz.position.set(0, 0, 0);
  [xy, yz, xz].forEach((g) => {
    g.material.transparent = false;
    g.material.depthWrite = false;
    g.visible = false;
    three.scene.add(g);
  });
  three.arenaGrid = { xy, yz, xz };

  three.meshGroup = new THREE.Group();
  three.meshGroup.renderOrder = 2;
  three.tokenGroup = new THREE.Group();
  three.scene.add(three.meshGroup);
  three.scene.add(three.tokenGroup);

  resizeRenderer();
  window.addEventListener("resize", resizeRenderer);
};

const resizeRenderer = () => {
  if (!three.renderer || !three.camera || !state.map) return;
  const rect = mapPanel.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  three.renderer.setSize(w * dpr, h * dpr, false);
  three.camera.aspect = w / h;
  three.camera.updateProjectionMatrix();
  webglCanvas.style.width = `${w}px`;
  webglCanvas.style.height = `${h}px`;
  render3d();
};

const buildTokenMesh = (token, cellHeight, boardWidth, boardDepth, cellUnit) => {
  const def = state.tokenDefs.find((d) => d.id === token.defId);
  if (!def) return null;
  const radius = Math.max(0.2, def.baseSize * cellUnit * 0.35);
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.2, 20);
  const color = new THREE.Color(def.colorTint || "#ffffff");
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone(),
    emissiveIntensity: 1.5,
    metalness: 0.1,
    roughness: 0.35
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  const isHex = state.map.gridType === "hex";
  const cellW = boardWidth / state.map.cols;
  const cellH = boardDepth / state.map.rows;
  // Stagger hex rows: even rows shift left by half, odd rows shift right by half.
  let hexOffset = 0;
  if (isHex) {
    if (token.row % 2 === 0) hexOffset = 0.5; // odd rows shift left
    else hexOffset = 0; // even rows shift right
  }
  const x = (token.col + hexOffset + 0.5) * cellW;
  const effRow = clamp(token.row + 1, 0, state.map.rows - 1); // push tokens one row down
  const z = (effRow + 0.5) * cellH;
  // Keep tokens just above the surface to avoid z-fighting, not floating well above it.
  const yOffset = cellUnit * 0.02;
  mesh.position.set(x, cellHeight + yOffset + 1, z);
  return mesh;
};

const getSurfaceHeightAt = (col, row, boardWidth, boardDepth, surfaceY, cellUnit) => {
  const effRow = clamp(row + 1, 0, state.map.rows - 1); // match token row shift
  const u = (col + 0.5) / Math.max(1, state.map.cols);
  const v = (effRow + 0.5) / Math.max(1, state.map.rows);
  const h = sampleHeightMap(state, u, v);
  return surfaceY + cellUnit * 0.1 + h * state.heightMap.heightScale * cellUnit * 0.25;
};

const updateTokens3d = (boardWidth, boardDepth, surfaceY, cellUnit) => {
  if (!three.tokenGroup) return;
  clearGroup(three.tokenGroup);
  state.tokens.forEach((token) => {
    const cellHeight = getSurfaceHeightAt(token.col, token.row, boardWidth, boardDepth, surfaceY, cellUnit);
    const mesh = buildTokenMesh(token, cellHeight, boardWidth, boardDepth, cellUnit);
    if (mesh) three.tokenGroup.add(mesh);
  });
};

const updateBoardScene = () => {
  if (!three.renderer) initThree();
  if (!state.map || !three.renderer) return;
  const map = state.map;
  const texW = textureCanvas.width || 0;
  const texH = textureCanvas.height || 0;
  const boardWidth = Math.max(1, texW || map.cols * map.gridSizePx);
  const boardDepth = Math.max(1, texH || map.rows * map.gridSizePx);
  const maxCellHeight = Math.max(0, ...Object.values(map.heights || {}));
  const surfaceY = maxCellHeight > 0 ? Math.min(map.gridSizePx * 0.5, maxCellHeight * map.gridSizePx * 0.05) : 0;

  three.boardMesh.geometry.dispose();
  three.boardMesh.geometry = new THREE.PlaneGeometry(boardWidth, boardDepth, 32, 32);
  three.boardMesh.rotation.set(-Math.PI / 2, 0, 0);
  three.boardMesh.position.set(boardWidth / 2, surfaceY + 0.001, boardDepth / 2);

  // board wire removed

  const boardMaterial = three.boardMesh.material;
  boardMaterial.emissive = new THREE.Color(0x111111);
  boardMaterial.emissiveIntensity = 0.05;
  const shouldTexture = textureToggle ? textureToggle.checked : true;
  const texReady = shouldTexture && map.backgroundUrl && textureCanvas.width > 0 && textureCanvas.height > 0;
  const useFlatTexture = texReady && !state.heightMap.showMesh;
  if (texReady) {
    const needsRecreate =
      !three.boardTexture ||
      three.boardTexture.image?.width !== textureCanvas.width ||
      three.boardTexture.image?.height !== textureCanvas.height;
    if (needsRecreate) {
      if (three.boardTexture) three.boardTexture.dispose();
      if (textureCanvas.width > 0 && textureCanvas.height > 0) {
        three.boardTexture = new THREE.CanvasTexture(textureCanvas);
      } else {
        three.boardTexture = null;
      }
    }
    if (three.boardTexture) {
      three.boardTexture.colorSpace = THREE.SRGBColorSpace;
      three.boardTexture.wrapS = three.boardTexture.wrapT = THREE.ClampToEdgeWrapping;
      three.boardTexture.anisotropy = 4;
      three.boardTexture.generateMipmaps = false;
      three.boardTexture.minFilter = THREE.LinearFilter;
      three.boardTexture.magFilter = THREE.LinearFilter;
      three.boardTexture.needsUpdate = true;
    }
  } else if (three.boardTexture) {
    three.boardTexture.dispose();
    three.boardTexture = null;
  }
  // Base board shows texture only when the height mesh is hidden; otherwise it stays a dark plate.
  if (useFlatTexture && three.boardTexture) {
    boardMaterial.map = three.boardTexture;
    boardMaterial.color = new THREE.Color(0xffffff);
  } else {
    boardMaterial.map = null;
    boardMaterial.color = new THREE.Color(0x0f172a);
  }
  boardMaterial.side = THREE.DoubleSide;
  boardMaterial.needsUpdate = true;

  if (three.originMarker) {
    three.originMarker.position.set(0, surfaceY + 0.02, 0);
  }

  updateHeightMapFromHeights(state, map);
  const cellUnit = boardWidth / state.map.cols;
  rebuildHeightMesh(three, state, boardWidth, boardDepth, surfaceY, cellUnit, textureToggle, three.boardTexture);
  if (three.meshGroup) three.meshGroup.visible = !!state.heightMap.showMesh;
  three.boardMesh.visible = true;
  // no bottom wireframe
  if (three.arenaGrid) {
    const visible = arenaGridToggle?.checked;
    const g = three.arenaGrid;
    const scale = Math.max(boardWidth, boardDepth, map.gridSizePx * Math.max(map.cols, map.rows));
    const grids = g.xyMajor
      ? [g.xyMajor, g.xyMinor, g.yzMajor, g.yzMinor, g.xzMajor, g.xzMinor]
      : [g.xy, g.yz, g.xz];
    grids.forEach((grid) => {
      if (!grid) return;
      grid.visible = visible;
      grid.position.set(boardWidth / 2, surfaceY, boardDepth / 2);
      grid.scale.set(scale, scale, scale);
    });
  }
  updateTokens3d(boardWidth, boardDepth, surfaceY, cellUnit);

  if (three.controls) {
  const sceneRadius = Math.max(boardWidth, boardDepth);
  three.controls.minDistance = Math.max(4, sceneRadius * 0.2);
  three.controls.maxDistance = Math.max(sceneRadius, sceneRadius * 2.5);
  const camInfo = cameraManager.getLastSavedCamera ? cameraManager.getLastSavedCamera() : null;
  if (camInfo?.distance) {
    const dist = Math.max(0.1, camInfo.distance);
    three.controls.minDistance = Math.min(three.controls.minDistance, dist * 0.9);
    three.controls.maxDistance = Math.max(three.controls.maxDistance, dist * 1.1);
  }
  }

  if (three.controls && !three.restoredCamera) {
    const target = new THREE.Vector3(boardWidth / 2, surfaceY + 0.25, boardDepth / 2);
    three.controls.target.copy(target);
    three.controls.update();
  }
  resizeRenderer();
};

const render3d = () => {
  if (!three.renderer || !three.scene || !three.camera) return;
  three.renderer.render(three.scene, three.camera);
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
    entries
      .filter((f) => f && f.file && f.file.endsWith(".txt"))
      .forEach((entry) => {
        let labelPrefix = "Script:";
        if (entry.type === "map") labelPrefix = "Map:";
        else if (entry.type === "pop") labelPrefix = "Pop:";
        else if (entry.type === "move") labelPrefix = "Move:";
        const option = document.createElement("option");
        option.value = `scripts/${entry.file}`;
        option.dataset.type = entry.type || "script";
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
