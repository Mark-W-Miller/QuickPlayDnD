export function cropTextureToOverlay({ textureCanvas, textureCtx, state, logClass }) {
  const ob = state.overlayBounds;
  if (!ob) return;
  if (
    Math.round(ob.width) === Math.round(textureCanvas.width) &&
    Math.round(ob.height) === Math.round(textureCanvas.height) &&
    Math.round(ob.minX) === 0 &&
    Math.round(ob.minY) === 0
  ) {
    return;
  }
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.round(ob.width));
  crop.height = Math.max(1, Math.round(ob.height));
  const ctx = crop.getContext("2d");
  ctx.drawImage(textureCanvas, -ob.minX, -ob.minY);
  textureCanvas.width = crop.width;
  textureCanvas.height = crop.height;
  textureCtx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  textureCtx.drawImage(crop, 0, 0);

  if (state.overlayCenters) {
    const entries = Array.from(state.overlayCenters.entries());
    state.overlayCenters.clear();
    entries.forEach(([key, val]) => {
      state.overlayCenters.set(key, { x: val.x - ob.minX, y: val.y - ob.minY });
    });
  }
  state.overlayBounds = { minX: 0, minY: 0, maxX: ob.width, maxY: ob.height, width: ob.width, height: ob.height };
  logClass?.(
    "BUILD",
    `cropTextureToOverlay: trimmed canvas to ${crop.width}x${crop.height} from overlay bounds`
  );
}
