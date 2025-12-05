import * as THREE from "three";

export function createInteractionManager({ logClass } = {}) {
  let mode = "view"; // view | edit
  let controls = null;
  let editHandlers = null;
  let viewHandlers = null;

  const applyToControls = () => {
    if (!controls) return;
    // Keep mouse mapping stable; just enable/disable behaviors by mode.
    controls.mouseButtons.LEFT = controls.mouseButtons.LEFT || THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = controls.mouseButtons.RIGHT || THREE.MOUSE.PAN;
    const isView = mode === "view";
    // Allow pan in edit (for right click) but disable rotate; selection handlers stop left.
    controls.enabled = true;
    controls.enableRotate = isView;
    controls.enablePan = true;
    controls.enableZoom = true; // allow wheel zoom in both
    controls.update?.();
  };

  const setMode = (next) => {
    mode = next === "edit" ? "edit" : "view";
    logClass?.("EDIT", `interactionMode=${mode} (InteractionManager)`);
    applyToControls();
    return mode;
  };

  const getMode = () => mode;

  const attachControls = (ctrl) => {
    controls = ctrl;
    applyToControls();
  };

  const setHandlers = ({ edit, view }) => {
    editHandlers = edit || null;
    viewHandlers = view || null;
  };

  const handleDown = (button, shift, evt) => {
    const h = mode === "edit" ? editHandlers : viewHandlers;
    if (!h?.onDown) return false;
    return !!h.onDown(button, shift, evt);
  };
  const handleUp = (button, shift, evt) => {
    const h = mode === "edit" ? editHandlers : viewHandlers;
    if (!h?.onUp) return false;
    return !!h.onUp(button, shift, evt);
  };
  const handleMove = (evt) => {
    const h = mode === "edit" ? editHandlers : viewHandlers;
    if (!h?.onMove) return false;
    return !!h.onMove(evt);
  };

  return { setMode, getMode, attachControls, setHandlers, handleDown, handleUp, handleMove };
}
