## 2026-06-17 — Phase5: Rust backend 動画decodeの limited range gate

### 実施内容
- サブエージェントレビューで指摘された `color_range=pc` 固定の危険をTDDで修正した。
- `rust-backend/tests/decode_control_plane.rs` に limited range H.264 fixture を追加し、`frameIndex=1` の decode が
  `tv -> pc` 明示変換のCRCと一致することを固定した。
- `rust-backend/src/main.rs` は `decode.requestFrame` ごとに `ffprobe` で `color_range` を読み、
  `pc` / `tv` のみを `scale=in_range=...:out_range=pc` へ渡すようにした。
- unknown / missing / unsupported range は無音で full range 扱いせず、Rust decode error として fail-loud にする。
- package version を `0.1.1-Beta-41b` に更新した。

### 現在の制限
- transfer / matrix の strict gate はまだ `bt709` 前提で、次の colour metadata gate で `ffprobe` 照合対象にする。
- POSIX shm / WebGPU upload は引き続き未実装で、Pixi video preview は維持する。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml` -> 5 tests passed。

## 2026-06-17 — Phase5: Rust backend 実動画フレーム decode gate

### 実施内容
- `rust-backend` の `decode.requestFrame` を ack-only から、実ファイルの指定 `frameIndex` を `ffmpeg` で RGBA decode する経路へ進めた。
- decode 結果は GPU row pitch に合わせて `strideBytes` padding し、`SharedFrame` descriptor と `FrameVerificationReport` の CRC32 だけを JSON-RPC で返すようにした。
- `SharedFrameRing` を backend session 内で保持し、`mark_slot_ready -> acquire_ready_slot -> decode.releaseFrame` の所有権遷移を通すようにした。
- `rustBackendVideoDecodeControl` に decoded frame descriptor / verification の型と `isRustBackendDecodedVideoFrameAvailable` を追加した。
- presenter diagnostics に `uxfdSharedRendererPresenterVideoFrameUploadReady` を追加し、Rust backend が verified frame を返せても WebGPU upload 未完了なら video cutover しない状態を可視化した。
- サブエージェントの軽量レビューで、次に `ffprobe` metadata gate と POSIX shm 書き込みが必要であることを確認した。
- package version を `0.1.1-Beta-41a` に更新した。

### Red
- `rust-backend/tests/decode_control_plane.rs` に、2 frame H.264 fixture の `frameIndex=1` を Rust backend が実 decode し、
  descriptor / verification checksum を返す契約を追加した。
- `frameBase64` / `bytes` / `pixels` が control-plane JSON に混入しないことを再帰的に固定した。
- `src/utils/rustBackendVideoDecodeControl.test.ts` に decoded frame availability 型ガードの契約を追加した。
- `src/utils/sharedRendererPresenterDiagnostics.test.ts` に `videoFrameUploadReady=false` の診断出力を追加した。

### Green
- `rust-backend/src/main.rs` に `decode_tight_rgba_frame` / `pad_rgba_rows` / CRC32 verification を実装した。
- `decode.start` は source path、ffmpeg path、`SharedFrameRing` を session に保持するようにした。
- `decode.releaseFrame` は GPU upload fence signalled の release だけを受け付け、ring slot を `free` に戻すようにした。
- TypeScript 側は verified decoded frame を認識できるが、actual pixel bytes はまだ IPC に載せない。

### 現在の制限
- actual pixel bytes はまだ POSIX shm / mmap へ書いていない。現時点では heap 上で padding と checksum を作り、control-plane に descriptor / checksum だけを返す。
- WebGPU texture upload は未実装のため、`videoFrameUploadReady=false` を維持し、Pixi video preview はまだ残す。
- `ffmpeg` decode filter は現時点で `in_range=pc` 固定。limited range / transfer / matrix は次 gate で `ffprobe` を使って fail-loud または明示変換にする。
- `latestWins` scheduler / request cancellation は未実装で、scrub 時の古い request coalesce は次以降の課題。

### 検証
- `cargo test --manifest-path rust-backend/Cargo.toml` -> 4 tests passed。
- `npm test -- src/utils/rustBackendVideoDecodeControl.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 3 files / 16 tests passed。

## 2026-06-17 — Phase5: SolidColour rectangle を Pixi から shared renderer ownership へ移管

### 実施内容
- `sharedRendererSolidColourOwnership` を追加し、SolidColour rectangle の cutover 条件を TDD で固定した。
  - shared renderer preview が ready。
  - geometry source が `rust-wasm`。
  - cutover 対象より前面に Pixi-only object がない。
  - export 中ではない。
- `sharedRendererSolidColourStackSafety` を追加し、SolidColour より前面に `Image` など Pixi-only plane がある場合は cutover しないようにした。
- `sharedRendererSolidColourScene` / `sharedRendererWebGpuPresenter` は owned SolidColour object id だけを draw list に残すようにした。
  - Pixi 側で unsafe shape を残しても shared renderer が上から描いてしまう z-order 破壊を防ぐ。
- `Viewport` は presenter の `solidColourOwnership.solidColourObjectIds` を `updatePixiContent` へ渡すようにした。
- `pixiRenderHelper` は owned SolidColour shape について Pixi children を cleanup し、`hitArea` だけ残して shape branch を抜けるようにした。
- DOM diagnostics に SolidColour ownership / reason / shared object count を追加した。
- package version を `0.1.1-Beta-40a` に更新した。

### 選定理由・判断の根拠
- 動画は actual pixel decode / shared memory / WebGPU upload が未実装のため、まだ Pixi から外すと表示を壊す。
- SolidColour rectangle は Rust/WASM で vertex 生成済み、WebGPU presenter で描画済みなので、PixiJS を剥がす最初の対象として最も安全。
- shared renderer canvas は Pixi 全体の上に重なるため、draw list 自体を safe id に絞らないと Pixi-only 前面 object を覆ってしまう。
- export は現行 Pixi canvas を読むため、Pixi shape skip は preview のみとした。

### 検証
- `npm test -- src/utils/sharedRendererSolidColourOwnership.test.ts src/utils/pixiSolidColourCutover.test.ts src/utils/sharedRendererSolidColourScene.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/pixiVideoCutover.test.ts`
  - 6 files / 26 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回の SolidColour ownership / Pixi cutover 由来の新規エラーはなし。

## 2026-06-16 — Pixi video texture cleanup のリーク対策

### 実施内容
- サブエージェントの軽量レビューで指摘された video texture / export overlay の破棄漏れを修正した。
- `videoElementForPixi` に cleanup helper を追加し、canvas upload texture は source ごと `destroy(true)`、`VideoSource` 経路は `VideoSource.destroy()` と `texture.destroy(false)` に分けるようにした。
- export overlay cache は export 終了、clip 非表示化、Viewport unmount 時に texture source ごと破棄するようにした。
- video object の `src` / `proxyFilePath` が差し替わった時、既存 `HTMLVideoElement` と frame texture を使い続けないようにした。
- package version を `0.1.1-Beta-39b` に更新した。

### 検証
- `npm test -- src/utils/videoElementForPixi.test.ts src/utils/pixiVideoCutover.test.ts src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 5 files / 31 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回の cleanup helper / Pixi video cleanup 由来の新規エラーはなし。

## 2026-06-16 — Phase5: video cutover z-order safety を追加

### 実施内容
- `sharedRendererVideoCutoverStack` を追加し、video cutover 候補より前面に Pixi-only object がある場合は cutover しない契約を TDD で固定した。
  - 前面の `Image` は Pixi-only として blocker にする。
  - 前面の `SolidColour` は shared renderer が描けるため blocker にしない。
  - 前面の `Video` は同じ cutover 候補に含まれる時だけ shared renderer owned とみなす。
- `sharedRendererVideoOwnership` は stack safety で許可された video id だけを `sharedRenderer` owner として返すようにした。
- `sharedRendererPreviewPresenterController` は Rust/WASM video decode request から candidate video id を取り、stack safety を通した id だけを ownership 判定へ渡すようにした。
- package version を `0.1.1-Beta-39a` に更新した。

### 選定理由・判断の根拠
- shared renderer canvas は Pixi 全体の上に重なるため、video だけを shared renderer へ移すと、video より前面にある Pixi-only image / PSD / text などを上書きして見える危険がある。
- actual frame upload を有効化する前に stack safety を ownership gate に入れることで、将来の切替時に z-order 破壊を避けられる。
- SolidColour は既に shared renderer で描けるため、video の前面にあっても同じ shared renderer stack 内で扱える。

### 検証
- `npm test -- src/utils/sharedRendererVideoCutoverStack.test.ts src/utils/sharedRendererVideoOwnership.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/pixiVideoCutover.test.ts`
  - 5 files / 23 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回追加した stack safety / ownership gate 由来の新規エラーはなし。

## 2026-06-16 — Phase5: Pixi video cutover ownership gate を追加

### 実施内容
- `sharedRendererVideoOwnership` を追加し、shared renderer が video ownership を取れる条件を TDD で固定した。
  - `cutoverEnabled`
  - Video scene が存在すること
  - video frame decode request が `rust-wasm` 経路で生成されていること
  - decoded frame の upload path が ready であること
- `sharedRendererPreviewPresenterController` は video ownership を計算し、DOM diagnostics に以下を公開するようにした。
  - `uxfdSharedRendererPresenterVideoOwner`
  - `uxfdSharedRendererPresenterVideoCutoverReason`
  - `uxfdSharedRendererPresenterSharedVideoObjectCount`
- `pixiVideoCutover` を追加し、shared renderer が所有する video object だけ Pixi video 分岐を skip できる判定を TDD で固定した。
- `Viewport` は presenter の `videoOwnership.videoObjectIds` を `updatePixiContent` に渡すようにした。
- `pixiRenderHelper` は cutover 対象 video について、Pixi children、`HTMLVideoElement`、`VideoFrameTextureState` を明示 cleanup してから video 分岐を抜けるようにした。
- package version を `0.1.1-Beta-38a` に更新した。

### 選定理由・判断の根拠
- `VITE_UXFD_SHARED_RENDERER_PREVIEW` だけで Pixi video を消すと、実 decoded frame upload が未実装の段階で動画が消えるため危険。
- `videoFrameUploadReady` を必須条件にすることで、現状では Pixi preview を維持しつつ、将来の sidecar decode -> shared memory -> WebGPU upload が入った時だけ切替できる。
- export は現行 Pixi canvas 経路を読むため、`isExporting === true` では Pixi video を維持する。
- shared renderer canvas は Pixi 全体の上に重なるため、future cutover では z-order parity が残件。今回の gate は ownership と cleanup の配線に留めた。

### 検証
- `npm test -- src/utils/sharedRendererVideoOwnership.test.ts src/utils/pixiVideoCutover.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 4 files / 19 tests passed。
- `npx tsc --noEmit --pretty false`
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足、`heavyEffectsStress.test.ts` の `PositionKeyframe`、`filterStack.test.ts` の fixture 型不整合で失敗。
  - 今回変更した `Viewport` / `pixiRenderHelper` / shared renderer ownership 由来の新規エラーはなし。

## 2026-06-16 — Phase5: video frame decode request と Rust backend 制御プレーンを接続

### 実施内容
- `rust-core` に `video_decode_request` module を追加し、`SceneSnapshot + SceneMediaReference` から
  Video frame decode request set を生成する契約を TDD で固定した。
  - `Video` media のみ抽出。
  - `source_frame` / `timeline_frame` / `source_rate` を integer / rational で保持。
  - output format は `rgba8Srgb`、colour contract は `rec709SrgbFullRange` に固定。
  - Video media の `source_rate` 欠落や `0/x`、`x/0` は fail-loud。
- `rust-core-wasm` に `build_video_frame_decode_requests` binding を追加し、生成済み WASM を更新した。
- `sharedRendererVideoDecodeRequest` と `sharedRendererRustVideoDecodeRequest` を追加し、
  TypeScript fallback と Rust/WASM adapter の両方で `sourceRate` を扱えるようにした。
- `rustSceneSnapshot` は video media reference に project fps 由来の `source_rate` を付けるようにした。
  将来は ffprobe の実 source fps に差し替える。
- `sharedRendererPreviewPresenterController` は Video clip がある時に decode request builder を実行し、
  DOM diagnostics に以下を公開するようにした。
  - `uxfdSharedRendererPresenterVideoDecodeRequestSource`
  - `uxfdSharedRendererPresenterVideoDecodeRequestCount`
- `sidecar-protocol` に `DecodeStartRequest` / `DecodeStartResponse` / `DecodeReleaseFrameRequest` /
  `FrameRate` / `DecodeFrameRequestMode::LatestWins` を追加した。
  - control plane は frame bytes / pixels / base64 を含まない。
  - `decode.start` は `sourceRate` と shared ring layout を扱う。
  - `decode.requestFrame` は `requestId` と `mode=latestWins` を持ち、scrub 時の stale frame 破棄に備える。
- `rust-backend` に `decode.start` / `decode.requestFrame` / `decode.releaseFrame` の JSON-RPC 受け口を追加した。
  - 現段階では実 decode は行わず、ring layout の返却、frame request 受理、GPU copy 完了後 release の受理まで。
- Electron IPC / preload / renderer utility に Rust backend video decode control API を追加した。
- package version を `0.1.1-Beta-37a` に更新した。

### 選定理由・判断の根拠
- `HTMLVideoElement` / `importExternalTexture` はブラウザ暗黙 decode と色変換に依存するため、shared renderer の
  parity source にはしない。正確性経路は Rust/sidecar decoded RGBA -> shared memory / mmap -> WebGPU texture upload とする。
- H.264 の `requestFrame(N)` は O(1) ではないため、API 形に `latestWins` と `requestId` を入れ、
  scrub 中の古い decode 完了を consumer が破棄できるようにした。
- `SharedFrame.ptsFrame` / `requestId` / `generation` を照合し、ready slot の順序だけに依存しない方針にした。
- 実 pixel decode / shared memory 実装へ進む前に、control plane が frame bytes を載せないことを test で固定した。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml`
  - 32 tests passed。
- `cargo check --manifest-path rust-core-wasm/Cargo.toml`
  - passed。
- `npm run wasm:build:rust-core`
  - passed。
- Node `initSync` で生成済み WASM を直接呼び、`request_count=1` と
  `source_rate={ numerator: 60, denominator: 1 }` を確認した。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml`
  - 25 tests passed。
- `cargo test --manifest-path rust-backend/Cargo.toml`
  - 3 integration tests passed。
- `npm test -- src/utils/sharedRendererVideoDecodeRequest.test.ts src/utils/sharedRendererRustVideoDecodeRequest.test.ts src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/rustBackendVideoDecodeControl.test.ts`
  - 6 files / 25 tests passed。

## 2026-06-16 — Phase5: video plane geometry を Rust/WASM に接続

### 実施内容
- `rust-core` に `video_plane_scene` module を追加し、`SceneSnapshot + SceneMediaReference + CanvasSize` から
  Video plane metadata と WebGPU 用 vertex buffer を生成する契約を TDD で固定した。
  - `Video` media のみ抽出。
  - `clip_id` / `media_id` / `source_frame` / `z_index` / `opacity` を plane metadata として保持。
  - texture UV と opacity を含む vertex 配列を生成。
- `rust-core-wasm` に `build_video_plane_vertex_scene` binding を追加し、生成済み WASM を更新した。
- `sharedRendererVideoPlaneScene` を追加し、Rust/WASM が使えない時の TypeScript fallback を用意した。
- `sharedRendererRustVideoPlaneScene` を追加し、WASM の snake_case 結果を TS の video plane scene contract へ正規化した。
- `sharedRendererPreviewPresenterController` は Video clip がある時に Rust/WASM video plane builder を実行し、
  DOM diagnostics に `uxfdSharedRendererPresenterVideoGeometrySource` を公開するようにした。
