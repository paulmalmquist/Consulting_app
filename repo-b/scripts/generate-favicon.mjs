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

  drawRoundedRect(ctx, size, "#ffffff");
  drawBowtie(ctx, size, "#000000");

  return canvas;
}

function drawRoundedRect(ctx, size, fillStyle) {
  const r = size * 0.18;
  ctx.fillStyle = fillStyle;
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
}

function drawBowtie(ctx, size, fillStyle) {
  const scale = size / 24;
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.translate(size * 0.5, size * 0.5);
  ctx.scale(scale, scale);
  ctx.translate(-12, -12);

  ctx.beginPath();
  ctx.moveTo(2, 6.5);
  ctx.lineTo(11, 11.2);
  ctx.lineTo(11, 12.8);
  ctx.lineTo(2, 17.5);
  ctx.lineTo(4.3, 12);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(22, 6.5);
  ctx.lineTo(13, 11.2);
  ctx.lineTo(13, 12.8);
  ctx.lineTo(22, 17.5);
  ctx.lineTo(19.7, 12);
  ctx.closePath();
  ctx.fill();

  const knotWidth = 2;
  const knotHeight = 4;
  const knotRadius = 0.4;
  roundRectPath(ctx, 11, 10, knotWidth, knotHeight, knotRadius);
  ctx.fill();
  ctx.restore();
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const right = x + width;
  const bottom = y + height;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
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
