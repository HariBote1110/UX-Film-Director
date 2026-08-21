# R2最初のスライス: source_frame規約の統一

## Decision

- `src/utils/rustSceneSnapshot.ts` の `sourceFrameForObject` を、静止系メディア
  （`shape` / `image` / `psd` / `barcode` ほか生成静止物29種）が `0` を返す規約から、
  `rust_core::timeline::evaluate_frame` と同じ「clip開始からの経過フレーム」規約へ寄せた。
- 経過フレームの式は `secondsToFrameIndex(Math.max(0, time - object.startTime), fps)`。
  これは元々 `audio_visualization` / `particle` / `shaking_polygon` / `shattered_sphere`
  の4種（時間依存の生成物）が既に使っていた式そのもので、`rust-core` 側の
  `frame_offset = frame_index - clip.start_frame` と整合することは R0 の測定で
  既に確認済み（この4種はR0の4,074件の差分に含まれていない）。共通ヘルパー
  `elapsedFrameForObject` として切り出し、静止系29種の `return 0;` をこれに置き換えた。
- `focus_lines_plus` の `interval === 0` 時の `return 0;` フォールバックと、
  `video` / `text` / `sphere_dots` / `spherical_field` が使うデフォルト分岐
  （offset・duration考慮のクランプ付き）は、R0が「既にRustと一致」と判定した
  経路なので**変更していない**。触ると振動・Clipping側の既知差分件数が動くリスクがあり、
  タスクの禁止事項でもある。
- `rust-core` 側は無変更。静止系の `source_frame` は生成関数の引数に無く、
  キャッシュキー（`media_content_revision` の `time_seed`）にも入らないという
  R0時点の構造的証拠のとおり、TS側の規約変更だけで安全に閉じた。

## Alternatives considered

- **`frameIndex(time) - frameIndex(startTime)` のように2回丸めてから引き算する式**:
  却下。`rust-core` の `frame_offset` はまさにこれ（`frame_index - clip.start_frame`、
  両方とも整数)だが、TS側で1回の `time - startTime` を丸める既存の式が
  時間依存4種で実測ゼロ差分だったため、新規に式を増やさず同じ式を使い回した。
  差分ハーネスのfixtureでは全て通っている。

## Constraints / Gotchas

- テスト側の影響は `src/utils/rustSceneSnapshot.test.ts`（28件、`source_frame: 0`
  → `60`/`90` に修正）、`src/e2e/allReadableMedia.e2e.test.ts`（19件、`.toBe(0)` →
  `.toBe(60)`。`ssd-focus-lines-plus` の1件だけ `keyframeInterval: 0` のため
  据え置き）、`src/utils/sharedRendererExportSession.test.ts`（1件）の3ファイルのみ。
  `source_frame` を参照する残り約40ファイルは、`buildRustSceneSnapshotForTimeline`
  の出力ではなく合成済みのsnapshotを直接構築している（`rustScenePlaybackController.test.ts`
  や各種 `sharedRenderer*.test.ts`）ため無関係だった。
- `rust-core/tests/fixtures/ts-evaluation-parity/KNOWN_DIFFERENCES.json` から
  `snapshot.clips[].source_frame`（4,074件）を削除。`npm run fixture:evaluation-parity`
  で再生成後、`cargo test --test ts_evaluation_parity` が緑になり、残り2クラス
  （`translation_x/y` 各170件、`effects.length`/`Clipping.*` 各137件）は件数不変。
- 受け入れ基準を全て満たした: `cargo test`(rust-core) 116 passed、
  `ts_evaluation_parity` 緑（`source_frame` バケット消滅、他バケット件数不変）、
  `npx vitest run` 251ファイル/1822テスト全緑、`npx tsc --noEmit` exit 0、
  `npm run codegen:types:check` exit 0。