- package version を `0.1.1-Beta-36a` に更新した。

### 選定理由・判断の根拠
- 動画は decode / 色変換 / frame accuracy / GPU external texture の論点が重いため、まず video plane の
  scene geometry と source frame metadata を Rust/WASM へ移した。
- これにより、動画読み込み readiness と GPU sampling に入る前に、Rust/WASM 呼び出し・fallback・diagnostics の
  境界を確認できる。
- この段階では動画フレームの実描画はまだ Pixi / HTMLVideoElement 経路であり、Rust は動画平面の geometry と
  metadata 生成までを担当する。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml --test video_plane_scene`
  - 2 tests passed。
- `cargo test --manifest-path rust-core/Cargo.toml`
  - 30 tests passed。
- `cargo check --manifest-path rust-core-wasm/Cargo.toml`
  - passed。
- `npm run wasm:build:rust-core`
  - passed。
- Node `initSync` で生成済み WASM を直接呼び、`plane_count=1`, `source_frame=90`,
  先頭 vertex `[-0.989583313, 0.962962985, 0, 0, 0.75, 1, 0, 1]` を確認した。
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererRustVideoPlaneScene.test.ts src/utils/sharedRendererVideoPlaneScene.test.ts`
  - 4 files / 14 tests passed。

## 2026-06-16 — Phase5: solid rectangle 図形の vertex 生成を Rust/WASM に接続

### 実施内容
- `rust-core` に `solid_colour_scene` module を追加し、`SceneSnapshot + SceneMediaReference + CanvasSize` から
  SolidColour draw list と WebGPU 用 vertex buffer を生成する契約を TDD で固定した。
  - `#rrggbb` colour source の parse。
  - clip opacity を掛けた premultiplied colour の生成。
  - canvas pixel 座標から clip-space 座標への変換。
- `rust-core-wasm` crate を追加し、`build_solid_colour_vertex_scene` を browser から呼べる WASM binding として生成した。
- `sharedRendererWebGpuPresenter` は、自前で矩形 geometry を作るのではなく、生成済み SolidColour vertices を受け取って
  GPU buffer に upload する形へ変更した。
- `sharedRendererPreviewPresenterController` は SolidColour clip がある時だけ Rust/WASM builder を読み込み、
  WASM 読み込みに失敗した場合は TypeScript fallback を使う。
- DOM diagnostics に `uxfdSharedRendererPresenterGeometrySource` を追加し、図形 vertex 生成が `rust-wasm` か
  `typescript` fallback かを確認できるようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-35a` に更新し、`wasm:build:rust-core` script を追加した。

### 選定理由・判断の根拠
- 動画の前に図形を Rust 化する方針に合わせ、まず失敗時の影響が小さい solid rectangle を Rust/WASM 境界の縦スライスにした。
- GPU command 発行はまだ TypeScript/WebGPU に残し、geometry / colour / vertex 生成だけを Rust に寄せた。
  これにより、次の動画 gate へ進む前に Rust/WASM 呼び出し、fallback、presenter 受け口を確認できる。
- controller では TS draw list 生成を事前判定から外し、SolidColour clip の有無だけを見るようにした。
  実際の colour parse と vertex 生成は Rust/WASM builder へ寄せる。

### 検証
- `cargo test --manifest-path rust-core/Cargo.toml`
  - 28 tests passed。
- `cargo check --manifest-path rust-core-wasm/Cargo.toml`
  - passed。
- `wasm-pack build rust-core-wasm --target web --out-dir ../src/wasm/rust-core --out-name uxfd_rust_core_wasm`
  - passed。
- Node `initSync` で生成済み WASM を直接呼び、`rect_count=1` と先頭 vertex `[-0.6875, 0.777777791, 0.5, 0, 0, 0.5]` を確認した。
- `npm test -- src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererRustSolidColourScene.test.ts src/utils/sharedRendererSolidColourScene.test.ts`
  - 4 files / 23 tests passed。
- ブラウザ確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - 図形追加後に `presenterStatus=ready`, `presenterSwatch=solid-colour-scene`,
    `geometrySource=rust-wasm`, `presenterFormat=bgra8unorm`。
  - console error は 0 件。通常起動では CSS reference swatch も表示されない。

## 2026-06-16 — Phase5: shared renderer overlay が動画を隠す不具合を修正

### 実施内容
- shared renderer preview 有効時、SolidColour scene が無い場合に診断用の青い swatch を全面描画していた挙動を修正した。
  - 通常 preview では transparent clear を描き、Pixi preview をパススルーする。
  - 診断 swatch / 左上 CSS reference swatch は `VITE_UXFD_SHARED_RENDERER_DIAGNOSTIC_SWATCH=1` の時だけ表示する。
- `presentSolidColourScene` は rect が 0 件でも transparent clear pass を実行するようにした。
- package version を `0.1.1-Beta-34b` に更新した。

### 選定理由・判断の根拠
- ユーザー実機で「GoPro 動画が Rectangle と一緒に TL にいないと表示されない」「左上に謎の青い刺客がいる」と報告。
  原因は shared renderer overlay が Pixi の上に乗り、動画だけの scene では診断 swatch が動画を覆っていたため。
- shared renderer がまだ描けない video / image / unsupported content は、Pixi fallback を見せるのが正しい。

### 検証
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts`
  - 3 files / 17 tests passed。
- `npx tsc --noEmit`
  - shared renderer / Viewport 由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- ブラウザ確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - `presenterStatus=ready`, `presenterFormat=bgra8unorm`, `presenterSwatch=pixi-passthrough`, `surfaceGate=ok`。
  - `data-shared-renderer-css-reference-swatch` は存在せず、console error は 0 件。

## 2026-06-16 — Phase5: shared renderer video media readiness 診断を追加

### 実施内容
- `sharedRendererVideoMediaReadiness` を追加し、`SceneSnapshot` の `Video` media reference と既存 preview の
  `HTMLVideoElement` を照合して、`ready` / `pending` / `missingElement` を診断できるようにした。
- `Viewport` から `window.__UXFD_SHARED_RENDERER_VIDEO_MEDIA_READINESS__` と DOM dataset に以下を公開した。
  - `uxfdSharedRendererVideoReadyCount`
  - `uxfdSharedRendererVideoPendingCount`
  - `uxfdSharedRendererVideoMissingCount`
- `renderScene` 後にも shared renderer preview session を publish し、Pixi 側が video element を作った後の readiness が
  shared renderer diagnostics に反映されるようにした。
- package version を `0.1.1-Beta-34a` に更新した。

### 選定理由・判断の根拠
- 動画はいきなり WebGPU external texture に進まず、まず既存 preview loader が video element を作り、
  current frame data を持っているかを shared renderer 側から観測できる gate にした。
- これにより、次の external texture 実装で「動画が読めていない」のか「GPU import / sampling が壊れている」のかを分離できる。
- Claude レビュー反映:
  HTMLVideoElement / `importExternalTexture` はブラウザの暗黙 YUV→RGB と float 秒 seek に依存するため、
  「動画を読み込める preview」と「preview/export parity が保証された動画」は別物として扱う。次の visible slice では
  動画表示を許可しても、色・フレーム正確性は parity 未検証として明示し、known clip で preview decode と export/sidecar decode を
  比較する gate を外さない。

### 検証
- `npm test -- src/utils/sharedRendererVideoMediaReadiness.test.ts src/utils/sharedRendererPresenterSessionKey.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts`
  - 3 files / 9 tests passed。
- `npx tsc --noEmit`
  - shared renderer / Viewport / video readiness 由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- in-app Browser では file chooser へローカル動画をセットする API が見えていないため、動画 upload 後の実ブラウザ確認は未実施。
  repo 内には `perf/heavy-media/*.mp4` があるため、次は手動または別ブラウザ制御で upload 実確認を行う。

## 2026-06-16 — Phase5: shared renderer で矩形 shape を表示

### 実施内容
- `SceneSnapshot` bridge で `shapeType: "rect"` かつ gradient 無しの shape を `SolidColour` plane として許可した。
  - `media.kind` に `SolidColour` を追加。
  - `source` は `#rrggbb`、`width` / `height` は shape の矩形サイズを保持。
  - 円・丸角・グラデーションなどは `unsupportedShapeGeometry` として fail-loud のまま。
- `rust-core` schema に `MediaKind::SolidColour` / `ClipKind::SolidColourPlane` を追加し、
  timeline snapshot contract で serialise / evaluate を固定した。
- `sharedRendererSolidColourScene` を追加し、`SceneSnapshot + media` から premultiplied な矩形 draw list を生成する契約を固定した。
- WebGPU presenter に SolidColour rect 用の最小 vertex pipeline を追加した。
  - transparent clear の上に triangle-list で矩形を描く。
  - SolidColour rect が存在する session では diagnostic swatch ではなく scene content を描く。
- package version を `0.1.1-Beta-33a` に更新した。

### 選定理由・判断の根拠
- shape を無理に動画/画像 media として扱わず、`SolidColour` media として境界に入れた理由:
  既存の `media_id` / `source_frame` 契約を崩さず、最初の「置いた図形が shared renderer に出る」体験を最小変更で作れるため。
- `rect` のみ許可した理由:
  circle / rounded rect / polygon / gradient は geometry・coverage・anti-aliasing の parity 論点を持つ。最初の遊べるラインでは
  1枚の solid rectangle に絞り、WebGPU pipeline と React/Timeline 連動を先に証明する。

### 検証
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/rustSceneSnapshotBoundary.test.ts src/utils/sharedRendererPreviewBridge.test.ts src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererPreviewDiagnostics.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererPresentationContract.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererSolidColourScene.test.ts`
  - 11 files / 44 tests passed。
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract`
  - 5 tests passed。
- `npx tsc --noEmit`
  - shared renderer / rustSceneSnapshot / Viewport 由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- ブラウザ実機確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - UI から「図形の形」を追加後、`presenterStatus=ready`, `presenterFormat=bgra8unorm`,
    `presenterSwatch=solid-colour-scene`, `surfaceGate=ok`。
  - console error は 0 件。
  - スクリーンショット上の shape 中心サンプルは RGBA `(218,0,0,255)`、shape 外側は `(35,35,35,255)` で、
    shared renderer canvas 上に矩形 scene が出ていることを確認。
  - 途中で presenter session key が canvas contract のみを見ており shape 追加で再描画されない不具合を検出。
    `buildSharedRendererPresenterSessionKey` を追加し、clips/media を key に含めて修正。

## 2026-06-16 — Phase5: shared renderer presenter を Viewport に接続

### 実施内容
- `sharedRendererPresenterDiagnostics` を追加し、WebGPU presenter の `ready` / `fallback` / `deviceLost` 状態を
  DOM dataset に公開する契約を TDD で固定した。
- `sharedRendererPreviewPresenterController` を追加し、surface gate が OK のときだけ WebGPU presenter を作成し、
  `solid-srgb` swatch を clear pass で表示、失敗時は Pixi fallback 診断へ戻す接続契約を TDD で固定した。
- `Viewport` の shared renderer preview canvas に presenter controller を接続した。
  - `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` のときだけ動作する。
  - canvas session key は surface gate と canvas presentation contract で安定化し、毎フレームの再初期化を避ける。
  - device lost は stale shared frame を許可せず、DOM dataset 上で Pixi fallback として見える。
- P3 Mac での目視 close 用に、同じ solid swatch 定数から生成した CSS sRGB reference swatch を preview 上に重ねた。
  実機では canvas 面と CSS reference の境界が同色に見えることを確認する。
- package version を `0.1.1-Beta-32a` に更新した。

### 選定理由・判断の根拠
- React component 直書きではなく controller に切り出した理由:
  WebGPU presenter の生成・swatch present・fallback 診断の順序を DOM 非依存でテストでき、以後 shader/pipeline に
  置き換える時も `Viewport` 側の差分を小さく保てるため。
- 初回表示を solid swatch に限定した理由:
  P3 Mac 上の canvas presentation 色管理だけを先に切り分けるため。SceneSnapshot の本描画や offscreen readback は
  後続 gate で追加する。
- CSS reference swatch を同時表示する理由:
  スクリーンショット RGBA は physical P3 display 上の見えを証明しない。canvas と CSS の同一 sRGB 色を実機で
  並べて見ることで、`colorSpace: "srgb"` が wide-gamut panel 上でも正しく扱われているかを切り分ける。

### 検証
- `npm test -- src/utils/sharedRendererPresenterDiagnostics.test.ts src/utils/sharedRendererPreviewPresenterController.test.ts src/utils/sharedRendererWebGpuPresenter.test.ts src/utils/sharedRendererPreviewSession.test.ts src/utils/sharedRendererPresentationContract.test.ts`
  - 5 files / 17 tests passed。
- `npx tsc --noEmit`
  - shared renderer / Viewport 接続由来の新規エラーなし。
  - 既存残件として `ThreeStageViewport.tsx` の `three` 型定義不足などは継続。
- ブラウザ実機確認（`VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174`）:
  - `planMode=parallelCompare`, `surfaceGate=ok`, `canvasColourSpace=srgb`, `canvasAlphaMode=premultiplied`。
  - `presenterStatus=ready`, `presenterFormat=bgra8unorm`, `presenterSwatch=solid-srgb`。
  - canvas backing size は 1920x1080、表示は visible、pointer events は none、console error は 0 件。
  - スクリーンショット上の preview 中央/四分点サンプルは RGBA `(67,115,179,255)` で、solid swatch の表示を確認。
  - DOMStringMap では `dataset.foo = undefined` が文字列 `"undefined"` になるため、不要診断キーは `delete` する契約へ修正。
  - 注意: 上記 RGBA は buffer/capture 経路の確認であり、P3 実機 close ではない。P3 close は CSS reference swatch との
    side-by-side 目視確認で行う。
  - CSS reference swatch 追加後のブラウザ確認:
    - reference background は `rgb(64, 128, 191)`。
    - スクリーンショット上の CSS reference 中央 / canvas 中央 / reference 右隣 canvas はいずれも
      RGBA `(89,127,189,255)`。capture 経路上の side-by-side 差はなく、P3 実機目視 gate の配置は完了。

## 2026-06-16 — vNext（Rust/wgpu 移行）アーキテクチャ方針の確定（Codex と協議）

調査・設計のみのセッション。コード変更なし。Codex（dev チーム）と agmsg 経由で大規模アーキテクチャ
移行計画をレビュー・往復し、方針を確定。設計文書の正本は `markdown/architecture/` 配下（Codex が作成）に
置き、ここには**判断の根拠と協議で潰した論点**を残す。

### 確定した方針
- **層構成**: Electron/React を薄い UI シェルに、`rust-core` を編集状態・時間評価・フィルタ仕様・
  音声時間評価・色空間メタの**正本**に、`wgpu+WGSL` の**単一レンダラ**を WASM/WebGPU プレビューと
  native 書き出しで共有、危険な ffmpeg/メディア処理は**別プロセス sidecar に隔離**。
- **3 前提**: ①レンダラは wgpu で一本化（parity を構造で保証）②ffmpeg/デコードは別プロセス隔離
  （クラッシュドメイン分離）③golden-frame parity テスト土台を移行の前に作る。
- **Electron 維持**: WebGPU 挙動の OS 横断一貫性のため Chromium 同梱が必須。Tauri は WKWebView の
  WebGPU 未成熟のため不採用。
