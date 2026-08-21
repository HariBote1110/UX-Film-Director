/**
 * TS 側の評価（`rustSceneSnapshot.ts`）と rust-core の評価（`timeline::evaluate_frame`）を
 * 突き合わせるための fixture を組み立てる。
 *
 * 同じ「評価済みシーン」を作る経路が現在 2 本ある
 * （`markdown/Rust_Source_Of_Truth_Plan.md` §1.2）。
 *
 * - 経路 A: `buildEditableRustScene` → `scene.replace(project)` → rust-core が評価
 * - 経路 B: `buildRustSceneSnapshotForTimeline` → TS が評価済み snapshot を渡す
 *
 * ここでは同じ object 集合から経路 A の入力（`project`）と経路 B の出力（`snapshot`）を
 * 出し、Rust 側テスト `rust-core/tests/ts_evaluation_parity.rs` が両者を比較する。
 *
 * 経路 A は経路 B より対応範囲が狭い（V1 の制限）。受け付けられない object は
 * 落としたうえで `unsupportedByResidentPath` に記録する。落とした事実そのものが
 * R0 の成果物なので、黙って除外しない。
 */
import type { LayerState, ProjectSettings, TimelineObject } from '../types';
import {
  buildEditableRustScene,
  type EditableRustProject,
  type EditableRustSceneIssue,
} from './editableRustScene';
import {
  buildRustSceneSnapshotForTimeline,
  type RustSceneSnapshot,
  type RustSceneSnapshotBuildIssue,
} from './rustSceneSnapshot';

export interface EvaluationParityFixtureFrame {
  frame_index: number;
  snapshot: RustSceneSnapshot;
}

export interface EvaluationParityFixture {
  name: string;
  project: EditableRustProject;
  frames: EvaluationParityFixtureFrame[];
}

export interface EvaluationParityFixtureBuild {
  fixture: EvaluationParityFixture;
  /** 経路 A（resident project）が受け付けず、比較対象から外した object。 */
  unsupportedByResidentPath: EditableRustSceneIssue[];
  /** 経路 B（TS snapshot）が組めず、比較対象から外した frame。 */
  skippedFrames: { frame_index: number; issues: RustSceneSnapshotBuildIssue[] }[];
}

export interface EvaluationParityFixtureInput {
  name: string;
  sceneId: string;
  projectSettings: Pick<ProjectSettings, 'width' | 'height' | 'fps'>;
  layers: LayerState[];
  objects: TimelineObject[];
  frameIndices: number[];
}

/** issue の出た object を落として経路 A が通るまで縮める。 */
const resolveResidentProject = (
  input: EvaluationParityFixtureInput
): { project: EditableRustProject; objects: TimelineObject[]; dropped: EditableRustSceneIssue[] } => {
  let objects = input.objects;
  const dropped: EditableRustSceneIssue[] = [];

  // object 数を上限に回す。1 回落とすごとに最低 1 個減るので必ず停止する。
  for (let attempt = 0; attempt <= input.objects.length; attempt += 1) {
    const built = buildEditableRustScene({
      sceneId: input.sceneId,
      projectSettings: input.projectSettings,
      layers: input.layers,
      objects,
    });
    if (built.ok) return { project: built.project, objects, dropped };

    const droppedIds = new Set(built.issues.map((issue) => issue.objectId));
    dropped.push(...built.issues);
    const next = objects.filter((object) => !droppedIds.has(object.id));
    if (next.length === objects.length) {
      throw new Error(
        `経路 A の issue を解消できない（対象 object が減らない）: ${JSON.stringify(built.issues)}`
      );
    }
    objects = next;
  }

  throw new Error('経路 A の issue 解消が収束しなかった');
};

export const buildEvaluationParityFixture = (
  input: EvaluationParityFixtureInput
): EvaluationParityFixtureBuild => {
  const { project, objects, dropped } = resolveResidentProject(input);

  const frames: EvaluationParityFixtureFrame[] = [];
  const skippedFrames: EvaluationParityFixtureBuild['skippedFrames'] = [];

  for (const frameIndex of input.frameIndices) {
    const built = buildRustSceneSnapshotForTimeline({
      projectSettings: input.projectSettings,
      layers: input.layers,
      objects,
      // 経路 B は秒を受ける。frame index を正本にしたいので、ここで秒へ戻す。
      time: frameIndex / input.projectSettings.fps,
    });
    if (!built.ok) {
      skippedFrames.push({ frame_index: frameIndex, issues: built.issues });
      continue;
    }
    frames.push({ frame_index: frameIndex, snapshot: built.snapshot });
  }

  return {
    fixture: { name: input.name, project, frames },
    unsupportedByResidentPath: dropped,
    skippedFrames,
  };
};
