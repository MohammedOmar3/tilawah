// Writes public/icon-192.png and public/icon-512.png: a gold ring and centre dot
// on the page background, matching app/icon.svg. Zero dependencies (zlib only).
// Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [0x07, 0x0b, 0x12];
const GOLD = [0xd4, 0xaf, 0x6b];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Coverage of the mark at (x, y) in a 1×1 square: ring r∈[0.30,0.36], dot r<0.10. */
function inMark(x, y) {
  const r = Math.hypot(x - 0.5, y - 0.5);
  return (r >= 0.3 && r <= 0.36) || r < 0.1;
}

function png(size) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) if (inMark((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)) hits++;
      const a = hits / (SS * SS);
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(BG[c] * (1 - a) + GOLD[c] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size));
}
