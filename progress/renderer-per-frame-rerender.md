# 再生中のレンダラー毎フレーム再レンダリング

## 決定

描画をRust/GPUへ移管した後もレンダラーメインスレッドのbusy率が42%あった。
Chromium描画APIの監査では2Dプレビューの本番描画経路は既にnative側へ分離済み
だったため、残っているのは**描画ではなくReactの再レンダリング**だと判断し、
高頻度更新される `currentTime`（`src/store/slices/playbackSlice.ts`）の
購読範囲を縮小する方針を採った。

既存の `src/components/TimelineCurrentTimeIndicator.tsx` が「毎フレーム購読者
だけを小コンポーネントへ切り出し、親を巻き込まない」パターンとして機能して
いたため、これを踏襲した。

- `TimelineControlBar`: `shallow` セレクタの比較対象に `currentTime` を含めて
  いたため毎フレーム等価判定に失敗し、再生ボタン群ごと再レンダーされていた。
  時刻表示を `TimelineCurrentTimeDisplay` へ切り出し、セレクタから除いた。
- `PropertyPanel`: `currentTime` をトップレベルで購読していたが、**JSX描画には
  一切使われておらず**、`mediaTimeForSelectedVideo` がイベントハンドラから
  呼ばれるときに読むだけだった。購読を削除し `useStore.getState().currentTime`
  の読み捨てへ変更した（`src/components/Timeline.tsx:468` と同じ流儀）。

## 実測（1台・開発ビルド・各1回の代表測定）

重量E2Eの再生3.6秒区間のChromiumレンダラートレース。

| 指標 | 修正前 | 修正後 | 差 |
|---|---|---|---|
| busyMs | 1516.5 | 1363.2 | -10% |
| busyRatio | 0.420 | 0.377 | -0.043 |
| scriptingMs | 448.2 | 263.7 | **-41%** |
| scriptMs | 406.0 | 222.9 | **-45%** |
| renderingMs | 201.5 | 189.6 | -6% |
| gcMs | 53.7 | 46.8 | -13% |
| React再レンダー関数 | 305.8 ms / 212回 | 120.4 ms / 212回 | **-61%**（回数は不変） |
| FireAnimationFrame | 384.8 ms / 395回 | 189.0 ms / 395回 | -51%（回数は不変） |
| layoutCount | 213 | 213 | 不変 |
| recalcStyleCount | 216 | 214 | ほぼ不変 |

E2Eは総合PASS、`settled: true`、runtimeErrors / MissingSource / WGPUエラーは
いずれも0件。

## 残っている問題

- **再レンダー回数は212回のまま**、つまり依然として毎フレーム1回Reactが走る。
  減ったのは1回あたりの仕事量だけである。回数を減らすには
  `src/components/Viewport.tsx:880-910` の巨大な shallow セレクタが
  `currentTime` を含んでいる点を解消する必要がある。
- **layoutCount 213 も不変**。`TimelineCurrentTimeIndicator` が再生ヘッド位置を
  Reactのstate経由のインラインstyleで毎フレーム書き換えているため。
  `ref` + 直接DOM書き込み、または `store.subscribe` による transient update に
  すればReactを経由せず更新できる。
- `Receive mojo reply` は 508ms/311回 → 602ms/395回 と**増えている**。単発測定の
  ばらつきの範囲かもしれないが、ネイティブ再生中は `scene.evaluate` と
  `publishSharedRendererPreviewSession` がガードされている想定なので、
  実際に何が飛んでいるかは別途特定が必要。候補は再生クロック通知
  （`rust-backend-scene-playback-ui-state`）と、co-delivery非対象セッションでの
  選択デコレーション送信（`src/components/Viewport.tsx:954-990`）。

## 制約・注意点

- 上記の数値は1台のMac・開発ビルド・各1回の測定であり、性能回帰の閾値には
  使えない。特に `Receive mojo reply` の増加を回帰と断定するには反復測定が要る。
- `markdown/Performance_Concerns.md` に `Timeline` / `Viewport` / `PropertyPanel`
  の毎フレーム再レンダー問題が「推測ベースの既知の懸念（優先度：高）」として
  記載されていた。今回のトレースはそれを実測で裏付けたものであり、
  今後は推測ではなくトレース値を根拠に優先順位を決められる。
- 重量E2Eを二重に走らせるとElectron同士が競合してタイムアウトする。計測は
  必ず単独で実行すること。
