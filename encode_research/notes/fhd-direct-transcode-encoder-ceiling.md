# FHD単体動画のdirect transcodeはVideoToolbox H.264エンコーダ律速（GPU使用率が低いのは仕様）

## 目的 / 仮説

ユーザー報告:「`npm run dev` でFHD動画1本だけを入れてエンコードすると、GPUが10%程度しか使われない」。

- 仮説1: debugビルドのbackendが律速している。
- 仮説2: direct transcodeのffmpegが `-hwaccel` 無しでHEVCをCPUデコードしており、CPU律速になっている。
- 仮説3: 毎回かける `scale/pad/crop/fps` フィルタがCPU律速になっている。
- 仮説4: VideoToolbox H.264エンコーダ自体が上限になっている。

反証条件: デコード方式・フィルタ有無を変えてもfpsが変わらなければ、仮説2・3は棄却。

## 環境

- ホスト: Apple M4（macOS 26 / Darwin 25.6.0）
- ffmpeg 8.0.1
- 素材: `perf/heavy-media/20000kbps_60fps.mp4`（HEVC 1920×1080 60fps、20.3秒）
- コミット: `8582ba3b`（0.1.1-Beta-520f）

## 手順

1. アプリ経路の確認: `UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH=perf/heavy-media/20000kbps_60fps.mp4 UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS=10 node scripts/run-video-export-e2e.mjs`（git worktree上、debug backend）。GPU使用率は `ioreg -r -c IOAccelerator` の `Device Utilization %` を0.5秒間隔で採取。
2. `rust-backend/src/transcode.rs` が組み立てるffmpeg引数（`-i <src> -vf scale=W:H,setsar=1,pad=…,crop=…,fps=60 -r 60 -c:v h264_videotoolbox -b:v <kbps>k -pix_fmt yuv420p`）を手で再現し、1変数ずつ変えて `/usr/bin/time -p` で3回（一部2回）計測。600フレーム、ビットレートは12000kで統一。

## 結果

### アプリ経路（E2E）

| 項目 | 値 |
| --- | --- |
| 選ばれた経路 | `Rust backend direct transcode`（描画・wgpuを通らないffmpeg直変換） |
| 600フレーム所要 | 5086 ms（117.97 fps） |
| GPU使用率（ioreg） | 平均46%、中央値34%（サンプル29点、起動区間を含む） |

debug/releaseの比較は、1回目のElectronが終了せずdebug portを占有したため2回目以降が起動失敗し、取得できなかった。ただしこの経路はbackend内でffmpegを起動するだけなので、backendのビルド種別は律速にならない（下表の生ffmpegで同等速度が出る）。

### ffmpeg単体（600フレーム、中央値）

| 変種 | 変えたもの | fps | CPU使用率 |
| --- | --- | --- | --- |
| A 現行引数 | — | 150 | 170% |
| B | `-hwaccel videotoolbox` | 148 | 50% |
| C | Bからフィルタ除去 | 148 | 51% |
| F | ソフトウェアデコードのままフィルタ除去 | 150 | 170% |
| G | 合成ソース（testsrc2）でエンコードのみ | 155 | 44% |
| D | ソフトウェアデコードのみ（`-f null`） | 420 | 530% |
| E | HWデコードのみ（`-f null`） | 276 | 28% |

### エンコーダ設定（合成ソース、600フレーム）

| 変種 | fps |
| --- | --- |
| h264_videotoolbox 既定 | 155 |
| h264 `-prio_speed 1` | 155 |
| h264 `-realtime 1` | 155 |
| hevc_videotoolbox 既定 | 149 |
| **hevc `-prio_speed 1`** | **224（+44%）** |
| h264 既定を2本並列（合計1200フレーム） | 合計159（並列化の効果なし） |
| 実素材 + HWデコード + h264 `-prio_speed 1` | 148 |

## 結論

- **仮説1: 棄却済み。** direct transcodeはbackendがffmpegを起動するだけで、生ffmpegでも150fps前後で頭打ちになる。
- **仮説2: 速度面では棄却済み。** HWデコードに変えてもfpsは変わらない（148〜150）。ただしCPU使用率は170%→50%に下がるので、省電力・他作業との並行には効く。
- **仮説3: 棄却済み。** フィルタの有無でfpsは変わらない（148 vs 148、150 vs 150）。
- **仮説4: 採択。** デコード無しの合成ソースでも155fpsで止まり、2本並列でも合計159fpsなので、M4のメディアエンジン上のH.264エンコードが上限（FHD60で約155fps）。`prio_speed`・`realtime` はH.264では効かない。
- 「GPU 10%」は異常ではない。VideoToolboxのデコード・エンコードはGPUコアではなくメディアエンジン（専用回路）で動くため、GPU使用率にはほとんど現れない。
- アプリ経路（118fps）と生ffmpeg（150fps）の差（約21%）は、音声の準備、プロセス起動、進捗の読み取りなどの固定費を含む計測範囲の違いと見られる（未分解）。

## 次の一手 / 未検証事項

- H.264の上限を超えるには、HEVC出力 + `-prio_speed 1`（224fps、+44%）が現実的な候補。ただしHEVCは再生互換性が下がるので、出力形式の選択肢として出すかはユーザー判断。
- `-hwaccel videotoolbox` はfpsを上げないがCPUを約3分の1にするので、direct transcodeへ入れる価値はある（要画質・色域確認）。
- アプリ経路の118fpsと生ffmpeg 150fpsの差（約1秒）の内訳は未計測。
- 描画を通す経路（編集あり、`iosurfaceVideoToolboxAudioMux`）はこのノートの対象外。そちらもH.264エンコードの上限155fpsが天井になる。
