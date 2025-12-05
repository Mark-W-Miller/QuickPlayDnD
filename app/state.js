const safeJsonParse = (val, fallback) => {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

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
    showMesh: true,
    heightScale: 3,
    grid: [],
    maxHeight: 1
  },
  overlayCenters: new Map(),
  selectedTokenIds: new Set(),
  activeMoves: [],
  activeEffects: [],
  moveSpeedScale: 1,
  showModels: true,
  lastBoard: null,
  overlayBounds: null,
  cameraBounds: null,
  selectionCells: new Set(),
  cameraResetPending: false
};

export { state, safeJsonParse, safeStorageGet, safeStorageSet };
