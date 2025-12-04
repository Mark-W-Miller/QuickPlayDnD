export function createViewSelectionHandlers({ three }) {
  const onDown = (button, shift, event) => {
    // In view mode we let OrbitControls handle everything unless shift-click needed later.
    if (three?.controls?.logClass) {
      three.controls.logClass("SELECTION", `view onDown button=${button} shift=${shift}`);
    }
    return false;
  };
  const onUp = (button, shift, event) => {
    if (three?.controls?.logClass) {
      three.controls.logClass("SELECTION", `view onUp button=${button} shift=${shift}`);
    }
    return false;
  };
  const onMove = (event) => {
    if (three?.controls?.logClass) {
      three.controls.logClass("SELECTION", `view onMove`);
    }
    return false;
  };
  return { onDown, onUp, onMove };
}
