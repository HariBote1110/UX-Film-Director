# Boundary / IPC / Sidecar Plan

## 目的

UX Film Director vNext は、Electron UI と Rust 編集エンジンの境界を明確に分ける。

特に巨大フレーム転送と危険なメディア処理は、Electron main の安定性を壊さない形にする。

## 制御プレーンとデータプレーン

### 制御プレーン

小さい命令や状態取得を扱う。

例:

- load project
- evaluate timeline
- start decode
- request frame
- start export
- cancel job
- progress event

候補:

- stdio JSON-RPC
- Electron IPC
- napi-rs

MVP では既存の Rust sidecar 資産を活かし、制御プレーンは細い IPC として扱う。

### データプレーン

大きいバイナリを扱う。

例:

- 4K RGBA frame
- decoded video frame
- rendered export frame
- PSD pixel blob

禁止:

- JSON
- base64
- 高頻度 ArrayBuffer IPC 往復

候補:

- 共有メモリ
- mmap
- 一時ファイル
- ring buffer

MVP では CPU 共有メモリ + 明示コピーを初期候補にする。GPU texture zero-copy は後続最適化とする。

## Sidecar の責務

sidecar は危険なメディア処理を隔離する。

MVP で扱うもの:

- CFR H.264 decode
- 画像 decode
- ffprobe / metadata
- ffmpeg encode
- RGBA frame 受け渡し
- progress / cancellation
- decoded RGBA の colour metadata 返却

MVP で扱わないもの:

- HEVC
- HDR
- VFR
- GPU texture zero-copy
- 複数同時 decode job の高度 scheduler

Phase 3 の renderer parity spike は sidecar decode に依存しない。動画平面の入力には、事前抽出した PNG / raw frame を使う。live decode と共有メモリ境界は Phase 4 で検証する。

ただし preview と export が別々に入力素材を decode する構成にはしない。Phase 3 の事前抽出 frame も、preview と export の両方へ同じ decoded RGBA と metadata を渡す。Phase 4 以降は sidecar が画像・動画の decode 済み RGBA を単一経路で供給する。

## 共有メモリ MVP

最初の共有メモリスパイクは以下だけを証明する。

1. sidecar が CFR H.264 を N frame decode する。
2. CPU 共有メモリへ frame を書く。
3. consumer が frame を読む。
4. direct decode reference と checksum / pixel diff が一致する。
5. 4K frame の throughput を測定する。

初回 decode correctness spike:

- `decode-spike` crate で、pure R / G / B と orange / teal などの中間色を含む既知の 32x16 RGBA swatch frame をテスト中に生成する。
- `ffmpeg` + software `libx264` fallback で `yuv444p` / `crf=0` の 1 frame CFR H.264 を作る。
- x264 VUI と stream metadata で `primaries=bt709`、`matrix=bt709`、`range=pc`、`transfer=iec61966-2-1` を明示する。
- `ffprobe` で `codec=h264`、`avgFrameRate=30/1`、`frameCount=1`、colour metadata を確認する。
- `ffmpeg` で decode を 1 回だけ実行し、RGBA8 frame と descriptor を生成する。
- 期待 RGBA と decoded RGBA を `golden-harness` で比較する。
- 実測: `maxDelta=2`、`meanAbsoluteError=0.3125`、`PSNR=52.042869868809795`、
  `SSIM=0.9999737802566389`、CRC32=`ef46fca8`。
- limited range input gate では、同じ swatch を `range=tv` / `color_range=tv` の H.264 4:4:4 として生成し、
  `ffprobe` の `color_range` を読んで `scale=in_range=tv:out_range=pc` を明示する。
- limited range decode -> full-range RGBA の実測: `maxDelta=1`、`meanAbsoluteError=0.25`、
  `PSNR=54.15140352195873`、`SSIM=0.9999824540291767`。

この spike の目的は `preview == export` の一致ではなく、既知入力に対する decode -> colour conversion -> descriptor
の正しさを確認することである。preview / export が同一 decoded buffer を共有する構成では、両者の一致だけでは
正しさの証明にならない。

Rust backend integration gate:

- `decode.start` は shared ring layout と `sourceRate` を返し、session 内に source path と ring state を保持する。
- `decode.requestFrame` は `ffprobe` で source `color_range` を読み、`pc` / `tv` を
  `scale=in_range=...:out_range=pc` へ明示したうえで、`frameIndex` を `ffmpeg` で RGBA decode し、
  GPU row pitch に合わせた `SharedFrame` descriptor と
  `FrameVerificationReport` の CRC32 だけを返す。