- **境界技術**: 制御プレーン（小・安全）は napi-rs 可、データプレーン（巨大フレーム）は別プロセス＋
  **共有メモリ/mmap**。JSON/base64 でフレームを流さない。
- **書き出しレンダラ**: 既定 (A)wgpu-native。parity 許容超過時のみ (B)Dawn-native へ。
  (C)headless Chromium は本経路に採らない（GPU 不安定・速度死）。
- **色/YUV**: 初期は RGBA 出力＋ffmpeg(**zscale で色空間/レンジ/primaries 明示**)。shader-YUV 化は
  後続最適化（HDR 狙いの時のみ前倒し）。**合成色空間は linear 光で決め打ち**（最大の後戻り不能点）。

### MVP スコープ（厳しく削る）
- MVP の目的は「使える編集機能」ではなく**「アーキテクチャが崩れない証明」**＝危険な境界を 1 回ずつ
  通す最薄の縦スライス。
- **絶対に入れない**: 滑らかな再生（real-time playback）と音声。過去に UXFD がネイティブ/Electron 両方で
  溺れた沼であり、かつ parity・境界の証明には不要。
- 入れる: 1 トラック 1 クリップ 1 keyframe / 1 動画平面＋1 画像＋1 エフェクト / スクラブ to frame の
  WebGPU プレビュー / 同一 timeline の wgpu-native 書き出し / golden 比較 / sidecar デコード（CPU 共有メモリ）。

### 選定理由・判断の根拠
- **wgpu 一本化**: プレビュー（wasm/WebGPU）と書き出し（native+ffmpeg フィルタ）を別実装にすると
  "What You See Is Not What You Render" を設計段階で組み込むことになるため。ffmpeg は decode/encode/mux に縮小。
- **sidecar 隔離**: libav は壊れた HEVC で普通に segfault する。最も落ちる処理を最も落ちてはいけない
  プロセス（UI 本体）に napi で同居させない。
- **linear 光合成を先決**: エフェクトを sRGB 合成前提で作って後で linear に変えると全エフェクトが壊れ、
  後戻り不能度が YUV の置き場所より高い。
- **却下案**: Tauri（WKWebView WebGPU 未成熟）/ ffmpeg フィルタ合成（parity 断層）/ 単一プロセス napi
  （クラッシュ結合）/ プレビューと書き出しの別レンダラ 2 実装。

### 過小評価されがちなリスク（初期計画に織り込む）
- カラーマネジメント（HDR/10bit/広色域）、音声同期、VFR（PTS ドリフト）、クロスプラットフォーム決定性
  （golden は許容誤差 SSIM/PSNR ベース）、実時間スケジューリング、4K フレームのバッファ/メモリ管理
  （wasm 4GB 制限、SharedArrayBuffer に COOP/COEP 必須）、CI マトリクス爆発。

### 設計文書（成果物・Codex が作成、本セッションで合意）
- `markdown/architecture/` に 00-overview / 01-decision-record(ADR) / 02-rust-core-spec / 03-colour-pipeline /
  04-render-parity / 05-boundary-ipc、＋ `markdown/roadmap.md`。
- **正本の分担**: 振る舞い＝02-rust-core-spec＋テスト、"なぜ"＝01-ADR、各事実の home は 00 の SSoT 表。
  コードは正本にしない。

### レビューで潰した重要論点（Claude 指摘 → 文書反映）
- **後戻り不能な未決定3点を Phase1 前に確定**: ①時間表現は float 秒を正本にせず整数 frame index /
  rational time base（29.97 等の drift 回避）②合成は premultiplied alpha・linear light ③linear 中間は
  `rgba16float` 既定（8bit linear のバンディング回避）。
- **parity の divergence 源を名指し**: preview(Dawn/Tint) と export(wgpu-native/Naga) で WGSL→MSL 翻訳器が
  別物。完全一致でなく許容誤差 golden を正本にし、原因分類に翻訳器差を含める。
- **入力側 parity を追加**: 画像・動画を preview/export で別 decode せず、sidecar/Rust の単一経路で
  decoded RGBA＋色 metadata を両レンダラへ供給（＝レンダラ一本化の入力版）。入力側の YUV→RGB / range /
  transfer も自動推測に依存しない契約に。
- **初回 parity gate の純化**: source=canvas 同一解像度・transform identity・1:1・no-resample で、色の正しさと
  sampling 差を交絡させない。scale/rotation/filtering は後続 gate。
- **MVP の1エフェクト＝per-pixel gain/exposure**（blur 等 sampling 系は後回し）。YUV round-trip は 4:4:4 で
  数学検証、4:2:0 は lossy 別許容。閾値は known-correct の noise floor＋margin で導出。

### 残課題・次のステップ
- **Phase1（rust-core）は着手可**＝project model の serialize round-trip test（Red）から開始。机上の詰めは
  収穫逓減で、残る未決は spike が答えを出すフェーズへ。
- 実データ待ちの判断: 初期許容誤差の具体値 / `rgba16float` の perf / VideoToolbox セッション競合の解消可否
  （sidecar 隔離で改善するか別スパイク）/ Naga・Tint 差の実測量。
- 解消済みの前提: Windows は準対応＝スモークのみ（厳密 golden は macOS/Metal に集約）。HDR は MVP 対象外
  （SDR/Rec.709、メタのみ保持）。音声は仕様定義のみで実装は後続。
- rust-core の厳密一致テストは no fast-math / FMA 再順序化前提。

## 2026-06-16 — Phase1: rust-core project model round-trip の TDD 着手

### Red
- `rust-core` crate の最小骨格を追加し、`tests/project_model_round_trip.rs` に project model の round-trip 期待テストを書いた。
- 期待 API として `Project` / `Fps` / `ProjectSize` / `ColourPipeline` / `MediaReference` / `Track` / `Clip` を先に固定した。
- `Fps` は `numerator` / `denominator` を持ち、serialised form に float 秒を含めないことをテストした。
- `cargo test --manifest-path rust-core/Cargo.toml` は未定義型で失敗し、Red を確認した。

### Green
- `serde` 対応の最小 schema を実装し、project model の `load -> save -> load` identity を通した。
- `ColourPipeline::rec709_sdr_linear()` は `rec709-sdr` / `linear-light` / `premultiplied` を返す最小実装にした。

### Refactor
- schema 定義を `rust-core/src/schema.rs` に分離し、`src/lib.rs` から再 export する構成に整理した。
- `rust-core/.gitignore` を追加し、`target/` を成果物から除外した。

### 確認結果
- `cargo test --manifest-path rust-core/Cargo.toml`
- 結果: 2 tests passed。

## 2026-06-16 — Phase1: timeline / keyframe / validation の TDD 拡張

### Timeline Evaluation
- Red: `tests/timeline_evaluation.rs` を追加し、clip の有効区間を `[start_frame, start_frame + duration_frames)` として固定した。
- Green: `evaluate_frame` / `SceneSnapshot` / `EvaluatedClip` を実装し、開始 frame、終了直前 frame、終了 frame、ゼロ duration の挙動を通した。
- Refactor: `clip_contains_frame` を切り出し、半開区間の判定を明示した。

### Keyframe Evaluation
- Red: `tests/keyframe_evaluation.rs` を追加し、opacity keyframe を clip-local `frame_offset` として評価する契約を固定した。
- Green: `ScalarKeyframe` と `opacity_keyframes` を schema に追加し、timeline evaluation の opacity に線形補間を反映した。
- Refactor: 補間処理を `src/keyframe.rs` に分離した。

### Validation
- Red: `tests/project_validation.rs` を追加し、不正 FPS、media 参照欠落、重複 ID、非有限 opacity を拒否する契約を固定した。
- Green: `validate_project` / `ValidationCode` / `ValidationIssue` を実装した。
- Refactor: ID 検証を `record_id` に切り出し、重複検出の重複を減らした。

### Property-based Test
- Red: `tests/keyframe_properties.rs` を追加し、`proptest` 未導入で失敗することを確認した。
- Green: `proptest` を dev dependency に追加し、2 keyframe 間の補間が有限値で端点範囲内に収まることを property test で確認した。
- 調整: `f32` 丸め誤差を踏んだため、範囲チェックに `1.0e-5` の許容を設け、proptest の failure persistence を無効化して CI で regression file を生成しないようにした。

### 確認結果
- `cargo test --manifest-path rust-core/Cargo.toml`
- 結果: 14 tests passed。

## 2026-06-16 — Phase1: command / snapshot contract / effect schema の TDD 拡張

### Command / Undo
- Red: `tests/command_undo.rs` を追加し、`SetClipOpacity` の do / undo / redo 契約を固定した。
- Green: `src/command.rs` を追加し、入力 `Project` を破壊せず新しい `Project` と undo command を返す最小実装にした。
- Validation: 存在しない clip は `ClipNotFound`、NaN opacity など適用後に不正となる command は `ValidationFailed` で拒否する。

### Timeline Snapshot Contract
- Red: `tests/timeline_snapshot_contract.rs` を追加し、renderer 境界として scene snapshot が `colour` metadata と clip `transform` を持つことを固定した。
- Green: `Transform` を schema に追加し、`evaluate_frame` の `SceneSnapshot` / `EvaluatedClip` に colour と transform を流すようにした。
- Validation: transform の NaN / infinite を `NonFiniteNumber` として拒否する。

### Effect Schema
- Red: MVP effect として `Effect::LinearGain { gain }` を clip に持たせ、evaluated clip にそのまま渡す契約を追加した。
- Green: `effects: Vec<Effect>` を schema と snapshot に追加し、`LinearGain` の非有限 gain を validation で拒否した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml`
- 結果: 22 tests passed。

## 2026-06-16 — Phase2: golden-harness RGBA 比較土台の TDD 着手

### Red
- `golden-harness` crate を追加し、`tests/rgba_compare.rs` に同一 RGBA frame の pass、channel delta の fail、寸法不一致の fail を先に書いた。
- SSIM 追加前に、`FrameMetrics.ssim` / `ComparisonThresholds.min_ssim` / `DifferenceCause::StructuralSimilarity` の未定義で Red を確認した。

### Green
- `RgbaFrame` / `compare_rgba_frames` / `ComparisonThresholds` / `FrameMetrics` / `DifferenceCause` を実装した。
- 指標は最大 channel 差、平均絶対誤差、PSNR、global SSIM。
- 失敗原因は `DimensionMismatch` / `PixelValueDelta` / `MeanAbsoluteError` / `PsnrBelowThreshold` / `StructuralSimilarity` に分類する。

### Refactor
- fixture IO や PNG 依存はまだ入れず、RGBA8 メモリ比較の純粋ロジックだけに閉じた。
- `markdown/architecture/04-render-parity.md` と `markdown/roadmap.md` を現状の harness 契約に更新した。

### 確認結果
- `cargo fmt --manifest-path golden-harness/Cargo.toml`
- `cargo test --manifest-path golden-harness/Cargo.toml`
- 結果: 5 tests passed。

## 2026-06-16 — Phase2: PNG fixture IO と CPU reference renderer の TDD 拡張

### PNG Fixture IO
- Red: `golden-harness/tests/png_fixture_io.rs` を追加し、RGBA PNG の保存・読込 round-trip と missing fixture の IO error を固定した。
- Green: `png` crate を導入し、`save_rgba_png` / `load_rgba_png` を実装した。
- Red: indexed PNG の palette / transparency が RGBA8 に展開される test を追加し、未正規化の読込で失敗することを確認した。
- Green: `png::Transformations::normalize_to_color8()` を読込に適用し、palette / indexed / grayscale / 16bit 系入力を比較前に 8bit colour へ正規化するようにした。

### CPU Reference Renderer
- Red: `reference-renderer` crate を追加し、`rust-core` の `SceneSnapshot` と media id -> `RgbaFrame` map から解析的 reference frame を生成する契約を test 化した。
- Green: 初回 parity gate 用に、source=canvas 同一解像度、identity transform、no resampling の CPU renderer を実装した。
- 合成: linear light sample、premultiplied alpha の source-over、`Effect::LinearGain` を premultiply 前の RGB に適用。
- Error: missing source と source/canvas size mismatch を明示的に返す。

### 文書更新
- `markdown/architecture/04-render-parity.md` に PNG 正規化と `reference-renderer` の役割を追記した。
- `markdown/roadmap.md` の Phase2 タスクに PNG fixture IO と CPU reference renderer を追加した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo fmt --manifest-path golden-harness/Cargo.toml`
- `cargo fmt --manifest-path reference-renderer/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml` -> 22 tests passed。
- `cargo test --manifest-path golden-harness/Cargo.toml` -> 8 tests passed。
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> 4 tests passed。

## 2026-06-16 — Phase3a: native wgpu 単独 parity spike の TDD 着手

### Claude レビュー反映
- 現行 Pixi characterization golden は後回しにし、先に Phase3a として native wgpu 単独で解析的 reference と比較する方針にした。
- 理由: WebGPU preview / native export の二経路比較を先に始めると、不一致時に renderer math の誤りと経路差を切り分けづらいため。
- `markdown/architecture/04-render-parity.md` と `markdown/roadmap.md` を Phase3a / Phase3b の 2 段構成に更新した。

### Red
- `native-wgpu-renderer` crate を追加し、`tests/native_reference_parity.rs` で `SceneSnapshot` + RGBA sources を native wgpu で描画し、CPU reference と比較する期待を先に固定した。
- 未定義の `render_native_wgpu_frame` / `NativeWgpuRenderError` と未導入 `pollster` で Red を確認した。

### Green
- `wgpu` / `half` / `bytemuck` / `pollster` を導入した。
- offscreen native wgpu renderer を実装し、`rgba16float` render target に premultiplied alpha の source-over で合成するようにした。
- source texture は `Rgba8Unorm` とし、shader 側で `textureLoad` により 1:1 no-resample で取得する。
- readback 後は CPU reference と同じ規則（clamp -> `value * 255.0` -> `round()`）で straight RGBA8 に変換する。
- 初回 gate は identity transform のみ対応し、CPU reference との比較は max channel delta を主判定にした。

