/**
 * One-off script (R5-3, work item 0): dump the ag-psd layer-tree output for
 * 葵ちゃん.psd as it existed on the pre-R5-3 import path
 * (`parsePsdViaWasm` → `psdAgPsdWorker.ts`'s `walkLayers`), meta-only
 * (no pixel bytes — matches what `psd.parseMeta` also omits).
 *
 * This is a parity BASELINE for R5-7 (not run as part of the test suite):
 * R5-7 will diff the Rust `psd.parseMeta` RPC output against this file.
 *
 * Usage: node dump-agpsd-parity-baseline.mjs <path-to-psd> <output-json-path>
 */
import { readPsd } from 'ag-psd';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , psdPath, outPath] = process.argv;
if (!psdPath || !outPath) {
  console.error('usage: node dump-agpsd-parity-baseline.mjs <path-to-psd> <output-json-path>');
  process.exit(1);
}

const buffer = readFileSync(psdPath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

// Meta-only: skip all pixel/composite decode work, same scope as psd.parseMeta.
const psd = readPsd(arrayBuffer, {
  skipLayerImageData: true,
  skipCompositeImageData: true,
  skipThumbnail: true,
});

const getWidth = (layer) => {
  if (typeof layer.left === 'number' && typeof layer.right === 'number') {
    return Math.max(0, layer.right - layer.left);
  }
  return 0;
};
const getHeight = (layer) => {
  if (typeof layer.top === 'number' && typeof layer.bottom === 'number') {
    return Math.max(0, layer.bottom - layer.top);
  }
  return 0;
};

const results = [];
const walkLayers = (layers, parentGroupId, counter) => {
  layers.forEach((layer, order) => {
    const isGroup = Array.isArray(layer.children);
    const ownGroupId = isGroup ? counter.n++ : null;

    results.push({
      name: layer.name ?? '',
      top: layer.top ?? 0,
      left: layer.left ?? 0,
      width: getWidth(layer),
      height: getHeight(layer),
      visible: layer.hidden !== true,
      isGroup,
      ownGroupId,
      parentGroupId,
      order,
    });

    if (isGroup && layer.children) {
      walkLayers(layer.children, ownGroupId, counter);
    }
  });
};

walkLayers(psd.children ?? [], null, { n: 0 });

const dump = {
  source: 'ag-psd (pre-R5-3 default import path: parsePsdViaWasm -> psdAgPsdWorker.ts walkLayers, meta-only)',
  file: psdPath,
  generatedAt: new Date().toISOString(),
  docWidth: psd.width,
  docHeight: psd.height,
  nodeCount: results.length,
  nodes: results,
};

writeFileSync(outPath, JSON.stringify(dump, null, 2));
console.log(`wrote ${results.length} nodes to ${outPath}`);
