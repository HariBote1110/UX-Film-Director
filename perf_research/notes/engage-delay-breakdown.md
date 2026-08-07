# engage 遅延の内訳 — 支配項は backend 速度に依存しない約370ms

## 目的 / 仮説

native playback clock の engage が frame 21〜93 と遅く、その間はレンダラークロックが
高コストな毎フレーム経路を回している。この待ち時間が何でできているかを実測で分解する。

- **H5（棄却）**: 待ち時間の主因は、再生直前の編集バーストで積まれた `scene.replace` の
  drain である。
- **H6（棄却）**: engage 遅延は backend 速度にほぼ比例する（＝遅い機械ほど比例して悪化する）。
- **H7（採択）**: 待ち時間の主因は `startScenePlayback` の往復1本である。

## 環境

- ホスト: Apple M4 / macOS 26.5.2、ブランチ `feature-proxy`、版 `0.1.1-Beta-486c`
- 重量編集E2E、再生3秒 / 約170フレーム、4K動画2本を含む混在シーン
- CPU スロットリングなし（`cpuThrottle.rate: 1`）
- scene RPC の所要時間を `exercise.sceneRpcTrace` へ記録する計測を追加（commit `a9d255c1`）

## 結果

| 操作 | release backend | debug backend（約3倍遅い） |
|---|---|---|
| `replace` 回数 / 合計 | 2 本 / **65.5 ms** | 2 本 / **211.4 ms** |
| **`startPlayback`** | **361.7 ms** | **383.8 ms** |
| `evaluate`（scheduler、全体） | 25 本 / 796.6 ms | 18 本 / 978.6 ms |
| engage フレーム | 21 | 30 |
| native 担当フレーム | 146 / 167 | 143 / 173 |
| presenterRestarts | 3 | 3 |
| busyMs | 343 | 243 |

engage 近傍のタイムライン（release）:

```
replace      rev …187          start 7219.5  dur   6.5
evaluate     rev …187 frame 0  start 7226.0  dur   7.1
startPlayback rev …187         start 7226.3  dur 361.7   ←
evaluate     rev …187 frame 1  start 7252.9  dur 339.1   ← 並走している
```

## 結論

### H5 棄却: `replace` は無罪

release で2本・合計 **65.5 ms** しかかかっていない。scheduler の `pump()` は replace が
in-flight の間に来た `submitRevision` をキューに積まず最新1件だけ残すため、編集が何回
あっても replace は1〜2本にしかならない。「バーストの drain 待ち」という説明は誤りだった。

### H7 採択: 支配項は `startPlayback` の往復1本

release で **361.7 ms**。engage が frame 21（≒0.35秒）だったことと一致する。
`startScenePlayback` は scheduler を通らず、main プロセス内部で独自に `scene.evaluate` と
`presentScene` を実行するため、レンダラーからは**1個の不透明な数字**としてしか見えない。

### H6 棄却（重要な訂正）

[native-clock-optimistic-revision-race.md](native-clock-optimistic-revision-race.md) で
「engage 遅延は backend 速度にほぼ比例する」と記録したが、**内訳を測ったら成り立たなかった**。

- `startPlayback`: release 361.7 ms → debug 383.8 ms（**+6% のみ**）。3倍遅い backend でも
  ほとんど変わらない。**Rust の CPU バウンドではない。**
- `replace`: 65.5 ms → 211.4 ms（約3.2倍）。こちらは素直に backend 速度に比例する。

engage 遅延 ＝「replace の残り」＋「約370msの定数項」であり、**支配しているのは
比例しないほうの項**である。先の比例説は、内訳を持たない状態で engage フレーム
（83/93 vs 43）だけを見て、replace レイテンシのばらつきを比例と誤読したものだった。

**弱いハード（M1 / A18 Pro）への含意も書き換わる。** engage 遅延が backend CPU に
比例して悪化するという見立ては支持されない。約370msがどこで消えているのかを
特定しないと、遅い機械での挙動は予測できない。候補は native overlay の present 経路
（GPU / CAMetalLayer）、IPC・シリアライズ、main プロセスのイベントループのいずれかで、
**どれも現時点では未計測**。

