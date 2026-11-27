# テキストの末尾文字欠落・選択不可・fps自由入力

## Decision
- 末尾文字欠落（例: "Alize" の e が消える）の真因: テキスト領域幅は Canvas2D `measureText` の四捨五入値、描画は cosmic-text が既定の自動折り返し付きでその幅に `set_size` していた。シェーピング幅が領域幅を1px未満でも超えると最後のグリフが2行目へ折り返され、1行分の高さの外でクリップされる。Rust テストで仮説を確認済み。
- 対策: `text.rs` で `Wrap::None`（改行は `\n` のみ）、計測幅は `Math.ceil`。余白の上乗せはしない。
- テキストの選択・ドラッグ不可の真因: `sceneHitTest.getObjectSize` が `width`/`height` を持たないオブジェクトを除外しており、テキストは対象外だった。`textMediaBox` を export して描画・ヒットテスト・選択枠の唯一の寸法源とした。テキストはリサイズハンドルを出さない（width/height を持たないため）。
- fps は新規プロジェクト画面で 1〜240 の整数を自由入力。小数fpsは非対応。

## Alternatives considered
- 計測幅に固定パディングを足す案: 中央・右揃えの位置がずれるため不採用。
- 小数fps（12.5, 29.97 等）: encode.rs（`fps: u32`）と editable_scene_builder.rs（`fps.round()`）が整数前提で、書き出し時に黙って丸められるため今回は見送り。対応するには Fps（分子/分母）を書き出しまで通す改修が必要。

## Constraints / Gotchas
- Canvas とcosmic-text でフォント解決が大きく異なる場合、`Wrap::None` でも右端が数px切れる可能性は残る（折り返しで丸ごと消えることはない）。