- control plane に frame bytes / pixel array / base64 は載せない。
- Electron production IPCとRust backend RPCから、旧 `start-export` / `write-frame` / `end-export` および
  `export.start` / `export.write_frame` / `export.end` のbase64 frame経路を削除する。
- export hookは `PIXI.Application` refを直接持たず、Rust/shared renderer frame sourceまたは
  Viewportから渡される `getExportCanvas` providerだけを参照する。
- export hookは旧VideoDecoder/Pixi注入用の `exportFrameOverridesRef` を公開引数として受け取らず、
  動画exportのframe供給はRust/shared renderer frame sourceに限定する。
- Pixi video cutoverは `exportFrameOverride` / `hasExportFrameOverride` を公開せず、動画preview/exportを
  Pixi bitmap overrideへ戻さない。
- `shouldSkipPixiVideoForSharedRenderer` はexport中でもvideo objectをPixi描画から外し、動画所有を
  Rust/shared rendererへ固定する。
- Pixi video cutoverの公開入力は `objectType` だけとし、export状態やshared renderer ownership idで
  Pixi動画復帰を判定しない。
- ViewportはPixi content routingへ `sharedRendererVideoObjectIds` / `requireSharedRendererVideo` を渡さない。
  動画cutover必須条件はpresenter orchestrationに閉じ、Pixi側はvideo objectを常に外す。
- 旧VideoDecoder/Pixi bitmap override専用の `exportOverlayCanvases` utilityはproduction utilsに置かない。
- export frame canvas utilityは Pixi 固有名をpublic APIに出さず、移行中のcanvas fallbackを `legacyCanvas`
  として扱う。
- `useProjectExport` は `createImageBitmap` を直接呼ばず、互換canvas captureは
  `projectExportLegacyCanvasCapture` adapterに閉じ込める。
- `useProjectExport` は `videoExportPipeline` を直接dynamic importせず、WebCodecs/mp4-muxer互換encoderは
  `projectExportCompatibilityEncoder` adapterへ隔離する。
- `useProjectExport` のWebCodecs/mp4-muxer互換branchは、Electron `export-stream-open` を呼ぶ前にも
  `hasVideoObjects` を再確認し、動画objectが混入した場合はRust backend encoder必須として失敗させる。
- exportのRust必須判定は `rustVideoOnly` flagではなく、動画objectの有無とRust encoder availabilityを正本にする。
- `projectExportCompatibilityEncoder` は非動画export専用adapterとし、動画objectを含む入力はWebCodecs/mp4-muxerを
  loadする前に拒否する。adapter入力の `hasVideoObjects` は必須booleanで、呼び出し側のsentinel渡し忘れを型で止める。
  `videoExportPipeline` の型も静的importせず、旧WebCodecs/mp4-muxer pipelineへの接続は非動画確認後の
  dynamic importだけに閉じる。
- export encode plan / frame source planの `hasVideoObjects` は必須booleanとし、動画有無が未指定のまま
  Rust必須判定やlegacy fallback判定へ進まない。
- Viewport Rust export frame sourceは、動画objectを含むexportでは preview cutover flagの値に関係なく
  effective video cutoverを有効化し、shared renderer encode-only / native render pathへ進む。
- `ProjectExportRustFrameSourceContext` と `BuildViewportRustExportFrameSourceInput` は `hasVideoObjects` を
  必須booleanとして受け取り、optional `objects` から動画有無を推測しない。
- shared renderer export frame sourceのblocked errorは、互換の型ガードとは別に
  `legacyCanvasFallbackAllowed` を持つ。動画bitmap capture拒否ではこれを `false` にし、診断上も
  legacy canvasへ戻れる失敗として扱わない。
- `useProjectExport` は shared renderer / Rust frame source blocked を検知した時点で
  `exportProgress.rustFrameSourceBlocked` へ `reason` / `frameIndex` / `legacyCanvasFallbackAllowed` を記録し、
  failExportか互換fallbackかを判定する前に診断を残す。
- shared renderer export surfaceは `VITE_UXFD_SHARED_RENDERER_EXPORT !== '0'` の既定ON gateでmountし、
  動画exportが実験flag未指定のためにRust frame sourceを失わないようにする。
- production app logicはWebCodecs向けH.264中間ファイル自動生成hookを起動しない。`videoDecodeStream` は
  export test harnessの比較・診断用途に限定する。
