# R2 第3スライス（最終）: subject crop の二重焼き込みバグを修正しparityゼロ達成

## Decision

- 原因は **rust-core 側ではなく TS 側**（`src/utils/editableRustScene.ts`）にあった。
  `residentEffectsForObject` が `rustEffectsForObject(object, object.startTime)` を呼び、
  `object.subjectCropEnabled` な video では **`object.startTime` 時点の subject crop**
  （= 最初の keyframe の値）を `Effect::Clipping` として静的 `effects` 配列へ焼き込んでいた。
  一方 `subjectCropForObject` は同じ subject crop を `subject_crop` フィールドとして
  **別送り**しており、rust-core (`timeline.rs:88-98`) がこれを毎フレーム
  `evaluate_subject_crop_keyframes` で動的評価し、`effects` の末尾へもう一つ
  `Effect::Clipping` を append していた。結果として **同じクリップに Clipping effect が
  2つ**（1つは静的で誤り、1つは動的で正しい）入っていた。
- 修正: `rustEffectsForObject` に `includeSubjectCrop` オプション
  （`src/utils/rustSceneSnapshot.ts:599-612`, `:822`）を追加し、
  `editableRustScene.ts:224` から `{ includeSubjectCrop: false }` で呼ぶよう変更。
  常駐 Project 用の静的 effects からは subject crop 由来の Clipping を完全に除外し、
  rust-core 側の動的評価だけに一本化した。
  `rustSceneSnapshot.ts:229`（直接評価経路、path B 自身）は毎フレームの `time` で
  呼んでいるため元々正しく、オプション既定値 `true` のまま変更していない。
- rust-core 側（`keyframe.rs:70-98` の `evaluate_subject_crop_keyframes`、
  `timeline.rs:88-98` の呼び出し）は**最初から正しく線形補間していた**。
  ここは無変更。

## タスク側の当初の原因推定との照合

タスク冒頭で「Rust は最初の keyframe に stuck している」という推定が示されていたが、
**これは誤診断だった**。実際に `evaluate_frame` を直接呼んでプローブすると、
同じフレームの `effects` 配列に Clipping が2つ入っており、
- `effects[2]`（静的、`object.startTime` 固定値）
- `effects[3]`（動的、frame ごとに正しく補間された値。例: frame=721 で
  `left=102.31999`）
であることが分かった（`left=102.32` は task 側が「TS のみが出す正しい値」として
挙げていた数値そのもの）。

`ts_evaluation_parity.rs` の配列比較は **index 同士**（`left[i]` vs `right[i]`）で行うため
（`diff()` 関数、`rust-core/tests/ts_evaluation_parity.rs:149-155`）、TS 側は
`effects.length=3` で末尾が動的 Clipping（index 2）、RS 側は `effects.length=4` で
index 2 が静的 Clipping・index 3 が動的 Clipping という配列だった。
そのため **index 2 同士だけが比較され**、TS の動的値と RS の静的値が食い違って見えた。
RS の index 3（動的・正しい値）は `min(left.len(), right.len())=3` の外側にあり、
そもそも比較対象になっていなかった。

つまり:
- 「TS がアニメーションしていて Rust が静的」という現象自体は事実（held）。
- 「rust-core の keyframe 補間ロジックが壊れている」という推定は**誤り**（did not
  hold）。`evaluate_subject_crop_keyframes` はタスク開始前から正しく動いていた。
- 「effects を1つ多く出す」という観察も事実（held）だが、原因は rust-core 側の
  append ロジックではなく、TS 側が本来送るべきでない静的 Clipping を事前に
  混入させていたことだった。

## Alternatives considered

- **rust-core 側で重複 Clipping を検出して de-dup する**: 却下。
  そもそも TS が送るべきでないデータを送っていることが原因であり、
  受信側で辻褄合わせをすると「なぜ2つ来るのか」という構造的な誤りが温存される。
  データの発生源（`editableRustScene.ts`）を直すほうが素直。
- **`rustEffectsForObject` を time 引数だけで判定する（例えば `time === object.startTime`
  なら subject crop を除外）**: 却下。`object.startTime` ちょうどのタイムラインでの
  直接評価（path B）でも time が偶然 startTime と一致するケースがあり、
  暗黙の time 依存判定は壊れやすい。明示的な `includeSubjectCrop` オプションのほうが
  意図が読める。

## Constraints / Gotchas

