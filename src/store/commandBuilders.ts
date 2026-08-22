import type { TimelineObject, ObjectFilter, LayerState } from '../types';
import type { Command } from '../generated/rustCore/Command';
import type { JsonValue } from '../generated/rustCore/serde_json/JsonValue';

/**
 * R4-8 group c: `useStore.ts` の呼び出し箇所が `Command` を組み立てるための
 * 共通ヘルパー。`src/utils/invertCommand.ts` と同じ理由（ts-rs 生成の
 * `TimelineObject`(`groupId?: string | null`)と `src/types.ts` の
 * `TimelineObject`(`groupId?: string | undefined`)はワイヤ表現の差のみ）で
 * `as unknown as` キャストをこのファイルに閉じ込める。
 */
type CommandObject = Extract<Command, { kind: 'addObject' }>['object'];
type CommandFilter = Extract<Command, { kind: 'addFilter' }>['filter'];

const toCommandObject = (object: TimelineObject): CommandObject =>
  object as unknown as CommandObject;

const toCommandFilter = (filter: ObjectFilter): CommandFilter =>
  filter as unknown as CommandFilter;

export const buildAddObjectCommand = (object: TimelineObject, index: number): Command => ({
  kind: 'addObject',
  object: toCommandObject(object),
  index,
});

export const buildRemoveObjectCommand = (object: TimelineObject, index: number): Command => ({
  kind: 'removeObject',
  objectId: object.id,
  removed: toCommandObject(object),
  index,
});

export const buildAddFilterCommand = (objectId: string, filter: ObjectFilter, index: number): Command => ({
  kind: 'addFilter',
  objectId,
  filter: toCommandFilter(filter),
  index,
});

export const buildRemoveFilterCommand = (objectId: string, filter: ObjectFilter, index: number): Command => ({
  kind: 'removeFilter',
  objectId,
  filterId: filter.id,
  removed: toCommandFilter(filter),
  index,
});

export const buildToggleFilterEnabledCommand = (objectId: string, filterId: string): Command => ({
  kind: 'toggleFilterEnabled',
  objectId,
  filterId,
});

export const buildMoveFilterCommand = (
  objectId: string,
  filterId: string,
  fromIndex: number,
  toIndex: number,
): Command => ({
  kind: 'moveFilter',
  objectId,
  filterId,
  fromIndex,
  toIndex,
});

/**
 * `swapLayerTracks`/`insertLayerTrackAt`/`deleteLayerTrackAt`
 * (`src/utils/layerTrackOps.ts`)向け。R4-7 の設計どおり、複雑な
 * リマップロジック(全オブジェクトの`layer`フィールド再計算等)は
 * Rust 側で再実装せず、変更前後の layers+objects を丸ごと差し替える
 * `reorderLayers` Command として表現する。
 */
export const buildReorderLayersCommand = (
  previousLayers: LayerState[],
  nextLayers: LayerState[],
  previousObjects: TimelineObject[],
  nextObjects: TimelineObject[],
): Command => ({
  kind: 'reorderLayers',
  previousLayers: previousLayers.map((layer) => ({ ...layer })),
  nextLayers: nextLayers.map((layer) => ({ ...layer })),
  previousObjects: previousObjects.map(toCommandObject),
  nextObjects: nextObjects.map(toCommandObject),
});

/**
 * 複数コマンドを 1 undo ステップへ束ねる。`commands` が空なら `null` を返す
 * — R4-7b の `Command::Batch` は空配列を apply 時に `EmptyBatch` として
 * 拒否するため、呼び出し側（このファイルの各 build*BatchCommand）は
 * 「積む前に対象が 1 件以上あるか」を確認してから `pushHistoryCommand` を
 * 呼ぶ責務を持つ（対象 0 件の操作は現行のスナップショット方式でも
 * `pushHistory` を呼ばない設計で、ここでも据え置く）。
 * 単一要素の場合はそのまま返す（`Batch` でラップしない）。
 */
export const buildBatchCommand = (commands: Command[]): Command | null => {
  if (commands.length === 0) return null;
  if (commands.length === 1) return commands[0];
  return { kind: 'batch', commands };
};

/**
 * `previousObject`→`nextObject` の差分から `setObjectField` の列を作る。
 * 汎用フィールド編集(グルーピング/AviUtl座標復元/リップル削除の
 * startTime shift 等)のように「ビジネスロジックが実際に何のフィールドを
 * 変えたか」を個別に手で追うより、最終的に computed された2つの
 * オブジェクトを丸ごと比較する方が「Rust 側の結果と乖離しない」という
 * 要件を安全に満たせる（取りこぼしがない）。`id` は比較対象から除外する
 * （SetObjectField は object_id で対象を特定するため、id 自体の変更は
 * 表現できないし、この用途では発生しない）。
 */
export const buildObjectFieldDiffCommands = (
  previousObject: TimelineObject,
  nextObject: TimelineObject,
): Command[] => {
  const commands: Command[] = [];
  const keys = new Set<string>([
    ...Object.keys(previousObject),
    ...Object.keys(nextObject),
  ]);
  keys.delete('id');
  keys.delete('type');

  for (const key of keys) {
    const previousValue = (previousObject as unknown as Record<string, unknown>)[key];
    const nextValue = (nextObject as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) continue;
    commands.push({
      kind: 'setObjectField',
      objectId: previousObject.id,
      field: key,
      previous: (previousValue ?? null) as JsonValue,
      next: (nextValue ?? null) as JsonValue,
    });
  }

  return commands;
};