- Electron mainは旧WebCodecs intermediate用の `check-intermediate` / `generate-intermediate` /
  `cancel-intermediate` IPCを公開しない。
- `VideoDecoder` / `mp4box` ベースの `decodeVideoStream` は `src/exportTest/` 配下に置き、
  production utils / app startupから参照しない。
- shared renderer preview/export presenter controlは `readPresentedFrameRgbaBytes` を公開しない。
  production orchestrationでpresented frameを取得する口は `takePresentedFrameSharedFrame` に限定し、
  WebGPU RGBA readbackは低レベル診断・parity検証用の実装詳細に留める。
- viewport presenter orchestration test fixtureも `readPresentedFrameRgbaBytes` を持たず、production controlの公開面に揃える。
- Rust backend は unix 環境で attach 可能な POSIX shared memory name を `memoryId` として返し、
  decoded RGBA を shared memory ring へ書く。
- `decode.releaseFrame` は consumer の最終状態を明示して slot を解放する。正常にconsumerがframeを消費した場合は
  `copyOutState=gpuUploadFenceSignalled`、copy / upload / native renderが途中で捨てる場合は
  `copyOutState=rendererUploadAborted` を使う。
- backend integration は `slotCount` と同じ multi-slot POSIX shm layout を作成し、先行 frame が `READING` でも
  後続 frame を別 slot へ書ける。
- renderer presenter は bridge から渡される decoded RGBA `Uint8Array` を、`descriptor.strideBytes` を
  `bytesPerRow` として WebGPU `rgba8unorm-srgb` texture へ upload し、video plane vertex scene で描画できる。
- `shared-video-frame-bridge` は POSIX shm ring から renderer upload buffer 相当の mutable slice へ copy する
  Rust core を持つ。copy 後も slot は `READING` のままで、GPU upload fence 後の release に ownership を委ねる。
- decode data-planeのreleaseはdescriptor由来の `slotIndex` を指定して行い、複数slotが `READING` のときも
  control-plane ringと同じslotだけをfreeに戻す。
- preload は `window.sharedVideoFrame.copyIntoUploadBuffer` を公開する。control payload は `memoryId` / `slotCount` /
  `slotByteLen` / `slotIndex` / `generation` / `ptsFrame` で、frame bytes は renderer-owned `Uint8Array` target にだけ入る。
- renderer utility は verified decoded frame response から upload buffer を準備し、GPU upload fence 後に
  `decode.releaseFrame(copyOutState=gpuUploadFenceSignalled)` を呼ぶ release callback を組み立てる。
- export native render source は verified decoded frame descriptor を Rust backend native renderer へ渡した後、
  render成功時に `gpuUploadFenceSignalled`、render失敗・unsupported block・例外時に
  `rendererUploadAborted` で `decode.releaseFrame` を単回実行する。
- preview/export native render consumer は、decoded sourceに complete / abort release callback が揃っていない場合、
  Rust backend native rendererへ渡す前に `nativeRenderSourceReleaseUnavailable` でfail-loudにする。
  この場合、preview/export diagnostics は専用の `*NativeRenderSourceReleaseRequired=true` を出して、
  release ownership不備として見分けられるようにする。
- Rust backend encode writer が native render output を消費する前に失敗した場合、export encode runner は
  `render.releaseNativeSharedFrame` を呼び、`released` / `missingBridge` / `failed` / `skipped` の release診断イベントを
  callbackへ通知する。`useProjectExport` はこのイベントを `exportProgress.nativeRenderOutputRelease` に保持し、
  export progress UIから確認できるようにする。
- `shared-video-frame-bridge-node` は Rust core を N-API addon として wrap し、Node 直 require では
  `Uint8Array` target を in-place mutation できる。
- preload は native module を `UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE` で差し込む形を維持し、未接続時は fail-loud とする。
- env 未指定時、preload は dev build output と packaged resources の `.node` を順に探す。
- Electron `contextBridge` 越しでも、preload は native copy 後の pixel bytes を戻り値へ載せない。
  renderer helper は copy report に pixel payload が混入した場合 fail-loud とし、data-plane を shared memory /
  native copy bridge / renderer-owned upload buffer に限定する。
- Viewport は video cutover flag が有効なとき、presenter 起動前に Rust backend decode request と shared memory copy を行い、
  decoded upload object を clip id 付きで WebGPU presenter に渡す。
