# 再生中のCPUはどのプロセスで燃えているか

## 目的 / 仮説

`progress/renderer-per-frame-rerender.md` 以降、性能改善の努力はすべて
**レンダラープロセスの React 再レンダー削減**に向いていた。その前提
（レンダラーが主なコスト）が今も成立しているかを、プロセス単位のCPUで確認する。

## 環境

- ホスト: Apple M4 / macOS 26.5.2、Node v26.0.0、cargo 1.93.0
- アプリ版数: `0.1.1-Beta-485a`、ブランチ `feature-proxy`、作業ツリー clean
- 計測: 重量編集E2E（`npm run test:realistic-heavy-edit:e2e`、開発ビルド）
  - 再生区間 3秒 / 179フレーム、4K動画2本を含む混在シーン
  - `UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=540000`（既定の300秒では
    `seed()`（重量プロジェクト生成）中にタイムアウトして計測に到達しない）

## 手順

```bash
UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=540000 npm run test:realistic-heavy-edit:e2e
node perf_research/tools/summarise-heavy-edit-result.mjs
```

プロセス別CPUは `result.json` の `processesDuringPlayback`（再生区間中の `ps` サンプル）。

## 結果

### プロセス別CPU（再生区間中の `ps` 1サンプル）

| プロセス | baseline-1 %CPU | baseline-2 %CPU |
|---|---|---|
| **uxfd-rust-backend** | **93.4** | **117.7** |
| Electron main | 38.3 | 35.9 |
| Electron renderer | 30.4 | 28.6 |
| network utility ほか | 0.0〜0.1 | 0.0〜0.1 |

backend は 100% を超えている（マルチスレッド）。RSS は 66 MB 前後。

### レンダラーメインスレッド（Chromiumトレース）

| 指標 | baseline-1 | baseline-2 |
|---|---|---|
| wallDurationMs | 3823.1 | — |
| busyRatio | **0.27** | **0.32** |
| scriptingMs | 196.5 | 191.2 |
| renderingMs | 182.9 | — |
| layoutCount | 213 | 215 |
| `animate` callCount | 179 | 181 |

### React コミット

| コンポーネント | baseline-1 | baseline-2 | actualDuration 合計 |
|---|---|---|---|
| Viewport | 63 | 94 | 15.3 / 20.8 ms |
| PropertyPanel | 7 | 7 | 2.0 / 2.1 ms |
| Timeline | 5 | 5 | 25.3 / 23.7 ms |

いずれも `droppedSampleCount` 0、`playbackClockHealth.healthy` true、総合 PASS、`settled` true。

**run 間の差異（交絡）**: baseline-2 では
`in-process decode unavailable ... falling back to ffmpeg pipeline` が1件発生している
（baseline-1 は0件）。presenterRestarts も 54 → 79 と増えており、この2 run は
厳密には同一条件ではない。backend が支配的という結論はどちらの run でも変わらない。

## 結論

**「レンダラーが主なコスト」という前提はもう成立していない。** 採否は次の3点。

1. **レンダラーメインスレッドは 27% busy しか使っていない。** 再生3.8秒のうち
   scripting は 196ms（5%）。React 再レンダーの実測コストは Viewport で **15.3ms / 3.8秒**。
   ここをさらに削っても取り分はほぼ無い。**React 側の最適化は完了扱いにしてよい。**

2. **`progress/renderer-per-frame-rerender.md` の「Viewport は毎フレーム約1回コミット
   （191回）」は 485a では再現しない。** 実測 **63回 / 179フレーム**（0.35回/フレーム）。
   同ノートの「残っている問題」節は解決済みとして扱う。あの時点から
   video-free presenter reuse 等が入った影響と見られる。
   → `viewport-subtree-commit-attribution.md` の H1 は**調査価値を失ったため取り下げる**。

3. **いま支配的なのは `uxfd-rust-backend`（93.4%、ほぼ1コア飽和）である。**

### ただし重大な但し書き: この backend は debug ビルドである

- E2E は `scripts/run-realistic-heavy-edit-e2e.mjs:387` で
  `cargo build --manifest-path rust-backend/Cargo.toml` を**プロファイル指定なし**で実行する
  （= dev プロファイル、unoptimised + debuginfo）。
- `electron/main.ts:178-179` の探索順が **debug → release** で、非パッケージ実行では
  debug バイナリが存在する限りそちらが選ばれる。
- したがって **この harness で取られた過去の性能値はすべて「最適化なしの Rust backend」
  に対するもの**である。93.4% という数字を製品の性能として読んではいけない。

## 次の一手 / 未検証事項

- **実験1（次にやる）: release ビルドの backend で同じE2Eを回す。** 1変数のみ。
  `UXFD_RUST_BACKEND_BIN=rust-backend/target/release/uxfd-rust-backend` で差し替える。
  - 期待: backend の %CPU が大きく下がる。下がるなら「93.4% は debug の副作用」で、
    製品の実CPU像を測るには harness 側の既定を見直す必要がある。
  - 反証条件: release でも %CPU がほぼ変わらないこと。その場合は最適化で消えない
    構造的コスト（毎フレームの再デコード等）が実在する。
- `presenterRestarts.duringPlayback = 54`（179フレーム）。混在セッションの reuse ゲート
  拡大は `progress/presenter-restart-storm-rustvideoonly-gate.md` で
  **二重デコード・A/Vドリフトの破綻経路を根拠に棄却済み**。同じ案を再検討しないこと。
  ただし同ノートが根拠にしている「フル再起動 約28ms/回」という単価は、
  **レンダラーメインスレッドの実測（scripting 196ms / 3.8秒）と整合しない**
  （54回 × 28ms = 1512ms は scripting 全体の7.7倍）。単価がどのプロセスの
  どのコストを指すのかが未確認であり、再起動ストームの実害を見積もる前に
  この単価の出所を確かめる必要がある。→ 別ノートに切る。
- プロセス別CPUは `ps` の1サンプルであり、瞬間値である。継続サンプリングでの
  裏取りは未実施。
