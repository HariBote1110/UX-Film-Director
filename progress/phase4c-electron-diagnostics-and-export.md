# Phase 4c 実Electron診断・動画出力NV12対応

日付: 2026-07-23

## 目的

Phase 4cで追加したin-processデコードとNV12 IOSurface合成を、RPC統合
テストだけでなく実Electronの混在シーンで確認する。また、採用経路を画面
から判定できる診断を追加し、プレビュー限定だったNV12合成を
`encode.writeNativeFrame`へ広げる。

## 実Electron検証

1920×1080/60fpsのプロジェクトへ実動画
`/Volumes/Datadrive/2026-01-07 18-19-31.mov`、GetColor V2Rドット
フィールド、SolidColour図形を配置した。約13秒の混在区間で3種類のmediaが
同じSceneSnapshotへ入り、動画と生成物が同時に描画されることを確認した。

同じ実シーンのSnapshot・media・source descriptorをElectron rendererから
Rust backendへ渡した結果は次のとおり。

- `decodePath`: `inprocess`
- `renderPath`: `webgpuSceneComposite`
- `nv12ZeroCopyMediaIds`: 動画の`mediaId` 1件

初回検証では修正前のRust実行ファイルを使ったため、RGBA共有メモリ読込が
タイムアウトした。`cargo build --manifest-path rust-backend/Cargo.toml`
後に再検証し、混在描画とNV12採用を確認した。今後の実機検証ではテスト用
バイナリのビルドだけでなくsidecar実行ファイルの更新も検証前提とする。

## 診断の決定

バックエンドのネイティブ合成結果へ`renderPath`を追加し、既存の
`decodePath`、`nv12ZeroCopyMediaIds`と合わせて
`SharedRendererNativeRenderDiagnostics`として扱う。

診断値はネイティブ描画upload、presenter orchestration、再利用presentを
通してdocument/canvas datasetへ伝搬する。正常時も次の形式のViewport
バナーを表示する。

`Rust shared renderer preview / status=ready / decode=inprocess / render=webgpuSceneComposite / nv12={mediaId}`

正常時にバナーを隠す従来仕様よりも、zero-copy検証中に経路を即座に判別
できることを優先した。失敗診断と同じ表示面を再利用し、別のデバッグUIは
増やさない。

実機検証では、ネイティブ描画が成功している場合にも、それ以前のRGBA共有
メモリ読込タイムアウトが動画upload失敗として残ることを確認した。現行出力を
`native-render-frame`または`external-video-source`が所有する場合、旧RGBA
upload失敗は置き換え済みの一時イベントとして永続診断から除外する。

## 動画出力の決定

`encode.writeNativeFrame`でも`collect_native_render_nv12_sources`を実行する。
NV12 sourceが1件以上ある場合はCPU単純動画合成をスキップし、
`render_frame_stages_with_audio_waveforms`へNV12 source mapを渡す。

レスポンスはプレビューと同様に次を返す。

- `renderPath="webgpuSceneComposite"`
- `nv12ZeroCopyMediaIds=[...]`

NV12 sourceがない既存経路ではCPU高速パスを維持し、
`nv12ZeroCopyMediaIds=[]`を返す。環境変数
`UXFD_DISABLE_NV12_ZERO_COPY_RENDER=1`によるkill switchも共通で有効。

新しい統合テストはH.264フィクスチャをin-processデコードし、その共有
sourceを`encode.writeNativeFrame`へ渡してMP4を完了させる。出力ファイルが
生成され、WebGPU経路と動画mediaIdが返ることを固定した。

## 全体検査で解消した不整合

- Rust backend分割前の`main.rs`だけを読む境界テストを、`state.rs`、
  `native_render.rs`、`rpc_dispatch.rs`、`encode.rs`を含む契約へ更新。
- shared-rendererの明示的なbrowser video互換モジュールを境界許可表へ固定。
- presenter再利用テストを新しい診断引数に追随。
- Electron IPC event、native overlay payload、Three.js addons、MP4Box、
  `.mjs`ベンチスクリプト、テストfixtureのliteral型を修正し、
  `npx tsc --noEmit`をエラー0にした。
- Workerがない環境のPSDフォールバックをcanvas読戻しから`useImageData`
  経路へ統一。`ImageData(width,height)`依存をなくし、NodeとElectronで
  同じRGBA契約を使う。

## バージョン

診断面の追加とexport経路の機能拡張を含むため、
`0.1.1-Beta-452c`から`0.1.1-Beta-453a`へ更新する。

## 最終検証

- 実Electron混在シーン: `decode=inprocess`、
  `render=webgpuSceneComposite`、動画media IDのNV12 zero-copy採用を確認。
- Vitest: 200ファイル、1482テスト合格。
- TypeScript: `npx tsc --noEmit`合格。
- Rust NV12統合: `render_nv12_zero_copy` 5テスト合格。
