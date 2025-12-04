export function createViewSelectionHandlers({ three }) {
  const onDown = (button, shift, event) => {
    // In view mode we let OrbitControls handle everything unless shift-click needed later.
    return false;
  };
  const onUp = (button, shift, event) => {
    return false;
  };
  const onMove = (event) => {
    return false;
  };
  return { onDown, onUp, onMove };
}