### 確認結果
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml`
- 結果: 1 test passed。
- 併せて `rust-core` 22 tests、`golden-harness` 8 tests、`reference-renderer` 4 tests も再確認済み。

## 2026-06-16 — Phase3a: sRGB 入力契約と oracle の解析アンカー修正

### Claude レビュー反映
- Claude から「oracle の正しさを誰が保証するか」「PNG byte を linear sample と見なす曖昧さ」を赤信号として指摘された。
- これを受け、PNG / RGBA8 入力は sRGB encoded とし、合成前に linear light へ decode、出力比較時に sRGB encode する契約へ修正した。

### Red
- `reference-renderer/tests/solid_scene.rs` の期待値を、sRGB decode -> linear 合成 -> sRGB encode の手計算値に変更した。
- 赤 50% over 青は `[128, 0, 128, 255]` ではなく `[188, 0, 188, 255]`。
- `[255, 128, 0]` に `LinearGain { gain: 0.5 }` を適用する case は `[188, 92, 0, 255]`。
- 旧実装は encoded byte 値のまま計算していたため Red を確認した。

### Green
- `reference-renderer` に sRGB -> linear decode と linear -> sRGB encode を追加した。
- `native-wgpu-renderer` の WGSL shader に sRGB decode を追加し、readback 後の RGBA8 化でも sRGB encode を行うようにした。
- native wgpu と CPU reference の parity test を Green に戻した。
- 追加アンカー: white 50% over black の手計算値 `[188, 188, 188, 255]` を CPU reference と native wgpu の両方で確認した。
- さらに opacity 0.25、source alpha 128 × clip opacity 0.5、gain 2.0 clamp、2 pixel 座標写像の判別ケースを追加した。

### 文書更新
- `markdown/architecture/03-colour-pipeline.md` に MVP の演算順序を正本として追記した。
- `markdown/architecture/04-render-parity.md` の Phase3a 量子化規則にも sRGB decode / encode を追記した。

### 確認結果
- `cargo test --manifest-path rust-core/Cargo.toml` -> 22 tests passed。
- `cargo test --manifest-path golden-harness/Cargo.toml` -> 8 tests passed。
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> 9 tests passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> 6 tests passed。

## 2026-06-16 — Phase3b: WebGPU preview harness の実測

### Claude レビュー反映
- Phase3b 前に、共有 WGSL、plain `rgba8unorm` + 手動 sRGB decode、`rgba16float` render target、readback 後 CPU encode / quantise の 4 点を固定した。
- WGSL は `shared-renderer/shaders/solid_composite.wgsl` の単一ソースに移し、native wgpu と WebGPU harness の両方から読む構成にした。

### WebGPU Harness
- `phase3b-webgpu-harness/` を追加した。
- local HTTP server 経由で Chrome 149 / WebGPU を起動し、Phase3a と同じ 6 つの hand anchor case を描画した。
- source texture は `rgba8unorm`、render target は `rgba16float`、sRGB decode は共有 WGSL、sRGB encode と `round()` は JS 側 readback 後に実行した。

### 実測結果
- 実行 URL: `http://127.0.0.1:4177/phase3b-webgpu-harness/`
- Adapter: `vendor=apple` / `architecture=metal-3` / `isFallbackAdapter=false`。
- red 50% over blue: `maxDelta = 0`
- white 50% over black: `maxDelta = 0`
- white 25% over black: `maxDelta = 0`
- source alpha × clip opacity: `maxDelta = 0`
- gain above one clamp: `maxDelta = 0`
- 2 pixel coordinate mapping: `maxDelta = 0`
- すべて `meanAbsoluteError = 0`。

### 追加確認
- `?perturb=red-plus` で共有 WGSL 読込後の shader に red channel 加算を入れ、期待通り RED になることを確認した。
- これにより、WebGPU harness が GPU output を実際に readback / compare していることを確認した。
- Claude レビューで `3b verified GO` として扱ってよいと確認された。
- この GO は per-pixel 合成の範囲に限定する。blur / scale / rotate など sampling 系は後続 gate で検証する。

## 2026-06-16 — Phase4: sidecar ring buffer / back pressure contract の TDD 着手

### Red
- `sidecar-protocol/tests/ring_buffer.rs` を追加し、共有フレーム ring の layout、slot 状態遷移、producer back pressure、consumer empty ring の契約を先に固定した。
- 期待 API として `FrameRingLayout` / `SharedFrameRing` / `SlotState` / `AcquireWriteError` / `AcquireReadError` を置いた。
- 未定義 API により `cargo test --manifest-path sidecar-protocol/Cargo.toml` が失敗し、Red を確認した。

### Green
- `sidecar-protocol` に OS 非依存の純粋な ring buffer state machine を実装した。
- slot 状態は `free -> writing -> ready -> reading -> free` とした。
- producer は `free` slot がない場合 `NoFreeSlot` を返し、consumer は `ready` slot がない場合 `NoReadySlot` を返す。
- `FrameRingLayout` は `memoryId`、slot 数、slot byte length、解像度、stride、format、colour metadata から各 `FrameDescriptor` を導出する。
- frame bytes は protocol object に載せず、`SharedFrame` は descriptor と `ptsFrame` のみを持つ契約を維持した。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に ring layout、状態遷移、所有権、back pressure の初期契約を追記した。
- checksum / pixel diff schema と実共有メモリ API は未決として残した。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml`
- 結果: 6 tests passed。

### Claude レビュー反映
- Claude から、共有メモリ ring contract の MVP blocker として以下の指摘を受けた。
  - Apple Silicon では plain load/store の slot state だと `ready` が見えても bytes が未可視化の torn frame が起きうる。
  - `reading -> free` を GPU upload 完了前に行うと、producer が上書きして renderer が読みかけの frame を壊す。
- Red: `reading_slot_is_not_freed_until_copy_out_completion_is_signalled` と `synchronisation_contract_requires_release_acquire_slot_state` を追加した。
- Green: `CopyOutState` / `RingSynchronisationContract` / `SlotStateStorage::AtomicU32` / `AtomicOrdering::{Release, Acquire}` を追加した。
- `release_read_slot` は `CopyOutState::GpuUploadFenceSignalled` が渡されるまで slot を `free` に戻さない契約に変更した。
- stride padding と colour metadata の退行防止として `layout_preserves_padded_stride_and_colour_metadata` を追加した。
- `markdown/architecture/05-boundary-ipc.md` に SPSC、atomic release/acquire、GPU upload fence、preview/export の独立 ring、back pressure policy、stuck slot の未決を追記した。

### 再確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml`
- 結果: 7 tests passed。
- Perturbation: `?perturb=red-plus` で shader の red channel を意図的に壊し、5/6 ケースが RED になることを確認した。gain clamp case は saturate して差が出ないため pass のまま。

### 確認結果
- `node --check phase3b-webgpu-harness/phase3b.js`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> 6 tests passed。

## 2026-06-16 — Phase4: checksum schema と既知 CFR H.264 decode correctness spike

### Claude レビュー反映
- Claude から、decode spike の目的は `preview == export` の同語反復ではなく、既知入力に対する
  decode -> colour conversion -> descriptor の正しさ確認に置くべきと指摘された。
- そのため、テスト素材は中身が既知の CFR H.264 をテスト中に生成し、期待 RGBA と decoded RGBA を比較する方針にした。
- 追加レビューで、grayscale ramp は luma 経路だけを確認する identity gate になり、YUV matrix の chroma 項を炙れないと指摘された。
- Red として pure R / G / B、orange、teal を含むことを test に追加し、grayscale 実装で失敗することを確認した。
- Green として既知フレームを 32x16 colour swatch に差し替え、x264 VUI / ffprobe metadata で
  `primaries=bt709`、`matrix=bt709`、`range=pc`、`transfer=iec61966-2-1` を明示した。
- `markdown/architecture/03-colour-pipeline.md` に、MVP の renderer handoff は `Rgba8Srgb` / sRGB transfer へ
  正規化する方針を追記した。

### Red
- `sidecar-protocol/tests/frame_verification.rs` を追加し、`FrameVerificationReport` / `FrameChecksum` /
  `PixelDiffSummary` / `FrameVerificationStatus` の JSON schema を先に固定した。
- verification report も frame bytes / pixel array / base64 を載せない契約にした。
- `decode-spike/tests/known_cfr_h264_decode.rs` を追加し、既知 CFR H.264 1 frame が期待 RGBA と許容差内で
  一致すること、descriptor が `Rgba8Srgb` と colour metadata を持つこと、decode invocation が 1 回であることを固定した。

### Green
- `sidecar-protocol` に checksum / pixel diff summary schema を実装した。
- `decode-spike` crate を追加した。
- 既知 32x16 RGBA colour swatch を生成し、`ffmpeg` + software `libx264` fallback で `yuv444p` / `crf=0` の
  1 frame CFR H.264 を作るようにした。
- `ffprobe` で `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、colour metadata を確認した。
- `ffmpeg` decode は 1 回だけ実行し、decoded RGBA8 frame から descriptor / shared frame / verification report を生成した。

### 実測結果
- decoded RGBA vs 期待 RGBA: `maxDelta=2`、`meanAbsoluteError=0.3125`、`PSNR=52.042869868809795`、
  `SSIM=0.9999737802566389`。
- decoded RGBA CRC32: `ef46fca8`。
- descriptor: `format=Rgba8Srgb`、`colour=rec709_srgb()`、`strideBytes=width*4`。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> 11 tests passed。
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml` -> 1 test passed。

## 2026-06-16 — Phase4: renderer handoff validation と atomic ring stress

### Claude レビュー反映
- Claude から、`transfer=bt709` や `range=tv` の実素材を sRGB/full range として無音処理しないよう、
  descriptor metadata を読んで未対応なら fail-loud にすべきと指摘された。
- また、単スレッドの ring buffer state machine test は acquire/release の正しさを証明しないため、
  producer / consumer を実スレッドで同時に回す checksum stress が必要と指摘された。

### Descriptor Validation
- Red: `sidecar-protocol/tests/descriptor_validation.rs` を追加し、MVP renderer handoff として
  `Rgba8Srgb + bt709 primaries + srgb transfer + rgb matrix + full range` だけを受け付ける契約を固定した。
- Green: `validate_renderer_handoff_descriptor` / `DescriptorValidationError` を実装した。
- `transfer=bt709` と `range=tv` は、後続 gate で対応するまでは明示的に reject する。

### Atomic Ring Stress
- Red: `shared-memory-spike/tests/atomic_ring_stress.rs` を追加し、producer / consumer を実スレッドで回して
  deterministic frame bytes と CRC32 が一致し続けることを固定した。
- Green: `shared-memory-spike` crate を追加し、`AtomicU32` slot state、`UnsafeCell<Vec<u8>>` buffer、
  release-store / acquire-load を使う in-memory SPSC ring を実装した。
- 2,000 frames / 4,096 bytes の stress で、読み出し bytes と checksum が全 iteration で一致した。
- stress は throughput / 機能確認として残す。メモリ順序 correctness の主証明にはしない。

### Loom Ordering
- Claude から、stress pass は確率的であり、Release/Acquire が本当に効いている証明にはならないと指摘された。
- Red/Green: `shared-memory-spike/tests/loom_ordering.rs` を追加し、stable toolchain で `loom` による ordering model を通した。
- Init handshake: header fields -> `initState` の Release/Acquire model は全 interleaving で pass。
- Init perturb: `initState` の store/load を Relaxed に落とした model は failure として検出されることを確認した。
- Publish 方向: frame bytes -> `ready` の Release/Acquire model は全 interleaving で pass。
- Publish perturb: `ready` の store/load を Relaxed に落とした model は failure として検出されることを `catch_unwind` で確認した。
- Recycle 方向: copy-out marker -> `free` の Release/Acquire model は、slot を 2 cycle 再利用しても全 interleaving で pass。
- Recycle perturb: `free` の store/load を Relaxed に落とした model は failure として検出されることを `catch_unwind` で確認した。
- ThreadSanitizer はローカルに nightly toolchain が無いため未実施。後続 CI / nightly 環境で追加する。

### Shared Header
- Claude から、cross-process mmap では `repr(C)` だけでは別ビルド間の layout drift を検出できないため、
  magic / protocol version / layout hash を共有領域先頭に置くべきと指摘された。
- Red: `shared-memory-spike/tests/shared_header.rs` を追加し、header offset / size、未初期化 attach の拒否、
  layout hash mismatch の拒否を固定した。
- Green: `SharedRingHeader` / `SharedRingAttachError` / `expected_shared_ring_layout_hash` を実装した。
- `SharedRingHeader` は `#[repr(C)]`、現時点で size 40 bytes。主要 offset は test で固定した。
- producer は初期化完了時に `init_state` を Release store、consumer attach は Acquire load で確認する。

### POSIX Shm Two-Process Spike
- Red: `shared-memory-spike/tests/posix_shm_two_process.rs` を追加し、consumer を producer より先に起動して
  shm object の存在 retry を踏む 2 プロセス CRC stress を固定した。
- Green: `shm_open` / `ftruncate` / `mmap(MAP_SHARED)` を使う `PosixSharedRing` と、
  `uxfd-shm-producer` / `uxfd-shm-consumer` bin を実装した。
- producer / consumer は別プロセスで 250 frames / 4,096 bytes の deterministic frame と CRC32 を検証した。
- Red/Green: 実 mapping 上の layout hash を意図的に壊した場合、attach が `LayoutHashMismatch` で fail-loud になる test を追加した。
- macOS の POSIX shm 名長制限に当たったため、test 用 shm name は短い形式に調整した。

### Decode -> Shm Integration
- Red: `shared-memory-spike/tests/decode_to_shm.rs` と `uxfd-shm-raw-consumer` bin を追加し、
  `decode-spike` の既知 CFR H.264 decoded RGBA を POSIX shm に流して別プロセス consumer が検証する契約を固定した。
- Green: `run_shm_raw_consumer_from_args` を実装し、consumer が expected raw RGBA file と shm frame の bytes / CRC32 を比較するようにした。
- 既知 colour swatch H.264 decode -> POSIX shm ring -> 別プロセス raw consumer の統合 test が pass した。

### Shm -> Native Renderer Integration
- Claude から、decode -> shm で止めず、実 decoded frame を renderer texture upload へ通してから 4K throughput に進むべきと指摘された。
- Red: `native-wgpu-renderer/tests/shm_decoded_frame_render.rs` を追加し、POSIX shm から読み出した decoded RGBA を
  native wgpu renderer に渡し、known swatch と比較する契約を固定した。
- Green: 既存 `render_native_wgpu_frame` で decoded frame を描画し、render 完了後に
  `CopyOutState::GpuUploadFenceSignalled` として slot release するようにした。
- 実測: `maxDelta=2`、`meanAbsoluteError=0.3125`、`PSNR=52.042869868809795`、
  `SSIM=0.9999737802566389`。
- これにより input -> decode -> POSIX shm -> native wgpu render -> known swatch 比較の end-to-end correctness が通った。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> 14 tests passed。
- `cargo fmt --manifest-path shared-memory-spike/Cargo.toml`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> 14 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test shm_decoded_frame_render` -> 1 test passed。

## 2026-06-16 — Phase4: 4K throughput / slot sizing spike

### Red
- `sidecar-protocol/tests/frame_memory_sizing.rs` を追加し、4K RGBA8 decode slot と `rgba16float`
  render target readback の byte footprint を先に固定した。
- `native-wgpu-renderer/tests/frame_stage_timings.rs` を追加し、native wgpu renderer が
  `sourceUpload` / `render` / `readbackEncode` / `total` を分離して返す契約を固定した。
- `native-wgpu-renderer/tests/four_k_throughput.rs` を `#[ignore]` 付きの明示実行 probe として追加した。

### Green
- `frame_buffer_footprint` と `rgba8_srgb_ring_layout` を実装し、row pitch は 256 byte alignment で計算するようにした。
- 4K RGBA8 source slot は `33,177,600 bytes`、4K `rgba16float` readback は `66,355,200 bytes` として固定した。
- `measure_native_wgpu_frame_stages` を実装し、従来の `render_native_wgpu_frame` は測定 API の frame だけを返す互換 API とした。
- 4K probe の初回実行で `wgpu::Limits::downlevel_defaults()` の `maxTextureDimension2D=2048` に当たり、
  3840px texture 作成が失敗した。device request limit を frame size に合わせ、adapter limit を超える場合は
  `FrameSizeExceedsAdapterLimit` として fail-loud にした。

### Claude レビュー反映
- Claude から、`total` に adapter / device / pipeline 作成などの一回性 setup が混入しているため、
  throughput 判断では per-frame steady state と分けるべきと指摘された。
- Red/Green: `NativeWgpuFrameStageTimings` に `setup` と `steadyState` を追加し、
  `steadyState = sourceUpload + render + readbackEncode` を test で固定した。
- preview path と export path を分けて読む必要がある。preview は readback を行わず、
  export だけが `readbackEncode` を支払う。

