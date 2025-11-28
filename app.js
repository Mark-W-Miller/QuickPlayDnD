import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("map-canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const logEl = document.getElementById("log");
const inputEl = document.getElementById("script-input");
const viewRadios = document.querySelectorAll('input[name="view-mode"]');
const camButtons = document.querySelectorAll("[data-cam]");
const heatHeightSlider = document.getElementById("heat-height");
const heatHeightValue = document.getElementById("heat-height-value");
const mapPanel = document.querySelector(".map-panel");
const appEl = document.querySelector(".app");
const resizer = document.getElementById("sidebar-resizer");

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
  viewMode: "2d",
  heatmap: {
    showVolumes: false,
    showMesh: true,
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
  pillarGroup: null,
  meshGroup: null,
  tokenGroup: null,
  ambient: null,
  directional: null,
  boardTexture: null
};

const log = (msg) => {
  const div = document.createElement("div");
  div.className = "log-entry";
  div.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
  logEl.prepend(div);
  while (logEl.children.length > 50) logEl.removeChild(logEl.lastChild);
};

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
    if ((match = /^TERRAIN\s+(.+)$/i.exec(line))) {
      const rows = match[1]
        .split(/[,|\/]/)
        .map((r) => r.trim())
        .filter(Boolean);
      if (rows.length) instructions.push({ type: "terrain", rows });
      continue;
    }
    if ((match = /^REMOVE\s+(\w+)$/i.exec(line))) {
      instructions.push({ type: "remove", tokenId: match[1] });
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
          working = { map: null, tokenDefs: [], tokens: [], viewMode: working.viewMode || "2d" };
        }
        break;
      }
      case "reset": {
        working = { map: null, tokenDefs: [], tokens: [], viewMode: "2d" };
        if (three.boardTexture) {
          three.boardTexture.dispose();
          three.boardTexture = null;
        }
        clearGroup(three.pillarGroup);
        clearGroup(three.meshGroup);
        clearGroup(three.tokenGroup);
        break;
      }
      case "height": {
        instr.entries.forEach(({ col, row, h }) => setHeight(col, row, h));
        break;
      }
      case "terrain": {
        const rows = instr.rows;
        if (!rows.length) break;
        const map = ensureMap();
        const heightRows = rows.map((r) => r.split("").map((ch) => charHeight(ch)));
        const maxCols = Math.max(...heightRows.map((r) => r.length));
        map.cols = maxCols;
        map.rows = heightRows.length;
        map.heights = {};
        heightRows.forEach((rowVals, rIdx) => {
          rowVals.forEach((val, cIdx) => {
            map.heights[`${cIdx},${rIdx}`] = val;
          });
        });
        working.map = map;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (three.renderer) {
      three.renderer.clear();
      three.boardMesh.visible = false;
      three.gridHelper.visible = false;
    }
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
    textureCanvas.width = state.map.cols * state.map.gridSizePx;
    textureCanvas.height = state.map.rows * state.map.gridSizePx;
    textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
    textureCtx.fillStyle = "#0a101a";
    textureCtx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
    const scale = Math.min(textureCanvas.width / img.width, textureCanvas.height / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const dx = (textureCanvas.width - drawW) / 2;
    const dy = (textureCanvas.height - drawH) / 2;
    textureCtx.drawImage(img, dx, dy, drawW, drawH);
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

const drawHex = (cx, cy, size, fill, stroke) => {
  const r = size / 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 3 * i + Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const charHeight = (ch) => {
  if (!ch) return 0;
  if (ch === "." || ch === "_" || ch === " ") return 0;
  if (/\d/.test(ch)) return clamp(Number(ch), 0, 20);
  const code = ch.toUpperCase().charCodeAt(0);
  if (code >= 65 && code <= 90) return clamp(10 + (code - 65), 0, 35);
  return 0;
};
const ensureRandomHeights = (map) => {
  if (!map) return;
  const hasHeights = map.heights && Object.keys(map.heights).length > 0;
  if (hasHeights) return;
  map.heights = {};
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      map.heights[`${c},${r}`] = Math.random() * 10;
    }
  }
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
  three.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000);
  three.camera.position.set(5.5, 9, 5.5);

  three.controls = new OrbitControls(three.camera, three.renderer.domElement);
  three.controls.enablePan = true;
  three.controls.enableDamping = false;
  three.controls.minDistance = 4;
  three.controls.maxDistance = 30;
  three.controls.minPolarAngle = 0.05;
  three.controls.maxPolarAngle = Math.PI / 2 - 0.05;
  three.controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };
  three.controls.addEventListener("change", () => {
    if (state.viewMode === "3d") render3d();
  });

  three.ambient = new THREE.AmbientLight(0xffffff, 0.65);
  three.scene.add(three.ambient);

  three.directional = new THREE.DirectionalLight(0xffffff, 0.9);
  three.directional.position.set(4, 8, 6);
  three.directional.castShadow = true;
  three.directional.shadow.mapSize.set(1024, 1024);
  three.directional.shadow.camera.near = 0.5;
  three.directional.shadow.camera.far = 40;
  three.scene.add(three.directional);

  three.boardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, side: THREE.DoubleSide })
  );
  three.boardMesh.rotation.x = -Math.PI / 2;
  three.boardMesh.receiveShadow = true;
  three.scene.add(three.boardMesh);

  three.gridHelper = new THREE.GridHelper(1, 8, 0x1f2937, 0x1f2937);
  three.gridHelper.position.y = 0.002;
  three.scene.add(three.gridHelper);

  three.pillarGroup = new THREE.Group();
  three.meshGroup = new THREE.Group();
  three.meshGroup.renderOrder = 2;
  three.tokenGroup = new THREE.Group();
  three.scene.add(three.pillarGroup);
  three.scene.add(three.meshGroup);
  three.scene.add(three.tokenGroup);

  resizeRenderer();
  window.addEventListener("resize", resizeRenderer);
};

