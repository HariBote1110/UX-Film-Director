# native playback clock が engage しない原因と修正の実測

## 目的 / 仮説

[debug-backend-as-accidental-throttle.md](debug-backend-as-accidental-throttle.md) で、再生中の
コストを支配しているのは「どちらの再生クロックが時刻を駆動しているか」だと分かった。
4 run のうち native playback clock が engage したのは1回だけで、原因が不明だった。

- **H3**: engage しないのはシーンのメディアが直接提示の適格性を満たさないためである。
- **H4**: engage しないのは `startScenePlayback` に渡す revision が Rust 側にまだ
  反映されていないレースのためである。

## 環境

- ホスト: Apple M4 / macOS 26.5.2、Node v26.0.0、cargo 1.93.0
- ブランチ `feature-proxy`、backend は **debug ビルド**（`rustBackendBinary.profile: "default-debug"`）
- 重量編集E2E、再生3秒 / 約180フレーム、4K動画2本を含む混在シーン
- 計測前に E2E へ計測専用の記録を追加（版 `0.1.1-Beta-485b`, commit `2791cbbb`）:
  再生クロック所有者、`startScenePlayback` の失敗理由と detail、engage したフレーム位置、
  使用した backend の profile

## 手順

```bash
UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=540000 npm run test:realistic-heavy-edit:e2e
node -e "…"   # result.json の exercise.nativePlayback* と finalSnapshot.rustPlayback* を読む
```

## 結果

### H3 は棄却（コード読解による）

シーンが含むメディア（`Video` ×2、`Image`、`Text`、`SolidColour` / `GeneratedGradient` /
`GeneratedShape`、`GeneratedAudioWaveform`、`GeneratedGetColorDots`、`GeneratedHksyCheckerGrid`、
`GeneratedRegionFrame`、`GeneratedSimpleTube`、`GeneratedAudioSphere`、`GeneratedHologram`、
`GeneratedShakingPolygon`、`GeneratedShatteredSphere`）は、
`src/utils/sharedRendererNativeMediaSupport.ts:7-48` の許可リストに**すべて含まれる**。
`audio` オブジェクトと `group_control` は `isVisualSceneObject`
（`rustSceneSnapshot.ts:933-934`）で除外され、そもそも `evaluation.media` に現れない。
`kind === 'Video'` は `nativeOverlayDirectMediaSupport.ts:8-18` で source 文字列を見ずに
常に受理される。**適格性は原因ではない。**

### H4 は採択（計測で確定）

instrument 後の1 run（`perf_research/runs/diag-debug-1`）が理由を直接吐いた。

```
rustPlaybackStatus: "fallback:evaluationFailed"
rustPlaybackDetail:  "scene.evaluate revision 1786038301103 does not match resident
                      revision 1786038301101 for sceneId 'viewport-rust-timeline'"
nativePlaybackFrameCount: 0 / 179
```

要求 revision が resident revision より **2つ先**。機序:

1. `src/utils/editableRustScenePreviewController.ts:44-51` がローカルの revision を
   楽観的に +1 して即座に返す（RPC はまだ走っていない）。
2. `src/components/Viewport.tsx:1611` がその値を同期的に state へ入れる。
3. 実際の `scene.replace` は `sharedRendererScenePreviewScheduler.ts` が非同期に実行し、
   成功して初めて内部の `remoteReadyRevision` が更新される（**private で外から見えなかった**）。
4. 再生開始 effect はまだ届いていない revision で `startScenePlayback` を撃つ。
5. `electron/rustScenePlaybackController.ts` が `{active:false, reason:'evaluationFailed'}` を返す。
6. **リトライが無い**（`rustScenePlaybackController.ts:432-437` は1フレーム評価して諦める）。
   一度落ちるとその再生区間はレンダラークロックが持ち続ける。

### 修正後の実測（版 `0.1.1-Beta-486a`, commit `203d79b6`）

楽観的 revision ではなく **Rust が実際に適用済みの revision** で発火するようにした。
scheduler に `onRemoteReady` を追加し、再生開始 effect の gate・引数・deps を
`rustTimelineSceneResidentRevision` へ差し替えた。deps に入れたことで、replace が着地した
時点で effect が再実行される＝**リトライ機構を別途作らずにリトライになる**。

