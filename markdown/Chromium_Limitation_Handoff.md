# 引き継ぎ課題：ChromiumをUI・編集命令の発行に限定する移行

作成: 2026-07-25 / 版 `0.1.1-Beta-481a` / ブランチ `feature-proxy`
更新: 2026-07-28 / 版 `0.1.1-Beta-483f` — P2・P3完了。P1は動画なしセッションの
presenter再利用を修正し、砕け散る球E2Eで定常再生中41回→0回を確認した。
動画を含む混在セッションの87回/177フレームは、A/V二重クロックを避けるため未修正。
WebGPU presenter到達率の縮小は、動画なし音声波形・音声球のdirect提示まで完了。
次はJPEG、PSD、またはRust側へ動画供給を統合した後の混在セッション再利用。

**E2E修復済み**: `npm run test:shattered-sphere-preview:e2e` はNative Overlayの
direct presentとDOM WebGPU uploadの期待が混在していた。検証対象を後者へ明示固定し、
画素検査・`nativeRenderFrameReady`・定常再生中のpresenter再起動0回を合否条件として
2回連続PASSした。

## 0. ゴール（元の指示）

ChromiumをUI・編集命令の発行に限定し、毎フレームのシーン／キーフレーム評価、
GetColor・HKSY・SimpleTube等のエフェクト生成、テキスト・図形・画像を含む
レイヤー合成、GPUリソース管理、CAMetalLayer直接present、書き出しをRust側へ
段階的に移管する。旧Canvas/WebGL/WebGPUの本番描画経路とCPUピクセル往復を廃止し、
現実的な重量編集E2Eで表示・保存復元・書き出しの正しさとCPU負荷低下を検証する。

## 1. ここから着手（優先順）

### P1: 残件あり（Beta-483a時点） Viewportの再レンダー削減

**現在の到達点**: `Timeline` 211 → 5、`Viewport` 377 → **109〜126**。
総合PASS・settled・エラー0件。178フレーム中109〜126なので、まだ約0.6回/フレーム残る。

以下は途中経過の記録（Beta-482a/482bの段階と、そこで犯した測定の誤り）。

> **当初「callCount 211 → 5 で完了」と記録したが誤りだった。** その指標
> （`topFunctions` の `chunk-…js:18625`）はReactの **sync lane** だけを数えており、
> Viewportのコミットは concurrent lane（`performWorkUntilDeadline`）へ移動した
> だけで消えていない。**今後は `exercise.reactProfile.components[].commitCount`
> を一次根拠にすること**（下の測定規約も更新済み）。

実施内容（コミット d03b2459〜4c2f8a73）:
- 選択枠を `SceneSelectionDecorationLayer` へ抽出。時間追従はhook購読ではなく
  `useStore.subscribe` + SVG属性の命令的パッチ（React描画とパッチが純関数
  `computeSceneSelectionOverlayGeometry` を共有）。契約テストを先に整備した。
- Viewport本体のセレクタから `currentTime` を除去し、requestTime→publish→
  renderScene のtick処理を `onCurrentTimeTickRef` + subscribeへ一元化。
- `TimelineCurrentTimeDisplay`（textContent直接更新）と
  `useVisionRealtimeDetection`（デバウンスのsubscribe化）の購読も除去。
- layoutCount 213は不変だが**原因の主体は入れ替わった**。`InvalidateLayout` の
  祖先は修正前99%がReactコミット、修正後97%がrAF（`animate`）内の命令的DOM更新。

**その後（Beta-483a）**: ランタイム計測で原因を特定し修正した。
`generatedEffect` の object-id 供給元が2つ（毎tickのpublish側と、
`nativeRenderFrameReady` でゲートされたpresenter完了側）あって同じrefを交互に
上書きし、`renderTick` が毎フレーム発火していた。publish側の即時反映は
Pixi二重描画レース対策の名残でPhase 4後は不要だったため撤去。
**`Viewport` commitCount は 191 → 109/126 まで減った**（2回とも計測有効・PASS）。

**残件の正体（Beta-483cで判明。React側ではなくpresenter側）**:
`Viewport` の残り約103コミットは `setSharedRendererPreviewSession` 由来で、その実体は
**presenterのフル再起動が再生中に87回起きていること**（177フレーム中。
`exercise.presenterRestarts.duringPlayback` として常設計測を追加した）。
コード中のコメントはフル再起動を「約28ms/回」としており、**Reactのコミット削減より
こちらの方が実CPUコストへの寄与が大きい可能性が高い**。