### 実測結果
- Debug build: `setup=28.588625ms`、`sourceUpload=13.600083ms`、`render=21.783333ms`、
  `readbackEncode=1.314205583s`、`steadyState=1.349588999s`、`total=1.379209708s`。
- Release build observed range: `setup=9.623042ms-25.295542ms`、`sourceUpload=10.807208ms-12.032625ms`、
  `render=7.610625ms-8.507167ms`、`readbackEncode=112.997ms-136.20175ms`、
  `steadyState=132.664167ms-155.516125ms`、`total=146.89025ms-181.625625ms`。
- `sourceUpload` は source texture 作成、CPU bytes の staging copy、queue flush、GPU work completion を含む。
- `render` は render command submit から GPU work completion までを含む。
- `readbackEncode` は `copy_texture_to_buffer` completion、buffer map、`f16` readback scan、
  premultiplied -> straight RGBA8、CPU linear -> sRGB encode を含む。
- Release の preview 相当 steady state は `sourceUpload + render = 約18.5-20.5ms`、約 49-54fps。
- Release の export steady state は `約132.7-155.5ms/frame`、約 6.4-7.5fps。
- 現時点の支配項は export 側の readback + CPU encode。これは後続の shader encode / u8 readback /
  YUV 直出し最適化の根拠として残すが、MVP では correctness gate を優先する。

### 確認結果
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test frame_memory_sizing` -> 4 tests passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test frame_stage_timings` -> 1 test passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test four_k_throughput` -> 1 ignored。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test four_k_throughput -- --ignored --nocapture` -> 1 test passed。
- `cargo test --release --manifest-path native-wgpu-renderer/Cargo.toml --test four_k_throughput -- --ignored --nocapture` -> 1 test passed。

## 2026-06-16 — Phase4: export round-trip / explicit ffmpeg colour conversion

### Red
- `decode-spike/tests/explicit_colour_export_round_trip.rs` を追加し、RGBA -> H.264 4:4:4 export filter が
  `primariesin` / `transferin` / `matrixin` / `rangein` と出力側 `primaries` / `transfer` / `matrix` / `range`
  を明示する契約を固定した。
- 既知 swatch frame を explicit H.264 4:4:4 へ encode し、再 decode して元 swatch と比較する契約を固定した。
- `native-wgpu-renderer/tests/export_round_trip.rs` を追加し、timeline snapshot -> native wgpu RGBA ->
  explicit H.264 4:4:4 export -> 再 decode -> known swatch 比較の縦スライスを固定した。

### Green
- `decode-spike` に `export_rgba_frame_to_h264_444` / `decode_exported_h264_to_rgba` /
  `explicit_rgba_to_h264_444_filter` を実装した。
- encode filter は `matrixin=gbr`、出力 `matrix=bt709`、`transfer=iec61966-2-1`、`range=full` を明示した。
- decode filter は H.264 4:4:4 側の `bt709` / sRGB transfer / full range を明示し、最後に `format=rgba` へ落とす。
- 最初の decode filter では `matrix=gbr` を zscale 出力に指定して失敗した。zscale は YUV family に RGB matrix を
  出せないため、YUV 側を明示した上で `format=rgba` に渡す形に修正した。

### 実測結果
- explicit H.264 4:4:4 export round-trip: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- native wgpu -> explicit H.264 4:4:4 export round-trip: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- native preview output -> export round-trip output の直接比較: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- ffprobe metadata: `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、`range=pc`、
  `space=bt709`、`transfer=iec61966-2-1`、`primaries=bt709`。
- 4:2:0 export は subsampling tolerance が別物になるため未実施。まず 4:4:4 correctness gate を固定した。
- Spike では sRGB transfer (`iec61966-2-1`) tag を使っている。内部一貫性は取れているが、shipping export では
  SDR H.264 の一般的な期待に合わせて bt709 transfer 出力を別 gate で確認する。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test explicit_colour_export_round_trip -- --nocapture` -> 2 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test export_round_trip -- --nocapture` -> 1 test passed。

### Consolidated Milestone
- Claude レビューで、MVP のアーキテクチャ検証 arc は完了と扱ってよいと確認された。
- central risk はそれぞれ falsification-grade の gate を持った:
  - preview parity: WebGPU / native wgpu / CPU reference / hand anchor が `maxDelta=0`。
  - input correctness: known CFR H.264 decode が `maxDelta=2`。
  - data plane: decode -> POSIX shm -> consumer が byte / CRC exact、Release/Acquire は loom perturb で検証済み。
  - render integration: shm frame -> native wgpu -> known swatch が `maxDelta=2`。
  - export correctness: native wgpu -> explicit H.264 4:4:4 -> known swatch が `maxDelta=1`。
  - WYSIWYG direct check: native preview output -> export round-trip output が `maxDelta=1`。
- ここから先はアーキテクチャ成立性の証明ではなく、breadth と production 化:
  sampling 系 effect、real footage、bt709 / limited range、VFR、4:2:0 tolerance、shader encode / u8 readback、
  sidecar orchestration / cancellation / crash recovery。

## 2026-06-16 — Breadth: bt709 transfer shipping export gate

### Red
- `decode-spike/tests/bt709_transfer_export_round_trip.rs` を追加し、sRGB encoded RGBA input を
  bt709 transfer の H.264 4:4:4 へ変換して書き出す filter contract を先に固定した。
- `native-wgpu-renderer/tests/export_round_trip.rs` に、native wgpu output -> bt709 transfer H.264 4:4:4 ->
  再 decode -> known swatch / preview output 比較の gate を追加した。

### Green
- `explicit_rgba_to_h264_444_bt709_filter` / `explicit_h264_444_bt709_to_rgba_filter` /
  `export_rgba_frame_to_h264_444_bt709` を実装した。
- encode filter は入力側 `transferin=iec61966-2-1`、出力側 `transfer=bt709` とし、RGB matrix input は
  `matrixin=gbr`、H.264 側は `matrix=bt709` とした。
- `libx264` と container tag も `transfer=bt709` / `-color_trc bt709` に揃えた。
- decode filter は bt709 transfer の H.264 4:4:4 を sRGB RGBA へ戻すため、
  `transferin=bt709` -> `transfer=iec61966-2-1` を明示した。

### 実測結果
- RGBA -> bt709 H.264 4:4:4 -> RGBA: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- native wgpu -> bt709 H.264 4:4:4 -> RGBA: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- native preview output -> bt709 export round-trip output: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- ffprobe metadata: `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、`range=pc`、
  `space=bt709`、`transfer=bt709`、`primaries=bt709`。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test bt709_transfer_export_round_trip -- --nocapture` -> 2 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test export_round_trip -- --nocapture` -> 2 tests passed。

## 2026-06-16 — Breadth: bt709 H.264 4:2:0 distribution export gate

### Red
- `decode-spike/tests/bt709_yuv420_export_round_trip.rs` を追加し、bt709 transfer / full range / H.264 4:2:0 の
  distribution export contract を固定した。
- `native-wgpu-renderer/tests/export_round_trip.rs` に、native wgpu output -> bt709 H.264 4:2:0 ->
  再 decode の gate を追加した。

### Green
- `explicit_rgba_to_h264_420_bt709_filter` / `export_rgba_frame_to_h264_420_bt709` を実装した。
- `ProbeSummary` に `pixelFormat` を追加し、ffprobe の `pix_fmt` を検証できるようにした。
- full range 4:2:0 は ffprobe 上 `yuvj420p` と報告されるため、`range=pc` と合わせてその表記を受け入れる。
- 32x16 の硬い色境界 swatch は 4:2:0 chroma subsampling の影響が内部まで強く出たため、
  4:2:0 gate では 128x128 の同一色 swatch を使い、full-frame envelope と stable swatch interior を分けて判定した。

### 実測結果
- RGBA -> bt709 H.264 4:2:0 -> RGBA full-frame: `maxDelta=132`、`meanAbsoluteError=3.0048828125`、
  `PSNR=27.403575633662975`、`SSIM=0.9915148895704098`。
- RGBA -> bt709 H.264 4:2:0 -> RGBA swatch interior: `maxDelta=2`、`meanAbsoluteError=0.34375`、
  `PSNR=52.390490931401914`、`SSIM=0.9999747882512735`。
- native wgpu -> bt709 H.264 4:2:0 -> RGBA full-frame: `maxDelta=132`、`meanAbsoluteError=3.0048828125`、
  `PSNR=27.403575633662975`、`SSIM=0.9915148895704098`。
- native wgpu -> bt709 H.264 4:2:0 -> RGBA swatch interior: `maxDelta=2`、`meanAbsoluteError=0.34375`、
  `PSNR=52.390490931401914`、`SSIM=0.9999747882512735`。

### 判断
- 4:2:0 は graphics / text / hard chroma edge で大きな局所劣化を起こす。これは codec/subsampling の性質であり、
  renderer parity failure と混同しない。
- distribution export の acceptance は full-frame envelope と stable-region correctness を別々に持つ。
- 高忠実度が必要な編集確認・中間成果物は 4:4:4 gate、配布用互換性は 4:2:0 gate で扱う。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test bt709_yuv420_export_round_trip -- --nocapture` -> 2 tests passed。
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml --test export_round_trip -- --nocapture` -> 3 tests passed。

## 2026-06-16 — Phase4: sidecar protocol 契約の TDD 着手

### Red
- `sidecar-protocol` crate を追加し、制御プレーンに frame bytes / base64 / pixel array を載せない契約を `tests/control_plane.rs` で先に固定した。
- `DecodeFrameRequest` は float 秒ではなく `frameIndex` を使うことを test 化した。

### Green
- `DecodeFrameRequest` / `ControlEvent` / `SharedFrame` / `FrameDescriptor` / `FrameFormat` / `ColourMetadata` を実装した。
- `FrameReady` event は shared memory descriptor と colour metadata だけを JSON に載せ、巨大 frame data は data plane に分離する形にした。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に `sidecar-protocol` の制御プレーン / データプレーン契約を追記した。

### 確認結果
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> 2 tests passed。

## 2026-06-16 — Phase4: sidecar job lifecycle / cancellation control-plane

### Red
- `sidecar-protocol/tests/job_lifecycle.rs` を追加し、cancel request が `jobId` だけを持ち、frame bytes /
  pixel array / base64 を制御プレーンに載せない契約を固定した。
- `jobProgress` と `jobCancelled` event が progress / cancellation metadata のみを JSON に載せることを固定した。
- cancel request 後に `complete` が成功せず、cleanup 完了後の `jobCancelled` で終端する state machine を先に書いた。

### Green
- `CancelJobRequest` / `JobState` / `JobLifecycle` / `JobLifecycleError` を実装した。
- `ControlEvent` に `JobStarted` / `JobProgress` / `JobCompleted` / `JobCancelled` を追加した。
- job state は `queued -> running -> completed`、または `queued/running -> cancelling -> cancelled` とし、
  `cancelling` 中の `complete` は `CancellationPending` で拒否する。
- `jobId` / `completedFrames` / `totalFrames` / `slotIndex` は JSON 側で camelCase になるよう固定した。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に job lifecycle と cancellation の最小 state machine を追記した。
- `markdown/roadmap.md` の Phase4 タスクに job lifecycle / progress / cancellation control-plane gate を追加した。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test job_lifecycle` -> 3 tests passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test control_plane` -> 2 tests passed。

## 2026-06-16 — Phase4: slot lease generation / stuck slot recovery contract

### Red
- `sidecar-protocol/tests/ring_buffer.rs` に、`FrameDescriptor.generation` と stale consumer release 防止の契約を追加した。
- watchdog recovery 後に古い `ReadyFrame` を release しても、新しい reader lease を `free` に戻せないことを固定した。
- 未定義の `SlotRecoveryReason` / `recover_stuck_slot` / `LeaseGenerationMismatch` と descriptor `generation` で Red を確認した。

### Green
- `FrameDescriptor` に `generation` を追加し、静的 layout descriptor は `generation=0`、実 write lease は 1 以上を発行するようにした。
- `SharedFrameRing.acquire_write_slot` が slot ごとに generation を進め、`mark_slot_ready` / `release_read_slot` で lease generation を検証するようにした。
- `recover_stuck_slot` を追加し、`writing` / `ready` / `reading` の stuck slot を `free` に戻す際に generation を進め、古い token を無効化するようにした。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に descriptor `generation` と slot lease / recovery contract を追記した。
- `markdown/roadmap.md` の Phase4 タスクと完了条件に stale slot release 防止 gate を追加した。

### 確認結果
- `cargo fmt --manifest-path sidecar-protocol/Cargo.toml`
- `cargo test --manifest-path sidecar-protocol/Cargo.toml --test ring_buffer` -> 8 tests passed。

## 2026-06-16 — Breadth: limited range H.264 decode gate

### Red
- `decode-spike/tests/limited_range_decode.rs` を追加し、source H.264 が `color_range=tv` の場合でも
  sidecar decode が full-range `Rgba8Srgb` descriptor を返す契約を固定した。
- limited range encode filter が `rangein=full` から `range=limited` へ明示変換することを test 化した。

### Green
- `explicit_rgba_to_limited_range_h264_444_filter` と
  `build_known_cfr_h264_limited_range_fixture` を実装した。
- `decode_fixture_to_shared_rgba` は `ffprobe` の `color_range` を読み、`pc` / `tv` に応じて
  `scale=in_range=...:out_range=pc` を明示するようにした。
- unknown / missing range は無音で full range 扱いせず、probe error として扱う。

### 実測結果
- limited range H.264 4:4:4 -> full-range RGBA: `maxDelta=1`、`meanAbsoluteError=0.25`、
  `PSNR=54.15140352195873`、`SSIM=0.9999824540291767`。

### 文書更新
- `markdown/architecture/03-colour-pipeline.md` に limited range source を full-range renderer handoff へ正規化する契約を追記した。
- `markdown/architecture/05-boundary-ipc.md` に limited range decode gate の実測値を追記した。
- `markdown/roadmap.md` の Phase4 完了条件に limited range H.264 input gate を追加した。

### 確認結果
- `cargo fmt --manifest-path decode-spike/Cargo.toml`
- `cargo test --manifest-path decode-spike/Cargo.toml --test limited_range_decode -- --nocapture` -> 2 tests passed。

## 2026-06-16 — Phase3c: integer transform / nearest sampling gate

### Red
- `reference-renderer/tests/solid_scene.rs` と `native-wgpu-renderer/tests/native_reference_parity.rs` に、
  2x2 source を `translation=(1,1)`、`scale=(2,2)` で 5x5 canvas に配置する hand anchor test を追加した。
- 旧実装は source と canvas の同一サイズ / identity transform 前提だったため、CPU reference 側で `SourceSizeMismatch` になり Red を確認した。

### Green
- `reference-renderer` に integer translation / nearest scale / clipping を追加した。
- `native-wgpu-renderer` と共有 WGSL に同じ nearest mapping を追加した。
- mapping は `floor((outputPixel - translation) / scale)` とし、sampler / bilinear filtering は使わない。
- rotation、非正 scale は引き続き unsupported として fail-loud にした。
- `phase3b-webgpu-harness` に同じ transform case を追加した。

### 実測結果
- CPU reference transform gate: hand anchor と一致。
- native wgpu transform gate: CPU reference / hand anchor と `maxDelta=0`。
- WebGPU preview harness: Chrome 149、Apple Metal adapter、`integer translation and nearest scale` case が
  `maxDelta=0` / `meanAbsoluteError=0`。

