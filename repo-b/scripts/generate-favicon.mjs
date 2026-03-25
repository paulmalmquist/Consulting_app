import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "public");
const appDir = path.resolve(__dirname, "..", "src", "app");

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Rounded rect background — primary blue
  const r = size * 0.18;
  ctx.fillStyle = "#3b6eb5";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // "W" letter
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${size * 0.6}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("W", size / 2, size / 2 + size * 0.03);

  return canvas;
}

// 32x32 for favicon.ico (saved as PNG — browsers accept PNG favicons)
const favicon = generateIcon(32);
fs.writeFileSync(path.join(outDir, "favicon.ico"), favicon.toBuffer("image/png"));
console.log("Generated public/favicon.ico");

// 180x180 for apple-touch-icon
const apple = generateIcon(180);
fs.writeFileSync(path.join(outDir, "apple-touch-icon.png"), apple.toBuffer("image/png"));
console.log("Generated public/apple-touch-icon.png");

// 512x512 for Next.js app icon
const appIcon = generateIcon(512);
fs.writeFileSync(path.join(appDir, "icon.png"), appIcon.toBuffer("image/png"));
console.log("Generated src/app/icon.png");
