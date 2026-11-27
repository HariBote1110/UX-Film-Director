# 書き出し・プロキシの VideoToolbox 加速

## 決定

- macOS のトランスコード入力は VideoToolbox デコードを優先する。配置が恒等でオーバーレイなしなら映像フィルターを出さず、単純リサイズだけなら `-hwaccel_output_format videotoolbox_vld` と `scale_vt` を使い、GPU surface のまま VideoToolbox エンコーダへ渡す。
- pad/crop またはオーバーレイは ffmpeg の CPU フィルターを必要とするため、VideoToolbox デコードのみを指定し、surface 出力指定はしない。プロキシも同様に `scale_vt` を優先し、失敗時は既存の libx264 CPU 経路へ戻す。
- `videoCodec` は省略時 H.264。HEVC は macOS で `hevc_videotoolbox -prio_speed 1 -tag:v hvc1`、ProRes は `prores_videotoolbox`（非 macOS のみソフトウェア互換エンコーダ）を選ぶ。ProRes は MOV 専用とし、MP4 は入力検証で拒否する。
- IOSurface の AVAssetWriter は HEVC と ProRes も選択できる。H.264 省略時の settings dictionary は従来と同じに保ち、HEVC/ProRes だけ圧縮プロパティに `PrioritizeEncodingSpeedOverQuality` を渡す。

## 制約 / 注意点

- VideoToolbox の実エンコード可否・実機速度は sandbox では評価しない。トランスコードは hardware attempt の失敗後に一度だけ CPU 引数で再試行し、proxy も CPU へフォールバックする。
- ProRes は品質ベースであるため、ビットレート要求は適用しない。音声付き IOSurface ProRes の一時映像も `.mov` を使う。

## 親環境での実測（2026-09-17、Apple M4、ffmpeg 8.0.1）

素材は `perf/heavy-media/20000kbps_60fps.mp4`（HEVC 1920×1080 60fps）。実装が生成するコマンドをそのまま `/usr/bin/time -p` で3回ずつ実行した（先頭10秒 = 600フレーム、プロキシのみ全1222フレーム）。

| ケース | 旧 | 新 |
| --- | --- | --- |
| (a) FHD無変換 H.264 | 150 fps / CPU 170% | 148 fps / CPU 47% |
| (a) FHD無変換 HEVC（新規） | — | 223〜299 fps / CPU 45〜59% |
| (b) 720p縮小 H.264 | 370 fps / CPU 560%（CPUデコード+CPU scale） | 306〜343 fps / CPU 28〜36%（HWデコード+scale_vt） |
| (b) 720p縮小 HEVC（新規） | — | 311〜337 fps / CPU 30〜36% |
| (d) プロキシ生成（1222フレーム） | 未計測 | 約240 fps / CPU 34〜41% |

- 出力はすべて期待どおり: (a)(b) 600フレーム、HEVC は `hvc1` タグ、(b) は 1280×720、プロキシは `scale_vt=w=1280:h=-2` で 1280×720・1222フレーム。
- (b) では旧CPU経路の方がスループットは約1割高い。M4のHWのHEVCデコード上限（約280〜300 fps）が律速になるためで、代わりにCPU使用率は約1/17になる。Apple機ではHW支援を優先する方針（ユーザー判断、2026-09-17）により新経路を採用する。
- アプリのE2E（`scripts/run-video-export-e2e.mjs`、FHD 10秒の direct transcode、H.264既定）は 5086 ms（118 fps）→ **3553 ms（169 fps、+43%）** で総合PASS、出力600フレーム。
- `macos-video-encode` の実機 HEVC テスト（`UXFD_RUN_HEVC_ENCODER_TEST=1`）と既存 H.264 テストは親環境で成功。rust-backend の cargo test、tsc、vitest（1865件）も成功。
