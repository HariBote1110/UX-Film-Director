/**
 * ag-psd metadata-tree dump — Node.js (VM/mac, no browser involved)
 *
 * Companion to `psd-native-bench --mode dump-meta` (Rust side). Parses a PSD
 * with ag-psd's `skipLayerImageData + skipCompositeImageData + skipThumbnail`
 * (metadata only, no pixel decode — mirrors `psd_fast::parse_psd_meta_only`)
 * and prints a JSON tree with the same shape so `compare-psd-parity.mjs` can
 * diff the two parsers node-by-node.
 *
 * Node ordering matches the pre-order flatten used by the UI
 * (`src/utils/psdAgPsdWorker.ts` / `psd_fast.rs` `flatten()`): group node
 * first, then its children, siblings in ag-psd's `children` array order
 * (which is already bottom-to-top per ag-psd's own convention, group-first).
 *
 * Usage:
 *   node dump-psd-tree.mjs <path/to/file.psd> [--out out.json]
 *
 * Protocol: one warm-up parse (discarded), one timed parse (used for both
 * the JSON tree and the reported wall time) — parity is the point here,
 * timing is secondary corroboration of the existing bench-agpsd.mjs numbers.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── minimal canvas stub (ag-psd's createImageData path is still probed even
//    with skipLayerImageData; keep the same no-op stub as bench-agpsd.mjs so
//    no native `canvas` build is required on the VM). ─────────────────────
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

const args = process.argv.slice(2);
const psdPath = args[0];
if (!psdPath) {
  console.error('usage: node dump-psd-tree.mjs <path/to/file.psd> [--out out.json]');
  process.exit(1);
}
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

const { readPsd } = require('ag-psd');

function buildTree(psd) {
  const nodes = [];

  function walk(children, parentPath) {
    for (const layer of children ?? []) {
      const name = layer.name ?? '';
      const path = parentPath ? `${parentPath}/${name}` : name;
      const isGroup = Array.isArray(layer.children);
      const top = layer.top ?? 0;
      const left = layer.left ?? 0;
      const bottom = layer.bottom ?? top;
      const right = layer.right ?? left;
      nodes.push({
        path,
        name,
        isGroup,
        top,
        left,
        width: right - left,
        height: bottom - top,
        visible: !layer.hidden,
      });
      if (isGroup) walk(layer.children, path);
    }
  }

  walk(psd.children, '');
  return nodes;
}

function parseOnce(buffer) {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const t0 = performance.now();
  const psd = readPsd(ab, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });
  const t1 = performance.now();
  return { psd, ms: t1 - t0 };
}

let result;
try {
  const buffer = readFileSync(psdPath);
  // warm-up (discarded) — JIT/allocator warm-up, same protocol as bench-agpsd.mjs
  parseOnce(buffer);
  // timed run — used for both the JSON tree and the reported wall time
  const { psd, ms } = parseOnce(buffer);
  const nodes = buildTree(psd);
  result = {
    file: psdPath,
    fileSizeBytes: buffer.byteLength,
    ok: true,
    depth: psd.bitsPerChannel ?? null,
    width: psd.width ?? null,
    height: psd.height ?? null,
    nodeCount: nodes.length,
    parseMs: ms,
    nodes,
  };
} catch (err) {
  result = {
    file: psdPath,
    ok: false,
    error: String(err && err.stack ? err.stack : err),
  };
}

const json = JSON.stringify(result);
if (outPath) {
  writeFileSync(outPath, json, 'utf-8');
  console.error(`wrote ${outPath} (${result.ok ? result.nodeCount + ' nodes, ' + result.parseMs.toFixed(2) + ' ms' : 'ERROR'})`);
} else {
  console.log(json);
}
