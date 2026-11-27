/**
 * コミット済みの fixture が、いまの TS 評価の出力と一致しているかを見る。
 *
 * fixture が古いと `rust-core/tests/ts_evaluation_parity.rs` は「昔の TS」と
 * 比較してしまい、差分が増えても気付けない。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildEvaluationParityFixtureSet,
  serialiseEvaluationParityFixture,
} from '../e2e/evaluationParityFixtureSet';

const FIXTURE_DIR = join(__dirname, '..', '..', 'rust-core', 'tests', 'fixtures', 'ts-evaluation-parity');

const REGENERATE = 'npm run fixture:evaluation-parity';

describe('rust-core 差分比較 fixture', () => {
  const entries = buildEvaluationParityFixtureSet();

  it('シーンが 1 件以上ある', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries.map((entry) => [entry.fileName, entry] as const))(
    '%s がいまの TS 評価と一致する',
    (fileName, entry) => {
      const path = join(FIXTURE_DIR, fileName);
      let committed: string;
      try {
        committed = readFileSync(path, 'utf8');
      } catch {
        throw new Error(`fixture が無い: ${path}\n${REGENERATE} で生成する`);
      }
      expect(
        committed,
        `fixture が古い: ${path}\n${REGENERATE} で再生成する`
      ).toBe(serialiseEvaluationParityFixture(entry));
    }
  );

  it('経路 A が受け付けない object が増えていない', () => {
    for (const entry of entries) {
      expect(
        entry.unsupportedByResidentPath,
        `${entry.fileName}: 経路 A(resident project) が受け付けない object が出た`
      ).toEqual([]);
    }
  });

  it('経路 B が組めない frame が無い', () => {
    for (const entry of entries) {
      expect(
        entry.skippedFrames,
        `${entry.fileName}: 経路 B(TS snapshot) が組めない frame が出た`
      ).toEqual([]);
    }
  });
});