### 副次的発見: 開始要求とプレビュー評価が競合している

`startPlayback`（361.7 ms）の実行中に、scheduler がプレビュー用 frame 1 の
`evaluate` を並走させ、それも **339.1 ms** に膨らんでいる。スクラブ中の evaluate は
0.4〜94 ms なので、この膨張は競合由来と見てよい。再生が始まればプレビュー評価は
不要になるのに、開始要求と同じ backend を奪い合っている。

## 追記: `startPlayback` の内訳（main プロセス内部を計測、版 `0.1.1-Beta-486d` 以降）

`electron/rustScenePlaybackController.ts` の `start()` に計測を入れた。この経路の await は
`evaluateScene` と `presentScene` の**2つだけ**で、first-frame 待ちもサーフェス attach も
デコーダのウォームアップも存在しない。

| run | totalMs | `evaluateSceneMs` | **`presentSceneMs`** | otherMs |
|---|---|---|---|---|
| startbreak-release-1 | 225.4 | 4.08 | **220.3** | 0.98 |
| startbreak-release-2 | 247.0 | 0.40 | **245.7** | 0.86 |
| verify-1 | 325.8 | 0.63 | **324.3** | 0.82 |
| verify-2 | 218.1 | 0.36 | **216.9** | 0.81 |

**engage 遅延の実体は `presentScene`（native overlay の addon 呼び出し）である。**
Rust への `scene.evaluate` は 0.36〜4.08 ms しかかかっておらず無罪。
backend を3倍遅くしても `startPlayback` がほとんど変わらなかった理由もこれで説明がつく
（Rust の計算ではなく、native overlay への提示そのものが重い）。

`presentScene` は `electron/nativeOverlayMainBridge.ts:338-376` の
`await addon.presentNativeOverlayScene(payload)` 1本。**既に `presentMs` という診断を
持っていたが、trace 用の環境変数を立てたときだけ `console.info` へ出す実装で、
`result.json` には一度も届いていなかった。** 370ms が長く見えなかった理由は
計測が無かったからではなく、計測結果が捨てられていたためである。

`isFirstStartSinceLaunch` は全 run で true。このシナリオでは `start()` が1回しか
呼ばれないため、**初回固有のコールドコストなのか毎回かかるのかは判定できていない。**
区別するには同一セッションで2回目の start（一時停止→再生）を測る必要がある。
- **`startPlayback` 実行中のプレビュー評価を止める。** 競合が消えれば engage が早まる可能性。
  ただし効果量は未測定であり、370msの主因が別にあるなら効果は限定的。
- CPU スロットリング（`UXFD_REALISTIC_HEAVY_EDIT_CPU_THROTTLE`）下での計測は未実施。
  なおこのスロットルは**レンダラーのメインスレッドのみ**に効き、main プロセス・
  Rust backend・GPU は素のままなので、約370msの主因がそれらにある場合は
  スロットリングでは見えない。
- **計測規約への追加**: engage フレームは run 間で 21〜93 と大きくばらつく。
  単発の engage フレームを指標に使わないこと。内訳（`sceneRpcTrace`）を必ず併記する。

## 副産物: 書き出しの間欠失敗（修正済み）

engage が確実になった副作用として、`SlotCountMismatch { expected: 2, actual: 6 }` で
書き出しが壊れる不具合が顕在化した（7 run 中1回）。native 再生が `slotCount=6` を、
書き出しが `slotCount=2` を要求するのに **jobId に slotCount が含まれておらず**、
backend が既存セッションをスロット数未検証で使い回していた。
詳細と修正は `progress/native-render-source-slot-count-collision.md`。

**教訓**: 「engage しない」状態で安定していた経路は、engage するようになると
未踏の状態遷移を踏む。性能改善が正しさの問題を掘り起こすことがあるので、
E2E の総合判定（`passed`）を性能指標と同じ重みで見ること。
