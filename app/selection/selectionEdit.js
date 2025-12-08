import * as THREE from "three";

export function createEditSelectionHandlers({
  canvas,
  three,
  state,
  raycaster,
  pointer,
  logClass,
  selectionWindowApi,
  updateSelectionHighlights,
  render3d,
  onSelectionChange
}) {
  let dragSelecting = false;
  let dragShift = false;
  let lastDragRef = null;
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
    const next = new Set(state.selectionCells);
    if (mode === "toggle") {
      refs.forEach((ref) => {
        if (next.has(ref)) next.delete(ref);
        else next.add(ref);
      });
    } else if (mode === "remove") {
      refs.forEach((ref) => next.delete(ref));
    } else if (mode === "add") {
      refs.forEach((r) => next.add(r));
    } else {
      next.clear();
      refs.forEach((r) => next.add(r));
    }
    state.selectionCells = next;
    updateSelectionHighlights?.();
    render3d?.();
  };

  const onDown = (button, shift, event) => {
    if (button !== 0) return false; // only left click selects
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!three.scene || !three.camera || !three.tokenGroup || !state.lastBoard) return false;
    logClass?.("SELECTION", `edit onDown button=${button} shift=${shift}`);
    dragShift = shift;
    lastDragRef = null;
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
        const selected = new Set([tokenId]);
        if (onSelectionChange) onSelectionChange([tokenId]);
        else {
          state.selectedTokenIds = selected;
          if (typeof state.renderTokensWindow === "function") state.renderTokensWindow();
          if (typeof render3d === "function") render3d();
        }
        return true;
      }
    }

    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (!boardHits.length) return false;
    const hit = boardHits[0];
    const cell = pickCellFromPoint(hit.point.x, hit.point.z);
    if (!cell) return false;
    logClass?.("EDIT", `Clicked cell ${cell.ref}`);
    dragSelecting = true;
    lastDragRef = cell.ref;
    const mode = shift ? "remove" : "add";
    applySelectionRefs([cell.ref], mode);
    return true;
  };

  const onUp = (button, shift, event) => {
    if (button !== 0) return false;
    logClass?.("SELECTION", `edit onUp button=${button} shift=${shift}`);
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragSelecting = false;
    lastDragRef = null;
    return true;
  };

  const onMove = (event) => {
    // Only respond to left-drag selection; let controls handle right-drag pan.
    if (!dragSelecting || (event.buttons & 1) === 0) return false;
    event.preventDefault();
    event.stopPropagation();
    const holdingShift = dragShift;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, three.camera);
    const boardHits = raycaster.intersectObject(three.boardMesh, true);
    if (!boardHits.length) return true;
    const hit = boardHits[0];
    const cell = pickCellFromPoint(hit.point.x, hit.point.z);
    if (!cell) return true;
    if (cell.ref === lastDragRef) return true;
    lastDragRef = cell.ref;
    const refs = [cell.ref];
    const mode = dragShift ? "remove" : "add";
    applySelectionRefs(refs, mode);
    logClass?.("SELECTION", `edit onMove refs: ${refs.join(", ")}`);
    return true;
  };

  return { onDown, onUp, onMove };
}