const resizeRenderer = () => {
  if (!three.renderer || !three.camera || !state.map) return;
  const size = computeViewportSize(state.map);
  three.renderer.setSize(size.pxW, size.pxH, false);
  three.camera.aspect = size.cssW / size.cssH;
  three.camera.updateProjectionMatrix();
  webglCanvas.style.width = `${size.cssW}px`;
  webglCanvas.style.height = `${size.cssH}px`;
  if (state.viewMode === "3d") render3d();
};

const updateHeatmapFromHeights = (map) => {
  const grid = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => ({ threat: 0, support: 0 }))
  );
  Object.entries(map.heights || {}).forEach(([key, val]) => {
    const [col, row] = key.split(",").map(Number);
    if (Number.isNaN(col) || Number.isNaN(row)) return;
    const gx = clamp(Math.floor((col / Math.max(1, map.cols)) * 8), 0, 7);
    const gz = clamp(Math.floor((row / Math.max(1, map.rows)) * 8), 0, 7);
    const threat = Math.max(0, val);
    const support = Math.max(0, -val);
    grid[gz][gx].threat = Math.max(grid[gz][gx].threat, threat);
    grid[gz][gx].support = Math.max(grid[gz][gx].support, support);
  });

  const allThreat = grid.flat().map((c) => c.threat);
  const allSupport = grid.flat().map((c) => c.support);
  state.heatmap.maxThreat = Math.max(0.001, ...allThreat, 0.001);
  state.heatmap.maxSupport = Math.max(0.001, ...allSupport, 0.001);
  state.heatmap.grid = grid;
};

const sampleHeatHeight = (u, v) => {
  const x = clamp(u, 0, 1) * 7;
  const z = clamp(v, 0, 1) * 7;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = clamp(x0 + 1, 0, 7);
  const z1 = clamp(z0 + 1, 0, 7);
  const fx = smoothstep(x - x0);
  const fz = smoothstep(z - z0);
  const h00 = state.heatmap.grid[z0][x0];
  const h10 = state.heatmap.grid[z0][x1];
  const h01 = state.heatmap.grid[z1][x0];
  const h11 = state.heatmap.grid[z1][x1];
  const heightVal = (cell) =>
    Math.max(
      cell.threat / (state.heatmap.maxThreat || 1),
      cell.support / (state.heatmap.maxSupport || 1)
    );
  const hx0 = lerp(heightVal(h00), heightVal(h10), fx);
  const hx1 = lerp(heightVal(h01), heightVal(h11), fx);
  return lerp(hx0, hx1, fz);
};

const rebuildPillars = (boardWidth, boardDepth, surfaceY) => {
  if (three.pillarGroup) clearGroup(three.pillarGroup);
};

