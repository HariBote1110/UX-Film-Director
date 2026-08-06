# 計測規約

## 目的

性能の判断に使ってよい指標と、使ってはいけない指標を固定する。
`progress/renderer-per-frame-rerender.md` で、ばらつきの大きい指標を根拠に
**2回誤った結論を出して訂正した**実績があるため、その再発を防ぐ。

## 環境

- ホスト: Apple M4 / macOS 26.5.2
- Node v26.0.0 / cargo 1.93.0
- アプリ版数: `0.1.1-Beta-485a`、ブランチ `feature-proxy`
- ビルド: 開発ビルド（Vite dev server + Electron）

## 一次根拠にしてよい指標（回数系）

| 指標 | 取得元 | 根拠 |
|---|---|---|
| `exercise.reactProfile.components[].commitCount` | result.json | React のコミット回数そのもの。**ただし下の注意書きを必ず読むこと** |
| `layoutCount` | chromiumRendererTrace | 213/213/211/211 と安定 |
| `recalcStyleCount` | chromiumRendererTrace | 同上 |
| `animate` の callCount | chromiumRendererTrace | 再生区間のフレーム数の代理。178〜179 で安定 |
| `presenterRestarts` | result.json | presenter フル再起動回数（約28ms/回）。0 が正常 |

## 一次根拠にしてはいけない指標

| 指標 | 実測ばらつき | 扱い |
|---|---|---|
| `busyMs` / `busyRatio` | 同一構成で 970〜1520 (1.6倍) | 参考値。単発比較で改善と言わない |
| `Receive mojo reply` | 67回〜395回 (6倍) | 原因帰属に使えない |
| `exportRun.durationMs` | 42.6 / 60.3 / 67.7 秒 | 参考値 |
| `chromiumRendererTrace.topFunctions[].callCount` | — | **React の再レンダー判定に使わない**。sync lane のみを数えるため、concurrent lane へ移っただけのものを「消えた」と誤読させる |

### `commitCount` の安定性は条件付き（2026-08-07 追記）

過去ノートは commitCount を「211/211/210/210 で安定」としていたが、**485a の実測では
同一構成の2 run で Viewport 63 → 94（+49%）と大きく動いた**。原因は
`presenterRestarts.duringPlayback` が 54 → 79 と変動し、コミットがそれに連動しているため
（[viewport-subtree-commit-attribution.md](viewport-subtree-commit-attribution.md)）。

したがって **commitCount を比較するときは `presenterRestarts.duringPlayback` を必ず併記する。**
再起動回数が揃っていない run 同士の commitCount 比較は無意味である。

`Timeline`（5 / 5）と `PropertyPanel`（7 / 7）は安定しており、この注意は Viewport 固有。

## 落とし穴

- **`RendererTraceProfiler` の `id` は Profiler 境界であって、そのコンポーネント単体ではない。**
  `src/App.tsx:209` の `id="Viewport"` は Viewport subtree 全体を包む。したがって
  `Viewport` の commitCount は「subtree 内の誰かがコミットした回数」であり、
  Viewport 本体の再レンダー回数と同一視してはいけない。
- **重量E2Eを二重に走らせない。** Electron 同士が競合してタイムアウトする。計測は必ず単独で。
- **rAF スロットリングに注意。** Electron ウィンドウが他アプリに隠れると回数系指標が桁違いに
  悪化するのに総合 PASS してしまう。`exercise.playbackClockHealth.trustworthy` が false の
  run は捨てる。
- **`droppedSampleCount` を確認する。** React profile のサンプルはリングバッファで、
  上限を超えると古い順に捨てられる。0 でない run の commitCount は過小評価になる。
- **in-process decode のフォールバックが run ごとに出たり出なかったりする。**
  baseline-2 では `in-process decode unavailable ... falling back to ffmpeg pipeline` が
  1件出て、その run は presenterRestarts も backend CPU も高かった。ログを必ず保存し、
  `grep -c "falling back to ffmpeg"` を run のメタ情報として記録する。
- **既定のE2Eタイムアウト300秒では `seed()`（重量プロジェクト生成）中に落ちる。**
  `UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=540000` を付ける。
- **開発実行では Rust backend の debug ビルドが優先される**
  （`electron/main.ts:178-179` の探索順が debug → release、E2E の `cargo build` も
  プロファイル指定なし）。製品性能を測りたいときは
  `UXFD_RUST_BACKEND_BIN` で release バイナリを明示する。
- トレースに `disabled-by-default-devtools.timeline.stack` が有効化されておらず、
  `Layout` / `InvalidateLayout` に JS スタックが無い。layout の関数レベル帰属は
  イベントの時間包含関係からの推定にとどまる。

## 手順

```bash
npm run test:realistic-heavy-edit:e2e
node perf_research/tools/summarise-heavy-edit-result.mjs
```

比較するときは result.json を退避してから複数渡す。

```bash
node perf_research/tools/summarise-heavy-edit-result.mjs runs/baseline/result.json runs/variant/result.json
```
