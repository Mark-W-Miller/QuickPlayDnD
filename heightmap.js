import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

export const updateHeightMapFromHeights = (state, map) => {
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
  state.heightMap.maxThreat = Math.max(0.001, ...allThreat, 0.001);
  state.heightMap.maxSupport = Math.max(0.001, ...allSupport, 0.001);
  state.heightMap.grid = grid;
};

export const sampleHeightMap = (state, u, v) => {
  const x = clamp(u, 0, 1) * 7;
  const z = clamp(v, 0, 1) * 7;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = clamp(x0 + 1, 0, 7);
  const z1 = clamp(z0 + 1, 0, 7);
  const fx = smoothstep(x - x0);
  const fz = smoothstep(z - z0);
  const h00 = state.heightMap.grid[z0][x0];
  const h10 = state.heightMap.grid[z0][x1];
  const h01 = state.heightMap.grid[z1][x0];
  const h11 = state.heightMap.grid[z1][x1];
  const heightVal = (cell) =>
    Math.max(
      cell.threat / (state.heightMap.maxThreat || 1),
      cell.support / (state.heightMap.maxSupport || 1)
    );
  const hx0 = lerp(heightVal(h00), heightVal(h10), fx);
  const hx1 = lerp(heightVal(h01), heightVal(h11), fx);
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
    const baseLift = cellUnit * 0.05;
    const scale = cellUnit * 0.6; // larger vertical influence
    position.setY(i, surfaceY + baseLift + height * state.heightMap.heightScale * scale);
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
