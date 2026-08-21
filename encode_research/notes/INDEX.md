# エンコード（動画エクスポート）高速化 研究ノート索引

新しいものを上に置く。1行1ノート。

- [export-speed-baseline-and-first-experiments.md](export-speed-baseline-and-first-experiments.md) — **focus-tips 720p60: ベースライン51.5fps(ffmpegRawRgba)、IOSurface直エンコードで66fps(+28%)、render-ahead=4は棄却。720pではエンコーダ自体は主犯でなく、残り15ms/frameの内訳分解が次の一手。IOSurface経路は既存ファイルがあると"Cannot Save"で必ず失敗するバグを発見**（2026-08-21）
- [export-pipeline-map.md](export-pipeline-map.md) — エクスポート経路の全体地図と高速化仮説の初期リスト（2026-08-21）

## 先行知見

- `perf_research/notes/` — 再生系のCPU/レンダリング調査。**dev環境ではdebugビルドのbackendが優先されるので、計測時は `UXFD_RUST_BACKEND_BIN` でreleaseを明示すること**（debug-backend-as-accidental-throttle.md）。
- `perf/export-test-results.json`（2026-07-01） — WebCodecs系のエンコード素性テスト。VideoToolbox HWエンコード自体は640x360で65〜112fps出る。
- `.codex/video-export-e2e/result.json`（2026-08-06） — focus-tips 12秒 720frames のエクスポートが **110.9s（6.5fps, 0.54x realtime）**、encoderPath=ffmpegRawRgba。
