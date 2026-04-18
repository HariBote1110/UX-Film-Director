# uxfd-coreml-tracker

macOS 専用の Vision `VNTrackObjectRequest` CLI。stdin に JSON を渡し、stdout に 1 行の JSON を返す。

## ビルド

```bash
cd macos-coreml-tracker
swift build -c release
```

実行ファイル: `.build/release/uxfd-coreml-tracker`

開発時は `UXFD_COREML_TRACKER_BIN` でパスを指定できる。

## 入力 JSON

| フィールド | 説明 |
| --- | --- |
| `videoPath` | 動画ファイルの絶対パス |
| `startSec` / `endSec` | メディア内の読み取り区間（秒） |
| `initialBoundingBox` | Vision 正規化矩形（原点は画像**左下**） |
| `frameStride` | 任意。`N` ごとに 1 サンプル出力（トラッキングは毎フレーム実行） |
| `targetFps` | 任意。`frameStride` 未指定時、出力をおおよそこの間隔（秒）で間引く |

## 出力 JSON

成功: `{"ok":true,"samples":[{"tSec":0.0,"boundingBox":{"x":...,"y":...,"width":...,"height":...}}, ...]}`

失敗: `{"ok":false,"error":"..."}`