const rebuildHeatMesh = (boardWidth, boardDepth, surfaceY) => {
  if (!three.meshGroup) return;
  clearGroup(three.meshGroup);
  if (!state.heatmap.showMesh) return;
  const subdivisions = 64;
  const geometry = new THREE.PlaneGeometry(boardWidth, boardDepth, subdivisions, subdivisions);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(boardWidth / 2, 0, boardDepth / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / boardWidth;
    const z = position.getZ(i) / boardDepth;
    const height = sampleHeatHeight(x, z);
    position.setY(i, surfaceY + 0.12 + height * state.heatmap.heightScale);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: three.boardTexture ? 0xffffff : 0x9aa4b5,
    map: three.boardTexture || null,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x020202)
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  three.meshGroup.add(mesh);
};

const buildTokenMesh = (token, cellHeight, boardWidth, boardDepth) => {
  const def = state.tokenDefs.find((d) => d.id === token.defId);
  if (!def) return null;
  const radius = Math.max(0.2, Math.min(0.5, def.baseSize * 0.35));
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.2, 20);
  const color = new THREE.Color(def.colorTint || "#ffffff");
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.25),
    metalness: 0.1,
    roughness: 0.35
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  const x = (token.col + 0.5) * (boardWidth / state.map.cols);
  const z = (token.row + 0.5) * (boardDepth / state.map.rows);
  mesh.position.set(x, cellHeight + 0.15, z);
  return mesh;
};

const getSurfaceHeightAt = (col, row, boardWidth, boardDepth, surfaceY) => {
  const u = (col + 0.5) / Math.max(1, state.map.cols);
  const v = (row + 0.5) / Math.max(1, state.map.rows);
  const h = sampleHeatHeight(u, v);
  return surfaceY + 0.12 + h * state.heatmap.heightScale;
};

const updateTokens3d = (boardWidth, boardDepth, surfaceY) => {
  if (!three.tokenGroup) return;
  clearGroup(three.tokenGroup);
  state.tokens.forEach((token) => {
    const cellHeight = getSurfaceHeightAt(token.col, token.row, boardWidth, boardDepth, surfaceY);
    const mesh = buildTokenMesh(token, cellHeight, boardWidth, boardDepth);
    if (mesh) three.tokenGroup.add(mesh);
  });
};

const updateBoardScene = () => {
  if (!three.renderer) initThree();
  if (!state.map || !three.renderer) return;
  const map = state.map;
  const boardWidth = Math.max(1, map.cols);
  const boardDepth = Math.max(1, map.rows);
  const maxCellHeight = Math.max(0, ...Object.values(map.heights || {}));
  const surfaceY = maxCellHeight > 0 ? Math.min(2, maxCellHeight * 0.3) : 0;

  three.boardMesh.geometry.dispose();
  three.boardMesh.geometry = new THREE.PlaneGeometry(boardWidth, boardDepth, 1, 1);
  three.boardMesh.rotation.set(-Math.PI / 2, 0, 0);
  three.boardMesh.position.set(boardWidth / 2, surfaceY + 0.001, boardDepth / 2);

  const boardMaterial = three.boardMesh.material;
  if (map.backgroundUrl && textureCanvas.width && textureCanvas.height) {
    if (!three.boardTexture) {
      three.boardTexture = new THREE.CanvasTexture(textureCanvas);
      three.boardTexture.colorSpace = THREE.SRGBColorSpace;
      three.boardTexture.wrapS = three.boardTexture.wrapT = THREE.ClampToEdgeWrapping;
      three.boardTexture.anisotropy = 4;
    } else {
      three.boardTexture.needsUpdate = true;
    }
    boardMaterial.map = three.boardTexture;
    boardMaterial.color = new THREE.Color(0xffffff);
    boardMaterial.side = THREE.DoubleSide;
  } else {
    if (three.boardTexture) {
      three.boardTexture.dispose();
      three.boardTexture = null;
    }
    boardMaterial.map = null;
    boardMaterial.color = new THREE.Color(0x0f172a);
  }
  boardMaterial.needsUpdate = true;

  three.gridHelper.scale.set(boardWidth, 1, boardDepth);
  three.gridHelper.position.set(boardWidth / 2, surfaceY + 0.01, boardDepth / 2);

  updateHeatmapFromHeights(map);
  rebuildPillars(boardWidth, boardDepth, surfaceY);
  rebuildHeatMesh(boardWidth, boardDepth, surfaceY);
  if (three.pillarGroup) three.pillarGroup.visible = !!state.heatmap.showVolumes;
  if (three.meshGroup) three.meshGroup.visible = !!state.heatmap.showMesh;
  // Only show the base plane when we don't have a textured mesh
  three.boardMesh.visible = !(state.heatmap.showMesh && three.boardTexture);
  updateTokens3d(boardWidth, boardDepth, surfaceY);

  const target = new THREE.Vector3(boardWidth / 2, surfaceY + 0.25, boardDepth / 2);
  three.controls.target.copy(target);
  three.controls.update();
  resizeRenderer();
};

