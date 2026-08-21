# TS評価とrust-core評価の差分（R0の測定結果）

## Decision

- 差分ハーネスを **Rust 側テスト + TS 側 drift 検出** の 2 本立てにした。
  - `rust-core/tests/ts_evaluation_parity.rs` が実際の比較を行う（既存の cargo CI に乗る）。
  - `src/utils/rustSceneEvaluationParityFixtureDrift.test.ts` が fixture の陳腐化を検出する。
  - 間を `rust-core/tests/fixtures/ts-evaluation-parity/*.json` が繋ぐ。
- **既知の差分をラチェットで管理する。** `KNOWN_DIFFERENCES.json` に path ごとの件数を持ち、
  増えたら失敗、減ったらベースライン更新を促す。R2 でゼロにする。
- 比較は JSON 木の再帰比較で行い、**丸め差は絶対 1e-4 または相対 1e-4** で吸収する。
  相対を併用するのは、座標のように値が大きいフィールドでは f32 の相対誤差が
  そのまま絶対差として出るため。

## Alternatives considered

- **rust-backend を起こして `scene.replace` / `scene.evaluate` RPC 越しに比較する**: 却下。
  測りたいのは評価の意味論であって IPC ではない。RPC を挟むとビルドと Electron が要り、
  失敗したときに評価差なのか IPC 差なのか切り分けられなくなる。
  `scene.evaluate` は `rust_core::evaluate_frame` をそのまま呼ぶので、
  直接呼びで意味論は等価。
- **vitest から `cargo run` を叩いて 1 つのテストに閉じる**: 却下。
  TS のテスト実行に Rust ツールチェーンが要るようになる。
  fixture をコミットして分離すれば、どちらの CI でも既存の構成のまま動く。
- **差分を全件ダンプする**: 却下。447 フレームで 5,099 件出て読めない。
  配列添字を畳んだ正規化パス（`snapshot.clips[].transform.translation_x`）で
  集計し、各バケットは件数・最大差・最大差のケースだけを出す。

## 測定結果

realistic-heavy-edit の 3 シーン、合計 447 フレーム（frame step 7）。
経路 A が受け付けなかった object は **0 件**、経路 B が組めなかった frame も **0 件**。
つまり比較対象の縮退は起きていない。

| 分類 | フィールド | 件数 | 最大差 |
|---|---|---|---|
| `convention` | `clips[].source_frame` | 4,074 | 1435 frame |
| `ts-only-feature` | `clips[].transform.translation_x` | 170 | 19.20 px |
| `ts-only-feature` | `clips[].transform.translation_y` | 170 | 9.60 px |
| `ts-only-animation` | `clips[].effects.length` | 137 | （構造差） |
| `ts-only-animation` | `clips[].effects[].Clipping.left` | 137 | 51.12 px |
| `ts-only-animation` | `clips[].effects[].Clipping.right` | 137 | 38.35 px |
| `ts-only-animation` | `clips[].effects[].Clipping.top` | 137 | 14.36 px |
| `ts-only-animation` | `clips[].effects[].Clipping.bottom` | 137 | 14.40 px |

**丸め差は 0 件。** 全部が実装差であって、浮動小数の精度差ではない。

### convention: `source_frame`

`rustSceneSnapshot.ts` の `sourceFrameForObject` は静止メディア
（`shape` / `image` / `psd` / `barcode` など）に **0** を返す。
`rust-core::evaluate_frame` は clip 種別に関係なく経過フレームを返す。
値の意味は同じで規約だけが違う。

### ts-only-feature: 振動が translation に畳み込まれている

`sceneTransforms.getVibrationOffset` に対応する概念が `rust-core` に無く、
TS 側が `translation_x/y` へ足し込んでいる（`rustSceneSnapshot.ts` の
コメントにも「rust-core の Effect に対応物が無い」と書かれている）。
最大 19.2px ずれるので、見た目に出る差。

### ts-only-animation: Clipping がアニメーションしていない

TS は Clipping の値をフレームごとに変える（frame 721 で 102.32、frame 1127 で 43.2）が、
`rust-core` は静的な値（51.2 / 28.8）を返す。加えて `rust-core` の方が effect を
1 つ多く出すフレームがある。最大 51.1px の差で、これも見た目に出る。

## Constraints / Gotchas

- **`source_frame` の扱いを決める前に、renderer が静止メディアの `source_frame` を
  本当に無視しているかを確認すること。** 無視していないなら、TS の 0 埋めが
  現在の描画結果を作っている可能性がある。規約合わせだけの話に見えて、
  実は描画に効いているかもしれない。
- fixture は 3.8MB ある。frame step を 7 より細かくすると急に膨らむ。
- 経路 A（`buildEditableRustScene`）は経路 B より対応範囲が狭く、
  `unsupportedGroup` / `unsupportedVideoMode` / `unsupportedMask` / `unsupportedFilter` などで
  object を弾く。今回の代表シーンはたまたま全部通ったが、
  対応範囲の広いシーンを足すと弾かれるものが出る。
  そのときは `unsupportedByResidentPath` に出るので、黙って除外されることはない。
- 比較しているのは **評価結果だけ**。media reference（`mediaReferenceForObject` と
  `mediaReferenceForEditableRustScene`）の差は見ていない。ここも二重実装なので、
  R2 に入る前に同じ形の比較を足すか判断が要る。
