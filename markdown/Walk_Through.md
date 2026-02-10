# 実施内容

## 1. ストア更新最適化
- `src/store/useStore.ts`
- `setTime` / `setDuration` に同値更新ガードを追加。
- `updateObject` に差分判定を追加し、差分がない場合は状態更新をスキップ。
- `duration` 再計算を `startTime` / `duration` 更新時のみに限定。

## 2. ストア購読の細粒度化
- `src/App.tsx`
- `src/components/Timeline.tsx`
- `src/components/TimelineItem.tsx`
- `src/components/TimelineControlBar.tsx`
- `src/components/PropertyPanel.tsx`
- `src/components/Viewport.tsx`
- `src/components/PsdRenderer.tsx`
- `src/hooks/useAppLogic.ts`
- `src/hooks/useTimelineDrop.ts`
- `src/hooks/usePixiInteraction.ts`
- `selector + shallow` を導入し、全体購読を削減。

## 3. タイムライン再レンダリング削減
- `src/components/TimelineItem.tsx` を `React.memo` 化。
- `src/components/Timeline.tsx` のコンテキストメニューコールバックを `useCallback` 化し、`TimelineItem` 側メモ化が有効になるよう調整。

## 4. エクスポート処理最適化
- `src/hooks/useProjectExport.ts`
- `electron/main.ts`
- フレーム転送を `base64` から `ArrayBuffer` に変更。
- `ffmpeg` への `stdin.write` でバックプレッシャー待機を追加。
- エクスポート中の `setTime` 更新頻度を間引き。

## 5. PSD 同期負荷軽減
- `src/utils/psdToolBridge.ts`
- ポーリング間隔を 300ms に調整。
- レイヤーツリー同期を 1 秒間隔に間引き。

## 6. TypeScript エラー解消
- `src/types.ts`
- `PsdLayerNode` の定義追加、`PsdObject` の実態に合わせた型補完（`rootLayer`/`activeLayerIds` 等）を追加。
- `src/components/PropertyPanel.tsx`
- ユニオン型キー制約で発生していた更新ハンドラの型不整合を修正。
- `src/utils/psdParser.ts`
- `ag-psd` のレイヤ型差分を吸収する補助型を追加し、`ImageData` 生成の型不整合を修正。
- `src/utils/pixiRenderHelper.ts`
- `DiagonalClippingFilter` を Pixi v8 の初期化形式へ変更。
- `src/main.tsx`
- `.tsx` 拡張子付き import を拡張子なしへ修正。

## 7. Rust バックエンド基盤の追加
- `rust-backend/Cargo.toml`
- `rust-backend/src/main.rs`
- `stdio` ベースの JSON-RPC 風プロトコルを実装し、`health` / `echo` メソッドを追加。
- `electron/main.ts`
- Rust バイナリ探索、プロセス起動、リクエスト送信、レスポンス待機、タイムアウト処理を追加。
- IPC ハンドラ `rust-backend-health` / `rust-backend-echo` を追加。
- `electron/preload.ts`
- `window.rustBackend` を公開し、Renderer から直接 `health` / `echo` を呼べるようにした。
- `src/vite-env.d.ts`
- `window.rustBackend` の型定義を追加。
- `package.json`
- Rust のビルド/実行スクリプト (`rust:build:debug`, `rust:build:release`, `rust:run`) を追加。

## 確認
- `npx tsc --noEmit` を実行し、成功を確認。
- Rust ツールチェーン (`cargo`) がこの実行環境に無いため、`rust-backend` のコンパイルは未実施。
