# エンコード（動画エクスポート）高速化 研究ノート索引

新しいものを上に置く。1行1ノート。

- [per-frame-overhead-breakdown.md](per-frame-overhead-breakdown.md) — **「GPU律速になるべき」仮説を採択。エンコーダはどの経路でも無罪（append 0.05ms）。既定経路はvsync同期の供給が15.75ms/frameで律速、residentScene経路もフレーム時間の46%(6.3ms)がRPC/JSON変換オーバーヘッド。write RPCは完全直列で、パイプライン化すれば約2倍の見込み**（2026-08-21）
- [export-speed-baseline-and-first-experiments.md](export-speed-baseline-and-first-experiments.md) — **focus-tips 720p60: ベースライン51.5fps(ffmpegRawRgba)、IOSurface直エンコードで66fps(+28%)、render-ahead=4は棄却。720pではエンコーダ自体は主犯でなく、残り15ms/frameの内訳分解が次の一手。IOSurface経路は既存ファイルがあると"Cannot Save"で必ず失敗するバグを発見**（2026-08-21）
- [export-pipeline-map.md](export-pipeline-map.md) — エクスポート経路の全体地図と高速化仮説の初期リスト（2026-08-21）

## 先行知見

- `perf_research/notes/` — 再生系のCPU/レンダリング調査。**dev環境ではdebugビルドのbackendが優先されるので、計測時は `UXFD_RUST_BACKEND_BIN` でreleaseを明示すること**（debug-backend-as-accidental-throttle.md）。
- `perf/export-test-results.json`（2026-07-01） — WebCodecs系のエンコード素性テスト。VideoToolbox HWエンコード自体は640x360で65〜112fps出る。
- `.codex/video-export-e2e/result.json`（2026-08-06） — focus-tips 12秒 720frames のエクスポートが **110.9s（6.5fps, 0.54x realtime）**、encoderPath=ffmpegRawRgba。
