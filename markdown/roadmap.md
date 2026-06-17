# UX Film Director vNext ロードマップ

## 目的

このロードマップは、UX Film Director vNext を Rust / wgpu 中心の編集エンジンへ移行するための実行順を定義する。

最初の MVP は、使える編集機能ではなく、アーキテクチャが崩れないことを証明する最小の縦スライスである。

## Phase 0: 設計正本の確定

成果物:

- `markdown/architecture/00-overview.md`
- `markdown/architecture/01-decision-record.md`
- `markdown/architecture/02-rust-core-spec.md`
- `markdown/architecture/03-colour-pipeline.md`
- `markdown/architecture/04-render-parity.md`
- `markdown/architecture/05-boundary-ipc.md`
- `markdown/roadmap.md`

完了条件:

- macOS-first の前提が明記されている。
- MVP に入れるもの、入れないものが明記されている。
- 却下案と理由が ADR に記録されている。

## Phase 1: Rust Core 土台

期間目安: Week 1

TDD タスク:

1. Red: project model の serialize round-trip test
2. 設計: schema 設計メモを `02-rust-core-spec.md` と照合し、時間表現を rational / frame index に固定
3. Green: 最小 project / track / clip / property schema
4. Refactor: schema module 抽出
5. Red: 単一 track / 単一 clip の frame index query test
6. Green: timeline evaluator
7. Refactor: evaluator と schema の責務分離
8. Red: keyframe linear interpolation の境界 test
9. Green: keyframe evaluator
10. Refactor: keyframe evaluator の型整理
11. Red: property-based test
12. Green: rational time / frame index 入力の決定性、有限値、単調性保証
13. Refactor: validation と evaluator の重複排除
14. Red: command undo / redo test
15. Green: `SetClipOpacity` command と undo command
16. Red: scene snapshot の renderer 境界 contract test
17. Green: snapshot の colour metadata、clip transform、effect stack

完了条件:

- `rust-core` が UI / GPU / IO 非依存でテストできる。
- `load -> save -> load` が identity。
- 同じ project と同じ frame index の評価が決定的。

## Phase 2: Golden Harness

期間目安: Week 2

TDD タスク:

1. Red: 同一画像比較が pass する test
2. Red: 意図的にずらした画像が fail する test
3. Green: PSNR / SSIM / 平均絶対誤差 / 最大ピクセル差の比較関数
4. Refactor: 比較指標と fixture IO を分離
5. Red: PNG fixture IO の round-trip test
6. Green: RGBA8 PNG の save / load
7. Red: 解析的 reference scene の test
8. Green: CPU reference renderer
9. Characterization golden を現行 pipeline から取得
10. 現行 golden が不安定な場合は reference golden へ切替
11. Refactor: golden fixture 管理を整理

完了条件:

- renderer parity の比較関数が単体テスト済み。
- PNG fixture の保存・読込が単体テスト済み。
- 解析的 reference scene が CPU reference renderer で生成できる。
- golden の閾値が文書化されている。
- 現行 pipeline を正本にできるか判断済み。

## Phase 3: wgpu Parity Spike

期間目安: Week 3

このフェーズは探索 spike であり、通常の Red / Green / Refactor だけでは扱わない。pass / fail gate を明確にして進める。

対象:

- 1 動画平面
- 事前抽出した静止フレームを動画平面の代理入力にする
- 1 画像
- 1 opacity keyframe
- 1 エフェクト（per-pixel gain / exposure 系）
- linear light 合成
- premultiplied alpha
- SDR / Rec.709

TDD / 検証タスク:

### Phase 3a: native wgpu 単独

1. `rust-core` の scene snapshot を renderer へ渡す。
2. `reference-renderer` で解析的 CPU reference frame を生成する。
3. native wgpu / Metal で同じ frame index を `rgba16float` に描画する。
4. readback 後に CPU reference と同じ量子化規則で RGBA8 へ変換する。
5. golden-frame harness の max channel delta を主 gate として比較する。
6. Refactor: native renderer の最小 API と spike 固有の制約を分離する。

### Phase 3b: WebGPU preview parity

