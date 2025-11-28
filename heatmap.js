import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

export const updateHeatmapFromHeights = (state, map) => {
  if (!map) return;
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

export const sampleHeatHeight = (state, u, v) => {
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

export const rebuildHeatMesh = (three, state, boardWidth, boardDepth, surfaceY, cellUnit, textureToggle) => {
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
    const height = sampleHeatHeight(state, x, z);
    position.setY(i, surfaceY + cellUnit * 0.1 + height * state.heatmap.heightScale * cellUnit * 0.25);
  }
  geometry.computeVertexNormals();
  const shouldTexture = textureToggle ? textureToggle.checked : true;
  const material = new THREE.MeshStandardMaterial({
    color: shouldTexture && three.boardTexture ? 0xffffff : 0x9aa4b5,
    map: shouldTexture ? three.boardTexture || null : null,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.6
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  three.meshGroup.add(mesh);
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
