# P1c `scene.replace` dual-run

## Decision

- `scene.replace` は従来の `project` / `media` を必須のresident入力として残し、`editableScene` はoptionalな比較用入力として追加する。
- Rust側のdual-runは `UXFD_SCENE_BUILDER_DUAL_RUN=1` のときだけ有効にし、環境変数はプロセス内で一度だけ読む。Rust builderの結果はsessionへ保存せず、応答の診断だけに使う。
- renderer側は `VITE_UXFD_RUST_EDITABLE_SCENE_DUAL_RUN=1` のときだけ、`buildEditableRustScene` と同じ settings / layers / objects に previewProxy の `mediaContext` を付けて送る。既定値はOFFである。
- 比較はP1bの構造比較規則に合わせ、JSON objectのキー順を無視し、配列順を維持し、数値の微小差を許容する。`source` がJSON文字列の場合はJSONとして比較する。
- `residentEligible` は独立に比較し、Rust側がfalseならTSが送ったsceneとのeligibility mismatchとして扱う。mismatch時は一行の簡潔なログを出す。

## Alternatives

- Rust builderの結果をresident sessionへ切り替える案は採用しなかった。P1cの目的はparityとpayload/build時間の計測であり、既存previewの挙動とauthoritative範囲を変えない。
- source文字列のbyte比較は採用しなかった。JSONのキー順や数値表現に依存するためである。
- フラグOFF時にも空のdiagnosticsを返す案は採用しなかった。旧clientとpayload/responseの互換性を保つため、`editableScene`が無い場合またはdual-runがOFFの場合は応答shapeを変更しない。

## Constraints / Gotchas

- `editableScene` の `mediaContext` は generated TypeScript型のcamelCase shapeである。Rust serdeのcamelCaseと一致させる必要がある。
- `Project.media` はRustの `MediaReference` にdeserializeされた旧payloadを比較対象にする。TS側のresident builderが持つmediaの寸法などは別の `media` 配列で比較する。
- diagnosticsには `diffPaths` を先頭16件まで、`payloadBytes` と `buildMicros` を含める。§6 decision 2の閾値はこの計測後に決める。
- sessionには常にTSから受けた `project` / `media` だけを保存する。dual-runのRust結果を誤って表示経路へ流さないこと。

## 実機検証（2026-09-13、realistic heavy edit E2E）

- `UXFD_SCENE_BUILDER_DUAL_RUN=1` と `VITE_UXFD_RUST_EDITABLE_SCENE_DUAL_RUN=1` を有効にし、export を省略して
  `scripts/run-realistic-heavy-edit-e2e.mjs` を実行した（スクラブ・複製・Undo/Redo・シーン切替・再生・保存形式往復）。
- `scene.replace` 8 回すべてで、差分は `project.id` の 1 箇所のみ、`eligibilityMatched=true`、Rust 診断 0 件だった。
  原因は preview の `editableScene.mediaContext` に `sceneId` を渡しておらず、Rust builder が既定 `editable-scene` を
  `Project.id` に使っていたこと。`mediaContext.sceneId` を渡す修正を入れた（commit 1c596209）。
- 計測値（CDP で `window.__UXFD_RUST_TIMELINE_SCENE_RPC__.dualRun` を 250ms 間隔で採取、ユニーク 3 サンプル）:
  `payloadBytes` 27,811〜34,035、`buildMicros` 586〜7,373（1 回のみ 7.4ms、他は 1ms 未満）。計画 §6 決定 2 の
  閾値判断の初期値として記録する。
- 同 E2E は `roundTrip.ok=false`（保存形式への直列化→復元の前後で fingerprint 不一致）で FAIL したが、dual-run フラグ
  なしの再実行でも同様に FAIL したため dual-run とは無関係。2026-07 下旬のアーカイブ実行 7 回はすべて
  `roundTrip.ok=true` だったので、それ以降の変更による退行であり、別途原因を調査する。
