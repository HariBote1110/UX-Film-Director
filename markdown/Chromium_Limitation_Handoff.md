# 引き継ぎ課題：ChromiumをUI・編集命令の発行に限定する移行

作成: 2026-07-25 / 版 `0.1.1-Beta-481a` / ブランチ `feature-proxy`
更新: 2026-07-26 / 版 `0.1.1-Beta-482b` — P1完了（callCount 211→5、レビュー確定回帰の修正込み）。次はP2から。

## 0. ゴール（元の指示）

ChromiumをUI・編集命令の発行に限定し、毎フレームのシーン／キーフレーム評価、
GetColor・HKSY・SimpleTube等のエフェクト生成、テキスト・図形・画像を含む
レイヤー合成、GPUリソース管理、CAMetalLayer直接present、書き出しをRust側へ
段階的に移管する。旧Canvas/WebGL/WebGPUの本番描画経路とCPUピクセル往復を廃止し、
現実的な重量編集E2Eで表示・保存復元・書き出しの正しさとCPU負荷低下を検証する。

## 1. ここから着手（優先順）

### P1: ✅完了（Beta-482a, 2026-07-25） Viewportの選択枠オーバーレイ抽出とcurrentTime購読の全廃

**結果: React sync work の `callCount` 211 → 5（2回のE2Eで再現）。総合PASS・
settled・エラー0件。** 詳細と測定表は `progress/renderer-per-frame-rerender.md`
の「解決（Beta-482a）」節。

実施内容（コミット d03b2459〜4c2f8a73）:
- 選択枠を `SceneSelectionDecorationLayer` へ抽出。時間追従はhook購読ではなく
  `useStore.subscribe` + SVG属性の命令的パッチ（React描画とパッチが純関数
  `computeSceneSelectionOverlayGeometry` を共有）。契約テストを先に整備した。
- Viewport本体のセレクタから `currentTime` を除去し、requestTime→publish→
  renderScene のtick処理を `onCurrentTimeTickRef` + subscribeへ一元化。
- `TimelineCurrentTimeDisplay`（textContent直接更新）と
  `useVisionRealtimeDetection`（デバウンスのsubscribe化）の購読も除去。
- 残る毎フレームのlayoutCount（212〜213）は時刻テキスト等のDOM更新由来で、
  Reactではない。`performWorkUntilDeadline` が180〜195残る（コスト小・原因未特定）。

**実機での未確認事項**: 選択枠のドラッグ・リサイズ操作（重量E2Eは演習しない）。
実機確認時にリサイズハンドルの追従を確認すること。

### P2: `text` をRust frame source必須側へ倒す

テキストのみで構成したプロジェクトはexport時にlegacy canvas
（`src/utils/projectExportLegacyCanvasCapture.ts` の `createImageBitmap`＝CPU往復）へ
落ちる。これが経路1がproduction到達する主要条件。

`hasProjectExportNativeRenderMediaObjects`（`src/utils/projectExportFrameCanvas.ts`）は
`isSupportedSceneObject(object) && object.type !== 'text'` となっており、この
`!== 'text'` を外すのが本題。Rust側にはテキスト描画実装がある
（`rust-backend/src/generated/text.rs`、`rust-backend/src/fonts.rs`）。

**フォント選択・字形・行送りの再現性検証が必須。** 詳細は
`progress/chromium-render-path-audit.md` の「`text` を除外している理由」節。

### P3: PSDの `putImageData` 往復を除去する

`src/utils/psdBillboardSync.ts:61-71` はRust側で合成済みのRGBA
（`rust-backend/src/psd_fast.rs` の `composite_visible_psd_layers*`）を受け取りながら、
Three.js CanvasTexture化のためCanvas2Dへ書き戻している。
`THREE.DataTexture` への直接投入で往復を除去できる。

### 以降の順序

`progress/chromium-render-path-audit.md` で決定した廃止順序は
**5(measureText) → 4(PSD) → 2(WebGPU presenter) → 1(legacy canvas) → 3(3D Stage)**。
3D StageのThree.js/WebGL移行が最大かつ最後で、1と4のlegacy canvas依存の根本原因。

## 2. 測定規約（必ず守ること。破ると誤った結論を積む）

重量編集E2E: `npm run test:realistic-heavy-edit:e2e`
（`UXFD_REALISTIC_HEAVY_EDIT_TIMEOUT_MS=600000` を付けること。既定300秒では
環境によって足りない）。

### 使ってよい指標（安定）

- `chromiumRendererTrace.topFunctions[].callCount` — 4回の測定で 212/212/210/210
- `performanceMetrics.layoutCount` / `recalcStyleCount` — 213/213/211/211

**構造改善の成否はこの回数系で判定する。**

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
