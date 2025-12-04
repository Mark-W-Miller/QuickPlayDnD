import * as THREE from "three";

export function createEditSelectionHandlers({
  canvas,
  three,
  state,
  raycaster,
  pointer,
  logClass,
  selectionWindowApi,
  updateSelectionHighlights
}) {
  let dragSelecting = false;
  let dragStartCell = null;
  let dragShift = false;

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

  const applySelectionRefs = (refs, mode) => {
    const next = new Set(mode === "toggle" ? state.selectionCells : []);
    if (mode === "toggle") {
      refs.forEach((ref) => {
        if (next.has(ref)) next.delete(ref);
        else next.add(ref);
      });
    } else {
      const same = refs.length === state.selectionCells.size && refs.every((ref) => state.selectionCells.has(ref));
      if (same) {
        next.clear();
      } else {
        refs.forEach((r) => next.add(r));
      }
    }
    state.selectionCells = next;
    selectionWindowApi?.setContent?.(Array.from(next).join(", "));
    selectionWindowApi?.bringToFront?.();
    updateSelectionHighlights?.();
  };

  const onDown = (button, shift, event) => {
    if (button !== 0 && button !== 2) return false;
    if (!three.scene || !three.camera || !three.tokenGroup || !state.lastBoard) return false;
    dragShift = shift;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, three.camera);

    // Check tokens first
    const tokenHits = raycaster.intersectObjects(three.tokenGroup.children, true);
    if (tokenHits.length) {
      const tokenObj = tokenHits[0].object;
      const tokenId = tokenObj.userData.tokenId || tokenObj.parent?.userData?.tokenId;
      if (tokenId) {
        logClass?.("EDIT", `Clicked token ${tokenId}`);
        dragSelecting = false;
        return true;
      }
    }

    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (boardHits.length) {
      const hit = boardHits[0];
      const cell = pickCellFromPoint(hit.point.x, hit.point.z);
      if (cell) {
        logClass?.("EDIT", `Clicked cell ${cell.ref}`);
        dragSelecting = true;
        dragStartCell = cell;
        if (!shift) {
          applySelectionRefs([cell.ref], "replace");
        }
        return true;
      }
    }
    return false;
  };

  const onUp = (button, shift, event) => {
    if (button !== 0 && button !== 2) return false;
    if (!dragSelecting) return false;
    dragSelecting = false;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, three.camera);
    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (!boardHits.length || !dragStartCell) return true;
    const hit = boardHits[0];
    const endCell = pickCellFromPoint(hit.point.x, hit.point.z);
    if (!endCell) return true;
    const cols = state.map.cols;
    const rows = state.map.rows;
    const minCol = Math.max(0, Math.min(dragStartCell.col, endCell.col));
    const maxCol = Math.min(cols - 1, Math.max(dragStartCell.col, endCell.col));
    const minRow = Math.max(0, Math.min(dragStartCell.row, endCell.row));
    const maxRow = Math.min(rows - 1, Math.max(dragStartCell.row, endCell.row));
    const refs = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        refs.push(`${String.fromCharCode(65 + c)}${r}`);
      }
    }
    applySelectionRefs(refs, dragShift ? "toggle" : "replace");
    return true;
  };

  const onMove = (event) => {
    if (!dragSelecting) return false;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, three.camera);
    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (!boardHits.length || !dragStartCell) return true;
    const hit = boardHits[0];
    const endCell = pickCellFromPoint(hit.point.x, hit.point.z);
    if (!endCell) return true;
    const cols = state.map.cols;
    const rows = state.map.rows;
    const minCol = Math.max(0, Math.min(dragStartCell.col, endCell.col));
    const maxCol = Math.min(cols - 1, Math.max(dragStartCell.col, endCell.col));
    const minRow = Math.max(0, Math.min(dragStartCell.row, endCell.row));
    const maxRow = Math.min(rows - 1, Math.max(dragStartCell.row, endCell.row));
    const refs = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        refs.push(`${String.fromCharCode(65 + c)}${r}`);
      }
    }
    applySelectionRefs(refs, dragShift ? "toggle" : "replace");
    return true;
  };

  return { onDown, onUp, onMove };
}
