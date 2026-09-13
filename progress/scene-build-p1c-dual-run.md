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