原因は `canReuseNativeRenderPresenter` のゲートが `rustVideoOnlyEnabled` 単独で、
この環境変数を `npm run dev` は設定するのに**本番ビルドと各E2Eは設定しない**こと。
ただし混在セッションでゲートを広げると動画の供給元がHTMLVideoElementのアップロードから
Rust再デコードへ切り替わり音声と二重クロックになるため、**安易に広げてはいけない**。
詳細と次の一手は `progress/presenter-restart-storm-rustvideoonly-gate.md`。

**Beta-483dで解消した部分集合**:
動画なしのnative-render-onlyセッションはHTMLVideoElement音声と競合しないため、
通常cutover構成でもpresenter reuseを許可した。砕け散る球E2Eでは修正前の定常再生中
41回から、修正後は有効な単調カウンタで0回へ減少した。video-only・混在セッションは
`rustVideoOnlyEnabled` 必須のままで、既知のA/V二重パイプラインを作らない。
詳細は `progress/video-free-presenter-reuse.md`。

**実機での未確認事項**: 選択枠のドラッグ・リサイズ操作（重量E2Eは演習しない）。
実機確認時にリサイズハンドルの追従を確認すること。

### P2: ✅完了（Beta-483a） `text` をRust frame source必須側へ倒す

`hasProjectExportNativeRenderMediaObjects` から `&& object.type !== 'text'` を撤去し、
SSOT（`isSupportedSceneObject`）からの素直な導出にした（`28bcd15b`）。

**着手前の想定（フォント再現性の検証が必須）は誤りだった。** 調査の結果:

- **PixiJS撤去済みのため、Chromium側はテキストのグリフを一切描いていない。**
  `textBoxMeasurement.ts` の `measureText` はボックス寸法を測るだけで、実描画は
  `rust-backend/src/generated/text.rs`（cosmic-text）が担う。
- 2D exportの「legacy canvas」は `getExportCanvas` が返す shared renderer の
  surface canvas であり、**中身は既にRustが描いた結果**。それを
  `createImageBitmap` でCPU往復コピーしていただけ。
- よって「Chromium描画とRust描画の比較」という論点自体が存在しなかった。
  この変更で絵は変わらず、変わるのはキャプチャ手段だけ。

**意図した挙動変更**: テキストのみのプロジェクトは、Rust frame sourceを用意できない
環境でlegacy canvasへ逃げず**export失敗**するようになった。legacy canvasの中身は
shared rendererのsurface canvasに過ぎず、Rust frame sourceが用意できない状況では
そのcanvas自体も空か古いフレームである可能性が高い。無音で空フレームを書き出すより
失敗させる方を選んだ（image/psdのみのプロジェクトは既に同じ扱い）。

**未検証**: テキストのみのプロジェクトのexportを実際に走らせた確認はしていない
（重量E2Eはvideoを含むため、この経路を通らない）。テキスト単体のexport E2Eを
作るのが確実な検証手段。

**副産物として見つかったRustテキスト描画の既存バグ**（P2とは独立）:

- ✅修正済み（`ae0535ea`）: 行送り比率が計測1.2に対し実描画1.25で複数行がクリップ／
  `letterSpacing` が計測に反映されず実描画幅を超える
- ❌未修正: `textShadow.blur` がRust側で完全に無視されている
  （`text.rs` の `paint_buffer` が `_blur` を受け取るだけで使っていない）
- ❌未修正: stroke/shadowがボックス寸法に加算されずプレーン境界でクリップされる
  （`textBoxMeasurement.ts` / `rustSceneSnapshot.ts` の `textMediaBox` が
  `textStroke.width` や `textShadow.offset/blur` を考慮しない）
- 未確認: 存在しないフォント名を指定したときのRust側フォールバック挙動
  （`family_with_cjk_fallback` のコメントと実装が乖離している）

### P3: ✅完了（Beta-483e） PSDの `putImageData` 往復を除去する

`src/utils/psdBillboardSync.ts` はRust側で合成済みのRGBA
（`rust-backend/src/psd_fast.rs` の `composite_visible_psd_layers*`）を受け取りながら、
Three.js CanvasTexture化のためCanvas2Dへ書き戻していた。Beta-483eで
`ArrayBuffer`からゼロコピーの`Uint8Array` viewを作り、`THREE.DataTexture`へ
直接渡すよう変更した。

同じ`filePath::activeLayerIds`ではDataTextureを再利用し、毎tickのGPU再転送を停止。
キー変更、billboard削除、3D Stage unmountではtextureを明示破棄する。
CanvasTextureとの表示互換のため、sRGB、`flipY=true`、straight alpha、
線形filterとmipmapを契約テストで固定した。全230 test files・1656 testsと型検査が
PASS。GPU転送前にRGBA長と正の安全な整数寸法も検証する。詳細は
`progress/psd-billboard-data-texture.md`。

