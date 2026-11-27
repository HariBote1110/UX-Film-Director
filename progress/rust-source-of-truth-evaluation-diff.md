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
| `keyframe-clamp` | `clips[].transform.translation_x` | 170 | 19.20 px |
| `keyframe-clamp` | `clips[].transform.translation_y` | 170 | 9.60 px |
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

### keyframe-clamp: keyframe 時刻の clamp 規約が食い違っている

**当初これを「振動フィルタが原因」と分類したのは誤りだった（2026-08-22 訂正）。**
`rustSceneSnapshot.ts` のコメントに「振動は rust-core に対応物が無いので TS 側で
translation に畳み込む」とあるのを読んで、最悪ケースを追わずにそう決めつけていた。
実際には **fixture のどのオブジェクトにも振動フィルタは付いておらず**、
この差分に振動は 1 ミリも寄与していない。

真の原因は keyframe 時刻の clamp 規約差:

- path A（`positionKeyframesForObject` → `normaliseKeyframesForObject`）は
  `keyframe.time` を `[startTime, startTime + duration]` に **clamp する**
  （`src/utils/keyframes.ts:28`）。
- path B（`evaluateKeyframesPositionAtTime`）は **生の時刻をそのまま使う**。

実例（`realistic-cutaway-video`、`duration = 16s` なのに `keyframes[2].time = 24s`）:

| | 補間区間 | t=15.633s での x |
|---|---|---|
| path B（clamp なし） | kf1(t=12, x=24) → kf2(t=24, x=0) | 19.5996 |
| path A（t=16 へ clamp） | kf1(t=12, x=24) → kf2(t=16, x=0) | 0.4033 |

最大 19.2px。**これは refactor の副産物ではなく、今日のアプリに実在する不具合である。**
native overlay（path A、既定 ON）と、それ以外の経路（path B）が、
同じクリップを最大 19.2px ずれた位置に描いている。

なお `keyframes` フィールドであって `positionKeyframes` ではない点に注意。
最初の追跡で私は `positionKeyframes` を見て「範囲外 keyframe は 0 件」と
誤った結論を出した。

### ts-only-animation: Clipping がアニメーションしていない

TS は Clipping の値をフレームごとに変える（frame 721 で 102.32、frame 1127 で 43.2）が、
`rust-core` は静的な値（51.2 / 28.8）を返す。加えて `rust-core` の方が effect を
1 つ多く出すフレームがある。最大 51.1px の差で、これも見た目に出る。

## Constraints / Gotchas

- **`source_frame` の懸念は解消済み（2026-08-22 の追跡調査）。Rust の規約へ寄せてよい。**
  静止系（`shape` / `image` / `psd` / `barcode` / `puzzle_piece` ほか生成静止物の全種）は、
  そもそも生成関数のシグネチャに `source_frame` 引数が無い
  （`rust-backend/src/lib.rs:18-65` の `build_generated_*_source_frame(media)` 群、
  `rust-backend/src/source_frames.rs:301` / `:330` の image / psd）。
  値が 0 でも経過フレームでも出力ピクセルは変わらない、というコンパイル時の証拠がある。
- **キャッシュキーへの混入も無い。** 静止系は `media_content_revision(media, time_seed)` の
  `time_seed` に `None` を渡しており（`rust-backend/src/source_frames.rs:81-104`, `:192`）、
  `source_frame` はキーに入らない。GPU テクスチャの revision キャッシュも同じ値を使うので、
  規約を 0 固定から経過フレームへ変えてもアップロードスキップは効いたままになる。
  `source_frame` をキーに含めるのは時間依存の 4 種
  （`GeneratedParticle` / `GeneratedFocusLinesPlus` / `GeneratedShakingPolygon` /
  `GeneratedShatteredSphere`）だけで、これらは TS 側も既に経過フレームを返しており対象外。
  Video も `source_frame` で decode 対象 PTS を選ぶが、同じく TS と規約が一致済み。
- **ただし R2 では TS のテストを大量に直すことになる。**
  `src/utils/rustSceneSnapshot.test.ts` が静止系ほぼ全種について `source_frame: 0` を
  期待している（shape:1271, barcode:1474, puzzle_piece:1523, tone_curve:2464,
  hksy_checker_grid:2502, getcolor_dot_field:2740, psd:3708, image/video 混在:3432-3473 など）。
  これらは現行 TS 規約をピン留めしているテストなので、規約変更と同時に更新が要る。
- **未整備**: 「同一の静止メディアで `source_frame` だけ変えてもキャッシュがヒットし続ける」ことを
  直接ピン留めするテストは無い（構造的証拠だけ）。R2 で規約を変えるなら、
  この性能特性を守るテストを先に足しておくのが安全。
- fixture は 3.8MB ある。frame step を 7 より細かくすると急に膨らむ。
- 経路 A（`buildEditableRustScene`）は経路 B より対応範囲が狭く、
  `unsupportedGroup` / `unsupportedVideoMode` / `unsupportedMask` / `unsupportedFilter` などで
  object を弾く。今回の代表シーンはたまたま全部通ったが、
  対応範囲の広いシーンを足すと弾かれるものが出る。
  そのときは `unsupportedByResidentPath` に出るので、黙って除外されることはない。
- 比較しているのは **評価結果だけ**。media reference（`mediaReferenceForObject` と
  `mediaReferenceForEditableRustScene`）の差は見ていない。ここも二重実装なので、
  R2 に入る前に同じ形の比較を足すか判断が要る。
