## Map asset generator (Node)
- Script: `tools/generate-maps.js` (uses `canvas`).
- Install deps: `npm install canvas`.
- Run: `node tools/generate-maps.js`.
- Outputs: `images/grid-default-map.png` (20x16 square, 5ft cells) and `images/hex-default-map.png` (20x14 pointy-top hex, 10-yard cells).

- To avoid Node ESM warnings, add `"type": "module"` to `package.json`.
