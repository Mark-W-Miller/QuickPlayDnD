export function overlayGridOnTexture(map, { textureCanvas, textureCtx, overlayGridToggle, overlayLabelToggle, state, logClass }) {
  if (!textureCtx || !textureCanvas || !map || !textureCanvas.width || !textureCanvas.height) return;
  if (overlayGridToggle && !overlayGridToggle.checked) return;
  const cols = Math.max(1, map.cols || 1);
  const rows = Math.max(1, map.rows || 1);
  const fontScale = Math.min(3, Math.max(0.25, state.gridRefFontScale || 1));
  const baseFontPx = 12 * fontScale;
  state.overlayBounds = null;
  state.overlayCenters?.clear();
  textureCtx.save();
  textureCtx.strokeStyle = "rgba(255,255,255,0.35)";
  textureCtx.lineWidth = 1;
  if (map.gridType === "hex") {
    const sqrt3 = Math.sqrt(3);
    const cellW = textureCanvas.width / (cols + 0.5);
    const cellH = textureCanvas.height / (rows + 0.5);
    const sFromW = cellW / sqrt3;
    const sFromH = cellH / 1.5;
    const s = Math.max(1, Math.min(sFromW, sFromH));
    const hexW = sqrt3 * s;
    const hexH = 2 * s;
    const fontPx = Math.max(6, Math.min(hexH * 0.9, baseFontPx));
    const rowStep = hexH * 0.75;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = hexW * (c + 0.5 * (r & 1)) + hexW / 2;
        const cy = rowStep * r + hexH / 2;
        state.overlayCenters?.set(`${c},${r}`, { x: cx, y: cy });
        textureCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i + Math.PI / 6;
          const px = cx + s * Math.cos(ang);
          const py = cy + s * Math.sin(ang);
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
          if (i === 0) textureCtx.moveTo(px, py);
          else textureCtx.lineTo(px, py);
        }
        textureCtx.closePath();
        textureCtx.stroke();
        if (!overlayLabelToggle || overlayLabelToggle.checked) {
          textureCtx.fillStyle = "rgba(240,240,240,0.7)";
          textureCtx.font = `${fontPx.toFixed(2)}px monospace`;
          textureCtx.textAlign = "center";
          textureCtx.textBaseline = "middle";
          const label = `${String.fromCharCode(65 + c)}${r}`;
          textureCtx.fillText(label, cx, cy);
        }
      }
    }
    if (Number.isFinite(minX)) {
      state.overlayBounds = {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
      };
      logClass?.(
        "BUILD",
        `overlay hex bounds x=[${minX.toFixed(1)},${maxX.toFixed(1)}] w=${(maxX - minX).toFixed(1)} y=[${minY.toFixed(
          1
        )},${maxY.toFixed(1)}] h=${(maxY - minY).toFixed(1)}`
      );
    }
  } else {
    const cell = Math.min(textureCanvas.width / cols, textureCanvas.height / rows);
    const fontPx = Math.max(6, Math.min(cell * 0.9, baseFontPx));
    for (let x = 0; x <= textureCanvas.width + cell; x += cell) {
      textureCtx.beginPath();
      textureCtx.moveTo(x, 0);
      textureCtx.lineTo(x, textureCanvas.height);
      textureCtx.stroke();
    }
    for (let y = 0; y <= textureCanvas.height + cell; y += cell) {
      textureCtx.beginPath();
      textureCtx.moveTo(0, y);
      textureCtx.lineTo(textureCanvas.width, y);
      textureCtx.stroke();
    }
    if (!overlayLabelToggle || overlayLabelToggle.checked) {
      textureCtx.fillStyle = "rgba(240,240,240,0.7)";
      textureCtx.font = `${fontPx.toFixed(2)}px monospace`;
      textureCtx.textAlign = "center";
      textureCtx.textBaseline = "middle";
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cell + cell / 2;
          const y = r * cell + cell / 2;
          const label = `${String.fromCharCode(65 + c)}${r}`;
          textureCtx.fillText(label, x, y);
        }
      }
    }
    state.overlayBounds = {
      minX: 0,
      minY: 0,
      maxX: textureCanvas.width,
      maxY: textureCanvas.height,
      width: textureCanvas.width,
      height: textureCanvas.height
    };
  }
  textureCtx.restore();
}