1. shared WGSL を native wgpu と WebGPU preview で共有する。
2. WebGPU preview harness で指定 scene を描画する。
3. preview / native / CPU reference / hand anchor を比較する。
4. 原因分類に WGSL -> MSL 翻訳器差（Dawn/Tint と wgpu-native/Naga）を含める。
5. Refactor: spike で得た実装を恒久 API と実験コードに分離する。

### Phase 3c: integer transform / nearest sampling

1. Red: 2x2 source を `translation=(1,1)`、`scale=(2,2)` で 5x5 canvas に配置する hand anchor test
2. Green: CPU reference renderer で integer translation / nearest scale / clipping を実装
3. Green: shared WGSL と native wgpu renderer を同じ nearest mapping に揃える
4. WebGPU preview harness に同じ case を追加し、Chrome / Metal で `maxDelta=0` を確認する

### Phase 3d: linear-light bilinear sampling

1. Red: 2x1 source（black / white）の midpoint を `sampling=bilinear` で描画し、期待値 `[188,188,188,255]` を hand anchor にする
2. Green: `Transform.sampling` に `nearest` / `bilinear` を追加し、既定値は `nearest` とする
3. Green: CPU reference renderer、shared WGSL、native wgpu renderer で sRGB decode 後の linear-light bilinear 補間を実装する
4. WebGPU preview harness に同じ case を追加し、Chrome / Metal で `maxDelta=0` を確認する

Go 条件:

- Phase 3a: macOS / Metal 上で native wgpu と CPU reference が max channel delta の許容内に入る。
- Phase 3b: macOS / Metal 上で preview と export frame が許容誤差内に入る。
- Phase 3c: integer translation / nearest scale が CPU reference、native wgpu、WebGPU preview で一致する。
- Phase 3d: linear-light bilinear midpoint が CPU reference、native wgpu、WebGPU preview で一致する。

見直し条件:

- 許容誤差を超え、原因が制御不能な backend 差である。
- Dawn-native でも解決できない。

## Phase 4: Sidecar / Boundary Spike

期間目安: Week 4

対象:

- CFR H.264
- CPU 共有メモリ
- 4K frame throughput
- ffmpeg encode
- 明示 `zscale` 変換

TDD / 検証タスク:

1. Red: 制御プレーンに frame bytes / base64 / pixel array を載せない protocol test
2. Green: descriptor + metadata の control event
3. Red: cancel request / progress / job lifecycle が control-plane のみで完結する protocol test
4. Green: `queued -> running -> cancelling -> cancelled` と cancellation pending guard
5. Red: ring buffer layout / ownership / back pressure の state machine test
6. Green: `free -> writing -> ready -> reading -> free` と `NoFreeSlot` / `NoReadySlot`
7. Red: watchdog recovery 後の stale slot release を拒否する generation contract test
8. Green: descriptor generation / stuck slot recovery / lease mismatch guard
9. Red: atomic release/acquire と GPU upload fence 前 release 禁止の contract test
10. Green: SPSC / independent ring / copy-out completion contract
11. Red: checksum / pixel diff summary の schema test
12. Green: verification report schema
13. Red: 既知 CFR H.264 frame の decode correctness test
14. Green: software `libx264` fallback で既知 frame を encode/decode し、期待 RGBA と比較
15. Red: unsupported transfer / range を fail-loud にする descriptor validation test
16. Green: renderer handoff validation
17. Red: loom で publish / recycle の Release/Acquire は pass、Relaxed perturb は fail する ordering model test
18. Red: shared memory header の magic / version / layout hash / init handshake test
19. Green: `repr(C)` shared header と loom init handshake gate
20. Red: producer / consumer 並行 stress で checksum を検証する atomic ring test
21. Green: release/acquire を使う in-memory SPSC ring spike
22. Red: POSIX shm 2プロセス CRC stress と layout hash mismatch fail-loud test
23. Green: `shm_open` / `mmap(MAP_SHARED)` backing
24. Red: 既知 CFR H.264 decoded RGBA -> POSIX shm -> 別プロセス consumer の checksum test
25. Green: decode correctness と data plane backing の統合
26. Red: POSIX shm decoded RGBA -> native wgpu render -> known swatch 比較 test
27. Green: input -> decode -> shm -> render の end-to-end correctness
28. Red: sidecar decode frame と direct decode reference の checksum 一致 test
29. Green: sidecar + CPU 共有メモリ
30. Refactor: 制御プレーンとデータプレーンの責務分離
31. Red: timeline -> wgpu RGBA -> ffmpeg -> 再 decode の 4:4:4 round-trip 比較
32. Green: explicit `zscale` / `libx264` colour tags による H.264 4:4:4 export pipeline
33. Refactor: ffmpeg 明示色変換設定と export orchestration を分離
34. Red: 4K slot footprint と native wgpu stage timing の contract test
35. Green: RGBA8 / `rgba16float` footprint 計算、`sourceUpload` / `render` / `readbackEncode` 測定 API
36. 4K throughput を debug / release build で記録し、支配項を分類

