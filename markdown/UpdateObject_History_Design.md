# updateObject の差分コマンド化 設計（レビュー所見 B-2/B-3/B-4 の解消）

状態: **Phase 1 実装済み**（2026-11-13、推奨デフォルトで確定: 合体の時間窓
1000ms、blur 単位のセッション化は v1 に含めない、許可リストは手書き＋契約テスト）。
§10 の未決事項はこのデフォルトで決着。手動 push 箇所の一本化は「削除して
updateObject の記録に寄せる」形で行い、複数オブジェクト編集は
`withObjectHistoryBatch` で1バッチに保つ。**Phase 2（setLayerState 配線）も
実装済み**（同日、コミット e3e77a80）。**Phase 3（3D カメラ）も実装済み**
（recordStageCameraHistory / amendStageCameraHistoryNext を useStore に置き、
OxidiseStageViewport の begin/end/settle へ配線）。**Phase 4 も実装済み**
（TimelineItem のドラッグ差分を部分再構築から開始時スナップショット全体へ
完全化。他のドラッグ系は元から全体差分だった）。全 Phase 完了。
対象ブランチ `feat/preview-export-compare`。
前提として済んでいるもの: 履歴を経由しない編集が redo スタック（`futureCommands`）を
無効化することと、`duration` の grow-only 化（コミット `d65a2176`）。

## 1. 問題

- `useStore.updateObject` は状態を書き換えるだけで `Command` を積まない。
  PropertyPanel の編集の大半（テキスト・色・数値・キーフレーム適用・音量・
  PSD スケール・グループグラデーション）はこの経路で、**undo できない**。
- 履歴が要る呼び出し側は「`buildObjectFieldDiffCommands(previous, next)` で
  バッチを作って `pushHistoryCommand` し、別に `updateObject` も呼ぶ」という
  手作業を各所で書いている（PropertyPanel 5箇所、TimelineItem、OxidiseStageViewport）。
  書いた場所だけ undo でき、書いていない場所はできない、という状態が問題の本体。
- 同根の問題が2つある:
  - レイヤーの名前/可視/ロック（`setLayerName` 等）も履歴外。そのため
    layer-track 系コマンドの undo（`previousLayers` 全体スナップショットの
    差し戻し）が、後から行ったレイヤーメタ編集まで巻き戻してしまう（B-2b）。
  - 3D ステージカメラの viewport 操作（orbit/pan/zoom と収束確定値）が履歴外で、
    PropertyPanel 経由のカメラ変更を undo すると巻き戻る（B-4）。

## 2. 既存の資産（新規発明はしない）

- `buildObjectFieldDiffCommands(previousObject, nextObject)`（`src/store/commandBuilders.ts`）:
  2つのオブジェクトの全キー差分から `setObjectField` の列を作る。コメントにも
  「最終的に computed された2つを丸ごと比較する方が取りこぼしがない」と明記済み。
- `buildBatchCommand` / `invertCommand`（`batch` は逆順+再帰、`setObjectField` は
  previous/next の swap）: undo/redo の適用経路は既存。
- ドラッグの先例（`TimelineItem.tsx` の `handleMouseUp`）: ドラッグ中は毎フレーム
  `updateObject` のみ、終了時に「開始時スナップショット→最終値」の差分を
  1バッチだけ積む。この規約がコード内コメントで明文化されている。
- 編集セッションの先例: フィルタパラメータの `filterParamEditSessions`
  （編集中は保留し、commit 時に確定する仕組みが `useStore.ts` にある）。
- **`SetLayerState` コマンドは Rust・生成 TS 型・`invertCommand` まで実装済み**で、
  Rust 側のドキュメントコメントは `setLayerName`/`toggleLayerVisibility`/
  `toggleLayerLock` のためのものだと明言している。TS 側の builder と配線だけが無い。
- `buildSetStageCamera3DCommand` は既存（PropertyPanel が使用中）。

## 3. 全体方針

`updateObject` 自身に履歴記録を内蔵し、手作業の push を不要にする。
記録する差分は「呼び出し側が渡した patch」ではなく、**updateObject の実行前後の
最終オブジェクト同士の差分**とする。これにより `syncObjectKeyframes`
（x/y/endX/endY/easing/enableAnimation の書き換え）や
`syncLegacyEffectsWithFilters` 等の内部の派生変更も自動的に差分へ入り、
A案の要件（派生変更の取りこぼし防止）を満たす。

## 4. API 変更

```ts
type UpdateObjectOptions = {
  history?: 'record' | 'defer' | 'skip';  // 既定 'record'
};
updateObject: (id: string, newProps: Partial<TimelineObject>, options?: UpdateObjectOptions) => void;
```

- `record`（既定）: 実行前後で差分を取り、バッチを1つ積む（§6 の合体あり）。
- `defer`: 記録しない。連続編集の途中経過用。終了時のコミットは呼び出し側の
  責務（TimelineItem ドラッグの既存パターンがそのままこれに当たる）。
- `skip`: 記録しない。プログラム的な書き戻し（計測値の反映など、ユーザーの
  編集でないもの）用。`defer` との違いは「後でコミットされる予定もない」こと。

呼び出し側の分類（実装フェーズで全箇所を棚卸しする）:

| 呼び出し側 | 分類 | 理由 |
| --- | --- | --- |
| PropertyPanel（86箇所の大半） | record | 本命。手動 push 済みの5箇所は二重記録になるため移行時に除去（§8） |
| registerAppCommands | record | キーボード由来のユーザー編集 |
| TimelineItem の mousemove | defer | 終了時に既存の差分コミットあり |
| useSceneInteraction のドラッグ中 | defer | 同上（終了時コミットの有無を実装時に確認） |
| Viewport / main.tsx の計測・初期化系 | skip | ユーザー編集ではない書き戻し |

