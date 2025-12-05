import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

export const updateHeightMapFromHeights = (state, map) => {
  if (!map) return;
  const cols = Math.max(1, map.cols || 1);
  const rows = Math.max(1, map.rows || 1);
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ h: 0 }))
  );
  let maxHeight = 0;
  Object.entries(map.heights || {}).forEach(([key, val]) => {
    const [col, row] = key.split(",").map(Number);
    if (Number.isNaN(col) || Number.isNaN(row)) return;
    const gx = clamp(col, 0, cols - 1);
    const gz = clamp(row, 0, rows - 1);
    const h = Number(val) || 0;
    grid[gz][gx].h = h;
    if (h > maxHeight) maxHeight = h;
  });
  state.heightMap.maxHeight = Math.max(0.001, maxHeight);
  state.heightMap.grid = grid;
};

const zeroCell = { threat: 0, support: 0 };
const getGridCell = (grid, r, c) => {
  if (!Array.isArray(grid) || !grid.length) return zeroCell;
  const row = grid[r];
  if (!Array.isArray(row)) return zeroCell;
  return row[c] || zeroCell;
};

export const sampleHeightMap = (state, u, v) => {
  const grid = state.heightMap?.grid;
  if (!grid) return 0;
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  if (!rows || !cols) return 0;
  const maxX = Math.max(1, cols - 1);
  const maxZ = Math.max(1, rows - 1);
  const x = clamp(u, 0, 1) * maxX;
  const z = clamp(v, 0, 1) * maxZ;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = clamp(x0 + 1, 0, cols - 1);
  const z1 = clamp(z0 + 1, 0, rows - 1);
  const fx = smoothstep(x - x0);
  const fz = smoothstep(z - z0);
  const h00 = getGridCell(grid, z0, x0).h || 0;
  const h10 = getGridCell(grid, z0, x1).h || 0;
  const h01 = getGridCell(grid, z1, x0).h || 0;
  const h11 = getGridCell(grid, z1, x1).h || 0;
  const hx0 = lerp(h00, h10, fx);
  const hx1 = lerp(h01, h11, fx);
  return lerp(hx0, hx1, fz);
};

export const rebuildHeightMesh = (three, state, boardWidth, boardDepth, surfaceY, cellUnit, textureToggle, boardTexture) => {
  if (!three.meshGroup) return;
  state.logClass("BUILD", "heightmap.js:55 Rebuilding height mesh");
  clearGroup(three.meshGroup);
  const showWire = !!state.heightMap.showMesh;
  // number of segments for a smoother displacement surface
  const subdivisions = 64;
  // base grid
  const geometry = new THREE.PlaneGeometry(boardWidth, boardDepth, subdivisions, subdivisions);
  // lay flat on XZ
  geometry.rotateX(-Math.PI / 2);
  // center it to positive space
  geometry.translate(boardWidth / 2, 0, boardDepth / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    // normalize X to 0–1
    const x = position.getX(i) / boardWidth;
    // normalize Z to 0–1
    const z = position.getZ(i) / boardDepth;
    // sample procedural height
    const height = sampleHeightMap(state, x, z);
    // displace vertex up
    position.setY(i, surfaceY + height);
  }
  // fix lighting after displacement
  geometry.computeVertexNormals();
  const shouldTexture = textureToggle ? textureToggle.checked : true;

  const hasTexture = shouldTexture && !!boardTexture;
  // Textured surface mesh (shows the map) — unlit so the texture is not altered by lighting.
  if (hasTexture) {
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: boardTexture,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.FrontSide
    });
    const mesh = new THREE.Mesh(geometry, baseMaterial);
    mesh.renderOrder = 2;
    three.meshGroup.add(mesh);
  }

  // Underside grid so the bottom is a translucent red wireframe instead of a black plane.
  const undersideMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3333,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.BackSide
  });
  const undersideMesh = new THREE.Mesh(geometry.clone(), undersideMaterial);
  undersideMesh.renderOrder = 1;
  three.meshGroup.add(undersideMesh);

  // Wireframe overlay for the height mesh outline
  if (showWire) {
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xff5555,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    const wireMesh = new THREE.Mesh(geometry.clone(), wireMaterial);
    wireMesh.renderOrder = 3;
    three.meshGroup.add(wireMesh);
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
