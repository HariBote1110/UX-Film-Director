/**
 * P2b 受入材料: generated / audio / getcolor / group_control を混在させた
 * シーンで、`buildEditableRustScene`（editable graph 経路）と
 * `buildRustSceneSnapshotForTimeline`（従来の TS serializer 経路）が
 * media 生成で一致することを確認する契約テスト。
 *
 * 比較セマンティクスは `rust-backend/src/scene.rs` の
 * `collect_structural_diffs` / `comparable_value` を手で写している
 * （数値は 1e-5 許容、`.source` は文字列ではなく parse 済み JSON として比較）。
 *
 * 注意: `buildRustSceneSnapshotForTimeline` は指定した時刻で評価済みの
 * snapshot（`clips`）だけを返し、editable graph 相当の未評価 `project`
 * （tracks/clips の生データ）は返さない。そのため実際の dual-run
 * （`rust-backend/src/scene.rs` の `dual_run_diagnostics`）が比較する
 * `project` 全体と同じ形の比較はこの2関数だけでは再現できない。
 * 両者が共通して返す構造は media list（`RustSceneMediaReference[]`）
 * だけなので、本テストはそこに比較範囲を絞る。
 */
import { describe, expect, it } from 'vitest';

import { buildEditableRustScene } from './editableRustScene';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneMediaReference,
} from './rustSceneSnapshot';
import {
  mixedKindDualRunLayers,
  mixedKindDualRunObjects,
  mixedKindDualRunSettings,
  mixedKindDualRunTime,
} from './mixedKindDualRunFixture';

/** rust-backend/src/scene.rs の comparable_value を写す: `.source` は JSON として比較する。 */
const comparableValue = (path: string, value: unknown): unknown => {
  if (path.endsWith('.source') && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** rust-backend/src/scene.rs の collect_structural_diffs を写す構造比較。 */
const collectStructuralDiffs = (path: string, expected: unknown, actual: unknown, diffs: string[]): void => {
  const left = comparableValue(path, expected);
  const right = comparableValue(path, actual);

  if (typeof left === 'number' && typeof right === 'number') {
    if (Math.abs(left - right) <= 1e-5) return;
    diffs.push(path);
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set<string>([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (key in left && key in right) {
        collectStructuralDiffs(`${path}.${key}`, left[key], right[key], diffs);
      } else {
        diffs.push(`${path}.${key}`);
      }
    }
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) diffs.push(`${path}.length`);
    const count = Math.min(left.length, right.length);
    for (let index = 0; index < count; index += 1) {
      collectStructuralDiffs(`${path}[${index}]`, left[index], right[index], diffs);
    }
    return;
  }

  if (left !== right) diffs.push(path);
};

const sortMediaById = (media: RustSceneMediaReference[]): RustSceneMediaReference[] =>
  [...media].sort((left, right) => left.id.localeCompare(right.id));

describe('mixed-kind dual-run media parity（P2b 受入材料）', () => {
  it('editable graph 経路と TS serializer 経路の media list が一致する', () => {
    const editable = buildEditableRustScene({
      sceneId: 'mixed-kind-dual-run',
      projectSettings: mixedKindDualRunSettings,
      layers: mixedKindDualRunLayers,
      objects: mixedKindDualRunObjects,
    });
    expect(editable.ok, editable.ok ? '' : JSON.stringify((editable as { issues: unknown }).issues)).toBe(true);
    if (!editable.ok) return;

    const snapshot = buildRustSceneSnapshotForTimeline({
      projectSettings: mixedKindDualRunSettings,
      layers: mixedKindDualRunLayers,
      objects: mixedKindDualRunObjects,
      time: mixedKindDualRunTime,
      videoSourceMode: 'previewProxy',
    });
    expect(snapshot.ok, snapshot.ok ? '' : JSON.stringify((snapshot as { issues: unknown }).issues)).toBe(true);
    if (!snapshot.ok) return;

    // 混在させた6種類の kind が両経路とも media を生成していることを前提として確認する。
    expect(sortMediaById(editable.media).map((media) => media.id)).toEqual(
      sortMediaById(snapshot.media).map((media) => media.id)
    );

    const diffs: string[] = [];
    collectStructuralDiffs(
      'media',
      sortMediaById(snapshot.media) as unknown,
      sortMediaById(editable.media) as unknown,
      diffs
    );

    expect(diffs, `media list に構造差分がある: ${JSON.stringify(diffs)}`).toEqual([]);
  });
});
