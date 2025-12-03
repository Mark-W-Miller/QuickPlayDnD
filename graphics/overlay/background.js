import { overlayGridOnTexture } from "./overlayGridOnTexture.js";
import { cropTextureToOverlay } from "./cropTextureToOverlay.js";

export function setBackground(url, deps) {
  const {
    state,
    textureCanvas,
    textureCtx,
    textureToggle,
    updateBoardScene,
    render,
    log,
    logClass,
    three,
    webglCanvas,
    overlayGridToggle,
    overlayLabelToggle
  } = deps;

  if (!url) {
    log("No background URL provided");
    return;
  }
  if (textureToggle) {
    textureToggle.checked = true;
    localStorage.setItem("show-texture", "true");
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
    const detectMaxTex = () => {
      if (three.renderer?.capabilities?.maxTextureSize) return three.renderer.capabilities.maxTextureSize;
      try {
        const gl =
          webglCanvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
          webglCanvas.getContext("webgl", { failIfMajorPerformanceCaveat: false }) ||
          webglCanvas.getContext("experimental-webgl");
        if (gl) return gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
      } catch {}
      return 2048;
    };
    const maxTexSize = detectMaxTex();
    let targetW = img.width;
    let targetH = img.height;
    if (state.map.cols && state.map.rows && state.map.gridSizePx) {
      if (state.map.gridType === "hex") {
        const sqrt3 = Math.sqrt(3);
        targetW = sqrt3 * (state.map.cols + 0.5) * state.map.gridSizePx;
        targetH = (1.5 * state.map.rows + 0.5) * state.map.gridSizePx;
      } else {
        targetW = state.map.cols * state.map.gridSizePx;
        targetH = state.map.rows * state.map.gridSizePx;
      }
    }
    const scale =
      maxTexSize && Math.max(targetW, targetH) > maxTexSize ? maxTexSize / Math.max(targetW, targetH) : 1;
    const drawW = Math.max(1, Math.round(targetW * scale));
    const drawH = Math.max(1, Math.round(targetH * scale));
    textureCanvas.width = drawW;
    textureCanvas.height = drawH;
    textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
    textureCtx.drawImage(img, 0, 0, drawW, drawH);
    logClass?.(
      "INFO",
      `Background loaded ${img.width}x${img.height}, target=${targetW.toFixed(1)}x${targetH.toFixed(
        1
      )} drawn ${drawW}x${drawH}`
    );
    logClass?.(
      "BUILD",
      `app.js:540 maxTex=${maxTexSize || "?"} scale=${scale.toFixed(4)} final=${drawW}x${drawH}`
    );
    if (state.map.cols > 0) {
      if (state.map.gridType === "hex") {
        const sqrt3 = Math.sqrt(3);
        const s = textureCanvas.width / (sqrt3 * (state.map.cols + 0.5));
        state.map.gridSizePx = s;
        logClass?.(
          "BUILD",
          `app.js:548 Inferred hex size=${s.toFixed(2)} from tex ${img.width}x${img.height} cols=${state.map.cols}`
        );
      } else {
        const cell = textureCanvas.width / state.map.cols;
        state.map.gridSizePx = cell;
        logClass?.(
          "BUILD",
          `app.js:552 Inferred square size=${cell.toFixed(2)} from tex ${img.width}x${img.height} cols=${state.map.cols}`
        );
      }
    }
    overlayGridOnTexture(state.map, {
      textureCanvas,
      textureCtx,
      overlayGridToggle,
      overlayLabelToggle,
      state,
      logClass
    });
    cropTextureToOverlay({ textureCanvas, textureCtx, state, logClass });
    updateBoardScene();
    render();
  };
  img.onerror = () => {
    logClass?.("ERROR", `Failed to load background ${url}`);
    log(`Failed to load background ${url}`);
    render();
  };
  img.src = url;
  log(`Background set: ${url}`);
}
