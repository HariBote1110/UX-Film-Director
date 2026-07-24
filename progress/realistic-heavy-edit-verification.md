# 現実的な重量編集の検証基盤

## 目的

軽い単機能サンプルではなく、実際の編集で起こり得る重い構成を毎回同じ条件で作り、次を一度に判定する。

- 編集画面が黒化・停止・クラッシュしない
- スクラブ、複製、Undo/Redo、シーン切替、再生が成立する
- 保存したプロジェクトを同じ内容として復元できる
- `MissingSource` の誤診断や未処理例外が発生しない
- 画面に有色ピクセルが十分あり、合成結果が空でない
- 書き出した動画の解像度、長さ、フレーム数が期待値と一致する

## シナリオ

`src/e2e/realisticHeavyEditScenario.ts` が決定論的に3シーンを生成する。初期状態は全54オブジェクト、メインシーン32オブジェクトで、操作後は全63オブジェクト、メインシーン41オブジェクトになる。

メインシーンには次を同時に配置する。

- 4K動画とそのプロキシ
- 時間的・空間的に重なる動画2本
- WAV音声と静止画
- テキスト、矩形、グリッド、線、波形などの図形
- キーフレーム
- グループ制御
- GetColor、HKSY、SimpleTubeを含む複数エフェクト

入力動画の既定値は `perf/heavy-media/GX010052.MP4`、プロキシは `perf/heavy-media/GX010052.proxy.mp4` である。音声は検証時に決定論的に生成する。

## 実行方法

```bash
npm run test:realistic-heavy-edit:e2e
```

CLIは独立したViteポート、Electronプロファイル、CDP接続を用意し、次の順に検証する。

1. Native Overlay、共有フレームbridge、Rust backendを再ビルドし、古いdebugバイナリによる偽陽性を防ぐ
2. resident scene RPCとNative Overlayを有効にして重量プロジェクトを生成する
3. 360回のスクラブ、複数選択・複製、Undo/Redo、シーン切替、3秒再生を行う
4. プロジェクトをJSONへ直列化し、復元前後のフィンガープリントとID一意性を比較する
5. ビューポートを撮影し、可視・有色ピクセル数を検査する
6. 短い1920×1080動画を書き出し、`ffprobe`で長さとフレーム数を検査する
7. 未処理例外、コンソール上の`MissingSource`、resident/presenter状態、WGPU shader validation errorを集計する

主な環境変数は次のとおり。

| 変数 | 用途 | 既定値 |
| --- | --- | --- |
| `UXFD_REALISTIC_HEAVY_EDIT_VIDEO_PATH` | 4K入力動画 | `perf/heavy-media/GX010052.MP4` |
| `UXFD_REALISTIC_HEAVY_EDIT_PROXY_PATH` | プロキシ動画 | `perf/heavy-media/GX010052.proxy.mp4` |
| `UXFD_REALISTIC_HEAVY_EDIT_IMAGE_PATH` | 静止画 | `public/icon.jpg` |
| `UXFD_REALISTIC_HEAVY_EDIT_SCRUB_ITERATIONS` | スクラブ回数 | `360` |
| `UXFD_REALISTIC_HEAVY_EDIT_PLAYBACK_MS` | 再生時間 | `3000` |
| `UXFD_REALISTIC_HEAVY_EDIT_EXPORT_SECONDS` | 書き出し対象長 | `2` |
| `UXFD_REALISTIC_HEAVY_EDIT_SKIP_EXPORT` | `1`で書き出しを省略 | 未設定 |
| `UXFD_REALISTIC_HEAVY_EDIT_CHROMIUM_TRACE` | `0`でChromium Renderer traceを無効化 | 有効 |
| `UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS` | 全体タイムアウト | `300000` |

成果物は `.codex/realistic-heavy-edit-e2e/` に出力する。

