// Simple build script — copies files to dist/ for loading as unpacked extension
// For production, use Vite or similar bundler

const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const DIST = path.join(SRC, "dist");

// Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// Copy manifest
fs.copyFileSync(
  path.join(SRC, "manifest.json"),
  path.join(DIST, "manifest.json")
);

// Copy background service worker
fs.copyFileSync(
  path.join(SRC, "background", "service-worker.js"),
  path.join(DIST, "background.js")
);

// Copy Socket.IO client (ESM) for MV3 background service worker
const socketIoSrc = path.join(
  SRC,
  "..",
  "node_modules",
  "socket.io-client",
  "dist",
  "socket.io.esm.min.js"
);
const socketIoDest = path.join(DIST, "socket.io.esm.min.js");
if (fs.existsSync(socketIoSrc)) {
  fs.copyFileSync(socketIoSrc, socketIoDest);
} else {
  console.warn("Socket.IO client not found. Run npm install in the repo root.");
}

// Copy content script
fs.copyFileSync(
  path.join(SRC, "content", "content-script.js"),
  path.join(DIST, "content.js")
);

// Copy AI fallback module
fs.copyFileSync(
  path.join(SRC, "content", "ai-fallback.js"),
  path.join(DIST, "ai-fallback.js")
);

// Copy popup
fs.copyFileSync(
  path.join(SRC, "popup", "popup.html"),
  path.join(DIST, "popup.html")
);
fs.copyFileSync(
  path.join(SRC, "popup", "popup.js"),
  path.join(DIST, "popup.js")
);

// Create icons directory with proper WinPilot branding
const iconsDir = path.join(DIST, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

// Generate SVG icons — same lightning bolt + cyan→purple gradient as the sidebar logo
const sizes = [16, 48, 128];
for (const size of sizes) {
  const rx = Math.round(size * 0.15);
  // Scale the lightning bolt path (original: 24×24, padded to 80% of icon size)
  const pad = size * 0.1;
  const area = size - pad * 2;
  const s = area / 24;
  const ox = pad, oy = pad;
  const pts = [
    [13, 2], [4.5, 13], [11, 13], [10, 22], [19.5, 11], [13, 11], [13, 2],
  ];
  const scaled = pts.map(([x, y]) => `${Math.round(x * s + ox)},${Math.round(y * s + oy)}`);
  const d = `M${scaled[0]}L${scaled[1]}H${Math.round(11 * s + ox)}L${scaled[3]}L${scaled[4]}H${Math.round(13 * s + ox)}Z`;
  const gradId = `g${size}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00E5FF"/>
      <stop offset="100%" stop-color="#6366F1"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="url(#${gradId})"/>
  <path d="${d}" fill="white"/>
</svg>`;
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
}

console.log("Extension built to dist/");
console.log("Load as unpacked extension from: extension/dist/");
