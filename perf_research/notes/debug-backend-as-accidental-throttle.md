# debug ビルドの Rust backend が偶然の律速になっていた

## 目的 / 仮説

[where-the-cpu-actually-goes.md](where-the-cpu-actually-goes.md) で、再生中の
`uxfd-rust-backend` が 93〜118 %CPU と支配的だと分かった。ただし harness が使う backend は
**debug ビルド**（`scripts/run-realistic-heavy-edit-e2e.mjs:387` がプロファイル指定なしで
`cargo build`、`electron/main.ts:178-179` の探索順が debug → release）。

- **H2**: 93〜118% は debug ビルドの副作用であり、release では大きく下がる。
- **反証条件**: release でも backend の %CPU がほぼ変わらないこと。その場合は最適化で
  消えない構造的コスト（毎フレームの再デコード等）が実在する。

## 環境

- ホスト: Apple M4 / macOS 26.5.2、Node v26.0.0、cargo 1.93.0
- アプリ版数: `0.1.1-Beta-485a`、ブランチ `feature-proxy`、作業ツリー clean
  （production コードは一切変更していない。差し替えは環境変数のみ）
- 計測: 重量編集E2E、再生3秒 / 約180フレーム、4K動画2本を含む混在シーン
- 変更した変数は **1つだけ**: backend バイナリの最適化プロファイル

## 手順

```bash
cargo build --release --manifest-path rust-backend/Cargo.toml   # 2m48s

UXFD_RUST_BACKEND_BIN=$PWD/rust-backend/target/release/uxfd-rust-backend \
UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=540000 \
npm run test:realistic-heavy-edit:e2e

node perf_research/tools/summarise-heavy-edit-result.mjs \
  perf_research/runs/baseline-1/result.json \
  perf_research/runs/baseline-2/result.json \
  perf_research/runs/release-1/result.json
```

`UXFD_RUST_BACKEND_BIN` は `electron/main.ts:170` の探索先頭にあり、E2E スクリプトは
`...process.env` を Electron へ渡す（`run-realistic-heavy-edit-e2e.mjs:419-425`）ので確実に効く。

## 結果

| 指標 | baseline-1 (debug) | baseline-2 (debug) | release-1 | release-2 |
|---|---|---|---|---|
| **rust-backend %CPU** | 93.4 | 117.7 | **34.6** | 未取得 |
| Electron main %CPU | 38.3 | 35.9 | 78.8 | 未取得 |
| Electron renderer %CPU | 30.4 | 28.6 | 74.3 | 未取得 |
| renderer busyMs | 1032.1 | 1171.7 | **1744.5** | **463.3** |
| renderer busyRatio | 0.270 | 0.322 | 0.480 | — |
| scriptingMs | 196.5 | 191.2 | 267.8 | — |
| **presenterRestarts.duringPlayback** | 54 | 79 | **133** | **3** |
| **Viewport commitCount** | 63 | 94 | **187** | **12** |
| Viewport actualDuration 合計 | 15.3 ms | 20.8 ms | 35.8 ms | 2.7 ms |
| **`animate` callCount（rAF再生ループ）** | 179 | 181 | 179 | **44** |
| harness `tick` callCount | 180 | — | 180 | 175 |
| rafSampleCount | 179 | 181 | 179 | 174 |
| **rafMeanMs** | 16.74 | 16.57 | 16.67 | 17.04 |
| layoutCount | 213 | 215 | 213 | **90** |

4 run とも総合 PASS / `settled: true` / `droppedSampleCount: 0` /
`playbackClockHealth.healthy: true` / `selectedObjectCount: 0`。
`falling back to ffmpeg` はそれぞれ 0 / 1 / 0 / 0 件。

**release の2 run は同じ構成なのに全く別の系になっている。** release-2 では
`animate`（`src/hooks/useAppLogic.ts:51` の rAF 再生ループ）が **44回しか回っていない**
（harness 自身の rAF サンプラ `tick` は175回回っているので、レンダラーのrAF自体は
生きている）。`shouldRunRendererPlaybackClock`（`src/utils/playbackClockOwnership.ts:7`）は
`isPlaying && !nativePlaybackActive` なので、これは**再生開始から約0.7秒後に
`nativePlaybackActive` が true になり、時刻の駆動がRust/main所有の
native playback clock へ移った**ことを意味する。他の3 run では最後まで移っていない。