- `result.json`: 機械判定結果と測定値
- `viewport.png`: 編集画面のスクリーンショット
- `realistic-heavy-edit.uxfd.json`: 実アプリでも開ける保存済みプロジェクト
- `realistic-heavy-edit-preview.mp4`: 短い書き出し結果
- `result.log`: 実行ログ
- `chromium-renderer-trace.json`: CDPで収集したRenderer main threadのChrome trace

## 初回の検証結果

2026-07-24の開発ビルドでは、書き出しを含む代表実行を繰り返して総合判定がPASSした。

- 360回スクラブ: 約485～486 ms
- requestAnimationFrame: 平均16.68～16.69 ms、p95 18.22～20.66 ms、最大21.77～29.34 ms
- long task: 0～1件
- 保存復元: フィンガープリント一致、63件すべてID一意
- presenter: `ready`、`sharedRenderer`、surface gate `ok`
- `MissingSource`: 0件
- 未処理例外: 0件
- 書き出し: 1920×1080、2.24秒、134フレーム、約2.6 MB
- 書き出し所要時間: 約45.1～45.6秒
- Computer Use: 保存済みプロジェクトを実アプリで開き、黒化せず再生・停止できることを確認

一方、再生中の瞬間サンプルはElectronメイン約70～74%、Renderer約89～95%、Rust backend約99～102%であり、CPU負荷は依然として高い。今回のPASSは正しさと耐壊性を示すもので、十分な性能やGPUオフロード完了を意味しない。

## resident移行後の再検証

2026-07-24にresident scene RPCを強制し、ネイティブ成果物を毎回再ビルドする条件へ
検証基盤を更新した。旧debugバイナリではParticle WGSLの過去版がvalidation errorを
出してもE2EがPASSしていたため、現在は`wgpu uncaptured error`または
`Shader validation error`を1件でも検出すると失敗する。再ビルド後の実行では
これらは0件、`MissingSource`も0件だった。

対応済み部分では360回スクラブ、複製・Undo/Redo、保存JSONのフィンガープリント一致、
1920×1080・2.24秒・134フレームの書き出しまで成立した。再生中の瞬間サンプルは
Electronメイン約25～29%、Renderer約36～37%、Rust backend 0%で、初回測定より
低下した。その後、RegionFrame、通常音声の非描画分離、静的filter、描画へ影響しない
groupIdをresidentへ移した。GetColorの重量シナリオも、未対応のshape参照ではなく
実在するローカル画像をサンプル元へ接続した。さらにSubjectCrop、時刻依存Wipe、
GroupControlをRust timeline evaluatorへ、AudioSphereをresident PCM cacheと
Native WGPU source passへ移した。

同日の短時間再検証は総合PASSとなり、最終`rustTimelineStatus`は`ready`だった。
60回スクラブは74.36 ms、requestAnimationFrameは平均16.68 ms、p95 20.82 ms、
最大28.22 ms、long taskは1件（59 ms）だった。操作後41オブジェクト、Undo後32、
Redo後41で整合し、画面検査、保存復元、`MissingSource` 0件、WGPU/native render
error 0件、未処理例外0件を確認した。これにより重量シナリオ内のresident拒否は
0件になった。

## GetColor GPU source移行後の再検証

2026-07-24にGetColorの完成RGBA生成をCPU経路から外し、Native WGPUのsource passから
CAMetalLayerへ合成する版で短時間重量検証を再実行した。60回スクラブ、複製、
Undo/Redo、シーン切替、1秒再生、保存復元は総合PASSだった。操作後42オブジェクト、
Undo後33、Redo後42で整合し、保存前後のフィンガープリントも一致した。

- 60回スクラブ: 82.24 ms
- requestAnimationFrame: 平均16.63 ms、p95 20.43 ms、最大21.70 ms
- long task: 1件（64 ms）
- `MissingSource`: 0件
- WGPU/native render error: 0件
- 未処理例外: 0件
- 画面検査: 可視261,009点、有色45,227点