### 文書更新
- `markdown/architecture/04-render-parity.md` に integer transform / nearest sampling gate を追記した。
- `markdown/roadmap.md` に Phase3c を追加した。

### 確認結果
- `cargo fmt --manifest-path reference-renderer/Cargo.toml`
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> 10 tests passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> 12 passed / 1 ignored。
- `node --check phase3b-webgpu-harness/phase3b.js`
- WebGPU harness: `http://127.0.0.1:4177/phase3b-webgpu-harness/` を system Chrome 149 で実行し `ok=true`。

## 2026-06-16 — Phase3d: linear-light bilinear sampling gate

### Red
- `reference-renderer/tests/solid_scene.rs` に、2x1 source（black / white）の midpoint を
  `sampling=bilinear` で 1x1 canvas に描画し、期待値 `[188,188,188,255]` と比較する hand anchor test を追加した。
- `native-wgpu-renderer/tests/native_reference_parity.rs` に同じ scene を追加し、native wgpu / CPU reference / hand anchor の一致を要求した。
- 旧 schema には `SamplingMode` と `Transform.sampling` が存在しないため、compile error で Red を確認した。

### Green
- `rust-core` の `Transform` に `sampling` を追加し、`nearest` / `bilinear` を `SamplingMode` として定義した。
- 既定値は後方互換のため `nearest` とし、既存 timeline snapshot は明示的に nearest を使う形に更新した。
- `reference-renderer` は nearest と bilinear の sampling を分岐し、bilinear では 4 texel を sRGB -> linear light decode 後に補間する。
- `native-wgpu-renderer` と共有 WGSL は `sampling_mode` uniform を受け取り、CPU reference と同じ linear-light bilinear 補間を行う。
- `phase3b-webgpu-harness` に `linear-light bilinear midpoint` case を追加した。

### 実測結果
- CPU reference bilinear gate: hand anchor `[188,188,188,255]` と一致。
- native wgpu bilinear gate: CPU reference / hand anchor と `maxDelta=0`。
- WebGPU preview harness: Chrome 149、Apple Metal adapter、`linear-light bilinear midpoint` case が
  `maxDelta=0` / `meanAbsoluteError=0`。

### 文書更新
- `markdown/architecture/02-rust-core-spec.md` に `Transform.sampling` と linear-light bilinear の契約を追記した。
- `markdown/architecture/04-render-parity.md` に linear-light bilinear sampling gate を追記した。
- `markdown/roadmap.md` に Phase3d を追加した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo fmt --manifest-path reference-renderer/Cargo.toml`
- `cargo fmt --manifest-path native-wgpu-renderer/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml` -> passed。
- `cargo test --manifest-path golden-harness/Cargo.toml` -> passed。
- `cargo test --manifest-path reference-renderer/Cargo.toml` -> passed。
- `cargo test --manifest-path sidecar-protocol/Cargo.toml` -> passed。
- `cargo test --manifest-path decode-spike/Cargo.toml` -> passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> passed。
- `cargo test --manifest-path native-wgpu-renderer/Cargo.toml` -> passed / 1 ignored。
- `node --check phase3b-webgpu-harness/phase3b.js`
- WebGPU harness: `http://127.0.0.1:4177/phase3b-webgpu-harness/` を system Chrome 149 で実行し `ok=true`。

## 2026-06-16 — Phase4: sidecar decode checksum handoff gate

### Red
- `shared-memory-spike/tests/sidecar_decode_checksum.rs` を追加し、既知 CFR H.264 の direct decode RGBA を
  sidecar handoff API 経由で POSIX shm に書き込む契約を固定した。
- test は `FrameReady` の `SharedFrame`、`FrameVerificationReport.checksum`、consumer readback CRC32 が
  direct decode reference と一致することを要求する。
- 未定義の `write_sidecar_decoded_frame_to_ring` で compile error になり Red を確認した。

### Green
- `shared-memory-spike` に `write_sidecar_decoded_frame_to_ring` と `SidecarDecodedFrameWrite` を追加した。
- API は `DecodeFrameRequest`、`FrameDescriptor`、RGBA bytes を受け取り、POSIX shm へ frame を書いて
  `JobStarted -> FrameReady -> JobCompleted` の control events を返す。
- `FrameVerificationReport` は CRC32 / byte length を持ち、pixel bytes 自体は control plane に載せない。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に sidecar data-plane handoff gate を追記した。

### 確認結果
- `cargo fmt --manifest-path shared-memory-spike/Cargo.toml`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test sidecar_decode_checksum` -> 1 test passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> passed。

## 2026-06-16 — Phase4: sidecar handoff metadata fail-loud gate

### Red
- `shared-memory-spike/tests/sidecar_decode_checksum.rs` に、`transfer=bt709` の descriptor を
  sidecar handoff が shm 書き込み前に拒否する contract test を追加した。
- 未定義の `SidecarDecodeHandoffError` で Red を確認した。

### Green
- `write_sidecar_decoded_frame_to_ring` の戻り値を `SidecarDecodeHandoffError` に変更し、
  `DescriptorValidationError` と shm error を分離した。
- shm へ bytes を書く前に `validate_renderer_handoff_descriptor` を呼び、未対応 metadata を fail-loud にした。

### 文書更新
- `markdown/architecture/05-boundary-ipc.md` に sidecar handoff 時の descriptor validation を追記した。

### 確認結果
- `cargo fmt --manifest-path shared-memory-spike/Cargo.toml`
- `cargo test --manifest-path shared-memory-spike/Cargo.toml --test sidecar_decode_checksum` -> 2 tests passed。
- `cargo test --manifest-path shared-memory-spike/Cargo.toml` -> passed。

## 2026-06-16 — Phase5: Pixi state -> Rust SceneSnapshot adapter gate

### Red
- `src/utils/rustSceneSnapshot.test.ts` を追加し、既存 `TimelineObject` / layer visibility / fps / timeline time から
  rust-core serde 互換の `SceneSnapshot` JSON を作る契約を固定した。
- active image / video plane、position animation、fade opacity、hidden / inactive clip の除外、
  unsupported Pixi feature の fail-loud を test 化した。
- 未実装の `rustSceneSnapshot` module import error で Red を確認した。

### Green
- `src/utils/rustSceneSnapshot.ts` を追加し、Phase5 入口用の `buildRustSceneSnapshotForTimeline` を実装した。
- 変換対象は `image` / `video` の media plane に限定し、`RustSceneSnapshot` と media references を返す。
- `frame_index` / `source_frame` は project fps から整数 frame に丸め、video は `offset` を source frame に反映する。
- `sampling` は shared renderer の Phase3d gate に合わせて `bilinear` とした。
- text / shape / PSD / audio、rotation、非正 scale、video reversed / subject crop、fade 以外の enabled filter は
  shared renderer へ黙って渡さず issue として fail-loud にした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-20a` に更新した。

### 文書更新
- `markdown/roadmap.md` の Phase5 に Pixi state -> Rust SceneSnapshot adapter gate を追記した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: Rust SceneSnapshot JSON boundary gate

### Red
- `rust-core/tests/timeline_snapshot_contract.rs` に `SceneSnapshot` の serde JSON contract test を追加した。
- TS adapter と同じ `frame_index` / `clip_id` / `media_id` / `source_frame` / `sampling` などの field name を固定した。
- `SceneSnapshot` / `EvaluatedClip` に `Serialize` / `Deserialize` が無いため compile error で Red を確認した。

### Green
- `rust-core/src/timeline.rs` の `SceneSnapshot` と `EvaluatedClip` に `Serialize` / `Deserialize` derive を追加した。
- `Effect::LinearGain` は serde の外部タグ付き enum として `{ "LinearGain": { "gain": ... } }` の形を維持した。

### 確認結果
- `cargo fmt --manifest-path rust-core/Cargo.toml`
- `cargo test --manifest-path rust-core/Cargo.toml --test timeline_snapshot_contract` -> 4 tests passed。
- `cargo test --manifest-path rust-core/Cargo.toml` -> passed。

## 2026-06-16 — Phase5: shared renderer adapter fail-loud widening

### Red
- `src/utils/rustSceneSnapshot.test.ts` に、`groupId` / `groupGradient` / `clipping` を持つ media plane を
  shared renderer adapter が拒否する contract test を追加した。
- 旧 adapter はこれらの Pixi 固有合成意味論を通してしまい、`ok=true` になったため Red を確認した。

### Green
- `RustSceneSnapshotBuildIssueCode` に `unsupportedGroupComposition` と `unsupportedMask` を追加した。
- `buildRustSceneSnapshotForTimeline` は group composition / group gradient / layer clipping mask を issue として返す。
- `package.json` / `package-lock.json` を `0.1.1-Beta-20b` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts` -> 4 tests passed。

## 2026-06-16 — Phase5: shared renderer adapter transform envelope gate

### Red
- `src/utils/rustSceneSnapshot.test.ts` に、非 identity scale と sub-pixel translation を shared renderer adapter が
  拒否する contract test を追加した。
- 旧 adapter は scale / sub-pixel translation を通してしまい、`ok=true` になったため Red を確認した。

### Green
- `buildRustSceneSnapshotForTimeline` は評価後 position が整数でない場合、または `scaleX` / `scaleY` が 1 でない場合に
  `unsupportedTransform` を返すようにした。
- Claude review の指摘に従い、Phase5 の最初の bridge は verified envelope に閉じ、Pixi差分を正解扱いせず triage 用にする。
- `package.json` / `package-lock.json` を `0.1.1-Beta-20c` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts` -> 5 tests passed。

## 2026-06-16 — Phase5: shared renderer preview bridge plan gate

### Red
- `src/utils/sharedRendererPreviewBridge.test.ts` を追加し、shared renderer preview の入口方針を固定した。
- flag disabled では Pixi only、adapter OK では Pixi primary / shared renderer candidate の `parallelCompare`、
  unsupported scene では Pixi fallback になることを test 化した。
- 未実装の `sharedRendererPreviewBridge` module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewBridge.ts` を追加し、`buildSharedRendererPreviewPlan` を実装した。
- bridge は Pixi を即 cutover せず、shared renderer を comparison candidate として返す。
- adapter issue がある場合は `pixiFallback` とし、unsupported feature を黙って近似しない。
- `markdown/roadmap.md` に Pixi は oracle ではなく triage signal として扱う方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-21a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewBridge.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: Viewport shared renderer preview diagnostic wiring

### Green
- `src/components/Viewport.tsx` で `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` の時だけ
  `buildSharedRendererPreviewPlan` を呼ぶ diagnostic wiring を追加した。
- Pixi preview は引き続き primary renderer のまま維持し、shared renderer plan は
  `window.__UXFD_SHARED_RENDERER_PREVIEW_PLAN__` に公開するだけにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-22a` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshot.test.ts src/utils/sharedRendererPreviewBridge.test.ts` -> 8 tests passed。
- `npx tsc --noEmit` は既存の `three` 型不足と既存 test 型エラーで失敗するため、今回追加分の全体型検査は未完了。

## 2026-06-16 — Phase5: TS SceneSnapshot boundary validation gate

### Red
- `src/utils/rustSceneSnapshotBoundary.test.ts` を追加し、TS adapter output が rust-core JSON 境界として妥当かを
  unknown payload から検査する契約を固定した。
- `frame_index` / `clip_id` など snake_case field を要求し、camelCase drift、非有限数、非整数 frame、
  未対応 enum、範囲外 opacity、未対応 effect、未対応 media kind を拒否する test を追加した。
- 未実装の `validateRustSceneSnapshotBoundary` で Red を確認した。

### Green
- `src/utils/rustSceneSnapshot.ts` に `validateRustSceneSnapshotBoundary` を追加した。
- Rust / shared renderer へ渡す前の JSON 境界として、`SceneSnapshot`、clip transform、effect stack、media references を
  実行時に検査できるようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-23a` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshotBoundary.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: shared renderer preview surface gate

### Red
- `src/utils/sharedRendererPreviewSurface.test.ts` を追加し、shared renderer canvas を mount してよい条件を
  UI から切り離した純粋関数の契約として固定した。
- `parallelCompare` 以外、export 中、3D editor mode、不正 project size、WebGPU 不在、fallback adapter、
  Rust boundary validation 失敗を明示理由つきで block する test を追加した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewSurface.ts` を追加し、`buildSharedRendererPreviewSurfaceGate` を実装した。
- Gate が通る時だけ canvas size、snapshot、media references を返し、Pixi primary / shared renderer candidate の
  read-only 並走条件を固定した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-24a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewSurface.test.ts` -> 3 tests passed。

## 2026-06-16 — Phase5: shared renderer preview diagnostics gate

### Red
- `src/utils/sharedRendererPreviewDiagnostics.test.ts` を追加し、Pixi diff を正解 oracle として扱わない比較診断契約を固定した。
- Pixi と candidate が一致しても reference gate 未実行なら `triageOnly`、reference が fail したら Pixi 一致でも
  `rejected`、reference/native が pass して Pixi だけ差分なら `needsLegacyTriage` とする test を追加した。
- report に frame bytes / pixel array / base64 を含めない metric-only 契約も固定した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewDiagnostics.ts` を追加し、`classifySharedRendererPreviewComparison` を実装した。
- 判定優先順位を reference correctness / native parity / Pixi triage の順に固定し、Pixi 一致だけで pass しないようにした。
- `markdown/roadmap.md` に比較診断 report の metric-only 方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-25a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewDiagnostics.test.ts` -> 4 tests passed。

## 2026-06-16 — Phase5: SceneSnapshot strict boundary schema gate

### Red
- `src/utils/rustSceneSnapshotBoundary.test.ts` に strict schema の追加契約を足した。
- camelCase drift を「必須 field 欠落」だけでなく「未知 field 混入」としても検出し、
  snapshot / clip / transform / media の unknown field、media id 重複、clip から参照されない orphan media を拒否する
  test を追加した。
- 旧 validator は unknown field と duplicate / orphan media を通したため Red を確認した。

### Green
- `validateRustSceneSnapshotBoundary` に allowed keys の検査、duplicate media id 検出、orphan media reference 検出を追加した。
- これにより TS 側の実行時 payload が Rust serde contract から緩く広がる drift を早期に検出できるようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-26a` に更新した。

### 確認結果
- `npm test -- src/utils/rustSceneSnapshotBoundary.test.ts` -> 4 tests passed。

## 2026-06-16 — Phase5: Viewport shared renderer preview session wiring

### Red
- `src/utils/sharedRendererPreviewSession.test.ts` を追加し、preview plan と surface gate を一括生成する session 契約を固定した。
- supported 2D scene では `parallelCompare` plan と mount 可能 surface gate を返し、disabled / unsupported scene では
  blocked surface reason を保つ test を追加した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererPreviewSession.ts` を追加し、`buildSharedRendererPreviewPlan` と
  `buildSharedRendererPreviewSurfaceGate` を束ねる `buildSharedRendererPreviewSession` を実装した。
- `src/components/Viewport.tsx` の feature flag 診断を session 経由へ切り替え、WebGPU adapter probe と
  `window.__UXFD_SHARED_RENDERER_PREVIEW_SURFACE_GATE__` の公開を追加した。
