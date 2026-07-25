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

## 実測（1台・開発ビルド。修正後は3回測定）

重量E2Eの再生3.6秒区間のChromiumレンダラートレース。修正後は同一に近い構成で
3回測っている（①は選択デコレーション実験前、A/Bは実験時の選択あり／クリア）。

| 指標 | 修正前(1回) | 修正後① | 修正後A | 修正後B |
|---|---|---|---|---|
| busyMs | 1516.5 | 1363.2 | **970.3** | 1519.7 |
| scriptingMs | 448.2 | 263.7 | 295.8 | 363.2 |
| scriptMs | 406.0 | 222.9 | 247.6 | 308.9 |
| React再レンダー関数 | 305.8 ms / 212回 | 120.4 / 212 | 170.9 / 210 | 195.3 / 210 |
| `Receive mojo reply` | 508 / 311 | 602 / 395 | **108 / 67** | 465 / 249 |
| layoutCount | 213 | 213 | 211 | 211 |

E2Eはいずれも総合PASS、`settled: true`、runtimeErrors / MissingSource / WGPUエラーは
すべて0件。

### 信頼できる結論

- **scripting の削減は実在する**。修正後3サンプルの `scriptMs` は 223 / 248 / 309 で、
  いずれも修正前の 406 を下回る。React再レンダー関数の時間も 120 / 171 / 195 で
  修正前 306 を一貫して下回る。削減幅は **-40〜45%** 程度と見るのが妥当。
  `PropertyPanel` と `TimelineControlBar` を毎フレーム経路から外した構造的変更なので、
  測定以前に効果が説明できる。

### 信頼できない指標（重要）

- **`busyMs` / `busyRatio` は単発比較に使えない**。修正後だけで 970〜1520 と
  1.6倍ばらつく。当初「busyMs -10%」と記録したが、これは誤差の範囲だった。
- **`Receive mojo reply` は原因帰属に使えない**。同一に近い構成で 67回〜395回と
  6倍ばらつく。一時「単一項目で最大のコスト」と判断したが、それは1サンプルに
  基づく誤りだった。
- **`exportRun.durationMs` もばらつく**（42.6 / 60.3 / 67.7 秒）。

### 安定している指標

`callCount`（212 / 212 / 210 / 210）と `layoutCount`（213 / 213 / 211 / 211）は
ほぼ完全に安定している。**今後の性能検証はミリ秒ではなく、これらの回数系指標を
一次根拠にする。** 回数が減れば構造が変わった証拠になり、ミリ秒は補助的に見る。

## 残っている問題

- **再レンダー回数は212回のまま**、つまり依然として毎フレーム1回Reactが走る。
  減ったのは1回あたりの仕事量だけである。回数を減らすには
  `src/components/Viewport.tsx:880-910` の巨大な shallow セレクタが
  `currentTime` を含んでいる点を解消する必要がある。
- **layoutCount 213 も不変**。`TimelineCurrentTimeIndicator` が再生ヘッド位置を
  Reactのstate経由のインラインstyleで毎フレーム書き換えているため。
  `ref` + 直接DOM書き込み、または `store.subscribe` による transient update に
  すればReactを経由せず更新できる。
## 選択デコレーションのIPC切り分け実験（結果: 仮説は否定された）

`Receive mojo reply` の発生源として、`src/components/Viewport.tsx:954-1019` の
選択デコレーション送信effectを疑った。依存配列に `currentTime` を含むため再生中は
毎フレーム再実行され、`nativeOverlayBodyCoDeliveryEligible` が
`VITE_UXFD_RUST_VIDEO_ONLY === '1'` 前提でこのE2Eでは常にfalseになるため、
`shouldSendStandaloneDecoration` が無条件にtrueを返す状態だった。

そこで `UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK=1` を追加し、
再生計測区間の直前に選択をクリアして比較した（プロダクションコードは変更していない）。

- A（選択あり）: `Receive mojo reply` 108ms / **67回**
- B（選択クリア）: `Receive mojo reply` 465ms / **249回**

選択をクリアした方が**多い**という逆の結果になった。よって選択デコレーション送信は
`Receive mojo reply` の主因ではない。この指標自体が run-to-run で6倍ばらつくため、
単発測定での原因帰属は不可能である。

トレース側の制約も判明した。Electronはrenderer↔main間の全チャネルを単一の
`electron.mojom.ElectronApiIPC` に集約するため（368件すべてが同一 `ipc_hash`）、
**トレースからチャネル別の内訳は特定できない**。IPC発生源を特定したい場合は、
main process側でチャネル別カウンタを取るなど別の計測手段が必要。

## 制約・注意点

- 上記の数値は1台のMac・開発ビルド・各1回の測定であり、性能回帰の閾値には
  使えない。特に `Receive mojo reply` の増加を回帰と断定するには反復測定が要る。
- `markdown/Performance_Concerns.md` に `Timeline` / `Viewport` / `PropertyPanel`
  の毎フレーム再レンダー問題が「推測ベースの既知の懸念（優先度：高）」として
  記載されていた。今回のトレースはそれを実測で裏付けたものであり、
  今後は推測ではなくトレース値を根拠に優先順位を決められる。
- 重量E2Eを二重に走らせるとElectron同士が競合してタイムアウトする。計測は
  必ず単独で実行すること。
