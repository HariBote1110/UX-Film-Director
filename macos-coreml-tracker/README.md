# uxfd-coreml-tracker

macOS 専用の Vision CLI。stdin に JSON を渡し、stdout に 1 行の JSON を返す。

## ビルド

```bash
cd macos-coreml-tracker
swift build -c release
```

実行ファイル: `.build/release/uxfd-coreml-tracker`

開発時は `UXFD_COREML_TRACKER_BIN` でパスを指定できる。

## `command` 別入力

共通: `videoPath`（絶対パス）

| command | 追加フィールド | 説明 |
| --- | --- | --- |
| `track`（省略可） | `startSec`, `endSec`, `initialBoundingBox`, 任意 `frameStride`, `targetFps` | 既存の逐次トラッキング |
| `detectSubjects` | `timeSec` | `VNRecognizeAnimalsRequest`（猫/犬）の bbox 一覧 |
| `segmentPerson` | `timeSec` | `VNGeneratePersonSegmentationRequest` のマスク PNG（base64） |
| `framePreview` | `timeSec` | 1 フレーム JPEG（base64）プレビュー用 |

## 出力（成功例）

- **track**: `{"ok":true,"samples":[...]}`
- **detectSubjects**: `{"ok":true,"animals":[{"identifier","confidence","boundingBox"},...]}`
- **segmentPerson**: `{"ok":true,"maskPngBase64":"..." | null, "message": "..."}`
- **framePreview**: `{"ok":true,"width":1920,"height":1080,"jpegBase64":"..."}`

失敗: `{"ok":false,"error":"..."}`
