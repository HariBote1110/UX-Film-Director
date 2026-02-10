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

## 確認
- `npx tsc --noEmit` を実行。
- 本リポジトリには既存の TypeScript エラーが多数あり、今回の変更範囲外でもビルドは失敗する状態。
- 今回追加した最適化差分で新たに発生した型エラーは解消済み（`src/store/useStore.ts` の更新差分は型通過する形に調整）。
