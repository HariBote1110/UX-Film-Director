/**
 * TS 評価 / rust-core 評価の差分比較用 fixture を生成する。
 *
 *   npm run fixture:evaluation-parity
 *
 * 出力先は `rust-core/tests/fixtures/ts-evaluation-parity/`。
 * 消費側は `rust-core/tests/ts_evaluation_parity.rs`。
 * fixture の定義そのものは `src/e2e/evaluationParityFixtureSet.ts` が正本で、
 * drift 検出テストも同じ定義を見る。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildEvaluationParityFixtureSet,
  serialiseEvaluationParityFixture,
} from '../src/e2e/evaluationParityFixtureSet';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'rust-core', 'tests', 'fixtures', 'ts-evaluation-parity');

mkdirSync(outputDir, { recursive: true });

let totalFrames = 0;
let totalDropped = 0;
let totalSkipped = 0;

for (const entry of buildEvaluationParityFixtureSet()) {
  const path = join(outputDir, entry.fileName);
  writeFileSync(path, serialiseEvaluationParityFixture(entry), 'utf8');

  totalFrames += entry.fixture.frames.length;
  totalDropped += entry.unsupportedByResidentPath.length;
  totalSkipped += entry.skippedFrames.length;

  const clipCount = entry.fixture.project.tracks.reduce((sum, track) => sum + track.clips.length, 0);
  console.log(`[${entry.fixture.name}]`);
  console.log(`  objects          = ${entry.objectCount}`);
  console.log(`  clips in project = ${clipCount}`);
  console.log(`  compared frames  = ${entry.fixture.frames.length} / ${entry.requestedFrameCount}`);
  if (entry.unsupportedByResidentPath.length > 0) {
    console.log(`  経路A 非対応で除外した object: ${entry.unsupportedByResidentPath.length}`);
    for (const issue of entry.unsupportedByResidentPath) {
      console.log(`    - ${issue.objectId} [${issue.code}] ${issue.detail}`);
    }
  }
  if (entry.skippedFrames.length > 0) {
    const codes = new Map<string, number>();
    for (const skipped of entry.skippedFrames) {
      for (const issue of skipped.issues) codes.set(issue.code, (codes.get(issue.code) ?? 0) + 1);
    }
    console.log(`  経路B が組めず除外した frame: ${entry.skippedFrames.length}`);
    for (const [code, count] of codes) console.log(`    - ${code}: ${count}`);
  }
  console.log(`  -> ${path}`);
}

console.log('');
console.log(`合計: 比較フレーム ${totalFrames}、除外 object ${totalDropped}、除外 frame ${totalSkipped}`);