この実行ではElectron Renderer約75%、Electron main約67%、Rust backend約33%の
瞬間CPU値が残った。GetColorのrevision変更時ラスタライズ除去は成立したが、
アプリ全体のCPUオフロード完了を示す値ではない。次はHKSY、SimpleTubeのGPU化と、
Chromium renderer内のscene評価・React更新・DOM compositorの時系列分離を行う。

## HKSY GPU source移行後の再検証

同日にHKSYのchecker-grid、diamond、measured-grid、anchor-lineをNative WGPUへ
移した版でも短時間重量検証は総合PASSした。60回スクラブは82.46 ms、
requestAnimationFrameは平均16.67 ms、p95 22.00 ms、最大25.71 ms、long taskは
1件（68 ms）だった。操作後42オブジェクト、Undo後33、Redo後42で整合し、
`MissingSource`、WGPU/native render error、未処理例外はすべて0件だった。

再生中の瞬間値はElectron Renderer約74%、Electron main約65%、Rust backend約30%で、
依然として高い。次はSimpleTubeのGPU source化を進める一方、Chromium側の高CPUが
scene評価、React更新、DOM compositorのどこに由来するかを時系列計測で分離する。

## SimpleTube GPU source移行後の再検証

同日にSimpleTubeのtube/torusをNative WGPUのline instance source passへ移し、
direct CAMetalLayer経路で完成RGBAをCPU生成しない版を短時間重量検証した。
60回スクラブ、複製、Undo/Redo、シーン切替、1秒再生、保存復元は総合PASSだった。
操作後42オブジェクト、Undo後33、Redo後42で整合し、保存前後のフィンガープリントも
一致した。

- 60回スクラブ: 69.79 ms
- requestAnimationFrame: 平均16.69 ms、p95 20.49 ms、最大23.69 ms
- long task: 0件
- `MissingSource`: 0件
- WGPU/native render error: 0件
- 未処理例外: 0件
- 画面検査: 可視261,332点、有色48,020点

再生中の瞬間値はElectron Renderer約74%、Electron main約66%、Rust backend約35%だった。
SimpleTubeの画素走査と完成RGBA uploadは除去できたが、Chromium側CPUは依然として高い。
次は残る生成sourceの負荷順位付けと並行して、Chromium renderer内のscene評価、
React更新、DOM compositorを時系列計測で分離する。

## Chromium Renderer CPU trace基盤

Beta-468aでは重量E2Eの操作区間をCDP `Tracing`と`Performance.getMetrics`で囲み、
Renderer main threadのTask、Script、Layout/Style/Paint、GC、上位`FunctionCall`を
同じ時間軸で集計するようにした。生traceも保存するため、集計後にChrome trace viewerで
再解析できる。計測は正しさのgateとは分離し、初期段階では性能閾値によってE2Eを
失敗させない。

1秒再生を含む代表実行では、1,211 msの観測区間に対してmain thread busyは718 ms
（59.2%）だった。CDP Performance差分はTask 759 ms、Script 403 ms、Layout 28 ms、
Style再計算9 msで、trace区分はScripting 415 ms、Rendering 117 ms、GC 38 msだった。
Layout 67回、Style再計算70回が発生した。

最上位の`FunctionCall`はReact DOM開発ビルド内のsync callbackで、66回・合計374 ms、
最大20.34 msだった。アプリ側の`useAppLogic.animate`は58回・合計14.31 msだったため、
現時点ではscene評価やlayout単体より、毎フレームのReact同期更新がRenderer CPUの
主要因である可能性が高い。ただし1回の開発ビルド測定なので、React Profilerによる
Viewport/Timeline/PropertyPanel別commit時間を追加して確定する。

残るCPU完成RGBA生成sourceは30種で、毎フレーム変化するものを優先すると
FocusLinesPlus、ShakingPolygon、ShatteredSphereの順となる。FocusLinesPlusは既定の
`keyframeInterval=0`で見た目が静的でもsource frameごとにrevisionが変わり、
CPU生成を繰り返すため、次のGPU source移管対象とする。