- Rust video-only modeでは、video plane geometryとdecode request builderのRust/WASM control-planeが使えない場合、
  TypeScript fallbackへ戻らず `requiredRustVideoControlPlaneUnavailable` として失敗させる。
- WebGPU presenter は upload 済み texture を `presentVideoFrameScene` へ渡して描画する。複数動画では
  `texturesByClipId` と `videoObjectIds` により、Rust upload が成功した clip だけを bind group 切替で描画する。
  upload ready だけで shared ownership に進めて Pixi video を消すことは禁止。
- copy / upload / stale response 失敗時は `rendererUploadAborted` で decoded slot を release し、
  back pressure による `NoFreeSlot` を避ける。
- 複数動画uploadで後続clipが失敗した場合も、すでに準備済みの先行upload objectへ
  `releaseAfterUploadAbort` を流し、全ての未提示decoded slotを `rendererUploadAborted` へ戻す。
- Viewport orchestration は decode job が解決した時点で active job ref を更新し、effect cancellation 後の
  `decode.start` 連打を避ける。複数動画では active jobs を配列で保持し、見えていない stale job は
  `decode.stop` で破棄する。
- Rust backend decode は jobId keyed multi-session とする。同じ source/layout の active job は再利用し、
  見えている複数動画はそれぞれ独立した shared memory ring / WebGPU texture upload として処理する。
- Rust backend decode は `ffprobe` metadata により `color_primaries=bt709`、
  `color_transfer=iec61966-2-1`、`color_space=bt709`、`color_range=pc/tv` を確認する。
  現在の renderer handoff は `rgba8Srgb` / full range に固定されるため、これ以外の transfer / matrix / primaries は
  fail-loud とする。HDR / 10bit / 変換対応は後続 gate とする。

## Protocol Contract

Phase 4 の入口として `sidecar-protocol` crate を置く。

制御プレーンに載せるもの:

- job id
- frame index
- slot index
- shared memory / mmap の識別子
- byte offset / byte length
- width / height / stride
- pixel format
- colour metadata
- progress / error / release event
- checksum / pixel diff summary

制御プレーンに載せないもの:

- decoded frame bytes
- pixel array
- base64 frame
- 高頻度の巨大 ArrayBuffer

初期 frame descriptor:

- `memoryId`
- `slotIndex`
- `generation`
- `byteOffset`
- `byteLen`
- `width`
- `height`
- `strideBytes`
- `format`
- `colour`

`generation` は slot lease token として扱う。consumer が古い `ReadyFrame` を保持したまま watchdog recovery が走り、
同じ slot が次の frame に再利用された場合でも、古い release が新しい frame を `free` に戻してはいけない。

frame request は float 秒ではなく `frameIndex` を使う。これは `rust-core` の timeline evaluation と同じ時間正本に揃えるためである。
`decode.start` は `sourceRate` を rational (`numerator` / `denominator`) として固定し、session 内の
`requestFrame` は同じ source time base の整数 `frameIndex` で要求する。

H.264 / HEVC の任意 frame access は O(1) ではない。`requestFrame(N)` は直前 keyframe から decode forward
する場合があり、consumer は variable latency を許容して最後の ready frame を保持する。
interactive scrub では backlog を作らないため、MVP の `DecodeFrameRequest` は `requestId` と
`mode = latestWins` を持つ。sidecar / scheduler は最新 request を優先し、古い request が完了しても
consumer は `requestId` / frame index を照合して stale frame を破棄できる必要がある。

ready frame は `SharedFrame.ptsFrame` に実際に decode された frame index を持つ。consumer は
「最後に要求した frame だから次の ready slot もその frame」と仮定してはいけない。ring は順序付き queue ではなく、
descriptor / `slotIndex` / `ptsFrame` / `generation` を照合して読む。

consumer は `strideBytes` を必ず使って行を読む。`width * 4` の tight stride を仮定しない。decoder / GPU upload は
row pitch alignment を要求することがあり、padding 付き frame を正しく扱う必要がある。

`colour` metadata は renderer の入力 decode 契約に直結する。たとえば `format = rgba8Srgb` かつ
`colour.transfer = srgb` の frame は、`03-colour-pipeline.md` の sRGB decode -> linear light 合成規則で読む。
consumer は OS / decoder の推測値に依存しない。

verification report:

- `frameIndex`
- `checksum`
  - `algorithm`
  - `valueHex`
  - `byteLen`
- `diff`
  - `maxChannelDelta`
  - `meanAbsoluteError`
  - `differingChannels`