- `preview-canvas-container` 内に `data-shared-renderer-preview-surface` canvas を重ねる準備を入れた。Pixi は引き続き primary。
- `src/utils/sharedRendererPreviewSurface.test.ts` の union narrowing を補い、全体 `tsc` 上の新規 shared renderer 型エラーを解消した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-27a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPreviewSurface.test.ts src/utils/sharedRendererPreviewSession.test.ts` -> 5 tests passed。
- `npx tsc --noEmit` は既存の `src/components/ThreeStageViewport.tsx` の `three` 型不足で失敗するが、
  `Viewport` / `sharedRendererPreview*` / `rustSceneSnapshot` の新規エラーは出ていない。

## 2026-06-16 — Phase5: shared renderer presentation contract gate

### Claude レビュー反映
- Claude から、Phase3b の readback proof は canvas presentation / display colour management / page compositing を通っていないため、
  on-screen preview では macOS P3 display、canvas alpha、同一 frame freeze、device lost、unsupported frame partition が
  盲点になると指摘を受けた。

### Red
- `src/utils/sharedRendererPresentationContract.test.ts` を追加し、WebGPU canvas presentation を `colorSpace: "srgb"` /
  `alphaMode: "premultiplied"` に固定する契約を test 化した。
- 比較 readback は page-composited canvas ではなく offscreen render target から取ること、device lost 時は Pixi fallback、
  stale shared frame を許さないことを test 化した。
- Pixi / shared renderer / SceneSnapshot の frame index が一致しない比較を拒否し、unsupported frame を parity metrics から除外して
  Pixi-only partition に分ける契約を追加した。
- さらに `src/utils/sharedRendererPreviewSession.test.ts` で session が presentation contract を公開する Red を確認した。

### Green
- `src/utils/sharedRendererPresentationContract.ts` を追加し、presentation contract、frame lock validation、
  comparable / Pixi-only frame partition を実装した。
- `buildSharedRendererPreviewSession` が `presentationContract` を返すようにし、
  `Viewport` から `window.__UXFD_SHARED_RENDERER_PRESENTATION_CONTRACT__` へ診断公開するようにした。
- `markdown/roadmap.md` に WebGPU presentation / offscreen readback / frozen frame / partition 方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-28a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererPresentationContract.test.ts src/utils/sharedRendererPreviewSession.test.ts` -> 5 tests passed。

### Browser 追加確認と修正
- `VITE_UXFD_SHARED_RENDERER_PREVIEW=1 npm run dev -- --host 127.0.0.1 --port 5174` で起動し、Browser で新規 project を作成した。
- `data-shared-renderer-preview-surface` canvas は Pixi canvas と同じ 1920x1080 backing size / 同じ CSS size /
  `pointer-events: none` で mount されることを確認した。
- 一方で `pixiReady` が render effect の依存に無いため、Pixi 初期化後に `renderScene` が再発火せず
  `window.__UXFD_SHARED_RENDERER_*` 診断 payload が未設定になることを確認した。
- `renderScene` の dependency に shared renderer flag / GPU status / editor mode / project settings を含め、
  render effect が `pixiReady` 後に再実行されるよう修正した。
- さらに診断 payload 生成を `renderScene` から独立した effect へ分離し、空 scene や初期描画前でも
  `window.__UXFD_SHARED_RENDERER_*` を観測できるようにした。
- Browser の read-only evaluation では page world の `window.__UXFD_*` expando を観測できない可能性があったため、
  `document.documentElement.dataset` と surface canvas dataset に plan / gate / canvas colour / alpha contract を
  併せて公開するようにした。
- 再確認で `planMode=parallelCompare`、`surfaceGate=ok`、`colourSpace=srgb`、`alphaMode=premultiplied`、
  surface canvas は backing size 1920x1080 / CSS size は preview scale / `pointer-events: none`、error log なしを確認した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-28d` に更新した。

### 残る手動 gate
- Claude から、P3 display 上の OS compositor colour management は unit test / offscreen readback では観測できないため、
  実機 P3 Mac で shared-renderer preview swatch と export-decoded reference swatch を並べる visual / sampled check が
  初回 surface go 前に必要と指摘を受けた。
- この P3 実機 check を `markdown/roadmap.md` の Phase5 gate に追記した。

## 2026-06-16 — Phase5: shared renderer WebGPU presenter init gate

### Red
- `src/utils/sharedRendererWebGpuPresenter.test.ts` を追加し、実描画前の WebGPU presenter 初期化契約を固定した。
- surface gate が blocked の時は WebGPU / canvas context に触らないこと、gate OK では
  `getPreferredCanvasFormat()`、`colorSpace: "srgb"`、`alphaMode: "premultiplied"`、
  `GPUTextureUsage.RENDER_ATTACHMENT` で `canvas.configure` することを test 化した。
- `device.lost` 解決時に Pixi fallback と stale shared frame 禁止を通知することも test 化した。
- 未実装 module import error で Red を確認した。

### Green
- `src/utils/sharedRendererWebGpuPresenter.ts` を追加し、`createSharedRendererWebGpuPresenter` を実装した。
- presenter は shader / render pipeline をまだ作らず、adapter / device / canvas context / presentation configure /
  device lost fallback のみに責務を限定した。
- `markdown/roadmap.md` に初回 presenter の責務境界を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-29a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts` -> 3 tests passed。
- `npx tsc --noEmit` は既存の `src/components/ThreeStageViewport.tsx` の `three` 型不足で失敗するが、
  `sharedRendererWebGpuPresenter` / shared renderer 追加分の新規エラーは出ていない。

### Dispose guard
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、presenter `dispose()` 後に `device.lost` が解決しても
  Pixi fallback callback を呼ばない契約を追加した。
- `createSharedRendererWebGpuPresenter` の成功結果に `dispose()` を追加し、unmount 後の遅延 device-lost event を抑止するようにした。
- `package.json` / `package-lock.json` を `0.1.1-Beta-29b` に更新した。

### Non-sRGB canvas format gate
- Claude から、canvas format を `-srgb` にすると renderer 側の linear -> sRGB encode と二重 encode になり、
  preview / export parity を壊すと指摘を受けた。
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に `bgra8unorm-srgb` など `-srgb` format を拒否する契約を追加した。
- `createSharedRendererWebGpuPresenter` は `getPreferredCanvasFormat()` の結果が `-srgb` で終わる場合、
  `srgbCanvasFormat` として fail-loud にするようにした。