| 指標 | 修正前 (diag-debug-1) | 修正後 run1 | 修正後 run2 |
|---|---|---|---|
| **nativePlaybackFrameCount** | **0 / 179** | **85 / 178** | **97 / 180** |
| nativePlaybackFirstActiveFrameIndex | null | 93 | 83 |
| **presenterRestarts.duringPlayback** | 42 | **3** | **3** |
| **Viewport commitCount** | 51 | **15** | — |
| **busyMs** | 919.3 | **493.2** | **506.4** |
| `animate` callCount | 179 | 94 | — |
| layoutCount | 213 | **136** | **126** |
| recalcStyleCount | 257 | 141 | — |
| rafMeanMs | 16.66 | 16.77 | — |
| 総合 | PASS | PASS | PASS |

2 run とも再現。**busyMs 約 -46%、presenter フル再起動 42 → 3、layoutCount -36%。**
`rafMeanMs` は変わらず 60fps を維持しており、体感を犠牲にした改善ではない。

### backend 速度に対する engage 遅延の感度（弱いハード想定の代用実験）

backend の debug ビルドは release の約3倍遅いので、**そのまま「遅い機械」のプロキシ**になる。
同じ修正済みコードで backend profile だけを変えて比較した。

| | backend profile | engage フレーム | native フレーム数 | busyMs | layoutCount | 再生中CPU |
|---|---|---|---|---|---|---|
| fix-debug-1 | default-debug | 93 | 85/178 | 493 | 136 | main 37.5 / renderer 42.2 / backend 104.3 |
| fix-debug-2 | default-debug | 83 | 97/180 | 506 | 126 | main 35.1 / renderer 29.5 / backend 119.2 |
| **fix-release-1** | **release** | **43** | **131/174** | **442** | **90** | main 75.5 / renderer 29.4 / backend 4.1 |

**engage 遅延は backend 速度にほぼ比例する。** 約3倍速い backend で engage が
frame 83〜93 → **43** へ約2倍早まり、native が担当するフレームが 85〜97 → **131** に増えた。

含意（外挿であり実機計測ではない）: **M1 や A18 Pro のような遅い機械では engage が
さらに遅れ、再生前半の高コストなレンダラークロック区間が伸びる。**
弱いハードほど「frame 0 から engage させる」ことの価値が大きい。

またコストの所在も移動している。native clock が担当している間、backend は **4.1%** まで
落ち、代わりに Electron main が **75.5%** へ上がる（main が再生時計と native overlay の
提示を持つため）。**弱いハードでは main プロセスのコストが次のボトルネック候補になる。**

## 結論

- H3 棄却、H4 採択。原因は**楽観的 revision による競合**であり、実測の detail 文字列で確定した。
- 修正は再現性のある大幅な改善をもたらした。これまで本研究で試したどの案よりも効果が大きい。
- **ただし engage は frame 83〜93（3秒区間の約1.4〜1.55秒地点）で、前半はまだレンダラー
  クロックが回っている。** 残り半分の取り分がある。

## 次の一手 / 未検証事項

- **engage までの遅延（frame 83〜93）の正体が未特定。** 有力な推測は、E2E が
  `setIsPlaying(true)` の直前に duplicate → undo → redo → updateObject → シーン往復という
  編集バーストを撃つため、その分の `scene.replace` が捌けるまで resident revision が
  確定しないこと。実ユーザー操作（編集して手を止めてから再生）ではバーストが無いので
  frame 0 から engage する可能性が高い。**これは推測であり計測していない。**
  切り分けるには、再生直前に resident revision の確定を待つ計測専用オプションを足して
  比較するのが安い。
- **release backend での再測が未実施。** 今回の数値はすべて debug backend。
  release では replace の処理が速くなるので engage がさらに早まる可能性がある。
- **export 開始側に同型のレースが残っている可能性。** `getRustExportFrameSource` の
  `createResidentSceneExportFrameSource({ sceneId, revision: rustTimelineSceneRevision })` が
  依然として楽観的 revision を使っている。再現も計測もしていないため未確認。
  `progress/native-playback-optimistic-revision-race.md` に未解決として記載済み。
