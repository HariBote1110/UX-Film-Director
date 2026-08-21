# パフォーマンス研究ノート索引

新しいものを上に置く。1行1ノート。

- [video-playback-probe-results.md](video-playback-probe-results.md) — **H1（メインスレッド同期デコード起因のFPS崩壊）はCONFIRMED: non-sequential request_frameが18〜32%発生し最大798ms、renderFrame awaitが最大1087msブロックしtickのframeIndexが最大67フレーム飛ぶ。動画はpre-warm経路から漏れたまま未修正。H2（マスタークロックの無方向スナップ）は具体的経路が0件発火で棄却、ただしsetTimeの単調性ガード欠如自体は-41.4sの後退実測で確認（別経路のTimelineシーク由来）**（2026-08-22）
- [video-playback-backward-jump-fps-collapse.md](video-playback-backward-jump-fps-collapse.md) — **動画素材再生の「位置巻き戻り＋FPS崩壊」の原因仮説（未検証）。H1: 動画がpre-warm経路から漏れておりメインスレッド同期デコード＋追いつきスキップ→O(GOP)同期シークの暴走ループ。H2: 単調性ガードなしの `setTime` へ遅れたメディアクロックが無方向スナップ**（2026-08-22）
- [present-scene-cold-start.md](present-scene-cold-start.md) — **`presentScene` の218〜348msは起動後の初回再生1回だけのコールドコスト。2回目は4.6〜35.3ms。addon内部の最適化ではなくpre-warmが正解。**終了時SEGV修正後3run連続でクラッシュレポート増加なし（確証には不足）（2026-08-07）
- [engage-delay-breakdown.md](engage-delay-breakdown.md) — **engage 遅延の内訳。支配項は `presentScene`（native overlay addon 呼び出し）で 216〜324ms、`scene.evaluate` は 0.4〜4ms で無罪。`replace` は2本65msで無罪、支配項は `startPlayback` の361.7ms。しかもこれは backend を3倍遅くしても +6% しか増えず、「engage 遅延は backend 速度に比例」という前の結論を棄却。開始要求とプレビュー評価の競合も発見**（2026-08-07）
- [native-clock-optimistic-revision-race.md](native-clock-optimistic-revision-race.md) — **native playback clock が engage しなかった原因は楽観的revisionのレース（実測detailで確定）。適格性説は棄却。常駐revision確定を待つ修正で busyMs 919→493/506、presenter再起動 42→3、layoutCount 213→136/126。ただし engage は frame 83〜93 で前半はまだレンダラークロック**（2026-08-07）
- [debug-backend-as-accidental-throttle.md](debug-backend-as-accidental-throttle.md) — harness の Rust backend は debug ビルドで、release にすると backend CPU は 93〜118% → 34.6% に下がる。**一度「release だと再起動が増える」と結論したが release-2 で撤回。真の支配変数は native playback clock が engage するかどうかで、engage すると busyMs 1032〜1745 → 463、presenter再起動 54〜133 → 3、Viewportコミット 63〜187 → 12**（2026-08-07）
- [where-the-cpu-actually-goes.md](where-the-cpu-actually-goes.md) — **再生中のCPUはレンダラーではなく `uxfd-rust-backend`（93〜118%）で燃えている。レンダラーは27〜32% busy、scripting 191〜196ms/3.8秒。React最適化は投資対効果の観点で完了扱い。**ただし harness の backend は debug ビルド（2026-08-07）
- [viewport-subtree-commit-attribution.md](viewport-subtree-commit-attribution.md) — Viewport subtree のコミット帰属。**「毎フレーム1回コミット」は485aでは再現しない（63〜94回/約180フレーム）。`SceneSelectionDecorationLayer` 犯人説は棄却。コミットは presenter フル再起動に連動**。commitCount が run 間で+49%動く落とし穴の発見を含む（2026-08-07）
- [measurement-protocol.md](measurement-protocol.md) — この研究で使う計測規約。信頼できる指標／できない指標と、その根拠（2026-08-07）

## 先行知見（`progress/` 側にある既存の記録）

このディレクトリを作る前の計測は `progress/` に入っている。再調査の前に必ず読むこと。

- `progress/renderer-per-frame-rerender.md` — `currentTime` hook購読の全廃。Timeline は毎フレーム→ほぼゼロ（commitCount 211→5）、Viewport は 377→191 で半減にとどまる。**busyMs / `Receive mojo reply` / exportRun.durationMs は run-to-run で数倍ばらつくため単発比較に使えない**という棄却記録を含む。
- `progress/chromium-render-path-audit.md` — production 到達可能な Chromium 描画経路の棚卸し。
- `markdown/Performance_Concerns.md` — **推測ベース**の懸念メモ。Pixi 前提の記述が残っており現行構成とズレている箇所がある。根拠としては使わない。
