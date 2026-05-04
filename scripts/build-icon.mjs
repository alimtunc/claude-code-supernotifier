#!/usr/bin/env node
// Generate media/icon.png (128x128) from media/icon.svg using macOS qlmanage when available,
// else fall back to a hand-written solid-colour PNG so the marketplace package never ships
// without an icon. Run with: node scripts/build-icon.mjs

import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const svgPath = join(root, 'media', 'icon.svg');
const pngPath = join(root, 'media', 'icon.png');

if (!existsSync(svgPath)) {
  console.error(`Missing source: ${svgPath}`);
  process.exit(1);
}

if (renderWithQlmanage()) {
  console.log('Rendered media/icon.png from icon.svg via qlmanage.');
  process.exit(0);
}

writeFallbackPng();
console.log('qlmanage unavailable — wrote a fallback solid PNG. Replace via your designer of choice.');

function renderWithQlmanage() {
  if (process.platform !== 'darwin') return false;
  const tmp = join(root, 'media', '.qlmanage-tmp');
  mkdirSync(tmp, { recursive: true });
  const result = spawnSync('qlmanage', ['-t', '-s', '128', '-o', tmp, svgPath], { encoding: 'utf8' });
  if (result.status === 0) {
    const generated = join(tmp, 'icon.svg.png');
    if (existsSync(generated)) {
      copyFileSync(generated, pngPath);
      rmSync(tmp, { recursive: true, force: true });
      return true;
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  return false;
}

function writeFallbackPng() {
  const size = 128;
  const channels = 4; // RGBA
  const raw = Buffer.alloc(size * (1 + size * channels));

  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * channels)] = 0; // PNG filter byte: None
    for (let x = 0; x < size; x++) {
      const offset = y * (1 + size * channels) + 1 + x * channels;
      const t = y / size;
      const r = Math.round(0x1f + (0x2d - 0x1f) * t);
      const g = Math.round(0x1f + (0x2d - 0x1f) * t);
      const b = Math.round(0x23 + (0x33 - 0x23) * t);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 0xff;
    }
  }

  const pngBuffer = encodePng(size, size, raw);
  writeFileSync(pngPath, pngBuffer);
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw, { level: 9 });

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcValue = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
