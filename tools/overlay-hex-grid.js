/**
 * Overlay a pointy-top hex grid onto a raw map image, saving to the path
 * referenced in a map script (BACKGROUND line).
 *
 * Usage:
 *   node tools/overlay-hex-grid.js scripts/map-hex.txt
 *
 * Expectations:
 *   - Script contains BACKGROUND images/<name>.png, GRID hex SIZE <px>, BOARD <cols>x<rows>
 *   - A raw image exists at images/raw/<name>-raw.png
 *   - Output is written to the BACKGROUND path (images/<name>.png)
 */

import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";

const scriptArg = process.argv[2];
if (!scriptArg) {
  console.error("Usage: node tools/overlay-hex-grid.js <path-to-map-script>");
  process.exit(1);
}

const scriptPath = path.resolve(process.cwd(), scriptArg);
if (!fs.existsSync(scriptPath)) {
  console.error(`Script not found: ${scriptPath}`);
  process.exit(1);
}

const script = fs.readFileSync(scriptPath, "utf8");
// Match directive lines only (ignore commented lines).
const bgMatch = /^\s*BACKGROUND\s+([^\r\n#]+)/im.exec(script);
if (!bgMatch) {
  console.error("No BACKGROUND line found in script.");
  process.exit(1);
}
console.log(`BACKGROUND:    ${bgMatch}`);
const gridMatch = /^\s*GRID\s+hex\s+SIZE\s+(\d+)/im.exec(script);
if (!gridMatch) {
  console.error("Only hex grids are supported. Add: GRID hex SIZE <px>");
  process.exit(1);
}
const boardMatch = /^\s*BOARD\s+(\d+)[xX](\d+)/im.exec(script);

const scriptDir = path.dirname(scriptPath);
// Prefer a sibling "images" directory; fall back to script directory.
let projectRoot = scriptDir;
const parentDir = path.dirname(scriptDir);
if (fs.existsSync(path.join(parentDir, "images"))) {
  projectRoot = parentDir;
} else if (fs.existsSync(path.join(scriptDir, "images"))) {
  projectRoot = scriptDir;
}
const bgRel = bgMatch[1].trim();
// Resolve BACKGROUND relative to the project root (parent of the script folder).
const bgOutPath = path.resolve(projectRoot, bgRel);
const bgExt = path.extname(bgOutPath) || ".png";
const bgBase = path.basename(bgOutPath, bgExt);
const rawPath = path.resolve(path.dirname(bgOutPath), "raw", `${bgBase}-raw${bgExt}`);
console.log(`Script path:   ${scriptPath}`);
console.log(`Resolved out:  ${bgOutPath}`);
console.log(`Raw input:     ${rawPath}`);

if (!fs.existsSync(rawPath)) {
  console.error(`Raw image not found: ${rawPath}`);
  process.exit(1);
}

const gridSize = Number(gridMatch[1]); // hex height in pixels
const cols = boardMatch ? Number(boardMatch[1]) : null;
const rows = boardMatch ? Number(boardMatch[2]) : null;

console.log("=== Parsed script parameters ===");
console.log(`Project root:  ${projectRoot}`);
console.log(`bgBase:        ${bgBase}`);
console.log(`GRID size:     ${gridSize}px (hex height)`);
console.log(
  `BOARD:         ${cols !== null && rows !== null ? `${cols}x${rows}` : "not specified (will estimate)"}`
);

const sqrt3 = Math.sqrt(3);
const s = gridSize / 2; // edge length / circumradius
const hexW = sqrt3 * s; // flat-to-flat width
const hexH = gridSize; // point-to-point height
const rowStep = hexH * 0.75; // odd-r stagger

const load = async () => {
  const img = await loadImage(rawPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  let useCols = cols;
  let useRows = rows;
  if (!useCols) {
    useCols = Math.ceil((img.width - hexW / 2) / (hexW * 0.75));
  }
  if (!useRows) {
    useRows = Math.ceil((img.height - hexH / 2) / rowStep);
  }

  ctx.strokeStyle = "rgba(90,150,190,0.9)";
  ctx.lineWidth = 0.8;
  const startX = hexW / 2;
  const startY = hexH / 2;
  for (let r = 0; r < useRows; r++) {
    for (let c = 0; c < useCols; c++) {
      const cx = startX + hexW * (c + 0.5 * (r & 1));
      const cy = startY + rowStep * r;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = Math.PI / 3 * i + Math.PI / 6;
        const px = cx + s * Math.cos(ang);
        const py = cy + s * Math.sin(ang);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }

  fs.mkdirSync(path.dirname(bgOutPath), { recursive: true });
  fs.writeFileSync(bgOutPath, canvas.toBuffer("image/png"));

  console.log("=== Overlay complete ===");
  console.log(`Script:     ${scriptPath}`);
  console.log(`Raw input:  ${rawPath} (${img.width}x${img.height})`);
  console.log(`Output:     ${bgOutPath}`);
  console.log(`Grid size:  ${gridSize}px (hexW=${hexW.toFixed(2)}, hexH=${hexH.toFixed(2)})`);
  console.log(`Grid dims:  ${useCols} cols x ${useRows} rows`);
};

load().catch((err) => {
  console.error("Failed to overlay grid:", err);
  process.exit(1);
});