完了条件:

- JSON/base64 を使わず frame を渡せる。
- ffmpeg の暗黙色変換に依存していない。
- software `libx264` fallback がある。
- 4K RGBA8 source slot と `rgba16float` readback footprint が test で固定されている。
- 4K single-frame の upload / render / readbackEncode が stage 別に測定できる。
- known-content swatch が native wgpu -> explicit H.264 4:4:4 -> 再 decode で許容差内に収まる。
- native preview output と export round-trip output が codec 丸め床の範囲内で直接比較されている。
- shipping 向け bt709 transfer H.264 4:4:4 export が known-content swatch で許容差内に収まる。
- distribution 向け bt709 H.264 4:2:0 export の full-frame envelope と stable-region correctness が分離されている。
- watchdog recovery 後の stale slot release が generation mismatch で拒否される。
- limited range H.264 input が metadata-driven decode で full-range `Rgba8Srgb` に正規化される。

## Phase 5: Pixi から shared renderer への移行

Phase 1 から 4 が成立した後に開始する。

方針:

- PixiJS は恒久 API ではなく移行足場とする。
- React/Zustand は編集正本を持たない。
- Rust evaluator と shared renderer を段階的に既存 UI へ接続する。

入口 gate:

1. Red: 既存 `TimelineObject` / layer visibility / project fps から rust-core 互換 `SceneSnapshot` JSON を生成する contract test
2. Green: `image` / `video` の active media plane だけを `RustSceneSnapshot` + media references へ変換する TS adapter
3. Fail-loud: text / shape / PSD / audio / rotation / blur など未移植 Pixi 機能は shared renderer へ黙って渡さない
4. Bridge: adapter 出力を WebGPU shared renderer preview surface へ渡し、Pixi preview と並走できる feature flag を作る
5. Cutover: 代表 scene の preview / native export parity が通った範囲から Pixi 経路を外す