- `status`

verification report も frame bytes / pixel array / base64 を含まない。

job lifecycle:

- `CancelJobRequest` は `jobId` のみを持つ。frame descriptor、bytes、pixel array、base64 は持たない。
- `ControlEvent` は job 状態を `jobStarted` / `jobProgress` / `jobCompleted` / `jobCancelled` / `jobFailed` で返す。
- `jobProgress` は `completedFrames` と `totalFrames` のみを持つ。progress event に frame data を混ぜない。
- job state は `queued -> running -> completed`、または `queued/running -> cancelling -> cancelled` を基本とする。
- cancel request 後に worker が最後の frame 処理を終えても、`complete` へ進まず `CancellationPending` として止める。
- cancel の確定は cleanup 完了後の `jobCancelled` event で表す。
- `request_cancel` は `cancelling` では冪等に扱い、terminal state の job には新しい cancel を適用しない。

renderer handoff validation:

- MVP renderer handoff は `Rgba8Srgb`、`primaries=bt709`、`transfer=srgb`、`matrix=rgb`、`range=full` のみを受け付ける。
- `transfer=bt709` や `range=tv` など未対応 metadata が来た場合は fail-loud にする。
- 未対応 metadata を sRGB / full range として無音処理してはいけない。

## Back Pressure

共有メモリは所有権と back pressure を明示する。

Phase 4 の初期契約として、`sidecar-protocol` に純粋な ring buffer state machine を置く。
これは OS の共有メモリ API にはまだ依存しない。mmap / named shared memory 実装は、この contract に従う。

shared memory header:

- 共有領域の先頭に `#[repr(C)]` header を置く。
- header は `magic`、`protocolVersion`、`headerBytes`、`layoutHash`、`slotCount`、`slotByteLen`、`initState` を持つ。
- attach 時に magic / protocol version / header size / layout hash を検証し、不一致なら fail-loud にする。
- `repr(C)` は field layout を固定するが、別ビルド間の version drift は検出しない。layout hash と version check を必須にする。
- producer は header と全 slot を初期化した後、最後に `initState=ready` を release-store する。
- consumer は `initState` を acquire-load で待ち、ready を観測した後にだけ slot state / descriptor / frame bytes に触る。
- `shared-memory-spike` の `SharedRingHeader` は現時点で size 40 bytes、主要 offset を test で固定する。

ring layout:

- `memoryId`
- `slotCount`
- `slotByteLen`
- `width`
- `height`
- `strideBytes`
- `format`
- `colour`

各 slot の `byteOffset` は `slotIndex * slotByteLen` で導出する。

状態:

- free
- writing
- ready
- reading

状態遷移:

```text
free --producer acquire--> writing
writing --producer mark ready--> ready
ready --consumer acquire--> reading
reading --consumer release--> free
```

所有権:

- `writing` は producer のみが所有し、consumer は読まない。
- `ready` は consumer に渡せるが、producer は上書きしない。
- `reading` は consumer のみが所有し、producer は上書きしない。
- `free` のみ producer が次の decode 出力先として取得できる。

同期契約:

- ring は MVP では single producer / single consumer (SPSC) とする。
- slot state は共有メモリ上で atomic `u32` として扱う。
- producer は frame bytes と descriptor を書き終えた後、`ready` を release-store する。
- consumer は `ready` を acquire-load した後にのみ、descriptor と frame bytes を読む。
- plain load / store だけで `ready` を観測してはいけない。Apple Silicon では store reordering により
  `ready` に見えても bytes がまだ可視化されていない torn frame が起きうる。
- `reading -> free` は consumer の copy-out 完了後に限る。renderer consumer の場合、CPU -> GPU upload
  の完了 fence が signal された後に free に戻す。`writeTexture` / `copyBufferToTexture` を開始した時点で
  free に戻さない。

複数 consumer:

- preview と export が同じ decoded frame を必要とする場合でも、1 つの ring slot を複数 consumer で共有しない。
- MVP では request ごと、または preview / export 経路ごとに独立 ring を使う。
- 1 ring を複数 consumer で共有すると、一方が free に戻した slot を他方がまだ読んでいる危険がある。

back pressure:

- producer が `free` slot を取得できない場合は `NoFreeSlot` とし、decode を止める。
- consumer が `ready` slot を取得できない場合は `NoReadySlot` とし、待機または次 tick へ戻る。
- frame bytes は制御プレーンに載せず、`SharedFrame` は descriptor と `ptsFrame` だけを持つ。
- policy は用途で分ける。decode-ahead / export は `NoFreeSlot` で block、realtime preview は必要に応じて
  drop / skip を選べる。ただし primitive は `NoFreeSlot` を返すだけに留め、policy を呼び出し側で名前付けする。

slot lease / recovery:

- `FrameDescriptor.generation` は slot の lease generation を表す。
- `FrameRingLayout.descriptor_for_slot` の静的 descriptor は `generation=0` を返す。
- 実 writer lease は `SharedFrameRing.acquire_write_slot` が発行し、slot ごとに generation を 1 ずつ進める。
- `mark_slot_ready` と `release_read_slot` は、渡された lease generation が現在の slot generation と一致する場合だけ成功する。
- watchdog が `writing` / `ready` / `reading` の stuck slot を recover する場合、slot を `free` に戻し、generation を進めて古い token を無効化する。
- 古い consumer が recovery 後に `release_read_slot` を呼んでも `LeaseGenerationMismatch` で拒否し、新しい reader lease を壊さない。

atomic ordering verification:

- `shared-memory-spike` は `loom` で release/acquire publication をモデル化する。
- init handshake も `loom` でモデル化する。header fields を書いた後に `initState` を release-store し、
  consumer が acquire-load 後に header fields を読む model は全 interleaving で pass する。
- `initState` の store/load を Relaxed に落とす perturb model は failure として検出する。
- producer が frame bytes を書いた後に `ready` を release-store し、consumer が `ready` を acquire-load してから bytes を読む model は全 interleaving で pass する。
- `ready` の store/load を Relaxed に落とす perturb model は failure として検出する。
- slot reuse も `loom` でモデル化する。consumer が copy-out marker を書いた後に `free` を release-store し、
  producer が `free` を acquire-load してから slot を再利用する model は全 interleaving で pass する。
- `free` の store/load を Relaxed に落とす recycle perturb model は failure として検出する。
- これは shader perturb と同じく、test が本当に順序欠落を検出できるかを確認するための gate である。

atomic ring stress:

- `shared-memory-spike` crate は、OS mmap の前段として `AtomicU32` slot state と release/acquire を使う
  in-memory SPSC ring を持つ。
- producer / consumer を実スレッドで同時に回し、2,000 frames の deterministic bytes と CRC32 を検証する。
- stress は throughput / 機能確認として扱う。メモリ順序 correctness の主証明は loom model とする。
- ThreadSanitizer は後続 CI / nightly toolchain で追加する。
- Cross-process mmap 自体は `loom` の対象外である。実 mmap 移行時は、atomics を共有 mapping 内に置き、
  loom で検証した順序を変更しない。

POSIX shm two-process spike:

- `shared-memory-spike` は macOS 上で POSIX `shm_open` / `ftruncate` / `mmap(MAP_SHARED)` を使う
  2 プロセス spike を持つ。
- consumer を producer より先に起動し、shm object が存在するまで retry してから `initState` handshake に入る。
- producer / consumer は別プロセスで 250 frames x 4,096 bytes の deterministic frame と CRC32 を検証する。
- 実 mapping 上の layout hash を意図的に壊した場合、attach は `LayoutHashMismatch` で fail-loud になる。
- data plane の frame bytes は disk temporary file ではなく POSIX shm に置く。
- `decode-spike` の既知 CFR H.264 decode RGBA を POSIX shm ring に流し、別プロセス consumer が raw RGBA
  bytes / CRC32 を検証する統合 test を持つ。
- sidecar data-plane handoff gate では、direct decode した RGBA bytes を `write_sidecar_decoded_frame_to_ring` で
  POSIX shm に書き込み、`JobStarted -> FrameReady -> JobCompleted` の control events と
  `FrameVerificationReport.checksum` を返す。consumer readback の CRC32 は direct decode reference と一致する。
- 同 gate は renderer handoff descriptor validation を shm 書き込み前に実行する。未対応 transfer / range /
  matrix / format は data plane に流さず fail-loud にする。
- POSIX shm から読み出した decoded RGBA を native wgpu renderer に渡し、render 完了後に slot を release する
  integration test を持つ。
- shm decoded frame -> native render -> known swatch の実測は `maxDelta=2`、`meanAbsoluteError=0.3125`、
  `PSNR=52.042869868809795`、`SSIM=0.9999737802566389`。