## 結論

### H2 の前半は採択: backend の CPU は release で約1/3になる（93〜118% → 34.6%）

harness で測った backend のCPU値を製品の性能として読んではいけない。これは確定。

### 【撤回】「release にすると再起動が増える」は交絡していた

release-1 だけを見て「backend を速くすると presenter 再起動が 54/79 → 133 へ増える。
debug の遅さが偶然のレートリミッタだった」と一度結論したが、**release-2 で 3 回しか
起きなかったため、この結論は成り立たない。**同じ構成で 133 と 3 が出る以上、
支配している変数は最適化プロファイルではない。

（レートリミッタ説の機序自体は `presenter-restart-storm-rustvideoonly-gate.md` §3 の
publish 畳み込みと整合しており、release-1 単体の説明としては筋が通る。しかし
release-2 を説明できないので、**現時点で採用しない**。）

### 支配している変数は「どちらの再生クロックが時刻を駆動しているか」だった

| | animate 回数 | nativePlaybackActive | busyMs | 再起動 | Viewportコミット |
|---|---|---|---|---|---|
| baseline-1 | 179 | 最後まで false | 1032 | 54 | 63 |
| baseline-2 | 181 | 最後まで false | 1172 | 79 | 94 |
| release-1 | 179 | 最後まで false | 1745 | 133 | 187 |
| **release-2** | **44** | **約0.7秒後に true** | **463** | **3** | **12** |

native playback clock（Rust/main 所有の単調再生時計、`progress/native-playback-clock.md`）へ
時刻駆動が移ると、**レンダラーの毎フレーム経路がまるごと消える**。
busyMs は 1032〜1745 → **463**、presenter 再起動は 54〜133 → **3**、
Viewport コミットは 63〜187 → **12**、layoutCount も 213〜215 → **90**。

**これは本研究でこれまでに見つかった、どの最適化案より桁違いに大きい差である。**
しかも新規実装ではなく、**既に存在する経路が engage するかどうか**の差でしかない。

### 再生の滑らかさはどの run でも劣化していない

`rafMeanMs` は 16.57〜17.04 で 60fps 維持、`rafSampleCount` も 174〜181 で同等。
**現時点で体感が壊れている証拠は無い**（「まだ困っていない」という認識と一致する）。
消えているのは余力であって、フレーム落ちではない。

## 次の一手 / 未検証事項

- **最優先: `nativePlaybackActive` が engage する条件を特定する。**
  ゲートは `Viewport.tsx:1663-` の effect で、`rustTimelineSceneRpcEnabled &&
  rustTimelineSceneRevision !== null` を満たしたうえで
  `window.rustBackend.startScenePlayback(...)` が `result.active === true` を返すこと。
  4 run のうち engage したのは1回だけで、**何が違ったのかは既存の診断では判別できない**
  （`finalSnapshot` に再生クロック所有者も `startScenePlayback` の `reason`/`detail` も
  入っていない）。→ 次のノートで harness へ計測専用の記録を足して分布を取る。
- **release の n が足りない。** release は 133 と 3 の2点しかなく、どちらが典型かも不明。
  clock owner を記録できるようにしてから取り直す。
- backend の %CPU は release-2 で取り損ねた（プロセスサンプルの取得はしているが
  比較表に入れ忘れ）。次回から4 run 分そろえる。
- **「フル再起動 約28ms/回」の単価の出所は依然不明。** `presenter-restart-storm-rustvideoonly-gate.md`
  はこの単価で実害を見積もっているが、どのプロセスのどのコストを指すのか未確認。
- **棄却済みの案を掘り返さないこと**: 混在セッションの reuse ゲート拡大
  （`canReuseNativeRenderPresenter` を `sharedRendererVideoCutoverEnabled || rustVideoOnlyEnabled` へ）は
  二重デコードと A/V ドリフトの具体的破綻経路を根拠に棄却済み。今回の結果は
  この棄却理由に何も影響しない。
- **harness 側の既定をどうするかは設計判断**（このノートは提案のみ、実装はしない）。
  debug 既定のままだと production と違う系を測り続けることになる。一方 release 既定に
  すると E2E の反復が毎回 release ビルド待ちになる。少なくとも
  **result.json にどちらのプロファイルで測ったかを記録する**のが最小の改善に見える。