## 5. 差分の作り方（実装メモ）

現在の `updateObject` は単一の `set((state) => ...)` で完結している。記録には
実行前後のオブジェクトが要るため、次の形に再構成する:

1. `get()` で対象オブジェクトの現在値（previous）を捕捉する。
2. 既存の正規化・同期ロジックで updatedObject を算出する（ロジック自体は不変）。
3. `set` で反映し、`buildObjectFieldDiffCommands(previous, updatedObject)` →
   `buildBatchCommand` → 非 null なら `pushHistoryCommand`。

差分が空（実質無変更）なら何も積まない（現行の手動パターンと同じ規約）。
`duration` は差分に含めない（シーン状態として別管理、`d65a2176` の grow-only が正）。

## 6. 連続編集の合体（coalescing）

数値入力のキー入力・スライダーの連続値など、`record` でも1操作が多数の
`updateObject` になり得る。対策として、モジュールスコープに直近の記録を保持する
（`filterParamEditSessions` と同じ置き方）:

```ts
let lastRecordedUpdate: { objectId: string; command: Command; at: number } | null;
```

次を全て満たすときだけ、直前のバッチを「最初の previous × 最新の next」で
再構成して差し替える（`pastCommands` の末尾を置換する）:

- 同一オブジェクトに対する `record` である
- `pastCommands` の末尾が `lastRecordedUpdate.command` 本人である
  （他のコマンドが挟まったら合体しない）
- 前回から短時間（初期値 1000ms。§10 の未決事項）

テキスト入力（1文字ごとの `handleChange`）はこの合体で実質「打ち始め→確定」が
1ステップに寄る。完全に blur 単位でまとめたい場合は編集セッション化が要るが、
v1 では時間窓の合体までとし、不足なら v2 でセッション化する。

## 7. 表現できないフィールドの扱い（安全弁）

`SetObjectField` は Rust 側で `known_field_names`（BaseObject + 型別
`*ObjectFields` のプロパティ集合）にあるフィールドしか受け付けず、外れると
`InvalidFieldPatch` でバッチ全体が失敗し、**undo そのものが壊れる**。
現在の手動パターンは「使うフィールドがたまたま全て表現可能」な箇所だけで
成立している。`updateObject` 全面に広げるには安全弁が必須:

- 正本は `schema/rust-core/*.schema.json`（schemars 生成）。ここから
  「型 → 許可フィールド集合」を導く TS 定数を用意し、**契約テスト**で
  スキーマ JSON と定数の一致を固定する（定数が古くなったらテストが落ちる）。
- 差分に許可外フィールドが1つでも含まれたら、その編集は**記録しない**
  （redo 無効化は従来どおり行う）。部分的にだけ積む案は「undo で一部だけ戻る」
  という最悪の挙動になるため採らない。
- `previous`/`next` の `?? null` 潰し（B-15）への対策: スキーマの `required` に
  あるフィールドで、どちらかが `null` になる差分も記録しない対象に含める
  （必須フィールドへの null 適用は Rust の再 deserialize が失敗する）。

## 8. 移行手順（二重記録の防止）

記録が `updateObject` に内蔵されると、既存の手動 push 箇所は同じ編集を
二重に記録する。フェーズごとに「手動 push を消す（または呼び出しを
`history: 'skip'` にする）」をセットで行う:

- Phase 1: `updateObject` の記録＋合体＋許可リスト＋契約テスト。
  PropertyPanel の手動 push 5箇所は、この時点で `updateObject` 側の記録に一本化。
- Phase 2: `setLayerState` の builder を追加し、layerSlice の3 setter を配線。
  これでレイヤーメタ編集が通常コマンドになり、LIFO の規律により
  layer-track スナップショットの巻き戻し問題（B-2b）も構造的に解消する
  （構造操作より後のメタ編集は、それより先に undo されるため）。
- Phase 3: OxidiseStageViewport のカメラ。ジェスチャ開始時点の
  `stageCamera3D` を捕捉し、`endCameraAdjust` で `buildSetStageCamera3DCommand`
  を積む。収束（settle）の非同期確定は §6 と同じ「直前コマンドの next 差し替え」
  で同じ1ステップに畳む。
- Phase 4: TimelineItem / OxidiseStageViewport のオブジェクトドラッグにある
  手動差分コミットを棚卸しし、`defer`+終了時コミットの形が重複していれば整理。

## 9. リスクと検証

- undo の楽観性（B-6）は不変: `SetObjectField` は `previous` を検証しない。
  本設計はその上に乗る（記録される previous は実行直前の実値なので、
  通常経路では一致する）。
- 履歴の肥大: 合体と「差分が空なら積まない」で抑える。`keyframes` 等の
  大きいフィールドは差分が JSON 全体になるため、大きなオブジェクトでの
  履歴サイズは実装フェーズで実測する。
- 検証: store テストに「PropertyPanel 相当の編集が undo/redo で往復する」
  「合体が効く（連続 record が1件になる）」「許可外フィールドでは積まれない」
  「defer/skip では積まれない」を追加し、全スイート＋tsc で確認する。

## 10. 未決事項（実装前に決める）

1. 合体の時間窓（初期値 1000ms で始めて挙動を見る、で良いか）。
2. テキスト入力を blur 単位で1ステップにする編集セッション化を v1 に含めるか
   （含めない場合、確定後の undo は「打ち始めの状態」まで一気に戻る場合がある）。
3. 許可リスト定数の置き場所と生成方法（手書き＋契約テスト か、スキーマ JSON
   からの生成スクリプトか）。
