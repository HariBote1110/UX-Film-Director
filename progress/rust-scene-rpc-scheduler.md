# Rust scene RPC スケジューラ

## 決定

- ChromiumからRustへのシーン同期は、編集時の`scene.replace`と再生時の`scene.evaluate`に分離する。
- `scene.replace`と`scene.evaluate`のエラーコード`-32060`、`-32061`、`-32062`は、rendererでそれぞれ`missingScene`、`staleRevision`、`revisionMismatch`として扱う。
- プレビュー用スケジューラは評価中のフレーム要求を一件だけ保持するlatest-wins方式とする。古い評価結果はpresentへ渡さない。
- revisionの置換中に新しいrevisionが到着した場合は、中間revisionを送らず、最新revisionだけを置換する。
- `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1` のViewportでは、同期の`buildSharedRendererPreviewSession`を時刻tickで実行せず、評価済みsnapshotから既存presenterへ接続する。未対応表現・RPC失敗・境界不正は最後のsceneを残さずblockedとして停止する。

## 検討した代替案

- 全フレームで評価済みスナップショットをChromiumから送る方式は、キーフレーム・グループ・エフェクト評価をrendererへ残すため採用しない。
- 各スクラブ要求を並列に評価する方式は、古い結果がnative overlayを上書きしうるため採用しない。

## 制約

- React/Viewport統合はfeature flag下だけで有効にする。既存presenter reuseとデコード要求IDの安全機構は、schedulerが採用した評価結果にのみ接続する。
- 書き出しはフレーム欠落を許容できないため、latest-winsのプレビューscene sessionを共有しない。
- 変換対象はshape/image/video/PSD/textに加え、GetColor、HKSY、
  SimpleTubeである。グループ、マスク、逆再生、有効filterは現時点では
  明示的に`blocked`とし、旧Chromium描画へ黙って戻さない。
- Rust scene RPC中はnative presenterのsingle-flight再送から同期TypeScript
  scene構築へ戻らない。処理中に届いた再送は捨て、次の`scene.evaluate`
  結果を待つ。

## 2026-07-24 実機確認

`VITE_UXFD_RUST_TIMELINE_SCENE_RPC=1`でElectronを起動し、Computer Useと
CDP診断を併用して次を確認した。

- 1920×1080/60 fpsのプロジェクトで矩形を追加すると、`scene.replace`後の
  `scene.evaluate`からCAMetalLayerへ赤い矩形が表示される。
- 矩形を複製しても`ready`へ収束し、1.2秒の再生で74回の評価要求・74回の
  応答、失敗0件となる。表示と選択枠も維持される。
- 有効filterを追加すると`unsupportedFilter`で`blocked`になり、旧Canvasへ
  フォールバックしない。
- 実機で発見した境界不整合2件を修正した。
  - 動画以外の`source_rate: None`を`null`として返して境界検証に失敗して
    いたため、未指定時はフィールド自体を省略する。
  - 常駐scene全体のmediaを毎frame返すと、非アクティブclipの未使用mediaが
    境界検証に失敗していたため、そのframeの可視clipが参照するmediaだけを返す。
- GetColor、HKSY、SimpleTubeだけを横並びに配置する
  `?rustTimelineGeneratedE2e=1`を追加した。3エフェクトはいずれも
  CAMetalLayerへ表示され、初期評価は要求1件・応答1件・失敗0件となる。
- 同じシーンを5秒間60 fpsで再生し、要求301件・応答301件・失敗0件を確認した。
  途中結果の破棄は58件であり、正しさは維持できた一方、静的生成ソースの
  毎frame CPU生成・GPU uploadを止める必要があることも確認した。

この段階でChromiumから除去できたのは、対応V1シーンの毎tick可視判定・
位置keyframe評価・clip snapshot再構築・media JSON再構築である。GPU描画後の
全画面転送除去は既存CAMetalLayer直描画が担う。GetColor、HKSY、
SimpleTubeのCPUラスタライズもRust側で行う。一方、静的生成結果のrevision
キャッシュと複数動画/NV12の直結は引き続き次段階の対象である。
