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

// Create icons directory with placeholder
const iconsDir = path.join(DIST, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

// Generate simple SVG icons as placeholders
const sizes = [16, 48, 128];
for (const size of sizes) {
  // Create a minimal PNG placeholder (1x1 blue pixel header)
  // In production, replace with actual icons
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#3B82F6"/>
    <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${size * 0.5}" font-family="system-ui" font-weight="bold">⚡</text>
  </svg>`;
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
}

console.log("Extension built to dist/");
console.log("Load as unpacked extension from: extension/dist/");
