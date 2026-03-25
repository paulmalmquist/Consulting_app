import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "public");

const WIDTH = 1200;
const HEIGHT = 630;
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

// Background — matches app dark theme hsl(216 31% 6%)
ctx.fillStyle = "#0d1117";
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Accent line — primary blue hsl(216 52% 48%)
ctx.fillStyle = "#3b6eb5";
ctx.fillRect(60, 80, 4, 120);

// "Winston" heading
ctx.fillStyle = "#e8ecf1";
ctx.font = "bold 64px sans-serif";
ctx.fillText("Winston", 84, 145);

// Subtitle
ctx.fillStyle = "#8b95a5";
ctx.font = "28px sans-serif";
ctx.fillText("AI Execution Environment", 84, 210);
ctx.fillText("for Institutional Operations", 84, 250);

// Capability line
ctx.fillStyle = "#5a6577";
ctx.font = "20px sans-serif";
ctx.fillText(
  "Fund Reporting  \u00B7  Waterfall Logic  \u00B7  Capital Activity  \u00B7  Portfolio Monitoring",
  84,
  330
);

// Domain
ctx.fillStyle = "#3b6eb5";
ctx.font = "18px sans-serif";
ctx.fillText("novendor.ai", 1020, 580);

// Write file
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync(path.join(outDir, "og-winston.png"), buffer);
console.log("Generated public/og-winston.png (%d bytes)", buffer.length);
