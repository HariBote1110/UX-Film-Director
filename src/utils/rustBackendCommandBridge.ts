import type { Command } from '../generated/rustCore/Command';
import type { SceneData } from '../generated/rustCore/SceneData';

export type RustBackendApplyCommandResult =
  | { success: true; result: { scene: SceneData } }
  | { success: false; result?: undefined; error?: string; errorCode?: number };

/**
 * `window.rustBackend.applyCommand`（R4-8 で配線した `command.apply` IPC、
 * `src/utils/projectFile.ts` の `RustBackendProjectFileBridge` と同じ
 * bridge-injection パターン）の薄い呼び出し口。
 *
 * `historySlice.ts` の undo/redo は引数なし（`AppState['undo']: () =>
 * Promise<void>`）で呼ばれるため、`parseProjectPayloadV2` のように呼び出し
 * 側が bridge を渡す形にはできない。代わりにモジュールスコープの
 * override（`setCommandBridgeForTests`）を用意し、テストはこれで実 IPC を
 * モックに差し替える。
 *
 * Electron renderer コンテキスト外（vitest の jsdom 環境等）では
 * `window.rustBackend` 自体が存在しないため、override が未設定なら
 * `getCommandBridge()` は `null` を返す — `historySlice.ts` はこれを
 * 「IPC bridge が存在しない環境」として no-op 扱いする。
 */
export interface RustBackendCommandBridge {
  applyCommand: (payload: { scene: SceneData; command: Command }) => Promise<RustBackendApplyCommandResult>;
}

let commandBridgeOverride: RustBackendCommandBridge | null = null;

/** テスト専用: bridge を差し替える。`null` を渡すと override を解除する。 */
export const setCommandBridgeForTests = (bridge: RustBackendCommandBridge | null): void => {
  commandBridgeOverride = bridge;
};

export const getCommandBridge = (): RustBackendCommandBridge | null => {
  if (commandBridgeOverride) return commandBridgeOverride;
  if (typeof window !== 'undefined' && window.rustBackend && typeof window.rustBackend.applyCommand === 'function') {
    return {
      applyCommand: (payload) => window.rustBackend.applyCommand(payload) as Promise<RustBackendApplyCommandResult>,
    };
  }
  return null;
};
