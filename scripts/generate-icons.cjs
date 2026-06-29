const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SVG = path.resolve(__dirname, "..", "src-tauri", "icons", "icon.svg");
const OUT = path.resolve(__dirname, "..", "src-tauri", "icons");

const SIZES = [32, 128, 256]; // 32x32.png, 128x128.png, 128x128@2x.png

async function main() {
  for (const size of SIZES) {
    const name = size === 256 ? "128x128@2x.png" : `${size}x${size}.png`;
    await sharp(SVG).resize(size, size).png().toFile(path.join(OUT, name));
    console.log(`  ✓ ${name}`);
  }

  // Build ICO from 32 + 128 PNG data
  const png32 = await sharp(SVG).resize(32, 32).png().toBuffer();
  const png128 = await sharp(SVG).resize(128, 128).png().toBuffer();

  const entries = [
    { w: 32, h: 32, data: png32 },
    { w: 128, h: 128, data: png128 },
  ];

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type = ICO
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const dirs = [];
  for (const e of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(e.w >= 256 ? 0 : e.w, 0);
    dir.writeUInt8(e.h >= 256 ? 0 : e.h, 1);
    dir.writeUInt8(0, 2);   // colors
    dir.writeUInt8(0, 3);   // reserved
    dir.writeUInt16LE(1, 4); // planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(e.data.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirs.push(dir);
    offset += e.data.length;
  }

  const ico = Buffer.concat([header, ...dirs, ...entries.map(e => e.data)]);
  fs.writeFileSync(path.join(OUT, "icon.ico"), ico);
  console.log("  ✓ icon.ico");
}

main().catch(console.error);
