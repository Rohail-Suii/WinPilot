/**
 * generate-icons.js
 *
 * Generates all required PNG sizes + favicon.ico from public/logo.svg.
 *
 * Output files:
 *   public/icon-16.png      (browser tab / small UI)
 *   public/icon-32.png      (browser tab retina / taskbar)
 *   public/icon-48.png      (Windows taskbar)
 *   public/icon-64.png      (shortcut / desktop)
 *   public/icon-96.png      (Chrome Web App)
 *   public/icon-128.png     (Chrome Extension store)
 *   public/icon-180.png     (Apple Touch Icon source)
 *   public/icon-192.png     (Android home screen / PWA)
 *   public/icon-256.png     (Windows tile)
 *   public/icon-512.png     (PWA splash / high-res)
 *   public/apple-touch-icon.png  (180×180, for <link rel="apple-touch-icon">)
 *   public/favicon.ico      (multi-size: 16, 32, 48)
 *   app/favicon.ico         (Next.js App Router auto-serves this as the tab icon)
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const sharp = require("sharp");
const toIco = require("png-to-ico");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SVG_SRC = path.join(ROOT, "public", "logo.svg");
const PUBLIC = path.join(ROOT, "public");
const APP_DIR = path.join(ROOT, "app");

const SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512];

async function run() {
  // ── 1. Generate individual PNGs ─────────────────────────────────────────
  console.log("Generating PNGs from public/logo.svg …");
  for (const size of SIZES) {
    const dest = path.join(PUBLIC, `icon-${size}.png`);
    await sharp(SVG_SRC)
      .resize(size, size)
      .png()
      .toFile(dest);
    console.log(`  ✓ icon-${size}.png`);
  }

  // ── 2. Apple Touch Icon (copy from 180px) ───────────────────────────────
  const appleSrc = path.join(PUBLIC, "icon-180.png");
  const appleDest = path.join(PUBLIC, "apple-touch-icon.png");
  fs.copyFileSync(appleSrc, appleDest);
  console.log("  ✓ apple-touch-icon.png");

  // ── 3. favicon.ico (multi-size: 16 + 32 + 48) ──────────────────────────
  console.log("Generating favicon.ico …");
  const icoBuf = await toIco([
    path.join(PUBLIC, "icon-16.png"),
    path.join(PUBLIC, "icon-32.png"),
    path.join(PUBLIC, "icon-48.png"),
  ]);

  // Write to public/ (for explicit <link> tags)
  fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), icoBuf);
  console.log("  ✓ public/favicon.ico");

  // Write to app/ — Next.js App Router automatically serves app/favicon.ico
  // as the browser tab icon with no extra config needed.
  fs.writeFileSync(path.join(APP_DIR, "favicon.ico"), icoBuf);
  console.log("  ✓ app/favicon.ico");

  console.log("\n✅ All icons generated successfully!");
  console.log("   Run `npm run build` or restart dev server to see the favicon.");
}

run().catch((err) => {
  console.error("❌ Icon generation failed:", err.message);
  process.exit(1);
});
