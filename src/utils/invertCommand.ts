import type { Command } from '../generated/rustCore/Command';

/**
 * `rust-core::command::invert` の TS 側ミラー。
 *
 * R4-6/R4-7 の設計記録（progress/rust-source-of-truth-r4-commands.md）が
 * 確認した通り、全 12 kind の `invert` は「`next`/`previous` を入れ替える」
 * （あるいは `AddObject`↔`RemoveObject` のような kind そのものの入れ替え）
 * という純粋なフィールド swap で表現できる。Rust 側のロジックを複製する
 * のは DRY 違反だが、undo を「invert を command.apply する」形にするには
 * apply 前に invert 済みコマンドを構築する必要があり、かつ invert 自体は
 * サーバ往復するほどの処理ではない（純粋関数・副作用なし）ため、往復
 * コスト回避のためあえて TS 側に複製した（R4-8 の設計判断）。
 *
 * `rust-core/src/command.rs` の `invert()` を変更した場合はこの関数も
 * 同時に更新すること。
 */
export const invertCommand = (command: Command): Command => {
  switch (command.kind) {
    case 'setObjectField':
      return {
        kind: 'setObjectField',
        objectId: command.objectId,
        field: command.field,
        next: command.previous,
        previous: command.next,
      };

    case 'addObject':
      return {
        kind: 'removeObject',
        objectId: (command.object as { id: string }).id,
        removed: command.object,
        index: command.index,
      };

    case 'removeObject':
      return {
        kind: 'addObject',
        object: command.removed,
        index: command.index,
      };

    case 'setLayerState':
      return {
        kind: 'setLayerState',
        index: command.index,
        next: command.previous,
        previous: command.next,
      };

    case 'reorderLayers':
      return {
        kind: 'reorderLayers',
        previousLayers: command.nextLayers,
        nextLayers: command.previousLayers,
        previousObjects: command.nextObjects,
        nextObjects: command.previousObjects,
      };

    case 'addFilter':
      return {
        kind: 'removeFilter',
        objectId: command.objectId,
        filterId: (command.filter as { id: string }).id,
        removed: command.filter,
        index: command.index,
      };

    case 'removeFilter':
      return {
        kind: 'addFilter',
        objectId: command.objectId,
        filter: command.removed,
        index: command.index,
      };

    case 'toggleFilterEnabled':
      return { ...command };

    case 'moveFilter':
      return {
        kind: 'moveFilter',
        objectId: command.objectId,
        filterId: command.filterId,
        fromIndex: command.toIndex,
        toIndex: command.fromIndex,
      };

    case 'updateFilterParams':
      return {
        kind: 'updateFilterParams',
        objectId: command.objectId,
        filterId: command.filterId,
        next: command.previous,
        previous: command.next,
      };

    case 'setCamera':
      return {
        kind: 'setCamera',
        next: command.previous,
        previous: command.next,
      };

    case 'setStageCamera3D':
      return {
        kind: 'setStageCamera3D',
        next: command.previous,
        previous: command.next,
      };

    default: {
      const exhaustive: never = command;
      throw new Error(`invertCommand: unknown command kind: ${JSON.stringify(exhaustive)}`);
    }
  }
};
