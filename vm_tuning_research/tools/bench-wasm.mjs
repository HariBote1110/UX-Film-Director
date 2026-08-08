/**
 * Node-WASM PSD parse bench — reuses the pre-built perf/wasm-node/ package
 * (wasm-pack Node target, no rebuild) to reproduce the "single-threaded WASM
 * fallback" measurement from perf/bench-psd.mjs (Benchmark 4: PsdParser) on
 * the VM, for a like-for-like comparison against ag-psd on the same host.
 *
 * Protocol: N iterations, first 3 discarded as JIT/wasm warm-up, report
 * median / min / max / stddev (population) in ms.
 *
 * Usage:
 *   node bench-wasm.mjs [path/to/file.psd] [iterations]
 * Defaults: ./葵ちゃん.psd (relative to this script), 15 iterations
 */

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const { PsdParser } = await import('./wasm-node/psd_wasm.js');

console.log(`\nnode version  : ${process.version}`);
console.log(`PSD file      : ${PSD_PATH}`);

const psdBuffer = readFileSync(PSD_PATH);
const psdSizeMB = (psdBuffer.byteLength / 1024 / 1024).toFixed(2);
console.log(`File size     : ${psdSizeMB} MB`);
console.log(`Iterations    : ${ITERATIONS} (first ${WARMUP} discarded as warm-up)\n`);

const samples = [];
for (let i = 0; i < ITERATIONS; i++) {
  const psdU8 = new Uint8Array(psdBuffer.buffer, psdBuffer.byteOffset, psdBuffer.byteLength);
  const t0 = performance.now();
  const parser = new PsdParser(psdU8);
  parser.metadata();
  const n = parser.layer_count();
  for (let j = 0; j < n; j++) parser.get_layer_rgba(j);
  parser.free();
  const t1 = performance.now();
  if (i >= WARMUP) samples.push(t1 - t0);
}

console.log('─── PsdParser (full single-thread, WASM) ───────────────────────────');
printStats('PsdParser::new() + all get_layer_rgba', samples);
console.log('\nDone.\n');
