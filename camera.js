import * as THREE from "three";

const safeJsonParse = (val, fallback) => {
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const parseCameraPayload = (payload) => {
  if (!payload) return null;
  const hasVec3 = (arr) => Array.isArray(arr) && arr.length === 3 && arr.every((v) => Number.isFinite(Number(v)));
  if (!hasVec3(payload.position) || !hasVec3(payload.target) || !Number.isFinite(Number(payload.distance || 0))) {
    return null;
  }
  return {
    position: payload.position.map(Number),
    target: payload.target.map(Number),
    distance: Number(payload.distance),
    azimuth: Number(payload.azimuth ?? 0),
    polar: Number(payload.polar ?? Math.PI / 4),
    up: hasVec3(payload.up) ? payload.up.map(Number) : [0, 1, 0],
    time: Number(payload.time || 0)
  };
};

export const createCameraManager = ({ three, state, textureCanvas, clamp, logClass }) => {
  let lastSavedCamera = parseCameraPayload(safeJsonParse(localStorage.getItem("camera-state") || "null", null));
  const nearlyEqual = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
  const sameVec3 = (a, b, eps = 1e-4) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === 3 &&
    b.length === 3 &&
    nearlyEqual(a[0], b[0], eps) &&
    nearlyEqual(a[1], b[1], eps) &&
    nearlyEqual(a[2], b[2], eps);

  const getLatestCameraPayload = () => {
    const storedCam = parseCameraPayload(safeJsonParse(localStorage.getItem("camera-state") || "null", null));
    const fallbackCam = parseCameraPayload(lastSavedCamera);
    const candidates = [
      storedCam && { payload: storedCam, source: "camera-state" },
      fallbackCam && { payload: fallbackCam, source: "last-saved" }
    ].filter(Boolean);
    if (!candidates.length) return null;
    const best = candidates.reduce((best, cam) => {
      const tCam = cam.payload.time || 0;
      const tBest = best.payload.time || 0;
      return tCam >= tBest ? cam : best;
    });
    if (logClass) {
      const sources = candidates
        .map((c) => `${c.source}:${(c.payload.time || 0).toFixed(0)}`)
        .join(" | ");
      logClass("CAMERA", `Selecting camera from ${best.source} (times ${sources})`, {
        chosen: best,
        candidates
      });
    }
    return best.payload;
  };

  const saveCameraState = () => {
    if (!three.camera || !three.controls) return;
    try {
      const target = three.controls.target.clone();
      const distance = three.camera.position.distanceTo(target);
      const payload = {
        position: three.camera.position.toArray(),
        target: target.toArray(),
        distance,
        azimuth: three.controls.getAzimuthalAngle(),
        polar: three.controls.getPolarAngle(),
        up: three.camera.up.toArray(),
        time: Date.now()
      };
      if (
        lastSavedCamera &&
        sameVec3(payload.position, lastSavedCamera.position) &&
        sameVec3(payload.target, lastSavedCamera.target) &&
        nearlyEqual(payload.distance, lastSavedCamera.distance, 1e-3) &&
        nearlyEqual(payload.azimuth, lastSavedCamera.azimuth, 1e-3) &&
        nearlyEqual(payload.polar, lastSavedCamera.polar, 1e-3)
      ) {
        return;
      }
      localStorage.setItem("camera-state", JSON.stringify(payload));
      lastSavedCamera = payload;
      if (logClass) {
        const fmt = (arr) => arr.map((n) => Number(n).toFixed(2)).join(", ");
        logClass(
          "CAMERA",
          `Saved pos [${fmt(payload.position)}] target [${fmt(payload.target)}] dist ${distance.toFixed(
            2
          )} az ${payload.azimuth.toFixed(2)} polar ${payload.polar.toFixed(2)}`,
          payload
        );
      }
    } catch {
      /* ignore persistence failures */
    }
  };

  const applySavedCamera = () => {
    if (!three.camera || !three.controls) return;
    const saved = getLatestCameraPayload();
    if (!saved || !Array.isArray(saved.target)) return;
    try {
      const target = new THREE.Vector3().fromArray(saved.target);
      const hasPos = Array.isArray(saved.position);
      let offset = hasPos ? new THREE.Vector3().fromArray(saved.position).sub(target) : new THREE.Vector3(1, 1, 1);
      if (offset.lengthSq() === 0) offset = new THREE.Vector3(1, 1, 1);
      let distance = typeof saved.distance === "number" && saved.distance > 0 ? saved.distance : offset.length();

      const spherical = new THREE.Spherical().setFromVector3(offset);
      const azimuth = typeof saved.azimuth === "number" ? saved.azimuth : spherical.theta;
      const polar = typeof saved.polar === "number" ? saved.polar : spherical.phi;

      const map = state.map || { cols: 20, rows: 20, gridSizePx: 48 };
      const boardWidth = Math.max(1, textureCanvas.width || map.cols * map.gridSizePx);
      const boardDepth = Math.max(1, textureCanvas.height || map.rows * map.gridSizePx);
      const sceneRadius = Math.max(boardWidth, boardDepth);
      const minDist = Math.max(2, sceneRadius * 0.1);
      const maxDist = Math.max(sceneRadius, sceneRadius * 2.5);
      distance = clamp(distance, minDist, maxDist);

      const clampedPolar = clamp(polar, 0.05, Math.PI - 0.05);
      const newPos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance, clampedPolar, azimuth)).add(target);

      three.controls.minDistance = Math.min(minDist, distance * 0.9);
      three.controls.maxDistance = Math.max(maxDist, distance * 1.1);
      if (Array.isArray(saved.up)) three.camera.up.fromArray(saved.up);
      three.camera.position.copy(newPos);
      three.controls.target.copy(target);
      three.controls.update();
      three.restoredCamera = true;
      lastSavedCamera = {
        position: newPos.toArray(),
        target: target.toArray(),
        distance,
        azimuth,
        polar: clampedPolar,
        time: saved.time || Date.now()
      };
      saveCameraState();
      if (logClass) {
        const fmt = (arr) => arr.map((n) => Number(n).toFixed(2)).join(", ");
        logClass(
          "CAMERA",
          `Restored pos [${fmt(newPos.toArray())}] target [${fmt(target.toArray())}] dist ${distance.toFixed(
            2
          )} az ${azimuth.toFixed(2)} polar ${clampedPolar.toFixed(2)}`,
          lastSavedCamera
        );
      }
    } catch (err) {
      console.warn("Failed to restore camera state", err);
    }
  };

  const setCameraPreset = (preset, render3d) => {
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
    saveCameraState();
    if (render3d) render3d();
  };

  const attachControlListeners = (render3d) => {
    if (!three.controls) return;
    three.controls.addEventListener("change", () => {
      if (render3d) render3d();
      saveCameraState();
    });
    three.controls.addEventListener("end", saveCameraState);
  };

  const getLastSavedCamera = () => lastSavedCamera;

  return {
    saveCameraState,
    applySavedCamera,
    setCameraPreset,
    attachControlListeners,
    getLastSavedCamera
  };
};
