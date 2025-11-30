import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

export const createSceneBuilder = ({
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
}) => {
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

  const buildTokenMesh = (token, cellHeight, boardWidth, boardDepth, cellUnit) => {
    const def = state.tokenDefs.find((d) => d.id === token.defId);
    if (!def) return null;
    const radius = Math.max(0.2, def.baseSize * cellUnit * 0.35);
    const height = Math.max(0.2, cellUnit * 0.2);
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 24);
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
    if (logClass) logClass("DIM", `cellW=${cellW.toFixed(3)} cellH=${cellH.toFixed(3)}`);
    // Stagger hex rows: odd rows shift right by half a cell, even rows stay centered.
    let hexOffset = 0;
    if (token.row % 2 === 0) hexOffset = 0.5; // odd rows shift left
    else hexOffset = 0; // even rows shift right
    const x = (token.col + hexOffset + 0.5) * cellW;
    const effRow = clamp(token.row + 1, 0, state.map.rows - 1);
    const z = (effRow + 0.5) * cellH;
    const yOffset = cellUnit * 0.02;
    mesh.position.set(x, cellHeight + yOffset, z);
    return mesh;
  };

  const getSurfaceHeightAt = (col, row, boardWidth, boardDepth, surfaceY, cellUnit) => {
    const effRow = clamp(row, 0, state.map.rows - 1);
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

  const render3d = () => {
    if (!three.renderer || !three.scene || !three.camera) return;
    three.renderer.render(three.scene, three.camera);
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
    three.controls.addEventListener("change", render3d);

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

    three.meshGroup = new THREE.Group();
    three.meshGroup.renderOrder = 2;
    three.tokenGroup = new THREE.Group();
    three.scene.add(three.meshGroup);
    three.scene.add(three.tokenGroup);

    resizeRenderer();
    window.addEventListener("resize", resizeRenderer);
  };

  const updateBoardScene = () => {
    if (!three.renderer) initThree();
    if (!state.map || !three.renderer) return;
    const map = state.map;
    const texW = textureCanvas.width || 0;
    const texH = textureCanvas.height || 0;
    const boardWidth = Math.max(1, texW || map.cols * map.gridSizePx);
    const boardDepth = Math.max(1, texH || map.rows * map.gridSizePx);
    logClass("DIM", `board ${boardWidth.toFixed(1)}x${boardDepth.toFixed(1)} tex ${texW}x${texH}`);
    const maxCellHeight = Math.max(0, ...Object.values(map.heights || {}));
    const surfaceY = maxCellHeight > 0 ? Math.min(map.gridSizePx * 0.5, maxCellHeight * map.gridSizePx * 0.05) : 0;

    three.boardMesh.geometry.dispose();
    three.boardMesh.geometry = new THREE.PlaneGeometry(boardWidth, boardDepth, 32, 32);
    three.boardMesh.rotation.set(-Math.PI / 2, 0, 0);
    three.boardMesh.position.set(boardWidth / 2, surfaceY + 0.001, boardDepth / 2);

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
        three.boardTexture = new THREE.CanvasTexture(textureCanvas);
        three.boardTexture.colorSpace = THREE.SRGBColorSpace;
        three.boardTexture.wrapS = three.boardTexture.wrapT = THREE.ClampToEdgeWrapping;
        three.boardTexture.anisotropy = 4;
        three.boardTexture.generateMipmaps = false;
        three.boardTexture.minFilter = THREE.LinearFilter;
        three.boardTexture.magFilter = THREE.LinearFilter;
      } else {
        three.boardTexture.needsUpdate = true;
      }
    } else if (three.boardTexture) {
      three.boardTexture.dispose();
      three.boardTexture = null;
    }
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
    }

    if (three.controls && !three.restoredCamera) {
      const target = new THREE.Vector3(boardWidth / 2, surfaceY + 0.25, boardDepth / 2);
      three.controls.target.copy(target);
      three.controls.update();
    }
    resizeRenderer();
  };

  return {
    clearGroup,
    buildTokenMesh,
    getSurfaceHeightAt,
    updateTokens3d,
    render3d,
    resizeRenderer,
    initThree,
    updateBoardScene
  };
};
