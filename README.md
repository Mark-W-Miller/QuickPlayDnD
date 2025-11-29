## Map asset generator (Node)
- Script: `tools/generate-maps.js` (uses `canvas`).
- Install deps: `npm install canvas`.
- Run: `node tools/generate-maps.js`.
- Outputs: `images/grid-default-map.png` (20x16 square, 5ft cells) and `images/hex-default-map.png` (20x14 pointy-top hex, 10-yard cells).

- To avoid Node ESM warnings, add `"type": "module"` to `package.json`.

## Overlay a hex grid onto a raw map
- Script: `tools/overlay-hex-grid.js` (uses `canvas`).
- Usage: `node tools/overlay-hex-grid.js scripts/<map-script>.txt`
- It reads BACKGROUND/GRID/BOARD from the script, loads `images/raw/<background-basename>-raw.png`, overlays a pointy-top hex grid sized from `GRID hex SIZE`, and writes the finished map to the BACKGROUND path.