`psdParser.ts`のPSD import用canvasと、3D Stage自体のThree.js/WebGL描画は対象外。

### P4: 部分完了（Beta-483f） WebGPU presenter到達率を下げる

Native Overlay addonには音声波形・音声球のresident PCM cacheとGPU sourceが
既に実装済みだったが、renderer、native-render-only分岐、Electron main再生の
3箇所が`GeneratedAudioWaveform` / `GeneratedAudioSphere`を明示拒否していた。

動画なしの両media kindは`presentScene`へ直接渡すよう変更し、renderer側PCM抽出、
`render.nativeSharedFrame`による完成RGBA生成、shared frame uploadを省略した。
Electron main所有のnative playback clockでも同じresident PCM経路を使う。

Video＋音声生成物は、renderer側のdecoded-frame注入経路がresident PCM descriptorを
供給しないため不適格のまま。提示関数自身もdecode開始前にこの組合せを拒否し、
native media schemaを満たさない音声・生成sourceはaddonへ渡さない。PSDはactive
layer搬送、JPEGはaddon decoder、複数Videoはroutingとlease管理が必要。
frontend全230 test files・1670 tests、型検査、native-overlayのresident PCM testが
PASS。詳細は
`progress/audio-reactive-direct-overlay.md`。

### 以降の順序

`progress/chromium-render-path-audit.md` で決定した廃止順序は
**5(measureText) → 4(PSD) → 2(WebGPU presenter) → 1(legacy canvas) → 3(3D Stage)**。
3D StageのThree.js/WebGL移行が最大かつ最後で、1と4のlegacy canvas依存の根本原因。

## 2. 測定規約（必ず守ること。破ると誤った結論を積む）

重量編集E2E: `npm run test:realistic-heavy-edit:e2e`
（`UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=600000` を付けること。既定300秒では
環境によって足りない）。

### 使ってよい指標（安定）

- **`exercise.reactProfile.components[].commitCount`** — Reactの再レンダー削減は
  必ずこれを一次根拠にする。コンポーネント別の直接値で、laneの区別に影響されない。
- `performanceMetrics.layoutCount` — 全runで212〜213。実測上もっとも安定している。
  （`recalcStyleCount` は安定指標ではない。後述の追加訂正を参照）
- `chromiumRendererTrace.topFunctions[].callCount` — 安定はしているが**Reactの
  判定には使わないこと**。`chunk-…js:18625` はsync laneのみを数えており、
  concurrent laneへ移動しただけの変化を「消えた」と誤読させる（Beta-482aで実害）。

**構造改善の成否はこの回数系で判定する。**

### 追加訂正: `recalcStyleCount` は安定指標ではない

上のリストに `recalcStyleCount` を安定指標として挙げていたが、同一構成で
**215〜308** を観測した（Beta-483aのrun1で308、run2で215）。1サンプルで308を見て
回帰かと疑ったが次のrunで戻った。**安定しているのは `layoutCount` だけ。**

### 計測の有効性を必ず確認すること（Beta-483aで追加）

Electronウィンドウが他アプリに隠されると**レンダラーのrAFがスロットリングされ、
性能指標が桁違いに良く見えるのに総合PASSする**（実測: `rafSampleCount` 178→9、
Viewportコミット 191→15、layoutCount 213→44）。これを改善と誤読しかけた。

`result.json` の `exercise.playbackClockHealth.healthy` が **false の回は
性能比較に使ってはいけない**。ランナーが警告も出す。測るときはElectronウィンドウを
前面に保ち、他アプリの重い処理を並行させないこと。

### 使ってはいけない指標（run-to-runで大きくばらつく）

- `busyMs` / `busyRatio` — 同一構成で 970〜1520（1.6倍）
- `Receive mojo reply` の totalMs / count — 同一に近い構成で 67回〜395回（6倍）
- `exportRun.durationMs` — 42.6 / 60.3 / 67.7 秒

ミリ秒で比較したい場合は**最低3回測って全サンプルを並べ**、全サンプルが
同じ向きに動いていることを確認してから述べる。1回の測定で「○%改善」と
書かないこと。

### その他の注意

- **重量E2Eを2つ同時に走らせるとElectron同士が競合してタイムアウトする。** 必ず逐次実行。
- E2Eは開始時に `.codex/realistic-heavy-edit-e2e/` を丸ごと削除する。比較したい結果は
  実行ごとに別ディレクトリへコピーして保存すること。
- **サブエージェントにE2Eを実行させないこと。** サブエージェント終了時に
  バックグラウンドプロセスが道連れで殺され、結果が失われる（このセッションで2回発生）。
  親エージェントが自分で実行する。