- `markdown/roadmap.md` に non-srgb canvas format 方針と二重 encode 禁止を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-29c` に更新した。

## 2026-06-16 — Phase5: presenter solid swatch gate

### Red
- `src/utils/sharedRendererWebGpuPresenter.test.ts` に、P3 実機確認用の solid sRGB swatch presentation 契約を追加した。
- presenter が shader module / render pipeline を作らず、`getCurrentTexture()` への render pass clear だけで
  swatch を canvas に出すことを fake device で固定した。
- 未実装の `presentSolidSrgbSwatch` で Red を確認した。

### Green
- `createSharedRendererWebGpuPresenter` の成功結果に `presentSolidSrgbSwatch` を追加した。
- 実装は `context.getCurrentTexture().createView()` を color attachment にした clear pass のみで、
  shader / pipeline 抽出前に canvas presentation の P3 表示境界を単独確認できる形にした。
- `markdown/roadmap.md` に solid swatch による canvas presentation 確認方針を追記した。
- `package.json` / `package-lock.json` を `0.1.1-Beta-30a` に更新した。

### 確認結果
- `npm test -- src/utils/sharedRendererWebGpuPresenter.test.ts` -> 6 tests passed。
- `npx tsc --noEmit` は既存の `src/components/ThreeStageViewport.tsx` の `three` 型不足で失敗するが、
  `sharedRendererWebGpuPresenter` / shared renderer 追加分の新規エラーは出ていない。

## 2026-05-31 — 中間ファイル生成を SW(libx264) 化＋実測ベンチ

### 実施内容（不具合修正）
- 中間ファイル生成を `h264_videotoolbox`(HW) で行うと、アプリ側の VideoToolbox 使用
  （プレビュー decode / 書き出し encode）と**セッション競合し、途中失敗・破損ファイル**を
  生成していた（ffprobe で「ストリーム無し」/「Conversion failed!」）。手動（レンダラ無し）では成功するのが傍証。
- 修正: 中間ファイルの **デコード・エンコードとも SW** に変更（`-i`（HWアクセラ無し）＋`-c:v libx264 -preset veryfast -crf 20`）。VideoToolbox を使わないため競合せず確実。4K HEVC→FHD で **約1.4倍速**（5分→約3.5分）と実用範囲。

### 実測ベンチ（4K HEVC 5分 → FHD60 書き出し）
- 修正前 rVFC: **82fps** → 5分の書き出し ≈ 3.7分（＋フレーム落ちの恐れ）
- 修正後 中間ファイル: **121fps** → ≈ 2.5分（フレーム落ちなし）
- => **書き出し 約1.5倍速**（＋ドロップ解消）。中間生成は一度きり・編集中にバックグラウンドで実施（約3.5分・~230MB/本）。

### 残課題・次のステップ
- 中間生成中の CPU 使用（~640%）で編集が一瞬重くなる可能性 → `nice`/スレッド数制限/アイドル判定で緩和余地。
- 中間ファイルが encode 律速(FHD60 H.264 ~120fps)に到達。さらなる高速化は HEVC 出力 or 出力解像度選択。
- tmpdir キャッシュの掃除。

## 2026-05-31 — 中間ファイルのバックグラウンド先行生成（初回書き出しも速く）

### 背景・計測
- ユーザー実シナリオ「出力 FHD・ソース 4K HEVC(5分)」を計測。getFrame/描画/読み戻しは全て高速で、ボトルネックは **HEVC が rVFC 再生方式に落ち、ディスプレイのリフレッシュ(~60Hz)制限＋4Kデコードのため実時間が上限**。エフェクト無関係。
- ffmpeg(HW) 4K HEVC→FHD H.264 変換は約2倍速（5分→2.5分）・576MB。変換自体が4Kデコードを伴うため、書き出し時に同期生成すると初回が逆に遅くなる。

### 実施内容
- **中間ファイルを編集中にバックグラウンド先行生成**する設計に変更:
  - `useMediaOptimization` フック: 出力解像度より大きい動画ソースを、出力解像度の H.264 へ HW で1本ずつ変換・キャッシュ（書き出し中は競合回避で停止）。
  - Electron: `generate-intermediate`(HW・キャッシュ・進捗・同時1本)＋`check-intermediate`(生成せず存在確認)。キャッシュキーはソースの size+mtime+幅。
  - 書き出し: キャッシュ済み中間ファイルが**あれば**最優先で VideoDecoder デコード（最速・フレーム落ちなし）、**無ければ待たずに**従来フォールバック（rVFC）。→ 初回書き出しは遅くならず、編集中に生成が済めば以降は高速。
- 優先順: 中間ファイル → プロキシ → ソース直 VideoDecoder → rVFC → シーク。

### 選定理由・判断の根拠
- 同期生成は初回が遅くなるため却下。バックグラウンド＋「あれば使う」方式なら回帰ゼロで、編集時間を使って透過的に最適化メディアを用意できる（FCP の optimized media と同じ発想）。
- ゲートを「ソース幅 > 出力幅」にし、4K→FHD の主ケースを HEVC/H.264 ともにカバー（HEVC 同解像度は当面 rVFC のまま・将来 codec プローブで拡張可）。

### 残課題・次のステップ
- 実機での体感確認（編集中に生成完了 → 書き出しが VideoDecoder 経路で高速・無ドロップになるか）。
- 編集中の生成が重い場合のアイドル判定／明示的な「最適化中」インジケータ。
- 中間ファイルのキャッシュ掃除（tmpdir 蓄積）。

## 2026-05-31 — 4K 書き出しを約2倍高速化（コーデックレベル/レイテンシ修正）

### 実施内容
- 実 Pixi(WebGPU) パイプラインを実ファイル(4K)で計測し、真の律速を特定:
  - getFrame=0.3ms / texUpdate=0.1 / render=0.4 / readback=0.1 / encode=0.1 と**取得・描画・読み戻しは全てほぼ無料**。
  - **encWait（HW エンコーダ待ち）だけが支配的**（修正前 ~39ms/枠）。→ デコード/描画/読み戻しの最適化が効かなかった理由。
- 原因と修正（`videoExportPipeline.ts`）:
  1. **コーデックレベルが Level 4.0 固定**で 4K 非対応 → 解像度から必要レベルを算出（4K は 5.1/5.2）。`buildH264Candidates`/`h264LevelHexFor`。
  2. **`latencyMode` が 'quality' 優先（遅い）** → **'realtime' 優先**（VideoToolbox の frame delay 制約緩和で高速）。
  3. **コーデックキャッシュが解像度を無視**（1080p 検出を 4K に流用）→ `${W}x${H}@${fps}` キーの Map に。
  4. ビットレートを解像度連動に（4K で 10Mbps は低品質 → ~25Mbps）。
- 計測結果: 4K 実効 **23fps → 43fps（約1.9倍）**、encWait 39→22ms。

### 選定理由・判断の根拠
- 計測で「エンコーダが唯一の律速」と確定したため、エンコーダ構成（レベル・レイテンシ）の最適化が最大効果。Level 4.0 で 4K を投げていたのは明確なバグ。
- realtime 優先は全解像度に効く（quality より速く、書き出し用途では十分な品質）。

### 残課題・次のステップ
- encWait（4K H.264 HW エンコード ~45fps）が新たな上限。さらなる高速化は HEVC 出力エンコード（要互換性検討）か出力解像度の選択肢提供。
- 実機での 4K 長尺の体感確認。

## 2026-05-31 — 書き出し高速化: 段のオーバーラップ＋出力のディスク逐次書き出し

### 実施内容
- 計測（実ファイル 4K, IMG_3899.MOV）: 実効 54fps、「再生デコード ~10ms ＋ 4K HWエンコード待ち ~8ms」がほぼ直列。
- **段のオーバーラップ**（`videoExportPipeline.ts`）: `new VideoFrame(bitmap)` はコピー生成のため、生成直後に次フレームの取得・描画(`iterator.next()`)を開始。現フレームのエンコード/背圧待ちと並行化し、「取得+描画」と「エンコード」の直列を解消。
- **出力のディスク逐次書き出し**:
  - `encodeVideoToMp4` に `writeChunk` を追加。指定時は `StreamTarget`(mp4-muxer) で出力チャンクを逐次書き出し、出力全体をメモリ保持しない（fastStart:false = moov 末尾）。
  - Electron に `export-stream-open/write/close` IPC を追加（fd を保持し position 指定で書き込み）。
  - `useProjectExport` は保存先を開き writeChunk で逐次書き込み、`save-buffer-to-file` の全保持書き込みを廃止。
- 検証: ハーネスで `streamed=true`・先頭ボックス=ftyp の有効 MP4 生成、オーバーラップ後も背圧 peakQueueSize=8 維持、無地エンコード正常を確認。

### 選定理由・判断の根拠
- VideoFrame のコピー特性を使うことで、所有権契約を変えずに（ジェネレータ側 close を維持）安全にパイプライン化できる（低リスク）。
- StreamTarget + fastStart:false は逐次・メモリ非保持で実装が単純。moov 末尾の再インポート遅延は許容（外部プレーヤ再生は問題なし）。faststart 化は将来 ffmpeg `-c copy -movflags +faststart` で対応可能。

### 残課題・次のステップ
- 実機（4K/長尺 HEVC）での体感速度・メモリの最終確認。
- 真のボトルネックが Pixi の WebGPU 読み戻しなら、`VideoFrame(canvas)` 直結（colorSpace 対応要確認）でさらに削減余地。

## 2026-05-31 — 書き出しメモリ爆発の真因を修正（エンコーダ背圧）

### 実施内容
- 症状: フレーム供給を bounded 化してもなお、実書き出しでメモリが膨張し続ける。
- 真因: `videoExportPipeline.ts` のエンコーダ背圧が**実質無効**だった。
  - `if (encodeQueueSize > 10) await Promise.race([setTimeout(0), error])` は「1回だけイベントループに譲る」だけで、**キューが捌けるのを待っていなかった**。
  - 生成（プロバイダ＋Pixi描画）が HW エンコードより速いと、**エンコーダ内部キューに VideoFrame が無制限に積もる**（1枚 数MB〜十数MB × 数千枚 → 数十GB）。
- 修正: `encodeQueueSize > MAX_QUEUE(8)` の間、`dequeue` イベント（非対応時は短いポーリング）で**実際にキューが減るまで待つ**。`for await` が止まることで上流の生成も自然に停止し、全体が bounded に。
- 検証: 4K フレームを 600 枚「即時供給」しても `peakQueueSize=8`（上限内）に張り付くことをハーネスで確認（`EncodeResult.peakQueueSize` を追加）。

### 選定理由・判断の根拠
- 真の背圧は「キュー減少を待つ」こと。`setTimeout(0)` の単発譲りは供給を止められず無意味だった。`dequeue` イベントが正攻法、フォールバックの短ポーリングで環境差も吸収。
- MAX_QUEUE=8 はパイプライン段数として十分（スループット維持）かつメモリ上限（4K で ~96MB）の両立点。

### 残課題・次のステップ
- 実機（4K/長尺 HEVC・H.264）での書き出しでメモリが数百MB〜1GB台に収束することの最終確認。
- これまでの一連（decode背圧／0フレームfallback／encoder背圧）で供給・変換・エンコードの全段が bounded 化。

## 2026-05-31 — HEVC 実ファイルのメモリ爆発を修正（0フレーム時のフォールバック）

### 実施内容
- 症状: 実ファイル `IMG_3899.MOV`（iPhone HEVC, ~2GB）で書き出すと 9000 フレーム付近で ~60GB 消費。
- 計測（`createImageBitmap`/`VideoFrame` の生成・解放をカウントする診断）で判明:
  - この HEVC は **VideoDecoder 経路に乗るが 1 フレームも生成しない**（MP4Box デマックスの HEVC 問題）。
  - しかも `VideoFrameProvider.init()` が **0 フレームでも成功扱い**になり、再生方式へフォールバックしなかった。
  - 結果、実書き出しでは「空のプロバイダ」が居座り、毎フレーム `getFrame()`=null → 同期されない通常 Pixi 動画パスに落ち、フレーム蓄積で 60GB。
- 修正（`src/utils/videoFrameProvider.ts`）: `init()` は **1 枚も取得できなければ例外**を投げる。
  - → HEVC は確実に **再生方式(PlaybackFrameProvider)** へフォールバック。
- 検証: 再生方式で実ファイルを 1500 フレーム消費しても **未解放 ImageBitmap は 1〜2 枚・VideoFrame 0**（完全に bounded）、got=1500/1500・60fps相当。

### 選定理由・判断の根拠
- 「0 フレーム成功」は無言の不具合源。明示的に失敗させることで、useProjectExport の 3 段フォールバック（VideoDecoder→再生→シーク）が正しく機能する。
- 再生方式は元から maxBuffer=8 で bounded のため、フォールバックさえ効けばメモリは収束する（計測で確認）。

### 残課題・次のステップ
- 実機での 4K/長尺 HEVC 書き出しでメモリが数GB以内に収束することの体感確認。
- HEVC が VideoDecoder で 0 フレームになる根本（MP4Box の onSamples 不発）は未解明だが、再生方式で実用上は解決。

## 2026-05-30 — 書き出しのメモリ爆発を修正（背圧の追加）

### 実施内容
- 症状: 4K 60fps 5分の動画を書き出すとメモリを ~50GB 消費。
- 原因: `decodeVideoStream`（VideoDecoder 経路）に**背圧が無く**、`feedPromise` が全サンプルを一気に `decoder.decode()` へ流すため、デコード済み 4K VideoFrame（1枚 ~12MB）が `frameQueue` に**無制限に蓄積**していた（消費＝エンコードより圧倒的に速いため）。加えて mp4box の使用済みサンプルも未解放。
- 修正（`src/utils/videoDecodeStream.ts`）:
  - **背圧を追加**: `pendingCount = frameQueue + decodeQueueSize + backlog` が `HIGH_WATER(24)` を超えたら fetch 読み込み（=サンプル供給=デコード）を停止し、1 枚消費（yield）ごとに再開。
  - `releaseUsedSamples` で mp4box 保持の使用済みサンプルを解放。
  - 範囲外フレーム破棄時も供給を再開（`notifyDrain`）。
- 結果: 4K でもピークは「デコード待ち ≤24 枚 + 先読み数枚 + 出力 MP4 数百MB」≒ 約1GB に収束。

### 選定理由・判断の根拠
- 標準的な bounded-queue 背圧パターンを採用。HIGH_WATER=24 はスループット維持（常に先読みが在る）とメモリ上限（4K で ~288MB）の両立点。
- `PlaybackFrameProvider`（再生方式）は元から maxBuffer=8 で背圧済みのため変更不要。問題は VideoDecoder 経路のみ。

### 残課題・次のステップ
- 実機（4K 60fps 5分）で再書き出しし、メモリが収束することの体感確認。
- 出力 MP4 を全てメモリ保持（ArrayBufferTarget）している点は長尺・高ビットレートで効くため、将来はストリーミング書き出し（ファイルへ逐次 flush）も検討余地。

## 2026-05-30 — HEVC 高速書き出し: rVFC 再生方式プロバイダ追加

### 実施内容
- `PlaybackFrameProvider`（`src/utils/playbackFrameProvider.ts`）を新設。
  - HTMLVideoElement を「シークせず再生」し `requestVideoFrameCallback` で提示フレームを取得。
  - OS デコーダ依存なので VideoDecoder/MP4Box が扱えない HEVC 等でも動作。
  - `playbackRate` で高速化＋リングバッファ＋背圧（満杯で一時停止）。
- 共通インターフェース `FrameProvider`（`getFrame`/`close`）を導入し、`VideoFrameProvider` と `PlaybackFrameProvider` を多態化。
- `useProjectExport` を **3 段フォールバック**に変更：①VideoDecoder(最速) → ②再生方式(rVFC・HEVC対応) → ③シーク。
- 計測（HEVC 10000kbps, 30fps×2s 要求）で `playbackRate` を掃引し最適点を決定：
  - 1x: uniq 100% / 30fps、2x: **uniq 98% / 59fps**、3x: 68%、4x: 52%。
  - → 既定 `playbackRate=2`（98% カバレッジ・約2倍速）。

### 選定理由・判断の根拠
- HEVC は VideoDecoder で description 修正後もデマックス側でサンプルが取れずデコード不可だったため、コーデック非依存で確実な「OS 再生＋rVFC」方式を採用。
- `playbackRate=2`：高速化とフレーム落ち（カバレッジ低下）のトレードオフの最良点。3x 以上は欠落フレームが増え書き出しがカクつくため不採用。
- 3 段フォールバックで H.264 は最速(VideoDecoder)、HEVC は再生方式、非対応のみシークと、回帰なく最大速度を選べる。

### 残課題・次のステップ
- 実プロジェクト（実 GoPro HEVC）での体感・画質確認（`npm run dev` → 動画出力）。
- 高 `playbackRate` でのフレーム落ちはソース fps 依存。必要なら適応制御（落ち検出で減速）。
- moov 末尾配置の大容量 H.264 は VideoDecoder 起動が遅く再生方式へ流れる（許容）。

## 2026-05-30 — 書き出し高速化: 全動画を VideoDecoder 経路へ（プロキシ不要化）

### 実施内容
- 書き出しボトルネックを計測ハーネスで定量化（`exportTestHarness.ts` にフェーズ別内訳・ソース直接デコード可否テストを追加）。
  - 結論: ボトルネックは **`HTMLVideoElement.currentTime` シーク = 100ms/フレーム**。コピー/読み戻し/Pixi 合成は 4K でも合計 <4ms と無視できる。
  - H.264(faststart) はソース直接 VideoDecoder で **731fps相当・起動218ms**。HEVC は VideoDecoder 無反応（6s でも 0 フレーム）。
- `useProjectExport` の経路選択を変更：
  - 順方向クリップは「プロキシがあればプロキシ、無ければ**ソースを直接** VideoDecoder デコード」を試行。
  - 初期化が 5s でタイムアウト/失敗した場合のみ従来のシーク方式へフォールバック（HEVC・moov 末尾配置・不正コンテナを安全に退避）。
  - → **H.264 の元動画はプロキシ生成なしで高速エンコード可能に**（9fps → encode 律速の数十fps）。

### 選定理由・判断の根拠
- PixiJS 撤廃・copy-chain 改修は不要と計測で判断：FHD/4K いずれもコピーは実質タダで、遅さの実体はシークだったため。最小変更で目標（重い動画 20〜40fps）に到達できる経路選択変更を採用。
- フォールバックを残す設計：HEVC 直接デコードが現状不可のため、回帰ゼロを最優先。タイムアウト 5s は faststart H.264 の起動(~0.2s)に十分な余裕かつ HEVC 退避を過度に遅延させない値。

### HEVC 調査の結果（追記）
- HEVC HW デコードは Electron で **利用可能**（`isConfigSupported`=supported）。
- 旧バグ: `sample.description` が HEVC で空 → `hvcC` が取れず description 無しで configure → デコーダ無反応。
  → **stsd の sample entry から抽出するよう修正**（`extractDescriptionFromTrack`）。AV1(av1C) も対応。
- ただしテストサンプル `10000kbps_60fps.mp4` では **MP4Box の onSamples が発火せず**（サンプル取り出し0件）、デマックス側に別問題が残る。fMP4 等サンプル特有の可能性があり、ユーザー実機の GoPro HEVC で要再検証。

### 残課題・次のステップ
- **HEVC を確実に無プロキシ高速化する本命案**: HTMLVideoElement の逐次再生（シークなし）＋ `requestVideoFrameCallback`＋ `playbackRate` でフレーム取得する provider。OS デコーダを使うためコーデック非依存で MP4Box 問題を回避できる。
- まずユーザー実機 HEVC で「description 修正だけで速くなるか」を確認するのが安価。
- moov 末尾配置の大容量 H.264 は起動が遅くフォールバック → range 取得 or 軽量 faststart remux の自動化が候補。
- 実プロジェクトでの体感確認（`npm run dev` → 動画出力）は未実施。

## 2026-05-29 — ブラウザでの実機確認とリサイズハンドルの視認性修正

### 実施内容
- レンダラのみをブラウザで起動する preview 設定（`.claude/launch.json`、`VITEST=true` で electron プラグインを無効化）を追加し、computer use で動作確認。
  - リサイズ: 右下ハンドルのドラッグで scaleX/scaleY が 1→2、左上アンカーが固定されることを実機確認。
  - ドラッグ移動のズレ修正: カメラ zoom=2 で本体をドラッグし、移動量が `Δclient/(displayScale*zoom)`（=68px）と一致、旧バグ値（135px）でないことを確認。
  - 書き出しモーダル: 準備中／描画中（フレーム N/総数・%）／キャンセル中の各表示とキャンセルボタン動作を確認。
- リサイズハンドルの見かけサイズ補正に `displayScale` を加味（約 3.7px → 約 10px）。プレビュー縮小時でも掴みやすいサイズに。

### 選定理由・判断の根拠
- ハンドルサイズの補正に displayScale を含める: スクリーン上の実ピクセルサイズは `local * objScale * cameraZoom * displayScale` で決まるため、一定の見かけサイズにするには displayScale も割る必要がある。`renderScene` の依存を増やさないよう ref 経由で参照。

## 2026-05-29 — 動画書き出しの進捗モーダルとキャンセル機能

### 実施内容
- 書き出し中に進捗を表示するモーダル `ExportProgressModal` を追加（App 直下にマウント）。
  - フェーズ表示（準備中 / 描画中 / 保存中 / キャンセル中）。
  - 描画中は「フレーム N / 総数」と % を確定プログレスバーで表示。それ以外は不確定バー。
  - キャンセルボタンを設置。
- store に書き出し進捗・キャンセル要求の状態を追加（TDD）。
  - `exportProgress`（phase / currentFrame / totalFrames）, `exportCancelRequested`。
  - アクション: `setExportProgress`, `requestExportCancel`。`setExporting` で開始時に初期化・終了時にクリア。
- `useProjectExport` を進捗報告・キャンセル対応に更新。
  - フレームループで約 10 回/秒に間引いて進捗を更新。
  - キャンセル要求（または effect クリーンアップ）を `isCancelled()` で監視し、ループ中断・保存スキップ・完了/失敗アラート抑制を行う。

### 選定理由・判断の根拠
- キャンセルを `isExporting=false` ではなく専用フラグ `exportCancelRequested` で行う方針: エンコード処理を中断し保存をスキップした上で `finally` が後始末してから `isExporting` を落とす、という安全な収束順序を保つため。即座に `isExporting` を落とすとモーダルが消え、進行中処理との状態不整合が生じる。
- 進捗更新を間引く: フレーム毎の store 更新は React 再レンダリングを多発させ書き出しを遅くするため、約 10 回/秒に制限。
- 状態を store に置く理由: 書き出しは `useProjectExport`（Viewport 配下）で走るが、モーダルは App 直下に置きたく、コンポーネント間で状態共有が必要なため。

### 残課題・次のステップ
- 現状キャンセルはフレームループ／保存前の境界で反映される。エンコーダ内部処理が長い場合は反映に多少の遅延がある。

## 2026-05-29 — 要素の角リサイズ機能とドラッグ移動ズレの修正

### 実施内容
- 選択中の要素の四隅にリサイズハンドルを表示し、ドラッグで拡縮できる機能を実装。
  - 掴んだ角の対角（アンカー）を固定したまま `scaleX` / `scaleY` を変更する挙動。
  - コンテナの回転にも対応（ローカル軸へ逆回転して拡縮量を算出）。
  - ハンドルはカメラズーム・要素スケールに依らず見かけ一定サイズ（約 10px）になるよう補正。
- リサイズ計算ロジックを純粋関数 `src/utils/transformGeometry.ts` に分離し、TDD で実装（`transformGeometry.test.ts`）。
- 要素のドラッグ移動がカメラズーム時にズレる不具合を修正。
  - 従来は global 座標の差分をそのまま `obj.x/y` に加算していたため、ズーム倍率分ズレていた。
  - コンテナの親空間（`parent.toLocal`）で差分を取るよう変更し、ズーム・回転・ネストを正しく加味。
- 3D ステージのビルボード抽出からリサイズハンドルを除外。

### 選定理由・判断の根拠
- 拡縮を `width/height` ではなく `scaleX/scaleY` で行う方針: text を含む全オブジェクト型で `width/height` を持つとは限らず、`scaleX/scaleY` は `BaseObject` 共通プロパティのため汎用的に扱えるため。
- 幾何計算を PixiJS 非依存の純粋関数へ分離: TDD でアンカー固定・回転対応の数式を単体検証できるようにするため。
- ドラッグ差分を親空間で取る方式: カメラ変換（zoom/rotation/pan）をコンテナ階層から自動的に反映でき、store のカメラ値を個別に持ち込むより堅牢なため。

### 残課題・次のステップ
- グループ所属・キーフレーム/モーションパス・振動オフセットを持つ要素のリサイズは、`obj.x/y` とコンテナ実位置がずれるためアンカー固定が完全でない（静的要素では正確）。必要なら別途対応。
