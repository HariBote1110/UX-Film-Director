/**
 * PSD metadata-parity driver — runs both parsers (ag-psd via
 * `dump-psd-tree.mjs`, native Rust via `psd-native-bench dump-meta`) over
 * every PSD in a corpus and reports a per-file, per-node comparison.
 *
 * A parser crash on either side is a FINDING, not a harness abort: the file
 * is recorded with an error and the driver moves on to the next one.
 *
 * Usage:
 *   node compare-psd-parity.mjs <file-list.txt> [--out results.json]
 *
 * <file-list.txt>: one absolute PSD path per line (blank lines / lines
 * starting with # are ignored).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const listPath = args[0];
if (!listPath) {
  console.error('usage: node compare-psd-parity.mjs <file-list.txt> [--out results.json]');
  process.exit(1);
}
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : resolve(__dirname, '../notes/tachie-corpus-parity-results.json');

const RUST_BIN = resolve(__dirname, 'psd-native-bench/target/release/psd-native-bench');
const DUMP_JS = resolve(__dirname, 'dump-psd-tree.mjs');

if (!existsSync(RUST_BIN)) {
  console.error(`Rust bench binary not found at ${RUST_BIN} — run \`cargo build --release\` in psd-native-bench/ first.`);
  process.exit(1);
}

const files = readFileSync(listPath, 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

function runAgPsd(file) {
  try {
    const out = execFileSync('node', [DUMP_JS, file], { maxBuffer: 1024 * 1024 * 200, encoding: 'utf-8' });
    return JSON.parse(out);
  } catch (err) {
    return { file, ok: false, error: `driver-side ag-psd invocation failed: ${err.message}` };
  }
}

function runRust(file) {
  try {
    const out = execFileSync(RUST_BIN, ['dump-meta', file], { maxBuffer: 1024 * 1024 * 200, encoding: 'utf-8' });
    return JSON.parse(out);
  } catch (err) {
    // The Rust binary always prints JSON and exits 0, even on parse
    // failure — a non-zero exit or unparsable stdout means it panicked.
    return { file, ok: false, error: `driver-side rust invocation failed (likely panic): ${err.message}` };
  }
}

function diffNodes(agNodes, rustNodes, maxMismatches = 10) {
  const mismatches = [];
  const n = Math.max(agNodes.length, rustNodes.length);
  for (let i = 0; i < n && mismatches.length < maxMismatches; i++) {
    const a = agNodes[i];
    const r = rustNodes[i];
    if (!a) {
      mismatches.push({ index: i, kind: 'extra-in-rust', rust: r });
      continue;
    }
    if (!r) {
      mismatches.push({ index: i, kind: 'missing-in-rust', agpsd: a });
      continue;
    }
    const fields = [];
    if (a.name !== r.name) fields.push('name');
    if (a.isGroup !== r.isGroup) fields.push('isGroup');
    if (a.top !== r.top) fields.push('top');
    if (a.left !== r.left) fields.push('left');
    if (a.width !== r.width) fields.push('width');
    if (a.height !== r.height) fields.push('height');
    if (a.visible !== r.visible) fields.push('visible');
    if (fields.length > 0) {
      mismatches.push({ index: i, kind: 'field-mismatch', fields, agpsd: a, rust: r });
    }
  }
  return mismatches;
}

const results = [];
for (const file of files) {
  process.stderr.write(`\n=== ${file} ===\n`);
  const ag = runAgPsd(file);
  const rust = runRust(file);

  const entry = {
    file,
    fileSizeBytes: ag.fileSizeBytes ?? rust.fileSizeBytes ?? null,
    agpsd: { ok: ag.ok, error: ag.ok ? undefined : ag.error, depth: ag.depth, width: ag.width, height: ag.height, nodeCount: ag.nodeCount, parseMs: ag.parseMs },
    rust: { ok: rust.ok, error: rust.ok ? undefined : rust.error, width: rust.width, height: rust.height, nodeCount: rust.nodeCount, parseMs: rust.parseMs },
  };

  if (ag.ok && rust.ok) {
    entry.nodeCountMatch = ag.nodeCount === rust.nodeCount;
    entry.dimsMatch = ag.width === rust.width && ag.height === rust.height;
    entry.mismatches = diffNodes(ag.nodes, rust.nodes);
    entry.fullMatch = entry.nodeCountMatch && entry.dimsMatch && entry.mismatches.length === 0;
  } else {
    entry.fullMatch = false;
  }

  process.stderr.write(
    `  ag-psd: ok=${ag.ok} nodes=${ag.nodeCount ?? '-'} depth=${ag.depth ?? '-'} ${ag.parseMs?.toFixed(2) ?? '-'}ms\n` +
    `  rust  : ok=${rust.ok} nodes=${rust.nodeCount ?? '-'} ${rust.parseMs?.toFixed(3) ?? '-'}ms\n` +
    `  match : ${entry.fullMatch}` + (entry.mismatches?.length ? ` (${entry.mismatches.length} mismatches shown, may be truncated at 10)` : '') + '\n'
  );

  results.push(entry);
}

writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');

const total = results.length;
const fullMatches = results.filter((r) => r.fullMatch).length;
const agCrashes = results.filter((r) => !r.agpsd.ok).length;
const rustCrashes = results.filter((r) => !r.rust.ok).length;

console.log(`\n\n=== SUMMARY ===`);
console.log(`total files        : ${total}`);
console.log(`full matches       : ${fullMatches}`);
console.log(`ag-psd crashes     : ${agCrashes}`);
console.log(`rust crashes       : ${rustCrashes}`);
console.log(`results written to : ${outPath}`);