初回 bridge は Pixi を primary renderer のまま維持し、shared renderer は `parallelCompare` candidate として扱う。
Pixi との差分は legacy oracle ではなく triage signal とし、解析的 reference / native parity gate と矛盾する場合は
Pixi 側の旧挙動を疑う。
比較診断 report は frame bytes / pixel array / base64 を含めず、frame index と max channel delta /
mean absolute error などの metrics だけを持つ。
WebGPU preview surface は `colorSpace: "srgb"` と `alphaMode: "premultiplied"` を明示し、比較 readback は
page-composited canvas ではなく offscreen render target から取る。Pixi / shared renderer の比較は同じ
frozen frame index に固定し、unsupported frame は parity metric から除外して Pixi-only partition として記録する。
macOS P3 display 上の sRGB -> P3 表示カラーマネジメントは offscreen readback では観測できないため、
初回 surface go 判定前に、実機 P3 Mac で shared-renderer preview swatch と export-decoded reference swatch を
並べた visual / sampled check を一度通す。
初回 presenter は shader / pipeline をまだ持たず、WebGPU adapter / device / canvas context の取得、
`colorSpace: "srgb"` / `alphaMode: "premultiplied"` / `GPUTextureUsage.RENDER_ATTACHMENT` による
canvas configure、device lost 時の Pixi fallback 通知だけを責務にする。
canvas format は `navigator.gpu.getPreferredCanvasFormat()` の非 `-srgb` 形式を使う。shared renderer / export は
linear -> sRGB encode を自前で行うため、`-srgb` canvas format による二重 encode を禁止する。
P3 実機 check 用の初回表示は shader / pipeline を使わず、WebGPU render pass の clear による solid sRGB swatch
だけで行い、canvas presentation の色管理だけを単独で確認する。
`Viewport` への接続は feature flag `VITE_UXFD_SHARED_RENDERER_PREVIEW=1` の下に限定し、presenter の
`ready` / `fallback` / `deviceLost` は DOM dataset へ公開する。初回 swatch 表示が通るまでは shared renderer
canvas は preview 診断面であり、Pixi preview を置き換えない。
次の遊べる gate は solid rectangle shape の表示とする。`shapeType: "rect"` かつ gradient 無しの shape は
`SolidColour` plane として `SceneSnapshot` 境界へ入れ、WebGPU presenter は transparent clear の上に
triangle-list で矩形を描く。円・丸角・グラデーションは coverage / anti-aliasing parity を切り分けるまで
fail-loud のままにする。
この gate の実装は、まず `rust-core` が SolidColour draw list と WebGPU 用 vertex buffer を生成し、
browser preview では `rust-core-wasm` からその vertex buffer を受け取る構成にする。TypeScript presenter は
生成済み vertices を GPU に upload する薄い役割へ寄せ、WASM 読み込みに失敗した時だけ TypeScript fallback を使う。
SolidColour rectangle は shared renderer が `rust-wasm` geometry を使えて、かつ z-order safety を満たす時だけ
shared renderer owner とする。owned SolidColour は presenter の draw list に残し、Pixi 側では children を cleanup して
`hitArea` だけを残す。owned ではない SolidColour は Pixi owner のままとし、shared renderer draw list からも除外する。
これにより、Pixi-only object が前面にある場合に shared renderer canvas が上から覆う事故を避ける。
動画 gate は external texture 描画の前に readiness 診断を挟む。`Video` media reference と既存 preview の
`HTMLVideoElement` を照合し、`ready` / `pending` / `missingElement` を DOM/window diagnostics に公開する。
この gate の入口として、`Video` media の plane metadata と WebGPU 用 vertices は `rust-core` /
`rust-core-wasm` で生成する。DOM diagnostics には `uxfdSharedRendererPresenterVideoGeometrySource` を出し、
動画 plane geometry が `rust-wasm` と `typescript` fallback のどちらで生成されたかを確認できるようにする。
続く gate では、動画 frame decode request も `rust-core` / `rust-core-wasm` で生成する。request は
`source`、`sourceFrame`、`sourceRate`、`timelineFrame`、`rgba8Srgb`、`rec709SrgbFullRange` を持ち、
frame bytes / pixel array / base64 は含めない。DOM diagnostics には
`uxfdSharedRendererPresenterVideoDecodeRequestSource` と
`uxfdSharedRendererPresenterVideoDecodeRequestCount` を出す。
Electron IPC は `decode.start` / `decode.requestFrame` / `decode.releaseFrame` を Rust backend へ転送する。
`decode.start` は shared ring layout と `sourceRate` を返し、`decode.requestFrame` は `requestId` と
`mode=latestWins` を持つ。これは scrub 中に古い request が後から完了しても、consumer が stale frame を破棄できるようにするためである。
Pixi video を降ろす切替は、shared renderer が ownership を明示できる時だけ行う。初期 gate では
`cutoverEnabled`、Video scene、`rust-wasm` video decode request、decoded frame upload readiness をすべて満たした場合のみ
`owner=sharedRenderer` とし、対象 `clipId` を `Viewport -> updatePixiContent` へ渡す。
Pixi 側は対象 video の `HTMLVideoElement` / video texture / children を cleanup して video 分岐を抜ける。
ただし export は現行 Pixi canvas を読むため、`isExporting` 中は Pixi video を維持する。
shared renderer canvas は Pixi 全体の上に重なるため、実 decoded frame upload を有効化する前に z-order parity gate を追加する。
z-order safety gate では、candidate video より前面に Pixi-only object がある場合、その video は Pixi owner のままにする。
前面の `SolidColour` は shared renderer が描けるため許可し、前面の `Video` は同じ cutover candidate に含まれる場合だけ許可する。
`Image` / PSD / text / unsupported object が前面に残る構成では、video の shared renderer cutover を行わない。
この段階で Rust backend は `decode.requestFrame(frameIndex)` から実 pixel decode を行い、source `color_range=pc/tv` を
full-range RGBA へ明示正規化し、decoded RGBA を POSIX shared memory ring へ書ける。
POSIX shared memory ring は `slotCount` と同じ multi-slot layout を持ち、先行 frame が `READING` のままでも
次 frame を別 slot へ decode / write できる。
control plane には descriptor / CRC32 verification だけを返す。
renderer presenter は `rgba8Srgb` descriptor + upload buffer を `rgba8unorm-srgb` texture へ upload し、
video plane vertex scene と sampler で描画できる。
`shared-video-frame-bridge` crate は POSIX shm ring から renderer upload buffer 相当の mutable slice へ
decoded frame bytes を copy でき、copy 後も slot ownership は `READING` のまま保持する。
preload は `window.sharedVideoFrame.copyIntoUploadBuffer` を公開し、renderer helper は `SharedFrame` descriptor から
upload buffer を確保して native bridge へ渡せる。
Rust decoded video upload pipeline helper は verified decode response だけを accepted とし、copy bridge 成功後に
GPU upload fence 後 release callback を持つ upload object を作れる。
`shared-video-frame-bridge-node` により Rust bridge core は N-API addon として build でき、Node 直 require では
`Uint8Array` target を in-place mutation できる。
Electron `contextBridge` 越しの target mutation は反映されないため、preload は native copy 後の bytes を
`result.rgbaBytes` として返し、renderer helper は returned bytes を upload buffer として採用する。
Viewport orchestration は video cutover flag 有効時に Rust backend decode / shared memory copy / WebGPU upload object
準備を行い、presenter に clip id 付きの `sharedRendererDecodedVideoFrameUploads` を渡せる。
preload は env override / dev output / packaged resources の順で shared video frame native addon を解決できる。
Rust backend decode は `decode.stop` で stale session を破棄して source/layout 切替できる。
review gate 後、uploaded texture は WebGPU video scene として描画され、copy / upload / stale response 失敗時は
`rendererUploadAborted` release で slot を戻す。in-flight decode job は presenter 完了前に記録される。
Rust backend decode は jobId keyed multi-session になり、Viewport は active jobs 配列を保持する。
WebGPU presenter は clip id ごとの texture bind group を切り替えて、Rust upload 済み動画clipだけを描画する。
Rust backend decode は ffprobe の colour metadata を gate し、bt709 / sRGB transfer / bt709 matrix / pc-tv range 以外を fail-loud にする。
次 gate で export 側のPixi依存除去、decode scheduler の負荷制御、HDR / 10bit / 明示変換対応を進める。
これにより、動画読み込み・current frame availability と GPU import / sampling の問題を分離する。
ただし HTMLVideoElement / `importExternalTexture` はブラウザの暗黙 YUV->RGB と float 秒 seek に依存するため、
この経路の動画 preview は export parity をまだ主張しない。external texture 表示を入れる前後で、known clip の同一 frame を
preview decode と export/sidecar decode で比較し、色変換と frame accuracy の許容差を gate 化する。VFR / HDR / 10bit /
frame-accuracy 未検証の入力は fail-loud で Pixi fallback に留める。

## 後回しにするもの

- 滑らかなリアルタイム再生
- 音声再生・音声ミックス
- HEVC / HDR / 10bit
- VFR
- PSD 統合
- 3D stage 統合
- 複数エフェクトスタック
- トランジション
- GPU texture zero-copy
- Windows の厳密 golden-frame
- HEVC の配布用 export tolerance

## CI 方針

### Linux

- `rust-core` の純粋テスト
- serialize / timeline / keyframe / undo / validation

### macOS

- renderer parity
- golden-frame
- export
- sidecar integration
- colour pipeline

### Windows

- build-only
- 起動 smoke
- 1 frame smoke

Windows の parity failure は MVP の blocker にしない。