const computeViewportSize = (map) => {
  const rect = mapPanel.getBoundingClientRect();
  const availW = rect.width || 800;
  const availH = rect.height || 600;
  const baseW = map.cols * map.gridSizePx;
  const baseH = map.rows * map.gridSizePx;
  const aspect = baseW / baseH || 1;
  let cssW = availW;
  let cssH = cssW / aspect;
  if (cssH > availH) {
    cssH = availH;
    cssW = cssH * aspect;
  }
  const dpr = window.devicePixelRatio || 1;
  return {
    cssW,
    cssH,
    pxW: Math.round(cssW * dpr),
    pxH: Math.round(cssH * dpr),
    scale: cssW / baseW
  };
};

const render2d = () => {
  const map = state.map;
  if (!map) return;
  if (!state.heatmap.grid?.length) updateHeatmapFromHeights(map);
  const size = computeViewportSize(map);
  const scaledCell = map.gridSizePx * size.scale;
  canvas.style.width = `${size.cssW}px`;
  canvas.style.height = `${size.cssH}px`;
  canvas.width = size.pxW;
  canvas.height = size.pxH;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (map.backgroundUrl) {
    ctx.globalAlpha = 0.95;
    ctx.drawImage(textureCanvas, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  } else {
    // Shade terrain based on heights when no background
    const maxH = Math.max(0.001, ...Object.values(map.heights || { 0: 0 }));
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const h = map.heights?.[`${c},${r}`] || 0;
        const t = clamp(h / maxH, 0, 1);
        const shade = Math.floor(40 + t * 80);
        ctx.fillStyle = `rgba(${shade + 10},${shade + 20},${shade + 40},0.5)`;
        const x = c * scaledCell;
        const y = r * scaledCell;
        ctx.fillRect(x, y, scaledCell, scaledCell);
      }
    }
  }

  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const x = c * scaledCell + scaledCell / 2 + (map.gridType === "hex" && r % 2 ? scaledCell / 2 : 0);
      const y = r * (map.gridType === "hex" ? scaledCell * 0.75 : scaledCell) + scaledCell / 2;
      if (map.gridType === "hex") {
        drawHex(x, y, scaledCell, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.08)");
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - scaledCell / 2, y - scaledCell / 2, scaledCell, scaledCell);
        ctx.fillRect(x - scaledCell / 2, y - scaledCell / 2, scaledCell, scaledCell);
      }
    }
  }

  state.tokens.forEach((token) => {
    const def = state.tokenDefs.find((d) => d.id === token.defId);
    if (!def) return;
    const x = token.col * scaledCell + scaledCell / 2 + (map.gridType === "hex" && token.row % 2 ? scaledCell / 2 : 0);
    const y = token.row * (map.gridType === "hex" ? scaledCell * 0.75 : scaledCell) + scaledCell / 2;
    const sizePx = scaledCell * def.baseSize;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, sizePx / 2, 0, Math.PI * 2);
    ctx.fillStyle = def.colorTint ? `${def.colorTint}55` : "#ffffff33";
    ctx.fill();
    ctx.strokeStyle = "#ffffffaa";
    ctx.stroke();
    ctx.clip();
    if (def.svgUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, -sizePx / 2, -sizePx / 2, sizePx, sizePx);
      };
      img.src = def.svgUrl;
    }
    ctx.restore();

    ctx.fillStyle = "#e9eef7";
    ctx.font = "12px monospace";
    ctx.fillText(token.id, x - sizePx / 2, y - sizePx / 2 - 4);
  });
};

const render3d = () => {
  if (!three.renderer || !three.scene || !three.camera) return;
  three.renderer.render(three.scene, three.camera);
};

