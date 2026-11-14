# 敵対的レビュー: undo/redo 履歴システム新規実装 (lane-j)

対象: 2026-11-13 追加の未監査コード
観点: undo/redo での状態破壊 / coalescing 同一性チェックの抜け / 例外時のバッチ収集 / redo スタック無効化の漏れ / allowlist 抜け(InvalidFieldPatch) / 非同期競合 / 楽観コマンド(previous 不一致)の悪用

---

## 進捗メモ

- 読了: src/store/useStore.ts:545-731 (updateObject 記録・coalescing), 1505-1593 (withObjectHistoryBatch / recordStageCameraHistory / amendStageCameraHistoryNext)
- 読了: src/store/objectFieldAllowlist.ts
- 読了: src/store/commandBuilders.ts (mergeFieldDiffCommands / buildSetLayerStateCommand / buildObjectFieldDiffCommands)
- 調査中: historySlice (undo/redo), invertCommand, layerSlice 内の履歴記録経路, coalescing 同一性チェックの実際の強さ

---

(調査中 — 確定所見は順次追記する)
