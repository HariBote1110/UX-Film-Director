# エクスポート経路の全体地図と高速化仮説（初期調査）

## 目的 / 仮説

エンコード（動画エクスポート）が遅い。糸口探しとして、まず経路の全体像を静的に把握し、
ボトルネック仮説を列挙してから計測に入る。

## 環境

- ホスト: yuki の Mac (Darwin 25.5.0, Apple Silicon)
- リポジトリ: UX-Film-Director branch `feature-proxy` @ fb081da8
- 既存計測: `.codex/video-export-e2e/result.json`（2026-08-06, 当時のバイナリ構成は不明）

## 経路の全体地図（コードリーディング結果）

エクスポートのフレーム供給には3系統あり、`Viewport.tsx: getRustExportFrameSource` が選ぶ:

1. **residentScene 経路（最速設計・ただしopt-in）**
   - 条件: `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1` かつ `VITE_UXFD_NATIVE_DIRECT_ENCODE=1`
     （preload.ts:193 `nativeDirectEncodeEnabled`）かつ 2Dモード。
   - renderer は `{sceneId, revision, frameIndex}` だけを送り、backend 常駐シーンが
     `evaluate_frame` → native-wgpu-renderer で **BGRA を IOSurface に直接描画** →
     `AVAssetWriter`（VideoToolbox HW）に **readback ゼロ**で append（native_render.rs:390-460）。
   - 制約: audioPath 併用不可（encode.rs:272-274 で明示的にエラー）。
     → 音声付きだと ffmpegRawRgba へフォールバックする点に注意。

2. **writeNativeFrame 経路**
   - renderer が snapshot+media+sources の JSON を毎フレーム RPC で送る。
   - backend が wgpu 描画 → RGBA readback → ffmpeg stdin（rawvideo rgba）。
   - iosurfaceEncode フラグ次第で IOSurface 直書きにもなる。

3. **sharedFrame 経路（2026-08-06 の実測で使われていたもの）**
   - shared renderer（レンダラープロセス側 WebGPU）が描画 → readback → POSIX 共有メモリ →
     backend が読んで ffmpeg stdin へ raw RGBA を書く（encode.rs: write_tight_rgba_frame_to_encoder）。
   - ffmpeg 側で RGBA→yuv420p 変換 + h264_videotoolbox エンコード。

エクスポート駆動は `runRustBackendVideoEncodeExport`（rustBackendVideoEncodeExport.ts）で、
**逐次ループ + render-ahead は既定1（最大4にクランプ, 126-129行）**。

## 既知の実測値（自分ではまだ再計測していない）

| 計測 | 値 | 出典 |
|---|---|---|
| focus-tips 12s/720frames エクスポート | 110.9s = 6.5fps（0.54x realtime） | .codex/video-export-e2e/result.json (2026-08-06) |
| encoderPath | ffmpegRawRgba（= 遅い系統3） | 同上 |
| VideoToolbox HW エンコード素性 (640x360) | 65〜112fps | perf/export-test-results.json (2026-07-01) |
| 4K seek ソース取得 | 6fps/枠（seek=122.8ms） | 同上 |

## ボトルネック仮説（未検証、優先順）

- **H1: 経路選択そのものが主犯。** 既定フラグでは residentScene+IOSurface 経路が無効で、
  readback + 共有メモリ + ffmpeg raw RGBA パイプの系統3に落ちている。
  フラグを有効化した同一プロジェクトの比較で数倍差が出るはず。
- **H2: パイプラインが直列。** render-ahead 既定1で、フレームN のエンコード完了を待ってから
  N+1 を描画する構造。renderAheadFrameCount を4にするだけで重なりが増える可能性。
- **H3: ffmpeg raw RGBA パイプの転送・変換コスト。** 1080p60 で 8.3MB/frame ≒ 500MB/s の
  stdin 書き込み + ffmpeg 側 RGBA→yuv420p 変換。ここが系統3の下限を規定している可能性。
- **H4: ソース動画のデコードがフレーム律速。**（focus-tips は動画ソース無しなので別プロジェクトで検証）
- **H5: 毎フレームの JSON RPC（snapshot+media 全文）のシリアライズ**（系統2のみ）。

## 計測手段

- `npm run test:video-export:e2e`（scripts/run-video-export-e2e.mjs）が
  `exportDurationMs` / `exportFramesPerSecond` / encoderPath を result.json に吐く。
  `process.env` を素通しするので `VITE_UXFD_*` フラグと `UXFD_RUST_BACKEND_BIN` を制御可能。
- backend の RPC 応答には per-frame timings（setupMs/sourceUploadMs/renderMs/readbackEncodeMs）が
  含まれるが、**TS側はこれを捨てておりログに出ない**。内訳が要るならここのログ追加が最小手術。

## 落とし穴（先行知見より）

- dev 環境では `rust-backend/target/debug` が release より先に解決される（main.ts:177-179）。
  計測時は必ず `UXFD_RUST_BACKEND_BIN` で release を指定する。

## 結論

未計測。次の一手を参照。

## 次の一手 / 未検証事項

1. ベースライン: focus-tips 12s を release backend + 既定フラグで再計測（H1の前提固定）。
2. 変数1つ変え: `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1 VITE_UXFD_NATIVE_DIRECT_ENCODE=1` で再計測（H1検証）。
3. render-ahead 4 で再計測（H2検証）。
4. 内訳が必要なら per-frame timings のログ出力を研究用に追加。
