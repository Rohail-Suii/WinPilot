// Simple build script — copies files to dist/ for loading as unpacked extension
// For production, use Vite or similar bundler
//
// The backend the extension talks to is fixed AT BUILD TIME. Set it once and
// every copied file plus the manifest points at that origin:
//
//   WINPILOT_APP_URL=http://localhost:3000 node build.js
//   node build.js --url=https://winpilot.tech
//
// or put WINPILOT_APP_URL in extension/.env (see .env.example). With nothing
// set, the build targets production.

const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const DIST = path.join(SRC, "dist");

// ─── Build-time endpoint ──────────────────────────────────

const FALLBACK_APP_URL = "https://winpilot.onrender.com";

// Minimal .env reader — KEY=value lines, `export` and quotes tolerated.
function readEnvFile(file) {
  const vars = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return vars;
}

function readCliFlag(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

// Precedence: CLI flag → shell env → extension/.env → production default.
const dotenv = readEnvFile(path.join(SRC, ".env"));
function setting(name) {
  return process.env[name] || dotenv[name] || undefined;
}

function normalizeUrl(url, source) {
  const trimmed = String(url).trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${source} is not a valid URL: "${url}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${source} must be http(s), got "${url}"`);
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error(`${source} must be an origin with no path, got "${url}"`);
  }
  return trimmed;
}

const appUrlRaw = readCliFlag("url") || setting("WINPILOT_APP_URL");
const wsUrlRaw = readCliFlag("ws-url") || setting("WINPILOT_WS_URL");

let APP_URL;
let WS_URL;
try {
  APP_URL = appUrlRaw ? normalizeUrl(appUrlRaw, "WINPILOT_APP_URL") : FALLBACK_APP_URL;
  // The Socket.IO server shares the app's origin (mounted at /api/ws), so the
  // WS URL only needs setting when the two are genuinely split.
  WS_URL = wsUrlRaw ? normalizeUrl(wsUrlRaw, "WINPILOT_WS_URL") : APP_URL;
} catch (error) {
  console.error(`Build aborted — ${error.message}`);
  console.error("Expected an origin such as http://localhost:3000 or https://winpilot.tech");
  process.exit(1);
}

const REPLACEMENTS = {
  __WINPILOT_APP_URL__: APP_URL,
  __WINPILOT_WS_URL__: WS_URL,
};

// Copy a source file into dist, substituting the build-time URL tokens.
function copyStamped(from, to) {
  let contents = fs.readFileSync(from, "utf8");
  for (const [token, value] of Object.entries(REPLACEMENTS)) {
    contents = contents.split(token).join(value);
  }
  fs.writeFileSync(to, contents);
}

// Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// Copy manifest, pinning host_permissions to the build target. Only the
// origin this build talks to is requested — a prod build asks for no
// localhost access, and a local build asks for no production access.
const manifest = JSON.parse(
  fs.readFileSync(path.join(SRC, "manifest.json"), "utf8")
);
const hostPermissions = ["https://www.linkedin.com/*", "https://www.indeed.com/*"];
for (const url of [APP_URL, WS_URL]) {
  const pattern = `${new URL(url).origin}/*`;
  if (!hostPermissions.includes(pattern)) hostPermissions.push(pattern);
}
manifest.host_permissions = hostPermissions;
fs.writeFileSync(
  path.join(DIST, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

// Copy background service worker
copyStamped(
  path.join(SRC, "background", "service-worker.js"),
  path.join(DIST, "background.js")
);

// Copy the Autopilot task runner — imported as an ES module by background.js
copyStamped(
  path.join(SRC, "background", "task-runner.js"),
  path.join(DIST, "task-runner.js")
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
copyStamped(
  path.join(SRC, "content", "content-script.js"),
  path.join(DIST, "content.js")
);

// Copy AI fallback module
copyStamped(
  path.join(SRC, "content", "ai-fallback.js"),
  path.join(DIST, "ai-fallback.js")
);

// Copy popup
fs.copyFileSync(
  path.join(SRC, "popup", "popup.html"),
  path.join(DIST, "popup.html")
);
copyStamped(
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
console.log(`  API  → ${APP_URL}`);
console.log(`  WS   → ${WS_URL}`);
if (!appUrlRaw) {
  console.log("  (no WINPILOT_APP_URL set — built against the production default)");
}
console.log("Load as unpacked extension from: extension/dist/");