const render = () => {
  const map = state.map;
  if (!map) return;
  canvas.style.display = state.viewMode === "2d" ? "block" : "none";
  webglCanvas.style.display = state.viewMode === "3d" ? "block" : "none";
  if (state.viewMode === "2d") {
    render2d();
  } else {
    resizeRenderer();
    render3d();
  }
};

const runCurrentScript = () => {
  const instructions = parseScript(inputEl.value);
  if (!instructions.length) {
    log("No instructions parsed");
    return;
  }
  applyInstructions(instructions);
};

const loadExampleScript = async (path, fallback) => {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    inputEl.value = text.trim();
    log(`Loaded example: ${path}`);
    runCurrentScript();
  } catch (err) {
    if (fallback) {
      inputEl.value = fallback.trim();
      log(`Loaded fallback example (failed to load ${path})`);
      runCurrentScript();
    } else {
      log(`Failed to load example ${path}: ${err.message}`);
    }
  }
};

document.getElementById("run-btn").addEventListener("click", () => {
  runCurrentScript();
});

document.getElementById("clear-btn").addEventListener("click", () => {
  applyInstructions([{ type: "clear", scope: "tokens" }]);
});

viewRadios.forEach((radio) =>
  radio.addEventListener("change", (e) => {
    state.viewMode = e.target.value;
    if (state.viewMode === "3d") {
      initThree();
      ensureRandomHeights(state.map);
      updateBoardScene();
      resizeRenderer();
    }
    render();
  })
);

const syncHeatControls = () => {
  heatHeightValue.textContent = `${state.heatmap.heightScale.toFixed(1)}x`;
};

heatHeightSlider.addEventListener("input", (e) => {
  state.heatmap.heightScale = parseFloat(e.target.value) || 1;
  syncHeatControls();
  updateBoardScene();
  render();
});

const setCameraPreset = (preset) => {
  if (!three.controls || !state.map) return;
  const map = state.map || { cols: 20, rows: 20 };
  const boardWidth = Math.max(1, map.cols);
  const boardDepth = Math.max(1, map.rows);
  const target = new THREE.Vector3(boardWidth / 2, 0, boardDepth / 2);
  const maxCellHeight = Math.max(0, ...Object.values(map.heights || {}));
  target.y = maxCellHeight > 0 ? Math.min(1.5, maxCellHeight * 0.2) : 0;

  const baseDistance = clamp(Math.max(boardWidth, boardDepth) * 0.9, 4, 30);
  const presets = {
    top: { theta: 0, phi: 0.28 },
    nw: { theta: -Math.PI / 4, phi: 0.95 },
    ne: { theta: Math.PI / 4, phi: 0.95 },
    sw: { theta: (-3 * Math.PI) / 4, phi: 0.95 },
    se: { theta: (3 * Math.PI) / 4, phi: 0.95 }
  };
  const presetAngles = presets[preset];
  if (!presetAngles) return;
  const phi = clamp(presetAngles.phi, three.controls.minPolarAngle, three.controls.maxPolarAngle);
  const spherical = new THREE.Spherical(baseDistance, phi, presetAngles.theta);
  const position = new THREE.Vector3().setFromSpherical(spherical).add(target);
  three.camera.position.copy(position);
  three.controls.target.copy(target);
  three.controls.update();
  if (state.viewMode === "3d") render3d();
};

camButtons.forEach((btn) =>
  btn.addEventListener("click", (e) => {
    setCameraPreset(e.target.getAttribute("data-cam"));
  })
);

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

syncHeatControls();
ensureRandomHeights(state.map);
initThree();
updateBoardScene();
render();

const fallbackScript = `
# Fallback square grid demo
BACKGROUND images/test-grid.svg
GRID square SIZE 56
BOARD 12x10
SPRITE DEF VC name="Vin Chi" url="https://upload.wikimedia.org/wikipedia/commons/3/3f/Chess_qdt45.svg" size=1 tint=#8b5cf6
SPRITE DEF DR name="Drake" url="https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_qlt45.svg" size=2 tint=#ef4444
PLACE VC @ B4,C4
PLACE DR @ H7
HEIGHT B4=3,C4=4,D5=2,E6=5,F6=4,H7=7
`;

loadExampleScript("examples/hex-demo.txt", fallbackScript);