## FocusLinesPlus GPU source移行後の再検証

Beta-469aではFocusLinesPlusのrayをGPU quad instanceで描画し、direct previewから
CPU完成RGBA生成を除去した。`keyframeInterval=0`の静的bucketと正のinterval境界も
契約テストで固定した。FocusLinesPlusを含む重量シナリオの短時間検証は総合PASSし、
操作後42オブジェクト、Undo後33、Redo後42、保存復元のfingerprint一致を確認した。

- 60回スクラブ: 80.22 ms
- requestAnimationFrame: 平均16.74 ms、p95 21.54 ms、最大25.10 ms
- long task: 1件（71 ms）
- `MissingSource`: 0件
- WGPU/native render error: 0件
- 未処理例外: 0件

CDP traceでは1,189 ms中main thread busy 653 ms（54.9%）、Task 652 ms、Script
334～347 ms、Rendering 92 ms、GC 30 msだった。最上位は引き続きReact DOMの同期
callbackで67回・303 msであり、FocusLinesPlusのCPU画素生成を外してもChromium側の
主要因はReact更新側に残る。次の生成source候補はShakingPolygonだが、これと並行して
React ProfilerでViewport、Timeline、PropertyPanelのcommit時間を分離する。

## 検証で発見した不具合

初回のシナリオ投入によって次を検出し、修正した。

- `group_control`を描画対象としてRustへ渡し、シーン全体が非対応扱いになって黒化する問題
- テキスト影に8桁カラーを渡し、native書き出しが拒否される問題
- 4Kシーク直後のデコード待機が200 msしかなく、初回ハードウェアデコード完了前に失敗する問題
- 静止画の実寸ではなく表示寸法をデコーダへ渡し、書き出し時に寸法不一致になる問題
- Rust previewのframe要求が書き出し終了を購読せず、書き出し中の`exporting`判定で
  blockedになった表示が終了後も残る問題

## React component別CPU計測とTimeline分離

Beta-470aでは重量E2E専用のReact Profilerを追加し、通常起動には計測処理を入れず、
Viewport、PropertyPanel、Timelineのcommit時間を同じ操作区間で採取できるようにした。
分離前の代表実行ではTimelineが67 commit・合計211.55 ms・平均3.16 msで、
Viewportの21.57 ms、PropertyPanelの22.30 msに対して約10倍を占めた。

Beta-471aではTimeline本体から`currentTime`購読を外し、時刻更新を2本の軽量な
playhead componentだけへ局所化した。追加操作の時刻はイベント実行時にstoreから
取得するため、操作時刻の正しさを保ちながら、再生tickごとの全clip一覧再描画を
避けている。同じ短時間構成の代表値ではTimelineの平均commit時間が
3.16 msから0.88 msへ約72%低下した。別の60回スクラブ・1秒再生実行でも
平均1.25 ms、requestAnimationFrame平均16.72 ms、p95 22.57 ms、long task 0件で、
`MissingSource`、WGPU/native render error、未処理例外はすべて0件だった。

実書き出し検証では1920×1080・2.24秒のMP4生成とprobeが成功した一方、完了直後に
previewが`exporting`でblockedのまま残る不具合を検出した。書き出し中はRust preview
評価を止め、`isExporting`がfalseへ戻った時点で現在frameを再要求するよう修正した。
短縮再検証では最終snapshotが`ok: true`、presenterが`ready`へ復帰した。なお、この
短縮実行の0.5秒切り詰めでは別のencode-only media制約によりMP4生成自体は失敗したため、
書き出し成功と復帰成功はそれぞれ前後2回の実行結果を組み合わせて確認している。

## ShakingPolygon GPU source移行後の再検証

Beta-472aではShakingPolygonの多角形fill、輪郭線、頂点discをNative WGPUへ移し、
direct previewから完成RGBAのCPUラスタライズとuploadを除去した。repeatごとの
`fill → outline → vertex`順と上書き合成、source frameごとの揺れをGPU経路の
契約テストで固定した。

