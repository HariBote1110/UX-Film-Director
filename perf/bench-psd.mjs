/**
 * PSD parse benchmark — Node.js
 *
 * Measures:
 *   1. WASM PsdLayout (Phase 1 metadata only)
 *   2. WASM serial decompress (PsdLayout + all layers, single-threaded)
 *   3. WASM PsdParser (full single-threaded fallback)
 *   4. ag-psd (readPsd — current baseline)
 *
 * Usage:
 *   node perf/bench-psd.mjs [path/to/file.psd] [iterations]
 *
 * Defaults: 葵ちゃん.psd, 5 iterations
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Worker, workerData, parentPort, isMainThread } from 'node:worker_threads';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const PSD_PATH   = process.argv[2] ?? resolve(__dirname, '../葵ちゃん.psd');
const ITERATIONS = parseInt(process.argv[3] ?? '5', 10);

// ── helpers ──────────────────────────────────────────────────────────────────

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function fmt(ms) { return ms.toFixed(1).padStart(7) + ' ms'; }

function printStats(label, samples) {
  const s = stats(samples);
  console.log(`  ${label.padEnd(36)} min=${fmt(s.min)}  avg=${fmt(s.avg)}  median=${fmt(s.median)}  max=${fmt(s.max)}`);
}

// ── load WASM ─────────────────────────────────────────────────────────────────

const wasmPkg = await import('./wasm-node/psd_wasm.js');
const { PsdLayout, PsdParser, decompress_layer_raw } = wasmPkg;

// ── load PSD bytes ────────────────────────────────────────────────────────────

console.log(`\nPSD file : ${PSD_PATH}`);
const psdBuffer = readFileSync(PSD_PATH);
const psdSize   = (psdBuffer.byteLength / 1024 / 1024).toFixed(1);
console.log(`File size: ${psdSize} MB`);
console.log(`Iterations: ${ITERATIONS}\n`);

// ── Benchmark 1: Phase 1 only (PsdLayout metadata) ───────────────────────────

{
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const psdU8 = new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength);
    const t0 = performance.now();
    const layout = new PsdLayout(psdU8);
    const tMeta = performance.now();
    const meta = layout.metadata();
    const tDone = performance.now();
    layout.free();
    if (i === 0) {
      const layers = meta.layers.length;
      const leafLayers = meta.layers.filter(l => !l.isGroup).length;
      console.log(`  Layer count: ${layers} total, ${leafLayers} leaf (non-group)`);
      console.log(`  Document: ${meta.width}×${meta.height}  depth=${meta.depth}  psb=${meta.isPsb}\n`);
    }
    samples.push(tDone - t0);
  }
  console.log('─── Phase 1: PsdLayout (metadata only) ─────────────────────────────');
  printStats('PsdLayout::new() + metadata()', samples);
}

// ── Benchmark 2: Phase 1 + leaf_tasks_json ────────────────────────────────────

{
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const psdU8 = new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength);
    const t0 = performance.now();
    const layout = new PsdLayout(psdU8);
    layout.metadata();
    JSON.parse(layout.leaf_tasks_json());
    const tDone = performance.now();
    layout.free();
    samples.push(tDone - t0);
  }
  console.log('─── Phase 1b: PsdLayout + leaf_tasks_json (tasks for workers) ───────');
  printStats('PsdLayout + leaf_tasks_json()', samples);
}

// ── Benchmark 3: WASM serial decompress via decompress_layer_raw ─────────────

{
  const psdU8 = new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength);
  const layout = new PsdLayout(psdU8);
  layout.metadata();
  const tasks = JSON.parse(layout.leaf_tasks_json());
  layout.free();

  const meta2 = (() => {
    const l2 = new PsdLayout(new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength));
    const m = l2.metadata();
    l2.free();
    return m;
  })();
  const { depth, isPsb } = meta2;

  const samples = [];
  const layerSamples = {};
  for (let i = 0; i < ITERATIONS; i++) {
    const bytes = new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength);
    const t0 = performance.now();
    for (const task of tasks) {
      const ids  = new Int32Array(task.channelIds);
      const lens = new Uint32Array(task.channelLens);
      const tL = performance.now();
      const rgba = decompress_layer_raw(bytes, BigInt(task.offset), ids, lens, task.width, task.height, depth, isPsb);
      if (i === 0) layerSamples[task.idx] = performance.now() - tL;
      void rgba;
    }
    samples.push(performance.now() - t0);
  }

  console.log('\n─── Phase 2: serial decompress_layer_raw (all leaf layers) ─────────');
  printStats('decompress_layer_raw × all layers', samples);

  // Show top-5 slowest layers
  const sorted = Object.entries(layerSamples).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  Top-5 slowest layers (first iteration):');
  for (const [idx, ms] of sorted) {
    const task = tasks[tasks.findIndex(t => t.idx == idx)];
    const mpx = ((task?.width ?? 0) * (task?.height ?? 0) / 1e6).toFixed(2);
    console.log(`    layer[${String(idx).padStart(3)}]  ${fmt(ms)}  ${mpx} Mpx  (${task?.width}×${task?.height})`);
  }
}

// ── Benchmark 4: WASM PsdParser (full single-threaded fallback) ───────────────

{
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const psdU8 = new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength);
    const t0 = performance.now();
    const parser = new PsdParser(psdU8);
    parser.metadata();
    const n = parser.layer_count();
    for (let j = 0; j < n; j++) parser.get_layer_rgba(j);
    parser.free();
    samples.push(performance.now() - t0);
  }
  console.log('\n─── PsdParser (full single-thread fallback) ─────────────────────────');
  printStats('PsdParser::new() + all get_layer_rgba', samples);
}

// ── Benchmark 5: ag-psd ───────────────────────────────────────────────────────
// ag-psd requires Canvas in Node.js for full image decode.
// We benchmark with skipCompositing=false where possible, otherwise metadata only.

{
  const { readPsd, initializeCanvas } = require('ag-psd');

  // Try to initialise canvas for full pixel decode
  let canvasAvailable = false;
  try {
    const { createCanvas, createImageData } = require('canvas');
    initializeCanvas(createCanvas, createImageData);
    canvasAvailable = true;
  } catch {
    // canvas package not installed — benchmark metadata+structure only
  }

  const label = canvasAvailable
    ? 'readPsd() — full decode (canvas)'
    : 'readPsd({ skipCompositing: true }) — metadata only';
  const opts = canvasAvailable ? {} : { skipCompositing: true };

  const samples = [];
  let failed = false;
  for (let i = 0; i < ITERATIONS; i++) {
    const ab = psdBuffer.buffer.slice(psdBuffer.byteOffset, psdBuffer.byteOffset + psdBuffer.byteLength);
    const t0 = performance.now();
    try {
      readPsd(Buffer.from(ab), opts);
      samples.push(performance.now() - t0);
    } catch {
      failed = true;
      break;
    }
  }
  console.log('\n─── ag-psd (baseline) ────────────────────────────────────────────────');
  if (failed || samples.length === 0) {
    console.log('  ⚠  ag-psd requires the `canvas` npm package for full pixel decode in Node.js.');
    console.log('     Browser benchmark (~310 ms) remains the reference for ag-psd.');
    console.log('     Install: npm install canvas   to enable this benchmark.');
  } else {
    if (!canvasAvailable) {
      console.log('  ⚠  canvas package not found — pixel decode skipped (numbers are lower than browser)');
    }
    printStats(label, samples);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('  NOTE: serial WASM times are single-core.');
console.log('  In the browser, phase2(decompress) runs across N Workers in parallel.');
console.log('  Expected browser phase2 ≈ serial_decompress / min(Workers, layers).');
console.log('═══════════════════════════════════════════════════════════════════════\n');