- **ユーザー影響（2026-08-22 訂正）**: native overlay（path A、既定 ON、
  `Viewport.tsx:731` の `!== '0'`）は今回のバグの影響を直接受けていた。
  **ただし症状は「最初の keyframe に固定されアニメーションしない」ではない。**
  renderer 側の `clipping_extent`（`native-wgpu-renderer/src/lib.rs:3510`）は

  ```rust
  clip.effects.iter().filter_map(pick).sum::<f32>().max(0.0)
  ```

  のとおり **すべての `Effect::Clipping` を合算する**。したがって静的な重複と
  正しい動的値が足し合わされ、実際の症状は
  **「正しいクロップ量に加えて、常に初回 keyframe 分だけ余計に切り取られる」**
  ＝ 各辺およそ 2 倍の過剰クロップである。アニメーション自体は動いていた。

  具体的には left が本来 51.2〜102.4px の範囲で動くべきところ、
  102.4〜153.6px でクロップされていた。**これはユーザーが今日見ている描画のバグであり、
  parity harness だけの artefact ではない。** 本修正で解消した。
- `rustEffectsForObject` を呼ぶ箇所は2箇所のみ（`grep` で確認済み）:
  `rustSceneSnapshot.ts:229`（path B 本体、time 引数は per-frame）と
  `editableRustScene.ts:224`（path A の静的 effects 構築、time 引数は `object.startTime`
  固定）。他に呼び出し元は無いため、オプション追加による影響範囲はこの2箇所に閉じる。
  `rustEffectsForObject` を直接 import するテストも無い（`grep` で確認）。
  既存の `src/utils/editableRustScene.test.ts` の subject crop テストは元々
  `effects` を検査しておらず（`toMatchObject` で `subject_crop` のみ確認）、
  重複バグを検出できていなかった。今回 `effects: []` の assertion を追加して
  Red 化した。
- fixture 再生成 (`npm run fixture:evaluation-parity`) で差分が出たのは
  `realistic-heavy-main.json` のみ（`realistic-main-video-b` を含むシーン）。
  他2シーンは subject crop を使うクリップが無いため無変更。
- `ts_evaluation_parity.rs` は `KNOWN_DIFFERENCES.json` の `differences: []`
  （空配列）を正しく扱える。`buckets`（実差分）・`known`（既知差分）の双方が
  空集合になるため、両方のループが0回実行され `failures` が空文字列のまま
  テストが通る。テスト本体の改修は不要だった。
- 計測結果（本スライス、修正前後）:
  - `cargo test --test ts_evaluation_parity`: 修正前は 5クラス・685件の既知差分を
    ラチェットで許容してパス。修正後は fixture 再生成込みで **既知差分ゼロ**、
    `KNOWN_DIFFERENCES.json` の `differences` を空配列化してもパス。
  - `cargo test --manifest-path rust-core/Cargo.toml`: 116 passed / 0 failed
    （変化なし。rust-core 本体のロジックは無変更のため）。
  - `npx vitest run`: 251 files / **1824** tests all green
    （既存 1823 + 今回追加した regression test 1件）。
  - `npx tsc --noEmit`: exit 0。
  - `npm run codegen:types:check`: exit 0。
- バージョンは `0.1.1-Beta-505a` → `0.1.1-Beta-506a`
  （ユーザー可視のレンダリング不具合修正のため PhaseVer を進めた）。

## これで R2 は完了

`rust-source-of-truth-evaluation-diff.md` で洗い出した3クラス（`source_frame` 規約差・
keyframe clamp 規約差・subject crop 二重焼き込み）を3スライスで解消し、
`ts_evaluation_parity` の既知差分がゼロに到達した。TS 評価経路（path B）と
rust-core 評価経路（path A）は、少なくとも `realistic-heavy-edit` の代表3シーン・
447フレームにおいて完全に一致する。

## ハーネス側の欠陥（親エージェントによる追記）

このバグを 685 件の差分として観測しながら原因を取り違えたのは、
`ts_evaluation_parity.rs` の配列比較が **`min(left.len(), right.len())` までしか
回っていなかった**ためである。TS の `effects` が 3 要素、Rust が 4 要素のとき、
Rust の 4 番目（正しい動的 Clipping）は**一度も比較されていなかった**。
`effects.length` の差分だけが出て、中身の食い違いは静的な重複同士の比較として
現れていた。

比較されない要素が黙って存在する状態はハーネスの欠陥なので、
長さが違うときに余った側を明示的に差分として出すよう修正した
（`(RS 側に対応要素なし)` / `(TS 側に対応要素なし)`）。
差分ハーネスを作るときは「片側にしか無い要素を黙って飛ばさない」ことを
最初から仕様に入れるべきだった。