最初の重量E2Eでは常駐Rust sceneの型境界だけが`shaking_polygon`を許可しておらず、
`unsupportedObjectType`を検出した。snapshot側とnative renderer側は対応済みだったため、
同じserializerを使う`GeneratedShakingPolygonPlane`を常駐Projectへ接続した。

56オブジェクトを投入する再検証は総合PASSし、操作後43、Undo後34、Redo後43、
保存復元後65オブジェクトのfingerprint一致を確認した。

- 60回スクラブ: 75.49 ms
- requestAnimationFrame: 平均17.25 ms、p95 19.06 ms、最大36.78 ms
- long task: 1件（63 ms）
- Timeline: 66 commit、合計79.38 ms、平均1.20 ms
- `MissingSource`: 0件
- WGPU/native render error: 0件
- 未処理例外: 0件
- 最終状態: presenter `ready`、Rust timeline `ready`

## ShatteredSphere GPU source移行後の再検証

Beta-473aではShatteredSphereの最大64×64 fragment gridをNative WGPUの
instance描画へ移した。各fragmentはCPU正本と同じ4 triangle fan、60 fps基準の時間、
決定論ノイズ、`blend: None`の後描き優先で描画する。設定が同じままsource frameだけ
進む場合はtextureを再生成せず、同じtextureへuniform更新とrender passを行う。

重量fixtureには約1,024 fragmentの24秒オブジェクトを追加した。57オブジェクトを
投入する短時間E2Eは総合PASSし、操作後44、Undo後35、Redo後44、保存復元後
66オブジェクトのfingerprint一致を確認した。

- 60回スクラブ: 68.18 ms
- requestAnimationFrame: 平均16.72 ms、p95 19.27 ms、最大32.25 ms
- long task: 1件（53 ms）
- Timeline: 67 commit、合計66.23 ms、平均0.99 ms
- `MissingSource`: 0件
- WGPU/native render error: 0件
- 未処理例外: 0件
- 最終状態: presenter `ready`、Rust timeline `ready`

## ShakingPolygon／ShatteredSphere export GPU接続後の再検証

Beta-474aでは両生成sourceをCPU完成RGBA収集から除外し、shared frame、
RGBA readback export、VideoToolboxのBGRA IOSurface exportへGPU descriptorを渡す。
ShakingPolygonはsource frameをrevisionに含めて揺れの更新を保持し、
ShatteredSphereは設定revisionとsource frameを分離して同一textureを再利用する。

重量fixtureの1秒exportを含む短時間E2Eは総合PASSした。操作後44、保存復元後
66オブジェクトのfingerprint一致を確認した。

- 出力: 1920×1080、75フレーム投入、MP4 74フレーム、1.24秒
- export所要時間: 64.82秒（開発ビルド、`ffmpegRawRgba`）
- `MissingSource`: 0件
- WGPU/native render error: 0件
- 未処理例外: 0件
- 画面検査: visible pixel 261,009、colourful pixel 44,340
- 最終状態: presenter `ready`、Rust timeline `ready`

macOSのBGRA IOSurface統合テストでも、CPU RGBA sourceを空にした
ShakingPolygonを直接描画し、GPU readbackなしで橙色ピクセルが得られることを確認した。

## 制約と次の観測点

- 現在の値は1台のMac、開発ビルド、1回の代表測定であり、性能回帰の閾値にはまだ使わない
- CPU値は短い瞬間サンプルで、スレッド別・GPU別の時系列ではない
- 音声はファイルの存在とプロジェクト復元を検証するが、聴感上の同期までは自動判定しない
- 書き出しは短区間であり、長尺時のメモリ増加や熱による性能低下は別途ソーク試験が必要
- 次段階では同じシナリオを基準に、Instruments/Metal System Traceまたは符号化された時系列メトリクスでCPU・GPU・フレーム落ちを分離する