## 4K Throughput / Slot Sizing

4K frame の初期 sizing は `sidecar-protocol` の `frame_buffer_footprint` を正本にする。

- RGBA8 / 3840x2160: `bytesPerPixel=4`、`strideBytes=15,360`、`slotByteLen=33,177,600`。
- `rgba16float` / 3840x2160: `bytesPerPixel=8`、`strideBytes=30,720`、`slotByteLen=66,355,200`。
- row pitch は GPU copy/readback と揃えるため 256 byte alignment とする。
- preview / export は独立 ring とし、slot 数は用途ごとに測定から決める。MVP の初期値は preview 2-3 slots、
  export 2-3 slots を候補にするが、control plane contract には固定しない。

native wgpu の 4K throughput probe は stage を分けて測る。

- `setup`: adapter / device / pipeline / render target / readback buffer 作成。一回性 cost として扱う。
- `sourceUpload`: source texture 作成、CPU bytes の staging copy、queue flush、GPU work completion。
- `render`: render command submit から GPU work completion。
- `readbackEncode`: `copy_texture_to_buffer` completion、buffer map、`f16` readback scan、
  premultiplied -> straight RGBA8、CPU linear -> sRGB encode。
- `steadyState`: `sourceUpload + render + readbackEncode`。export の per-frame cost として読む。

Release build の 4K single-clip 観測レンジ:

- `setup=9.623042ms-25.295542ms`
- `sourceUpload=10.807208ms-12.032625ms`
- `render=7.610625ms-8.507167ms`
- `readbackEncode=112.997ms-136.20175ms`
- `steadyState=132.664167ms-155.516125ms`
- `total=146.89025ms-181.625625ms`

preview path は readback を行わないため、preview 相当の steady cost は `sourceUpload + render = 約18.5-20.5ms`
である。export path は `readbackEncode` を含むため `約132.7-155.5ms/frame` になる。

この probe で、`wgpu::Limits::downlevel_defaults()` のままだと `maxTextureDimension2D=2048` になり
4K texture を作れないことを確認した。native renderer は frame size に合わせて device request limit を上げ、
adapter limit を超える場合は fail-loud にする。

現時点の支配項は export 側の readback + CPU encode である。これは shader 側で premultiplied -> straight、
linear -> sRGB、将来的には YUV conversion まで寄せ、u8 / YUV を readback する最適化の根拠になる。
ただし MVP ではこの最適化を前倒しせず、まず export round-trip correctness と明示 ffmpeg colour conversion
を通す。

export steady state が約 6.4-7.5fps である場合、4K30 の 5 分素材は 9,000 frames なので、readback + CPU encode
だけで約 20-23 分が下限になる。これは encode 時間をまだ含まない。後続最適化の主標的は
`readbackEncode` leg であり、shader encode / u8 readback は readback 量を `rgba16float` の 66MB/frame から
RGBA8 の 33MB/frame へ半減しつつ、8.3M pixels/frame の CPU sRGB encode も外せる。

## Export Round-Trip / Explicit Colour Conversion

初期 export gate は H.264 4:4:4 で correctness を確認する。

- 入力は native wgpu が返した `Rgba8Srgb` frame。
- ffmpeg input は rawvideo `rgba` として渡す。
- `zscale` では入力側 `primariesin=bt709`、`transferin=iec61966-2-1`、`matrixin=gbr`、`rangein=full` を明示する。
- H.264 側は `primaries=bt709`、`transfer=iec61966-2-1`、`matrix=bt709`、`range=full` を明示する。
- `libx264` には `range=pc:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709` を渡し、
  container tags も `-color_primaries bt709` / `-color_trc iec61966-2-1` / `-colorspace bt709` /
  `-color_range pc` で明示する。

decode 側も H.264 4:4:4 の `bt709` / sRGB transfer / full range を `zscale` へ明示し、最後に `format=rgba`
へ落とす。zscale の出力 matrix に `gbr` を直接指定すると YUV family と RGB matrix の不整合で失敗するため、
YUV 側の colour contract を固定してから RGBA 化する。

実測:

- explicit H.264 4:4:4 export round-trip: `maxDelta=1`、`meanAbsoluteError=0.203125`、
  `PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- native wgpu -> explicit H.264 4:4:4 export round-trip: `maxDelta=1`、
  `meanAbsoluteError=0.203125`、`PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。
- native preview output -> export round-trip output の直接比較: `maxDelta=1`、
  `meanAbsoluteError=0.203125`、`PSNR=55.05316982544961`、`SSIM=0.9999856973166401`。

