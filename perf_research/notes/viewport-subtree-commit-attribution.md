# Viewport subtree の毎フレームコミットの帰属

## 目的 / 仮説

`progress/renderer-per-frame-rerender.md` の Beta-482a で、`currentTime` を hook 購読する
コンポーネントをゼロにした結果、`Timeline` の commitCount は 211 → 5 になった。一方
`Viewport` は 377 → 191 と半減にとどまり、再生区間 178 フレームに対して**約1回/フレームの
コミットが残っている**。その発生源が未特定のまま放置されている。

### 前提として確認した構造上の事実

`src/App.tsx:209` の `RendererTraceProfiler id="Viewport"` は **Viewport subtree 全体を包む
Profiler 境界**である。React の `Profiler` の `onRender` は subtree 内の任意のコンポーネントが
コミットしたときに発火するため、**commitCount 191 は「Viewport 本体が191回再レンダーした」
ではなく「subtree 内の誰かが191回コミットした」を意味する**。既存ノートはこの区別をしておらず、
`Viewport` 本体の再レンダーとして読める書き方になっている。まずここを切り分ける。

subtree の構成要素（`src/components/Viewport.tsx`）:

- `Viewport` 本体
- `SceneSelectionDecorationLayer`（`Viewport.tsx:2521`）
- `VisionDetectionOverlayLayer`（`Viewport.tsx:2550`、opt-in プレビュー時のみマウント）
- `ThreeStageViewport`（`Viewport.tsx:2604`、3D ステージ時のみ）

### 仮説

- **H1**: 残る毎フレームコミットの発生源は subtree 内の単一コンポーネントに特定できる。
- **H1-a**: 発生源は `SceneSelectionDecorationLayer` である。
  - ただし**事前の反証材料あり**: 既存トレースでは `selectedObjectCount` が前後とも 0 で、
    この層の唯一の setState (`setNativeSelectionDecorationActive`) には同値ガードがあり、
    ジオメトリ更新は命令的パッチで React を経由しない。よって確度は低いと見ている。
  - 反証条件: 選択なしシナリオで commitCount が変わらないまま、この層をアンマウントしても
    191 が減らないこと。
- **H1-b**: 発生源は `Viewport` 本体で、`renderTick` / `sharedRendererGpuStatus` /
  `sharedRendererPreviewDiagnostic` / `sharedRendererExternalVideoFrameReadyTick` の
  いずれかの setState が再生中に毎フレーム発火している。
  - `updateSharedRenderer*ObjectIds` 系（`Viewport.tsx:836-880`）は集合の同値ガード付きで
    `setRenderTick` するため、ID 供給が安定していれば発火しないはず。ガードが効いていない
    （毎フレーム別インスタンスの集合が来ている等）なら、これが主因になり得る。
  - 反証条件: 各 setter の発火回数を計測して、再生区間中の合計がフレーム数を大きく下回ること。

falsification が成立した場合は、subtree 外（App の再レンダーによる props 伝播）を疑う方向へ
切り替える。ただし `Timeline` が 5 で安定していることから、App 由来の可能性は低いと見ている。

## 環境

- ホスト: Apple M4 / macOS 26.5.2
- Node v26.0.0 / cargo 1.93.0
- アプリ版数: `0.1.1-Beta-485a`、ブランチ `feature-proxy`、作業ツリー clean
- 計測: 重量編集E2E（`npm run test:realistic-heavy-edit:e2e`）、開発ビルド
- 素材: `perf/heavy-media/GX010052.MP4`（4GB, 実測用）＋ `GX010052.proxy.mp4`
- 計測規約: [measurement-protocol.md](measurement-protocol.md)

## 手順

```bash
npm run test:realistic-heavy-edit:e2e
node perf_research/tools/summarise-heavy-edit-result.mjs
```

## 結果

ベースライン2回（同一構成、`perf_research/runs/baseline-1`, `baseline-2`）。

| 指標 | baseline-1 | baseline-2 |
|---|---|---|
| rafSampleCount（フレーム数） | 179 | 181 |
| **Viewport commitCount** | **63** | **94** |
| Timeline commitCount | 5 | 5 |
| PropertyPanel commitCount | 7 | 7 |
| **presenterRestarts.duringPlayback** | **54** | **79** |
| Viewport actualDuration 合計 | 15.3 ms | 20.8 ms |
| layoutCount | 213 | 215 |
| scriptingMs | 196.5 | 191.2 |

いずれも総合 PASS / `settled: true` / `droppedSampleCount: 0` /
`playbackClockHealth.healthy: true` / `selectedObjectCount: 0`。

## 結論

### 1. 前提が古かった: 「Viewport は毎フレーム約1回コミット」はもう成立しない

`progress/renderer-per-frame-rerender.md` の 191回 / 178フレームに対し、485a では
**63〜94回 / 約180フレーム**。1フレームあたり 0.35〜0.52 回であり、「毎フレーム1回」ではない。
同ノートの「残っている問題」節は現状に合わないので、そのまま読むと誤誘導になる。

### 2. H1-a（`SceneSelectionDecorationLayer` 犯人説）は棄却

2 run とも `selectedObjectCount` が 0 で、この層のジオメトリパッチも送信も動いていない。
にもかかわらず Viewport subtree は 63〜94 回コミットしている。
**入れ子 Profiler を入れる実験は不要になった**（当初の計画は取り下げ）。

### 3. H1-b を支持: コミットは presenter フル再起動に連動している

2 run の差分が決定的だった。

- presenterRestarts: 54 → 79（**+25**）
- Viewport commitCount: 63 → 94（**+31**）

再起動effect（`src/components/Viewport.tsx:1808-` 付近）は1回の起動につき
`setSharedRendererPreviewDiagnostic` を最低1回、`.finally` の pending replay 経路で
`setSharedRendererPreviewSession` を条件付きで呼ぶ。**再起動1回あたり約1〜1.2コミット**という
実測比はこの構造と整合する。

ただしこれは **n=2 の相関**であり、因果を確定したわけではない。確定させるなら
再起動回数を意図的に変えた条件で commitCount が追随することを見る必要がある。
もっとも、後述のとおり**この帰属を詰める実益は薄い**。

### 4. そもそも React 側に取り分が残っていない

Viewport のコミットコストは実測 **15.3〜20.8 ms / 約3.8秒**、レンダラーの scripting 全体でも
191〜196 ms（busyRatio 0.27〜0.32）。一方 `uxfd-rust-backend` は 93〜118 %CPU。
**このノートの問い自体が、費用対効果の低い場所を掘っていた。**
詳細と次の狙いは [where-the-cpu-actually-goes.md](where-the-cpu-actually-goes.md) へ移す。

## 次の一手 / 未検証事項

- このノートの調査はここで打ち切る。React 再レンダー削減は投資対効果の観点で完了扱い。
- **副産物として重要**: `commitCount` は presenterRestarts と連動して run 間で
  63→94（+49%）変動する。**`commitCount` を無条件に「安定指標」として扱ってはいけない**。
  [measurement-protocol.md](measurement-protocol.md) に反映済み。
- `layoutCount`（213 / 215）の帰属は未着手のまま。ただし rendering 全体が 182.9 ms しか
  無いため、こちらも取り分は小さい。優先度を下げる。
