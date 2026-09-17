# エクスポートコーデック選択の配線

## 決定

- `exportVideoCodec` は `.uxfd` プロジェクトファイルではなく、アプリ全体の `localStorage` 設定（`uxfd-export-video-codec`）として保存する。プロジェクトの内容・再現性を変えず、利用者ごとの既定出力形式を次回起動後も使えるためである。
- UI 向けの契約は `VideoExportCodec`、`VIDEO_EXPORT_CODECS`、`exportVideoCodec`、`setExportVideoCodec` とする。既定は既存の出力と互換な `h264`。
- H.264 の Rust リクエストには `videoCodec` キーを送らない。既存バックエンドへのペイロードをバイト単位で変えず、HEVC／ProRes 選択時だけキーを追加する。
- ProRes は `.mov`、H.264／HEVC は `.mp4` を保存ダイアログの既定名・フィルターとして使う。選択された保存先の拡張子が一致しなければ、書き出しを始めず日本語のエラーを表示する。
- WebCodecs 互換エンコーダーは H.264 以外を実装していないため、Rust バックエンドへ進めない場合に HEVC／ProRes を H.264 として静かに出力しない。明示的なエラーにする。

## 制約

- Rust バックエンドは ProRes の MP4 出力を拒否するため、UI は descriptor の `fileExtension` に従う必要がある。
- 実 Electron の保存ダイアログおよび実書き出しはこの環境では実行していない。ユニットテストではダイアログ引数、拡張子検証、Rust ペイロードを検証する。
