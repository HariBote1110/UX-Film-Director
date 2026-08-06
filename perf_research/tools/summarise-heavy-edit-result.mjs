#!/usr/bin/env node
// 重量編集E2E (`npm run test:realistic-heavy-edit:e2e`) の result.json から、
// 性能判定の一次根拠となる「回数系指標」だけを抜き出す。
//
// 測定規約（progress/renderer-per-frame-rerender.md の訂正節に従う）:
// - Reactの再レンダー削減は `exercise.reactProfile.components[].commitCount` を一次根拠にする。
//   `chromiumRendererTrace.topFunctions[].callCount` はlaneを混同するため使わない。
// - ミリ秒系（busyMs / durationMs / Receive mojo reply）はrun-to-runで数倍ばらつくため参考値。
//
// 使い方:
//   node perf_research/tools/summarise-heavy-edit-result.mjs [result.json のパス...]
// 複数渡すと横並びの比較表を出す。

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const DEFAULT_RESULT = '.codex/realistic-heavy-edit-e2e/result.json';

const paths = process.argv.slice(2);
const targets = paths.length > 0 ? paths : [DEFAULT_RESULT];

/** @param {string} path */
const summarise = (path) => {
  const raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  const exercise = raw.exercise ?? {};
  const profile = exercise.reactProfile ?? {};
  const components = Object.fromEntries(
    (profile.components ?? []).map((component) => [component.id, component]),
  );
  const trace = raw.chromiumRendererTrace ?? {};
  const metrics = trace.performanceMetrics ?? {};
  const animate = (trace.topFunctions ?? [])
    .find((entry) => entry.functionName === 'animate');

  const phaseCounts = {};
  for (const sample of profile.samples ?? []) {
    const key = `${sample.id}:${sample.phase}`;
    phaseCounts[key] = (phaseCounts[key] ?? 0) + 1;
  }

  return {
    label: basename(resolve(path, '..')),
    path,
    ok: raw.passed ?? null,
    settled: raw.finalSnapshot?.settled ?? null,
    playbackMs: exercise.playbackMs ?? null,
    rafSampleCount: exercise.rafSampleCount ?? null,
    rafMeanMs: exercise.rafMeanMs ?? null,
    playbackClockHealth: exercise.playbackClockHealth?.healthy ?? null,
    presenterRestarts: exercise.presenterRestarts?.duringPlayback ?? null,
    droppedSampleCount: profile.droppedSampleCount ?? null,
    animateCallCount: animate?.callCount ?? null,
    layoutCount: metrics.layoutCount ?? null,
    recalcStyleCount: metrics.recalcStyleCount ?? null,
    busyMs: trace.busyMs ?? null,
    selectedObjectCountBefore: exercise.before?.selectedObjectCount ?? null,
    commitCounts: Object.fromEntries(
      Object.entries(components).map(([id, component]) => [id, component.commitCount]),
    ),
    actualDurationMs: Object.fromEntries(
      Object.entries(components).map(([id, component]) => [
        id,
        Number(component.totalActualDurationMs?.toFixed(1) ?? 0),
      ]),
    ),
    phaseCounts,
  };
};

const summaries = targets.map(summarise);

const numberOrDash = (value) =>
  typeof value === 'number' ? String(Number(value.toFixed(2))) : String(value ?? '-');

const rows = [
  ['ok', (s) => s.ok],
  ['settled', (s) => s.settled],
  ['playbackClock trustworthy', (s) => s.playbackClockHealth],
  ['rafSampleCount (=フレーム数)', (s) => s.rafSampleCount],
  ['rafMeanMs', (s) => s.rafMeanMs],
  ['animate callCount', (s) => s.animateCallCount],
  ['layoutCount', (s) => s.layoutCount],
  ['recalcStyleCount', (s) => s.recalcStyleCount],
  ['presenterRestarts (再生中)', (s) => s.presenterRestarts],
  ['selectedObjectCount (再生前)', (s) => s.selectedObjectCountBefore],
  ['droppedSampleCount', (s) => s.droppedSampleCount],
  ['busyMs (参考値)', (s) => s.busyMs],
];

const componentIds = [
  ...new Set(summaries.flatMap((s) => Object.keys(s.commitCounts))),
].sort();

const print = (label, values) => {
  console.log(`${label.padEnd(32)} | ${values.map((v) => numberOrDash(v).padStart(10)).join(' | ')}`);
};

console.log(`# 重量編集E2E 要約 (${summaries.length}件)`);
console.log('');
print('指標', summaries.map((s) => s.label));
console.log('-'.repeat(32 + summaries.length * 13));
for (const [label, pick] of rows) print(label, summaries.map(pick));

console.log('');
console.log('## commitCount（一次根拠）');
for (const id of componentIds) {
  print(id, summaries.map((s) => s.commitCounts[id] ?? 0));
}

console.log('');
console.log('## actualDuration 合計 ms（参考）');
for (const id of componentIds) {
  print(id, summaries.map((s) => s.actualDurationMs[id] ?? 0));
}

console.log('');
console.log('## phase 内訳（nested-update はコミット中のsetStateを示す）');
const phaseKeys = [...new Set(summaries.flatMap((s) => Object.keys(s.phaseCounts)))].sort();
for (const key of phaseKeys) {
  print(key, summaries.map((s) => s.phaseCounts[key] ?? 0));
}
