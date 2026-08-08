/**
 * ag-psd baseline bench — Node.js (VM, no browser involved)
 *
 * Measures readPsd() wall-clock time for a fixed PSD file, two variants:
 *   (a) full parse incl. pixel data (composite image + thumbnail + all layers)
 *   (b) skipCompositeImageData + skipThumbnail — mirrors the browser
 *       "skipCompositing: true" measurement in markdown/PSD_WASM_Challenge.md
 *       (layer pixel data still decoded, only the flattened composite + thumb skipped)
 *
 * ag-psd needs a canvas-like factory registered via initializeCanvas() to
 * allocate its internal pixel buffers, even with useImageData:true (see
 * createImageDataBitDepth() in ag-psd/dist/psdReader.js, which always calls
 * through helpers.createImageData()). Installing the native `canvas` npm
 * package is unnecessary for a parse-time benchmark — that package's
 * createImageData() only allocates a Uint8ClampedArray-backed buffer too;
 * it does no PSD-related work. We register a minimal in-memory stub with
 * the same shape instead, so the decode path taken (and its cost) is
 * identical, without pulling in canvas's native build toolchain on the VM.
 *
 * Protocol: N iterations, first 3 discarded as JIT warm-up, report
 * median / min / max / stddev (population) in ms.
 *
 * Usage:
 *   node bench-agpsd.mjs [path/to/file.psd] [iterations]
 * Defaults: ../葵ちゃん.psd (relative to this script), 15 iterations
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── minimal canvas stub (buffer allocation only, no real rendering) ──────────

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

const PSD_PATH   = process.argv[2] ?? resolve(__dirname, '葵ちゃん.psd');
const ITERATIONS = parseInt(process.argv[3] ?? '15', 10);
const WARMUP     = 3;

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = samples.reduce((s, v) => s + v, 0) / n;
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    min: sorted[0],
    max: sorted[n - 1],
    median: n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2],
    mean,
    stddev: Math.sqrt(variance),
    n,
  };
}

function fmt(ms) { return ms.toFixed(2).padStart(8) + ' ms'; }

function printStats(label, samples) {
  const s = stats(samples);
  console.log(`  ${label.padEnd(40)} n=${s.n}  min=${fmt(s.min)}  median=${fmt(s.median)}  mean=${fmt(s.mean)}  max=${fmt(s.max)}  stddev=${fmt(s.stddev)}`);
}

function runSet(label, opts, psdBuffer, iterations, warmup) {
  const { readPsd } = require('ag-psd');
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    // fresh ArrayBuffer copy each iteration — readPsd may consume/reference the buffer
    const ab = psdBuffer.buffer.slice(psdBuffer.byteOffset, psdBuffer.byteOffset + psdBuffer.byteLength);
    const t0 = performance.now();
    readPsd(ab, opts);
    const t1 = performance.now();
    if (i >= warmup) samples.push(t1 - t0);
  }
  console.log(`\n─── ${label} ───────────────────────────────`);
  printStats(label, samples);
  return samples;
}

console.log(`\nag-psd version: ${require('ag-psd/package.json').version}`);
console.log(`node version  : ${process.version}`);
console.log(`PSD file      : ${PSD_PATH}`);

const psdBuffer = readFileSync(PSD_PATH);
const psdSizeMB = (psdBuffer.byteLength / 1024 / 1024).toFixed(2);
console.log(`File size     : ${psdSizeMB} MB`);
console.log(`Iterations    : ${ITERATIONS} (first ${WARMUP} discarded as warm-up)\n`);

// (a) full parse incl. pixel data, no canvas dependency
runSet('(a) full readPsd() [useImageData:true]', { useImageData: true }, psdBuffer, ITERATIONS, WARMUP);

// (b) skip composite image + thumbnail (mirrors browser skipCompositing:true)
runSet('(b) readPsd() [skipCompositeImageData+skipThumbnail, useImageData:true]',
  { useImageData: true, skipCompositeImageData: true, skipThumbnail: true },
  psdBuffer, ITERATIONS, WARMUP);

console.log('\nDone.\n');
