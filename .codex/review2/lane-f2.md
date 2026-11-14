所見あり。

1. `onResizeEnd` が履歴確定していない  
- ファイル: `useSceneInteraction.ts:266`  
- 根拠: `resizeRef.current.active = false` のみ。`initialObjState` と現在値の差分を `pushHistoryCommand` する処理が抜粋にない。コメントだけ。要件の「終了時に1回積む」を満たさず、リサイズが undo 不能。  
- 深刻度: 高

2. 録画分岐が通常ドラッグの履歴確定を排他  
- ファイル: `useSceneInteraction.ts:164-193`  
- 根拠: `isRecordingPathRef.current` が true の間は `else if` に入らない。`normalised.length === 0` や `targetId` なしの場合、`history:'defer'` で行ったドラッグ更新の差分が push されない。  
- 深刻度: 中

3. 録画終了の再生トグルが状態依存  
- ファイル: `useSceneInteraction.ts:166`  
- 根拠: `if (isPlaying) togglePlay()` は録画前から再生中でも停止する。closure の `isPlaying` が stale だと停止漏れ/誤停止。録画開始時の再生状態を ref で保持すべき。  
- 深刻度: 中

4. ポインタ外れ/キャンセル時の残留対策が見えない  
- ファイル: `useSceneInteraction.ts:163-198,266`  
- 根拠: `onPointerUp`/`onResizeEnd` のみ。`setPointerCapture`、`pointercancel`、blur/unmount 時の cleanup が見えない。外れ時は drag/resize active、録画フラグ、再生、window グローバルが残留し得る。  
- 深刻度: 中（未実装確定なら高）

5. 書き出し中ガードが開始処理のみ  
- ファイル: `useSceneInteraction.ts:95,207`  
- 根拠: `onPointerMove`/`onPointerUp`/`onResizeEnd` に `isExporting` チェックがない。書き出し開始が操作中に起きると更新・履歴 push・録画停止が続行。  
- 深刻度: 中

6. 確定時の `currentObject`/`previousObject` 未定義ガードなし  
- ファイル: `useSceneInteraction.ts:171-174,186-188`  
- 根拠: `find` 結果や `initialObjState` が null/undefined でも diff に渡す。録画中に削除されると `{...currentObject}` が motionPath だけになり、不正差分や例外の恐れ。  
- 深刻度: 中

7. `latestObjectsRef` と最終更新の競合  
- ファイル: `useSceneInteraction.ts:160,171-174,186-188`  
- 根拠: ドラッグ中は `initialObjState` 基準で更新、確定時は `latestObjectsRef` から現在値を取得。反映が非同期/バッチだと最後の pointermove が履歴 diff に入らない。`computeDragUpdate` が全体を返すなら他フィールドの同時更新も巻き戻る。  
- 深刻度: 中

8. リサイズのアンカー計算が原点中心前提  
- ファイル: `useSceneInteraction.ts:218-224`  
- 根拠: `transform.x/y + rotate(anchorLocal * scale)` は transform.x/y が中心で回転原点も中心の場合のみ正しい。原点が異なる、bounds が既にスケール済み、非等方スケール/回転時はアンカーがずれる。  
- 深刻度: 中

9. テキストを一律リサイズ除外  
- ファイル: `useSceneInteraction.ts:212`  
- 根拠: `type === 'text'` で return。テキストにリサイズハンドルを出す UI なら操作不能。ロック中テキストの選択もスキップ。  
- 深刻度: 低

10. 録画パス ref / window グローバルがクリーンアップされない  
- ファイル: `useSceneInteraction.ts:168-182`  
- 根拠: `recordedPathRef.current` を読むだけで空にしていない。開始時クリアがないなら次回録画に混入。`window.isPathRecordingMode` も alert 中や異常系で true のまま残り得る。`alert` は同期ブロックで UX も悪い。  
- 深刻度: 低
