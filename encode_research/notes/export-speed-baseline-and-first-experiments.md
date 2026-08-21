# エクスポート速度ベースラインと初回実験（H1/H2）

## 目的 / 仮説

[export-pipeline-map.md](export-pipeline-map.md) の仮説を実測で切り分ける。

- H1: residentScene+IOSurface 経路（フラグopt-in）を有効にすれば大幅に速くなる
- H2: render-ahead を 1→4 に増やせばパイプライン重なりで速くなる

## 環境

- ホスト: yuki の Mac (Darwin 25.5.0, Apple Silicon)、電源状態・他プロセスは未統制
- リポジトリ: branch `feature-proxy` @ fb081da8（作業ツリーはクリーン、後述の一時パッチを除く）
- backend: `rust-backend/target/release/uxfd-rust-backend`（cargo release, 2026-08-21ビルド）
  - **必ず `UXFD_RUST_BACKEND_BIN` で release を明示**（dev では debug が優先解決されるため）
- 計測対象プロジェクト: `public/agent-projects/focus-tips.json`
  （1280x720 @60fps、12秒 = 720フレーム。shape 22 / text 20 / dotField 1 / particle 1。
  **動画・音声ソースなし** → デコード系は今回の変数に含まれない）
- ハーネス: `node scripts/run-video-export-e2e.mjs`（結果は `.codex/video-export-e2e/result.json`）
- 各条件 1 run のみ（run-to-run ばらつき未評価。過去ノートでは export 系指標は数倍ばらつく
  ことがあるとされるが、今回の 51↔66fps 差は同条件反復で要確認）

## 手順

```bash
# ベースライン
UXFD_RUST_BACKEND_BIN=$PWD/rust-backend/target/release/uxfd-rust-backend \
UXFD_VIDEO_EXPORT_E2E_AGENT_PROJECT_PATH=$PWD/public/agent-projects/focus-tips.json \
UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS=300000 node scripts/run-video-export-e2e.mjs

# H1: フラグ有効（residentScene + IOSurface VideoToolbox 直エンコード）
VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1 VITE_UXFD_NATIVE_DIRECT_ENCODE=1 <同上>

# H2: render-ahead 4
VITE_UXFD_RUST_EXPORT_RENDER_AHEAD_FRAMES=4 <同上>
```

## 結果

| 条件 | encoderPath | 720枠所要 | fps | 対ベースライン |
|---|---|---|---|---|
| ベースライン（既定フラグ, release backend） | ffmpegRawRgba | 13.97s | **51.5** | 1.00x |
| H1: residentScene+IOSurface（※後述パッチ適用後） | iosurfaceVideoToolbox | 10.91s | **66.0** | **1.28x** |
| H2: render-ahead=4（既定経路） | ffmpegRawRgba | 14.11s | 51.0 | 0.99x |
| （参考）2026-08-06 の記録 | ffmpegRawRgba | 110.9s | 6.5 | — |

副次的な発見（速度以前の問題）:

1. **IOSurface 経路は出力先ファイルが既に存在すると必ず起動失敗する（バグ）。**
   `AVAssetWriter.startWriting` は既存ファイルを上書きできず
   `StartFailed("Cannot Save")` になる（使い捨てテストで確定再現）。
   ffmpeg 経路は `-y` 付きなので同条件でも成功する。検証のため
   `VideoEncodeSession::start` に「既存ファイルを事前削除」する一時パッチを当てて計測した
   （パッチは撤去済み。本修正は /development で TDD 再実装すること）。
   なお失敗時に 0 バイトの残骸ファイルが残り、以後のリトライも全部失敗する。
2. **residentScene 経路で 12 秒設定の run が 1 回タイムアウト**（120s 経過で 8KB しか
   書かれず、進捗モーダルも消失）。同条件の再実行では 10.9s で完走しており再現条件不明。
   フレーク or 初回特有の問題の可能性。安定性の検証が別途必要。
3. **debug ビルド backend では export が `webGpuUnavailable` で開始すらできない**（2/2 再現）。
   8/6 の 6.5fps 記録との 8 倍差は binary/コード差のどちらか切り分け不能のまま
   （debug では今日はそもそも走らないため）。以後の比較は release 前提で揃える。

## 結論

- **H1: 採択（ただし効果は +28% どまり）。** IOSurface 直エンコードは速いが劇的ではない。
  readback+ffmpeg パイプ（系統3）の除去で稼げるのは 720p では 3ms/frame 程度。
- **H2: 棄却。** render-ahead 1→4 は 720p の focus-tips では誤差内（51.5→51.0fps）。
  ボトルネックは render-ahead が重ねられる区間の外にある。
- **最重要の示唆: 720p では「エンコード」自体は主犯ではない。**
  エンコーダを VideoToolbox 直結にしても 66fps ≒ 15ms/frame が残る。
  残り時間の内訳（backend の evaluate+wgpu render / RPC 往復 / renderer 側のフレーム生成）を
  分解しないと次の一手が決まらない。backend の RPC 応答には既に per-frame timings
  （setupMs/sourceUploadMs/renderMs/readbackEncodeMs/totalMs）が入っているが
  **TS 側が捨てていてログに出ない**。ここの可視化が次の最小手術。

## 次の一手 / 未検証事項

1. per-frame timings を集計・出力する（研究用: rustBackendVideoEncodeExport.ts か
   electron bridge でログ）→ 15ms/frame の内訳を確定させる。
2. 同条件反復（≥3 run）で 51 / 66 fps の再現性・分散を確認。
3. 動画ソース入りプロジェクト（heavy-media）での計測。H4（デコード律速）は未検証。
4. 1080p / 4K 解像度スケーリングの確認（720p は転送量が小さく系統3が不利になりにくい）。
5. residentScene 12s タイムアウトの再現試行と原因調査。
6. バグ修正の本実装: IOSurface encode の既存ファイル上書き（ffmpeg -y と同義に）
   + 失敗時の 0 バイト残骸削除。
