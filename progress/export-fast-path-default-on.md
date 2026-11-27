# residentScene RPC / IOSurfaceダイレクトエンコード経路の既定有効化

## Decision
- `VITE_UXFD_RUST_TIMELINE_SCENE_RPC`（src/components/Viewport.tsx）と
  `VITE_UXFD_NATIVE_DIRECT_ENCODE`（electron/preload.ts）を、既存の
  `VITE_UXFD_SHARED_RENDERER_EXPORT`と同じopt-out方式（`!== '0'`）へ統一し、
  未設定・'1'指定時は常駐Rust scene RPC + IOSurface/VideoToolbox直接エンコード
  経路（約135fps）を既定で有効化した。無効化するには両方に`0`を指定する。
- 段階移行フラグとして導入された2つのフラグは、dev起動スクリプト
  （scripts/dev-native-overlay.mjs）やE2Eスクリプト
  （scripts/run-realistic-heavy-edit-e2e.mjs, run-psd-import-e2e.mjs）では
  既に`'1'`固定で常時有効化されており、実質的に既定動作として運用されて
  いた。今回の変更でVite/Electron本体のデフォルトをそれに追随させた。
- `rustTimelineSceneRpcEnabled`はexportだけでなくLIVE再生（timeline scene RPC
  診断、native再生ui-state、resident revision管理など）にも波及する唯一の
  フラグであり、export専用に切り出すことはしなかった。dev起動スクリプトが
  常時'1'で運用してきた実績があり、既知の未解決課題やTODOも見当たらな
  かったため、live再生を含めて既定有効化して問題ないと判断した。

## Alternatives considered
- export専用の別フラグへ分離する案: `rustTimelineSceneRpcEnabled`はRPC経路の
  scene評価そのものを切り替える単一フラグで、export/live両方が同じ常駐
  scene controllerを共有する設計のため、export単独無効化はアーキテクチャ上
  分離コストが高く、既定動作としての実績もあったため見送った。

## Constraints・Gotchas
- opt-out環境変数: `VITE_UXFD_RUST_TIMELINE_SCENE_RPC=0` と
  `VITE_UXFD_NATIVE_DIRECT_ENCODE=0` を両方指定するとレガシー経路
  （renderer側timeline評価 + ffmpegRawRgbaエンコード、約51fps）に戻る。
  片方だけ無効化すると経路がねじれるため、opt-outする場合は両方揃える。
- e2e検証（focus-tips.json, 720フレーム）:
  - 既定（フラグ未指定）: `encoderPath: iosurfaceVideoToolbox`,
    exportDurationMs 5154〜7521ms（約95〜140fps、初回はコールドスタートで
    遅くなる）
  - opt-out（両方`0`）: `encoderPath: ffmpegRawRgba`,
    exportDurationMs 10470ms（約69fps、レガシー経路）
  - 検証中、Electronプロセスの残留による一過性のWebGPU初期化失敗
    （`WebGPU is not available for shared renderer Rust export`）が一度
    発生したが、これは今回の変更起因ではなくプロセス残留による既知の
    flakinessで、再実行で解消した。
- 実装は`src/vite-env.d.ts`の型定義（`VITE_UXFD_RUST_TIMELINE_SCENE_RPC?`）や
  `sharedRendererExportFrameSource.ts`側の`rustTimelineSceneRpcEnabled`
  パラメータ受け取り箇所は無変更（値を受け取るだけで判定ロジックを持たない
  ため影響なし）。
