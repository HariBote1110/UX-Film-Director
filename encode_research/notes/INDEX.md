# エンコード（動画エクスポート）高速化 研究ノート索引

新しいものを上に置く。1行1ノート。

- [upload-fence-per-frame-removal.md](upload-fence-per-frame-removal.md) — **sourceUpload残存2〜3msの正体は毎フレームのuploadフェンス(submit(empty)+wait ≒2.0ms)。仮説B(revision取りこぼし)は棄却(ミスは起動時42回のみ)。フェンス除去で133〜139fps(中央値135.8、ベースラインの2.64倍)、e2e全success。本実装は/developmentへ**（2026-08-21）
- [generated-source-cache-verification.md](generated-source-cache-verification.md) — **キャッシュ修正の効果検証: collect 7.03→0.2ms(-96%)、102〜119fps(中央値107、当初ベースラインの2.07倍)。フレーム時間はほぼGPU作業のみ=GPU律速に到達。次はsourceUpload 2〜3ms残存とvsync供給律速の既定経路**（2026-08-21）
- [collect-sources-cpu-rasterisation.md](collect-sources-cpu-rasterisation.md) — **前処理6〜8msの最終帰属。JSON往復・再パースは<0.1msで無罪(レバー2棄却)。`collect_native_render_sources`が生成系(Text/Shape/Gradient/SolidColour)を毎フレームCPU再ラスタライズしているのが犯人。revisionキー付きCPUキャッシュで130〜140fps見込み**（2026-08-21）
- [write-pipelining-rejected-backend-serial-cpu.md](write-pipelining-rejected-backend-serial-cpu.md) — **writeパイプライン化は棄却(+3〜5%)。backendは直列サーバで、真犯人は前処理CPU 6.05ms/frame(JSON Value往復+clone+parse)。本命はレバー2=JSON往復排除(→約135fps見込み)。加えてエクスポートeffect再発火によるrunExport並走(encode.start二重)バグを特定 — "Cannot Save"/0バイト残骸/タイムアウトの統一真因**（2026-08-21）
- [per-frame-overhead-breakdown.md](per-frame-overhead-breakdown.md) — **「GPU律速になるべき」仮説を採択。エンコーダはどの経路でも無罪（append 0.05ms）。既定経路はvsync同期の供給が15.75ms/frameで律速、residentScene経路もフレーム時間の46%(6.3ms)がRPC/JSON変換オーバーヘッド。write RPCは完全直列で、パイプライン化すれば約2倍の見込み**（2026-08-21）
- [export-speed-baseline-and-first-experiments.md](export-speed-baseline-and-first-experiments.md) — **focus-tips 720p60: ベースライン51.5fps(ffmpegRawRgba)、IOSurface直エンコードで66fps(+28%)、render-ahead=4は棄却。720pではエンコーダ自体は主犯でなく、残り15ms/frameの内訳分解が次の一手。IOSurface経路は既存ファイルがあると"Cannot Save"で必ず失敗するバグを発見**（2026-08-21）
- [export-pipeline-map.md](export-pipeline-map.md) — エクスポート経路の全体地図と高速化仮説の初期リスト（2026-08-21）

## 先行知見

- `perf_research/notes/` — 再生系のCPU/レンダリング調査。**dev環境ではdebugビルドのbackendが優先されるので、計測時は `UXFD_RUST_BACKEND_BIN` でreleaseを明示すること**（debug-backend-as-accidental-throttle.md）。
- `perf/export-test-results.json`（2026-07-01） — WebCodecs系のエンコード素性テスト。VideoToolbox HWエンコード自体は640x360で65〜112fps出る。
- `.codex/video-export-e2e/result.json`（2026-08-06） — focus-tips 12秒 720frames のエクスポートが **110.9s（6.5fps, 0.54x realtime）**、encoderPath=ffmpegRawRgba。
