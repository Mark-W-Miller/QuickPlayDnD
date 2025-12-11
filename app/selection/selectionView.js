export function createViewSelectionHandlers({
  three,
  state,
  raycaster,
  pointer,
  logClass,
  refreshTokenHighlights,
  onSelectionChange
}) {
  let dragPath = [];
  let dragMax = Infinity;
  let dragging = false;

  const pickCellFromPoint = (x, z) => {
    const { boardWidth, boardDepth } = state.lastBoard || {};
    const { cols, rows, gridType } = state.map || {};
    if (!cols || !rows || !boardWidth || !boardDepth) return null;
    if (gridType === "hex" && state.overlayBounds && state.overlayCenters?.size) {
      const ob = state.overlayBounds;
      const normX = x / ob.width;
      const normY = z / ob.height;
      let best = null;
      state.overlayCenters.forEach((pt, key) => {
        const cx = pt.x / ob.width;
        const cy = pt.y / ob.height;
        const dx = normX - cx;
        const dy = normY - cy;
        const d2 = dx * dx + dy * dy;
        if (best === null || d2 < best.d2) best = { key, d2 };
      });
      if (best) {
        const [cStr, rStr] = best.key.split(",");
        const col = Number(cStr);
        const row = Number(rStr);
        return { col, row, ref: `${String.fromCharCode(65 + col)}${row}` };
      }
      return null;
    }
    const cellW = boardWidth / cols;
    const cellH = boardDepth / rows;
    let col = Math.floor(x / cellW);
    let row = Math.floor(z / cellH);
    col = Math.max(0, Math.min(cols - 1, col));
    row = Math.max(0, Math.min(rows - 1, row));
    return { col, row, ref: `${String.fromCharCode(65 + col)}${row}` };
  };

  const onDown = (button, shift, event) => {
    // In view mode we still allow OrbitControls, but we first try to select tokens and log.
    if (!three?.scene || !three?.camera || !three?.boardMesh || !raycaster || !pointer) return false;
    if (button !== 0) return false;
    const rect = three.renderer?.domElement?.getBoundingClientRect();
    if (!rect) return false;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, three.camera);

    // Check tokens first.
    const tokenHits = three.tokenGroup ? raycaster.intersectObjects(three.tokenGroup.children, true) : [];
    if (tokenHits.length) {
      const tokenObj = tokenHits[0].object;
      const tokenId = tokenObj.userData.tokenId || tokenObj.parent?.userData?.tokenId;
      if (tokenId) {
        logClass?.("SELECTION", `View clicked token ${tokenId}`);
        const selected = new Set([tokenId]);
        if (onSelectionChange) onSelectionChange([tokenId]);
        else {
          state.selectedTokenIds = selected;
          if (typeof state.renderTokensWindow === "function") state.renderTokensWindow();
          if (typeof refreshTokenHighlights === "function") refreshTokenHighlights();
        }
        return true;
      }
    }

    // Otherwise log the grid cell.
    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (boardHits.length) {
      const hit = boardHits[0];
      const cell = pickCellFromPoint(hit.point.x, hit.point.z);
      if (cell) {
        if (shift) {
          const selId = Array.from(state.selectedTokenIds || [])[0] || null;
          const tok = selId ? (state.tokens || []).find((t) => t.id === selId) : null;
          const feetPerHex = state.map?.feetPerHex || 12;
          const speedFt = tok?.speed || 0;
          dragMax = Math.max(1, Math.floor(speedFt / Math.max(1, feetPerHex)));
          dragPath = [cell.ref];
          dragging = true;
          window.dispatchEvent(new CustomEvent("dm-move-path", { detail: { path: dragPath.slice() } }));
          return true;
        }
        logClass?.("SELECTION", `View click cell ${cell.ref}`);
      }
    }
    return false;
  };
  const onUp = (button, shift, event) => {
    if (dragging) {
      dragging = false;
      window.dispatchEvent(new CustomEvent("dm-move-path", { detail: { path: dragPath.slice() } }));
      return true;
    }
    return false;
  };
  const onMove = (event) => {
    if (!dragging) return false;
    if (!three?.scene || !three?.camera || !three?.boardMesh || !raycaster || !pointer) return false;
    const rect = three.renderer?.domElement?.getBoundingClientRect();
    if (!rect) return false;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, three.camera);
    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (boardHits.length) {
      const hit = boardHits[0];
      const cell = pickCellFromPoint(hit.point.x, hit.point.z);
      if (cell) {
        const last = dragPath[dragPath.length - 1];
        if (cell.ref !== last && dragPath.length < dragMax) {
          dragPath.push(cell.ref);
          window.dispatchEvent(new CustomEvent("dm-move-path", { detail: { path: dragPath.slice() } }));
          return true;
        }
      }
    }
    return false;
  };
  return { onDown, onUp, onMove };
}
