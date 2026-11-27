/**
 * ag-psd ONE-SHOT peak-RSS bench — Node.js (VM, no browser involved)
 *
 * Unlike bench-agpsd.mjs (multi-iteration, GC-history-distorted for peak
 * memory purposes), this script performs exactly ONE readPsd() call with
 * the (b) skipCompositeImageData + skipThumbnail options (still decodes
 * every layer's pixel data — this is the variant compared against the
 * native psd_fast bench, which also skips the flattened composite/thumb),
 * then exits. Intended to be wrapped by `/usr/bin/time -v` on the caller
 * side so "Maximum resident set size" reflects a single decode's peak,
 * not a peak inflated or deflated by prior iterations' GC state.
 *
 * Usage:
 *   /usr/bin/time -v node bench-agpsd-oneshot.mjs [path/to/file.psd]
 * Default file: ../葵ちゃん.psd (relative to this script)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function stubCreateImageData(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function stubCreateCanvas(width, height) {
  return {
    width,
    height,
    getContext() {
      return {
        createImageData: stubCreateImageData,
        putImageData() {},
        getImageData: (_x, _y, w, h) => stubCreateImageData(w, h),
      };
    },
    toDataURL() { return ''; },
  };
}

{
  const { initializeCanvas } = require('ag-psd');
  initializeCanvas(stubCreateCanvas, stubCreateImageData);
}

const PSD_PATH = process.argv[2] ?? resolve(__dirname, '葵ちゃん.psd');

const { readPsd } = require('ag-psd');
const psdBuffer = readFileSync(PSD_PATH);
console.log(`ag-psd version: ${require('ag-psd/package.json').version}`);
console.log(`node version  : ${process.version}`);
console.log(`PSD file      : ${PSD_PATH} (${(psdBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

const ab = psdBuffer.buffer.slice(psdBuffer.byteOffset, psdBuffer.byteOffset + psdBuffer.byteLength);

const t0 = process.hrtime.bigint();
const psd = readPsd(ab, { useImageData: true, skipCompositeImageData: true, skipThumbnail: true });
const t1 = process.hrtime.bigint();

let layerCount = 0;
let totalBytes = 0;
(function walk(children) {
  for (const c of children ?? []) {
    if (c.children) walk(c.children);
    else {
      layerCount++;
      if (c.imageData?.data) totalBytes += c.imageData.data.length;
    }
  }
})(psd.children);

console.log(`parse time    : ${Number(t1 - t0) / 1e6} ms`);
console.log(`layer_count   : ${layerCount}`);
console.log(`total_decoded_rgba_bytes: ${totalBytes}`);

// Keep the result reachable until process exit so the peak RSS the OS
// reports genuinely reflects "all decoded layers held at once", matching
// the native bench's materialise-everything behaviour. No explicit
// process.exit() call needed — falling off the end is sufficient and
// avoids any exit-path GC quirks.
globalThis.__keepAlive = psd;