4:2:0 export は chroma subsampling により許容差が別物になるため、この gate とは分ける。
MVP ではまず 4:4:4 の数学 correctness を固定し、配布用 H.264 4:2:0 / HEVC は後続 gate で扱う。

この spike は内部一貫性を優先し、H.264 4:4:4 も `transfer=iec61966-2-1` としてタグ付けしている。
shipping export では SDR H.264 の一般的な再生環境に合わせ、bt709 transfer 出力を使う。
gamma misread を避けるため、bt709 transfer 版も別 gate として確認済みである。

bt709 transfer shipping gate:

- encode: `primariesin=bt709`、`transferin=iec61966-2-1`、`matrixin=gbr`、`rangein=full` から
  `primaries=bt709`、`transfer=bt709`、`matrix=bt709`、`range=full` へ変換する。
- decode verification: `transferin=bt709` から `transfer=iec61966-2-1` へ戻して RGBA 比較する。
- `libx264` / container tags も `transfer=bt709` / `-color_trc bt709` に揃える。
- RGBA -> bt709 H.264 4:4:4 -> RGBA: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- native wgpu -> bt709 H.264 4:4:4 -> RGBA: `maxDelta=2`、`meanAbsoluteError=0.328125`、
  `PSNR=52.57532498834205`、`SSIM=0.999975264393527`。
- native preview output -> bt709 export round-trip output: `maxDelta=2`、
  `meanAbsoluteError=0.328125`、`PSNR=52.57532498834205`、`SSIM=0.999975264393527`。

MVP 縦スライスの WYSIWYG claim は「preview と export は codec 由来の 8-bit YUV 丸め床を除いて一致する」である。
bit-exact equality は codec export を通した時点で要求しない。sRGB-tag spike gate では residual は `maxDelta=1`、
bt709-transfer shipping gate では transfer conversion を含めて `maxDelta=2` である。

H.264 4:2:0 distribution gate:

- encode: bt709 transfer shipping gate と同じ colour conversion を使い、最後を `format=yuv420p` にする。
- ffprobe は full range 4:2:0 を `pix_fmt=yuvj420p` と報告する。これは `range=pc` と合わせて受け入れる。
- 4:2:0 は chroma subsampling により、graphics / text / hard chroma edge で大きな局所劣化を起こす。
  renderer parity failure と混同しない。
- そのため distribution gate は full-frame envelope と stable swatch interior を分ける。
- RGBA -> bt709 H.264 4:2:0 -> RGBA full-frame: `maxDelta=132`、
  `meanAbsoluteError=3.0048828125`、`PSNR=27.403575633662975`、`SSIM=0.9915148895704098`。
- RGBA -> bt709 H.264 4:2:0 -> RGBA swatch interior: `maxDelta=2`、
  `meanAbsoluteError=0.34375`、`PSNR=52.390490931401914`、`SSIM=0.9999747882512735`。
- native wgpu -> bt709 H.264 4:2:0 -> RGBA full-frame / swatch interior も同じ値で gate を通過した。

高忠実度が必要な編集確認・中間成果物は 4:4:4 gate、配布用互換性は 4:2:0 gate で扱う。

## macOS VideoToolbox

macOS-first なので、VideoToolbox は将来的に優先候補になる。

ただし現行 UX Film Director では、プレビュー decode と書き出し encode の VideoToolbox セッション競合で破損する問題があった。vNext では sidecar 隔離により構造的に改善できる可能性があるため、別スパイクで検証する。

初期 export では software `libx264` fallback を必ず残す。

## Windows

Windows は初期段階では準対応に留める。

MVP 基準:

- build が通る。
- 起動する。
- 1 frame smoke が通る。

Windows 固有の named shared memory や GPU backend 最適化は MVP の blocker にしない。

## 未決事項

- frame header schema
- cancellation protocol
- sidecar crash recovery
  - MVP で完全 recovery までは作らないが、producer が `writing` で落ちる、または consumer が `reading` で落ちる
    stuck slot を無音 deadlock にしない。
  - generation counter は slot lease として採用済み。
  - timeout / heartbeat の具体値と、どの process が recover を発火するかは未決。
- cancellation timeout / force kill policy
  - control-plane の cancel state machine は固定済み。
  - 実 process が stuck した場合に何秒で kill するか、partial output をどう掃除するかは未決。
- napi-rs を使う範囲