- Electronはrenderer↔main間の全チャネルを単一の `electron.mojom.ElectronApiIPC` に
  集約するため、**トレースからIPCチャネル別の内訳は特定できない**。IPC発生源を
  特定したい場合はmain process側にチャネル別カウンタを入れるなど別手段が必要。

## 3. このセッション（2026-07-25）でやったこと

版 `0.1.1-Beta-478a` → `0.1.1-Beta-481a`、21コミット。作業ツリーはクリーン。

1. **export直後のpresenter復帰不能を修正**（`69edfcb7` / `9b1d367a`）
   `videoTextureViewUnavailable` でfallback固定される追跡課題を解消。原因はRust常駐
   scene RPCモードで復帰経路が一つも配線されていなかったこと。詳細は
   `progress/post-export-presenter-recovery.md`。
2. **重量E2Eの最終整定条件を強化**（`17a44b68`）
   `snapshot.ok` はpresenterとrustTimelineの**どちらか**readyで真になるため、
   presenter側の故障を最終地点で検出できていなかった。双方readyを待つ
   `settled` フラグを追加。
3. **exportのRust経路判定の網羅漏れを修正**（`21d7d0b6` / `0de3b7ac`）
   手書きOR式の二重管理を `isSupportedSceneObject` からの導出へ。
   `shattered_sphere` / `plain_effector_line` の漏れを解消。
4. **PropertyPanel / TimelineControlBarの毎フレーム購読を除去**
   （`f87ade03` / `fe48a00f` / `10a57c84` / `d4939ef2`）
   `scriptMs` は3サンプルすべて（223/248/309）が修正前406を下回り、削減は実在。
   幅は -40〜45%。
5. **残存Chromium描画経路の棚卸し** — `progress/chromium-render-path-audit.md`
6. **再生ヘッドのref+transform化**（`a0448b6a` / `2187a828`）
   — **回数系指標は変わらず、効果は測定できていない。** Viewport側が原因だと判明。
   `left`→`transform` の分だけ合成側に有利なため残置しているが、Viewportを
   止めるまで効果は出ない。

### 訂正した誤り（同じ轍を踏まないこと）

- 「`Receive mojo reply` が単一項目で最大コスト」— 1サンプルに基づく誤り。
  切り分け実験（`UXFD_REALISTIC_HEAVY_EDIT_CLEAR_SELECTION_BEFORE_PLAYBACK=1`）で
  選択デコレーション由来という仮説も否定された。指標自体が6倍ばらつく。
- 「busyMs -10%改善」— 誤差の範囲だった。

## 4. 決定ログ（`progress/`、新しい順）

- `renderer-per-frame-rerender.md` — 再生中レンダラーCPUの主因がReact毎フレーム
  再レンダーであること、削減実績と残課題、**測定指標のばらつき実測**
- `chromium-render-path-audit.md` — 残存Chromium描画経路と廃止順序、`text` の未解決点
- `post-export-presenter-recovery.md` — export直後のpresenter復帰
- `realistic-heavy-edit-verification.md` — 重量E2Eの検証基盤と各段階の実測値
- ほか `progress/INDEX.md` 参照

## 5. 作業規約

- `/development` スキルに従う。Red→Green→Refactorを別コミットにし、
  作業ツリーを汚したまま次へ進まない。
- 応答・ドキュメントは日本語。コード内英語コメントは British English 綴り。
- 版番号は `package.json`。新機能・重大バグ修正でPhaseVerを進めSubVerをaに戻す。
  軽微修正はSubVerを1つ進める。
- 決定・却下案・非自明な制約は `progress/` へ記録し `INDEX.md` を更新する。
- Opus/Fableで作業する場合はコード編集をサブエージェントへ委譲する
  （`/subagent-policy`）。ただしE2E実行は委譲しない（前述）。

## 6. 主要ファイル

| 役割 | パス |
|---|---|
| プレビューの中心 | `src/components/Viewport.tsx` |
| presenter制御 | `src/utils/sharedRendererPreviewPresenterController.ts` |
| WebGPU presenter（廃止対象） | `src/utils/sharedRendererWebGpuPresenter.ts` |
| export frame source判定 | `src/utils/projectExportFrameCanvas.ts` |
| legacy canvas capture（廃止対象） | `src/utils/projectExportLegacyCanvasCapture.ts` |
| native対応objectのSSOT | `src/utils/rustSceneSnapshot.ts` の `isSupportedSceneObject` |
| 重量E2E | `scripts/run-realistic-heavy-edit-e2e.mjs` / `src/e2e/realisticHeavyEditHarness.ts` |
| Rust backend | `rust-backend/src/` |
| GPU描画 | `native-wgpu-renderer/src/` |
