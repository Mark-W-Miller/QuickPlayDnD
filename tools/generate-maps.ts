/**
 * Standalone map generator (TypeScript).
 * Outputs:
 *   images/grid-default-map.png — 20x16 square grid, 5ft per cell
 *   images/hex-default-map.png  — 20x14 pointy-top hex grid, ~10 yards per hex
 *
 * Requirements: node + canvas
 *   npm install canvas
 * Run:
 *   npx ts-node tools/generate-maps.ts
 */

import fs from "fs";
import { createCanvas, CanvasRenderingContext2D } from "canvas";

const colLabel = (idx: number): string => {
  let n = idx;
  let label = "";
  while (true) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return label;
};

const drawGradient = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: [number, number, number] = [12, 28, 42],
  bottom: [number, number, number] = [28, 60, 85]
) => {
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, w, 1);
  }
};

const drawSquareGrid = () => {
  const cols = 20;
  const rows = 16;
  const cell = 50; // 5 ft per cell
  const w = cols * cell;
  const h = rows * cell;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  drawGradient(ctx, w, h);

  for (let x = 0; x <= w; x += cell) {
    const major = (x / cell) % 2 === 0;
    ctx.strokeStyle = major ? "rgba(90,150,190,0.85)" : "rgba(70,110,140,0.7)";
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += cell) {
    const major = (y / cell) % 2 === 0;
    ctx.strokeStyle = major ? "rgba(90,150,190,0.85)" : "rgba(70,110,140,0.7)";
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,70,70,0.9)";
  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell + cell / 2;
      const y = r * cell + cell / 2;
      ctx.fillText(`${colLabel(c)}${r}`, x, y);
    }
  }

  ctx.fillStyle = "rgba(220,230,255,0.9)";
  ctx.font = "16px monospace";
  ctx.textAlign = "left";
  ctx.fillText("200ft x 160ft (5ft cells) 20x16", 10, h - 20);

  fs.writeFileSync("images/grid-default-map.png", canvas.toBuffer("image/png"));
  console.log("Wrote images/grid-default-map.png", w, h);
};

const drawHexGrid = () => {
  const cols = 20;
  const rows = 14;
  const s = 25; // edge length (~10 yards)
  const sqrt3 = Math.sqrt(3);
  const hexW = sqrt3 * s;
  const hexH = 2 * s;
  const rowStep = hexH * 0.75;
  const w = Math.round(hexW * (cols + 0.5));
  const h = Math.round(rowStep * (rows - 1) + hexH);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  drawGradient(ctx, w, h, [12, 28, 42], [28, 60, 85]);

  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Odd-r offset, pointy-top hex centers
      const cx = hexW * (c + 0.5 * (r & 1)) + hexW / 2;
      const cy = rowStep * r + hexH / 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i + Math.PI / 6;
        const px = cx + s * Math.cos(ang);
        const py = cy + s * Math.sin(ang);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(90,150,190,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "rgba(255,70,70,0.9)";
      ctx.fillText(`${colLabel(c)}${r}`, cx, cy);
    }
  }

  ctx.fillStyle = "rgba(220,230,255,0.9)";
  ctx.font = "16px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Outdoor Hex (10 yards per hex) ${cols}x${rows}`, 10, h - 20);

  fs.writeFileSync("images/hex-default-map.png", canvas.toBuffer("image/png"));
  console.log("Wrote images/hex-default-map.png", w, h);
};

drawSquareGrid();
drawHexGrid();
