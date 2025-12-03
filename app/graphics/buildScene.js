import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

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
  const formatTokenLabel = (t) => {
    if (!t) return "unknown";
    const col = Number.isFinite(t.col) && t.col % 1 !== 0 ? t.col.toFixed(2) : t.col;
    const row = Number.isFinite(t.row) && t.row % 1 !== 0 ? t.row.toFixed(2) : t.row;
    return `${t.id || "unnamed"} @ (${col},${row})`;
  };
  // Cache token face textures (SVG data URLs) to avoid reloading each frame.
  const textureLoader = new THREE.TextureLoader();
  const tokenTextureCache = new Map();
  const getTokenTexture = (svgUrl) => {
    if (!svgUrl) return null;
    if (tokenTextureCache.has(svgUrl)) return tokenTextureCache.get(svgUrl);
    const tex = textureLoader.load(
      svgUrl,
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.wrapS = loaded.wrapT = THREE.ClampToEdgeWrapping;
        loaded.needsUpdate = true;
        requestTokenRefresh();
      },
      undefined,
      () => {}
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tokenTextureCache.set(svgUrl, tex);
    return tex;
  };

  // Cache GLB models for 3D tokens.
  const gltfLoader = new GLTFLoader();
  const modelCache = new Map();
  let modelLoadChain = Promise.resolve();
  const getModelEntry = (url) => {
    if (!url) return null;
    if (modelCache.has(url)) return modelCache.get(url);
    const entry = { scene: null, bbox: null, promise: null };
    logClass("3DLOAD", `Start loading model ${url}`);
    entry.promise = modelLoadChain = modelLoadChain
      .then(
        () =>
          new Promise((resolve, reject) => {
            gltfLoader.load(
              url,
              (gltf) => {
                entry.scene = gltf.scene || gltf.scenes?.[0];
                entry.bbox = new THREE.Box3().setFromObject(entry.scene);
                const size = new THREE.Vector3();
                entry.bbox.getSize(size);
                logClass(
                  "3DLOAD",
                  `Loaded ${url} size(${size.x.toFixed(2)},${size.y.toFixed(2)},${size.z.toFixed(2)})`
                );
                resolve(entry);
              },
              undefined,
              (err) => {
                logClass("3DLOAD", `Failed to load ${url}: ${err?.message || err}`);
                reject(err);
              }
            );
          })
      )
      .catch((err) => {
        // Do not break the chain on failure.
        logClass("3DLOAD", `Model load chain error ${url}: ${err?.message || err}`);
        return entry;
      });
    modelCache.set(url, entry);
    return entry;
  };

  // Refresh tokens when async model finishes loading.
  let updateTokensRef = null;
  let renderRef = null;
  const requestTokenRefresh = () => {
    if (!state.lastBoard || !updateTokensRef) return;
    const { boardWidth, boardDepth, surfaceY, cellUnit } = state.lastBoard;
    updateTokensRef(boardWidth, boardDepth, surfaceY, cellUnit);
    renderRef && renderRef();
  };
  // Attach logger to state so downstream utilities (heightmap) can log without guards.
  state.logClass = logClass || (() => {});
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

  const computeGridPlacement = (token, boardWidth, boardDepth) => {
    const cellW = boardWidth / state.map.cols;
    const cellH = boardDepth / state.map.rows;
    const x = (token.col + 0.5) * cellW;
    const effRow = clamp(token.row, 0, state.map.rows - 1);
    const z = (effRow + 0.5) * cellH;
    return { x, z, cellW, cellH };
  };

  const computeHexPlacement = (token, boardWidth, boardDepth) => {
    // Smooth placement based on overlay bounds; avoid snapping to centers so animation stays continuous.
    const ob = state.overlayBounds;
    const cols = state.map.cols;
    const rows = state.map.rows;
    const originX = ob.minX;
    const originY = ob.minY;
    const spanW = ob.width;
    const spanH = ob.height;
    const cellW = spanW / (cols + 0.5);
    const cellH = spanH / (rows + 0.5);
    const rowBase = Math.floor(token.row);
    const isOdd = rowBase % 2 !== 1;
    const rowOffset = isOdd ? 0 : cellW * 0.5;
    const x = originX + (token.col + 0.5) * cellW + rowOffset;
    const z = 15+ (originY + (token.row + 0.5) * cellH) * 1.005;
    return { x, z, cellW, cellH };
  };

  const buildTokenMesh = (token, boardWidth, boardDepth, surfaceY, cellUnit) => {
    logClass(
      "3DLOAD",
      `Build Token: ${formatTokenLabel(token)} board=${boardWidth.toFixed(2)}x${boardDepth.toFixed(
        2
      )} grid=${state.map.gridType} cols=${state.map.cols} rows=${state.map.rows} size=${state.map.gridSizePx?.toFixed?.(
        2
      )}`
    );
    const def = state.tokenDefs.find((d) => d.id === token.defId);
    if (!def) {
      logClass("3DLOAD", "No def found for token");
      return null;
    }
    const placement = state.map.gridType === "hex"
      ? computeHexPlacement(token, boardWidth, boardDepth)
      : computeGridPlacement(token, boardWidth, boardDepth);
    if (logClass)
      logClass(
        "BUILD",
        `placement: x=${placement.x.toFixed(3)} z=${placement.z.toFixed(3)} cellW=${placement.cellW?.toFixed?.(
          3
        )} cellH=${placement.cellH?.toFixed?.(3)}`
      );

    // Sample surface height and normal at token center.
    const u = THREE.MathUtils.clamp(placement.x / Math.max(1, boardWidth), 0, 1);
    const v = THREE.MathUtils.clamp(placement.z / Math.max(1, boardDepth), 0, 1);
    const surfaceHeightAt = (ux, vz) => {
      const hNorm = sampleHeightMap(state, ux, vz);
      const baseLift = 0;
      const scale = cellUnit * 0.6;
      return surfaceY + baseLift + hNorm * state.heightMap.heightScale * scale;
    };
    const hCenter = surfaceHeightAt(u, v);
    const deltaU = 1 / Math.max(8 * state.map.cols, boardWidth || 1);
    const deltaV = 1 / Math.max(8 * state.map.rows, boardDepth || 1);
    const hL = surfaceHeightAt(Math.max(0, u - deltaU), v);
    const hR = surfaceHeightAt(Math.min(1, u + deltaU), v);
    const hD = surfaceHeightAt(u, Math.max(0, v - deltaV));
    const hU = surfaceHeightAt(u, Math.min(1, v + deltaV));
    const dx = (hR - hL) / (2 * deltaU * Math.max(1, boardWidth));
    const dz = (hU - hD) / (2 * deltaV * Math.max(1, boardDepth));
    const normal = new THREE.Vector3(-dx, 1, -dz).normalize();
    const tokenSize = token.size || def.baseSize || 1;
    const isStructure = (token.type || def.category || "").toString().toLowerCase() === "structure";
    const isSelected = state.selectedTokenIds?.has(token.id);

    // Build base disk (skip for structures).
    const faceTexture = getTokenTexture(token.svgUrl || def.svgUrl);
    const radius = Math.max(0.2, tokenSize * cellUnit * 0.35);
    const height = Math.max(0.2, cellUnit * 0.3); // 1.5x taller base
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 24);
    const color = new THREE.Color(def.colorTint || "#ffffff");
    const topBottomMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff), // keep caps neutral so SVG colors stay true
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.25,
      metalness: 0.1,
      roughness: 0.4,
      map: faceTexture || null
    });
    const sideMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#b59b2a"), // dull yellow sides
      emissive: new THREE.Color("#b59b2a"),
      emissiveIntensity: 0.6,
      metalness: 0.05,
      roughness: 0.8
    });
    if (isSelected) {
      const glow = new THREE.Color("#4da3ff");
      topBottomMat.emissive = glow;
      topBottomMat.emissiveIntensity = 1.4;
      sideMat.emissive = glow;
      sideMat.emissiveIntensity = 1.4;
    }
    const baseMesh = new THREE.Mesh(geometry, [sideMat, topBottomMat, topBottomMat]);
    baseMesh.castShadow = true;

    const baseGroup = new THREE.Group();
    if (!isStructure) baseGroup.add(baseMesh);

    // If a model URL is provided, add it on top of the disk (never replace the disk).
    if (def.modelUrl && state.showModels !== false) {
      logClass("3DLOAD", `Attempt model ${def.modelUrl}`);
      const entry = getModelEntry(def.modelUrl);
      if (!entry) return baseGroup;
      if (!entry.scene) {
        logClass("3DLOAD", `Model pending for ${def.modelUrl} — will retry on load`);
        entry.promise
          ?.then(() => requestTokenRefresh())
          .catch(() => {});
        // Show base disk immediately even while model loads.
        baseGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const yOffsetPending = 0;
        baseGroup.position.set(placement.x, hCenter + yOffsetPending + (isStructure ? 0 : height / 2), placement.z);
        return baseGroup;
      }
      logClass("3DLOAD", `Using cached model ${def.modelUrl}`);
      const clone = entry.scene.clone(true);
      clone.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
          if (n.material) {
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            mats.forEach((m) => {
              if (m.emissive?.setScalar) m.emissive.setScalar(0.3);
              if (m.emissiveIntensity !== undefined) m.emissiveIntensity = Math.max(0.9, m.emissiveIntensity || 0);
              if (m.color?.convertSRGBToLinear) m.color.convertSRGBToLinear();
              if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
              m.needsUpdate = true;
            });
          }
          if (n.material?.clone) n.material = n.material.clone();
        }
      });
      const bbox = entry.bbox || new THREE.Box3().setFromObject(clone);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxXZ = Math.max(size.x, size.z, 1e-3);
      const desired = radius * 2 * 0.9;
      const scale = desired / maxXZ;
      clone.scale.setScalar(scale);
      const minY = bbox.min.y * scale;
      const topY = isStructure ? 0 : height / 2;
      const yOffsetModel = isStructure ? -minY : topY - minY;
      logClass(
        "3DLOAD",
        `Model place scale=${scale.toFixed(3)} minY=${minY.toFixed(3)} topY=${topY.toFixed(3)}`
      );
      clone.position.set(0, yOffsetModel, 0);
      baseGroup.add(clone);
    }

    if (isStructure) {
      // Structures sit flat at center height.
      baseGroup.quaternion.identity();
      baseGroup.position.set(placement.x, hCenter, placement.z);
    } else {
      baseGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      const yOffset = 0;
      baseGroup.position.set(placement.x, hCenter + yOffset + height / 2, placement.z);
    }
    baseGroup.userData.tokenId = token.id;
    return baseGroup;
  };

  const updateTokens3d = (boardWidth, boardDepth, surfaceY, cellUnit) => {
    if (!three.tokenGroup) return;
    clearGroup(three.tokenGroup);
    state.tokens.forEach((token) => {
      const mesh = buildTokenMesh(token, boardWidth, boardDepth, surfaceY, cellUnit);
      if (mesh) three.tokenGroup.add(mesh);
    });
  };
  updateTokensRef = updateTokens3d;

  const updateEffects3d = (boardWidth, boardDepth, surfaceY, cellUnit) => {
    if (!three.effectGroup) return;
    clearGroup(three.effectGroup);
    const makeBall = (color) =>
      new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.1, cellUnit * 0.15), 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 })
      );
    const getPos = (coord) => {
      if (!coord) return null;
      if (state.map.gridType === "hex") {
        const cols = Math.max(1, state.map.cols || 1);
        const rows = Math.max(1, state.map.rows || 1);
        const cellW = boardWidth / (cols + 0.5);
        const cellH = boardDepth / (rows + 0.5);
        const isOdd = coord.row % 2 !== 0;
        const rowOffset = isOdd ? cellW * 0.5 : -cellW * 0.5;
        const effRow = clamp(coord.row + 1, 0, rows - 1);
        return {
          x: (coord.col + 0.5) * cellW + rowOffset,
          z: (effRow + 0.5) * cellH
        };
      }
      const cellW = boardWidth / state.map.cols;
      const cellH = boardDepth / state.map.rows;
      const effRow = clamp(coord.row + 1, 0, state.map.rows - 1);
      return { x: (coord.col + 0.5) * cellW, z: (effRow + 0.5) * cellH };
    };
    const surfaceHeightAt = (x, z) => {
      const u = THREE.MathUtils.clamp(x / Math.max(1, boardWidth), 0, 1);
      const v = THREE.MathUtils.clamp(z / Math.max(1, boardDepth), 0, 1);
      const hNorm = sampleHeightMap(state, u, v);
    const baseLift = 0;
      const scale = cellUnit * 0.6;
      return surfaceY + baseLift + hNorm * state.heightMap.heightScale * scale;
    };

    (state.activeEffects || []).forEach((fx) => {
      let from = null;
      let to = null;
      if (fx.fromTokenId) {
        const t = state.tokens.find((tk) => tk.id === fx.fromTokenId);
        if (t) from = { col: t.col, row: t.row };
      }
      if (fx.toTokenId) {
        const t = state.tokens.find((tk) => tk.id === fx.toTokenId);
        if (t) to = { col: t.col, row: t.row };
      }
      if (fx.fromCoord) from = fx.fromCoord;
      if (fx.toCoord) to = fx.toCoord;
      const fromPos = getPos(from || to);
      const toPos = getPos(to || from);
      if (!fromPos || !toPos) return;
      const tNorm = Math.min(1, Math.max(0, fx.age / (fx.duration || 600)));
      const x = fromPos.x + (toPos.x - fromPos.x) * tNorm;
      const z = fromPos.z + (toPos.z - fromPos.z) * tNorm;
      const y = surfaceHeightAt(x, z) + cellUnit * 0.05;
      const color = fx.type === "magic" ? 0x66ccff : 0xffaa55;
      const ball = makeBall(color);
      ball.position.set(x, y, z);
      ball.material.opacity = 0.5 + 0.5 * (1 - tNorm);
      three.effectGroup.add(ball);
    });
  };

  const render3d = () => {
    if (!three.renderer || !three.scene || !three.camera) return;
    three.renderer.render(three.scene, three.camera);
  };
  renderRef = render3d;

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

    three.renderer = new THREE.WebGLRenderer({
      canvas: webglCanvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true // reduce z-fighting when zoomed out
    });
    three.renderer.outputColorSpace = THREE.SRGBColorSpace;
    three.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    three.renderer.toneMappingExposure = 1.2;
    three.renderer.shadowMap.enabled = true;
    three.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    three.renderer.setPixelRatio(window.devicePixelRatio || 1);

    const rect = mapPanel.getBoundingClientRect();
    // Use a slightly larger near plane for better depth precision; far will be tightened per board size.
    three.camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 50000);
    three.camera.position.set(5.5, 9, 5.5);

    three.controls = new OrbitControls(three.camera, three.renderer.domElement);
    three.controls.enablePan = true;
    three.controls.enableDamping = false;
    three.controls.minDistance = 0.01;
    three.controls.maxDistance = 400;
    three.controls.minPolarAngle = -Math.PI; // allow full under-orbit
    three.controls.maxPolarAngle = Math.PI;  // allow full over-orbit
    three.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    three.controls.addEventListener("change", render3d);

    three.ambient = new THREE.AmbientLight(0xffffff, 1.7);
    three.scene.add(three.ambient);

    three.directional = new THREE.DirectionalLight(0xffffff, 2.8);
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
    three.effectGroup = new THREE.Group();
    three.scene.add(three.meshGroup);
    three.scene.add(three.tokenGroup);
    three.scene.add(three.effectGroup);

    resizeRenderer();
    window.addEventListener("resize", resizeRenderer);
  };

  const updateBoardScene = () => {
    if (!three.renderer) initThree();
    if (!state.map || !three.renderer) return;
    const map = state.map;
    const texW = textureCanvas.width || 0;
    const texH = textureCanvas.height || 0;
    const cellSize = map.gridSizePx || 1;
    let boardWidth = 1;
    let boardDepth = 1;
    if (map.gridType === "hex") {
      const bounds = state.overlayBounds;
      if (bounds && bounds.width && bounds.height) {
        boardWidth = bounds.width;
        boardDepth = bounds.height;
        logClass(
          "BUILD",
          `buildScene: using overlay bounds for board size ${boardWidth.toFixed(1)}x${boardDepth.toFixed(1)}`
        );
      } else {
        const sqrt3 = Math.sqrt(3);
        boardWidth = Math.max(1, sqrt3 * (map.cols + 0.5) * cellSize);
        boardDepth = Math.max(1, (1.5 * map.rows + 0.5) * cellSize);
      }
    } else {
      boardWidth = Math.max(1, map.cols * cellSize);
      boardDepth = Math.max(1, map.rows * cellSize);
    }
    logClass(
      "BUILD",
      `buildScene: board=${boardWidth.toFixed(1)}x${boardDepth.toFixed(1)} tex=${texW}x${texH} cols=${map.cols} rows=${map.rows} size=${map.gridSizePx?.toFixed?.(
        2
      )} gridType=${map.gridType} overlay=${
        state.overlayBounds
          ? `min(${state.overlayBounds.minX.toFixed(1)},${state.overlayBounds.minY.toFixed(
              1
            )}) max(${state.overlayBounds.maxX.toFixed(1)},${state.overlayBounds.maxY.toFixed(1)}) size(${state.overlayBounds.width.toFixed(
              1
            )}x${state.overlayBounds.height.toFixed(1)})`
          : "none"
      }`
    );
    const maxCellHeight = Math.max(0, ...Object.values(map.heights || {}));
    const surfaceY = maxCellHeight > 0 ? Math.min(map.gridSizePx * 0.5, maxCellHeight * map.gridSizePx * 0.05) : 0;
    state.lastBoard = { boardWidth, boardDepth, surfaceY, cellUnit: boardWidth / state.map.cols };

    three.boardMesh.geometry.dispose();
    three.boardMesh.geometry = new THREE.PlaneGeometry(boardWidth, boardDepth, 32, 32);
    three.boardMesh.rotation.set(-Math.PI / 2, 0, 0);
    three.boardMesh.position.set(boardWidth / 2, surfaceY + 0.001, boardDepth / 2);

    const boardMaterial = three.boardMesh.material;
    boardMaterial.emissive = new THREE.Color(0x111111);
    boardMaterial.emissiveIntensity = 0.05;
    const shouldTexture = textureToggle ? textureToggle.checked : true;
    const texReady = map.backgroundUrl && textureCanvas.width > 0 && textureCanvas.height > 0;
    const useFlatTexture = shouldTexture && texReady && !state.heightMap.showMesh;
    logClass(
      "BUILD",
      `buildScene: shouldTex=${shouldTexture} texReady=${texReady} useFlat=${useFlatTexture} heightMesh=${state.heightMap.showMesh}`
    );
    if (shouldTexture && !texReady) {
      logClass("ERROR", `Texture not ready: canvas ${texW}x${texH}, url=${map.backgroundUrl || "none"}`);
    }
    const wrapGlUpload = (fn, label = "texture upload") => {
      try {
        fn();
        const gl = three.renderer?.getContext?.();
        if (gl) {
          const err = gl.getError();
          if (err && err !== gl.NO_ERROR) {
            const texImgW = three.boardTexture?.image?.width || 0;
            const texImgH = three.boardTexture?.image?.height || 0;
            const msg = `WebGL error after ${label}: 0x${err.toString(
              16
            )} canvas=${textureCanvas.width}x${textureCanvas.height} texImg=${texImgW}x${texImgH} board=${boardWidth.toFixed(
              1
            )}x${boardDepth.toFixed(1)} cols=${map.cols} rows=${map.rows} size=${map.gridSizePx?.toFixed?.(
              2
            )} url=${map.backgroundUrl || "none"}`;
            logClass("ERROR", msg);
            console.error(msg);
          }
        }
      } catch (e) {
        const msg = `Texture upload failed during ${label}: ${e.message || e}`;
        logClass("ERROR", msg);
        console.error(msg);
      }
    };

    if (texReady) {
      // Always recreate to avoid stale dimensions causing GL errors.
      wrapGlUpload(() => {
        if (three.boardTexture) three.boardTexture.dispose();
        three.boardTexture = new THREE.CanvasTexture(textureCanvas);
        three.boardTexture.colorSpace = THREE.SRGBColorSpace;
        three.boardTexture.wrapS = three.boardTexture.wrapT = THREE.ClampToEdgeWrapping;
        three.boardTexture.anisotropy = 4;
        three.boardTexture.generateMipmaps = false;
        three.boardTexture.minFilter = THREE.LinearFilter;
        three.boardTexture.magFilter = THREE.LinearFilter;
      }, "texture recreate");
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
    // Base board only shows when the height mesh is hidden (texture lives there in that case).
    three.boardMesh.visible = !state.heightMap.showMesh;
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

    if (three.controls && three.camera) {
      const sceneRadius = Math.max(boardWidth, boardDepth);
      // Tighten clip range to improve depth precision and reduce z-fighting.
      three.camera.near = 0.1;
      three.camera.far = Math.max(sceneRadius * 6, 200);
      three.camera.updateProjectionMatrix();
      three.controls.minDistance = 0.1;
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
    updateTokens3d,
    render3d,
    resizeRenderer,
    initThree,
    updateBoardScene,
    updateEffects3d
  };
};
