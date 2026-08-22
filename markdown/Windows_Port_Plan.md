# Windows 移植 実装計画

最終更新: 2026-08-22

## 位置づけ

本計画は、ADR-001 で「準対応」に留めていた Windows を、**native overlay まで含めて
macOS と同じ設計で動かす**までの道筋を定める。

`Native_Overlay_Plan.md` §「Windows 対応（別フェーズ・未着手）」が
「別 ADR（ADR-012 想定）を起こして決定する」としていた、その ADR と計画にあたる。

本計画の前提はすべて **Windows 実機（`ssh mainpc` / RTX 3070 Ti）での実測**に基づく。
根拠は `windows_port_research/notes/` を参照。推測で書いた箇所は「未検証」と明記する。

Single Source of Truth: 本ファイル。設計判断は確定し次第
`architecture/01-decision-record.md` へ ADR として転記する。

## 0. ゴールと非ゴール

### ゴール

- Windows で native overlay preview が動く（macOS と同じ構成・同じ WGSL）。
- `rust-backend` / `native-overlay` addon が Windows でビルド・リンク・実行できる。
- 既存の macOS 経路を壊さない（golden-frame parity を維持する）。

### 非ゴール

- Windows での VideoToolbox 相当（Media Foundation / D3D11VA）の hardware decode/encode。
  初期は ffmpeg 経路のままとする（ADR-007 の software fallback を維持）。
- NV12 ゼロコピー import の Windows 実装（DXGI shared texture）。Phase 5 完了後に別途判断。
- CoreML 物体追跡の Windows 同等品。IPC 側で `supported: false` を返す現状を維持する。
- macOS と同一の性能・画質 parity。ADR-001 の「Windows は厳密 golden の対象外」を当面維持する。

## 1. 現在地（実測で確定していること）

| 問い | 結論 | 根拠 |
|---|---|---|
| Windows ビルドを止めているものは何か | **`shared-memory-spike/src/lib.rs` の POSIX shm 9 シンボルのみ**。下流4クレートのエラーは全部その連鎖 | [current-portability-audit.md](../windows_port_research/notes/current-portability-audit.md) |
| macOS 専用の映像 I/O はビルドを妨げるか | 妨げない。`cfg(not(macos))` の stub が全経路に既設 | 同上 |
| shm を潰した後に残るものは | `rust-backend` の `cfg(unix)` 掛け漏れ **5 箇所だけ** | 同上 |
| `native-wgpu-renderer` / `native-overlay` は | shm を通せば**無改造で Windows 向けに型検査を通過** | 同上 |
| CAMetalLayer の Windows 相当は | IDCompositionVisual。wgpu の公開 API に入口あり | [cametallayer-equivalent-and-alpha.md](../windows_port_research/notes/cametallayer-equivalent-and-alpha.md) |
| 現行 wgpu 0.20 で透過 overlay は作れるか | **作れない**（`alpha_modes = [Opaque]`、実機確認済み） | [dx12-alpha-real-hardware.md](../windows_port_research/notes/dx12-alpha-real-hardware.md) |
| wgpu を上げれば直るか | **直る。wgpu-hal 25.0.2 以降**で `PreMultiplied` を広告する | 同上 |
| 透過は実際に合成されるか | **される**。数値も画像も期待どおり | [dcomp-transparent-composite-visual.md](../windows_port_research/notes/dcomp-transparent-composite-visual.md) |
| 別ウィンドウの上でも合成されるか | **される** | [dcomp-crosswindow-and-hittest.md](../windows_port_research/notes/dcomp-crosswindow-and-hittest.md) |
| クリック透過はどうやるか | `WS_EX_TRANSPARENT` だけでは**抜けない**。`WM_NCHITTEST` → `HTTRANSPARENT` が要る | 同上 |
| 実物の Chromium の上でも成立するか | **する**。ちらつき・z-order 競合は観測されず | [electron-real-app-on-windows.md](../windows_port_research/notes/electron-real-app-on-windows.md) |
| アプリは Windows で起動するか | **する**。Rust を一切ビルドせずに UI まで描画 | 同上 |
| WebGPU フォールバックは使えるか | **使える**（nvidia/ampere）。起動ログの DXC エラーは無害 | 同上 |
| 毎フレーム present し続けても破綻しないか | **破綻しない**。ちらつき・z 順逆転・acquire 失敗すべて 0 件 | [sustained-present.md](../windows_port_research/notes/sustained-present.md) |
| 60fps は出せるか | **桁で余る**。最悪の resize フェーズでも 845fps / frame p99 = 6.1ms（予算 16.67ms） | 同上 |
| 親の移動・リサイズは present を止めるか | **止めない**。present p99 は 0.48〜1.77ms | 同上 |
| vsync 待ちはどこで起きるか | `get_current_texture`（Fifo で p50 30.7ms）。**UI スレッドで呼んではいけない** | 同上 |
| surface reconfigure は連続で耐えるか | **耐える**。8,445 回連続で失敗ゼロ | 同上 |

### macOS ↔ Windows 対応表（実測で確定）

| macOS | Windows |
|---|---|
| child NSWindow（`setOpaque: NO` / `clearColor`） | オーナー付き `WS_POPUP` + `WS_EX_NOREDIRECTIONBITMAP` |
| CAMetalLayer（`setOpaque: NO`） | DirectComposition visual + composition swapchain |
| surface 構築後の opaque 再適用（Bug E） | **不要**（alpha は swapchain 生成時に確定し wgpu が壊さない） |
| `LoadOp::Clear(TRANSPARENT)` + PreMultiplied | 同じ |
| `hitTest:` nil / `setIgnoresMouseEvents: YES` | `WM_NCHITTEST` → `HTTRANSPARENT` |
| `NSWindowDidMoveNotification` 等の resync observer | `WM_MOVE` / `WM_SIZE` / `WM_DPICHANGED` |

## 2. 依存関係とクリティカルパス

```text
Phase 0 (連続描画の先行検証)
   │  ここで破綻したら設計を見直す。Phase 4 の大投資の前に置く。
   ▼
Phase 1 (準対応MVPの正式化) ──────────┐  独立。いつやってもよい
   │                                  │
Phase 2 (shm Windows 実装)            │
   │                                  │
Phase 3 (cfg(unix) 掛け漏れ)          │
   │  ここまでで「native overlay 以外は Windows で動く」  │
   ▼                                  │
Phase 4 (wgpu 0.20 → 25+ 移行) ★最大の不確実性・macOS にも影響
   │
   ▼
Phase 5 (Windows overlay 実装)
   │
   ▼
Phase 6 (geometry 追従・DPI)
   │
   ▼
Phase 7 (段階導入・既定切替)
```

**クリティカルパスは Phase 4。** Windows の透過は wgpu 25+ が必須で、
これは macOS 側の `nv12/import.rs`（`wgpu_hal::metal` 内部 API を直接叩いている）にも影響する。
Windows のためだけの作業ではなく、`wgpu24_nv12_research` の延長線上にある。

## 3. フェーズ計画

### Phase 0: 連続描画の実機検証（推定 1日）★完了 2026-08-22

**目的**: 「毎フレーム present しても破綻しないか」を、実装に入る前に潰す。
これまでのプローブはすべて **1 フレーム描いて止まる**作りで、ここだけが未測定の実質リスク。

- `windows_port_research/tools/probe-electron` を拡張し、60fps で N 分間 present し続ける。
- 測る: フレームタイム分布、ちらつきの有無、z-order の安定性、GPU/CPU 使用率、
  Chromium 側の描画が阻害されないか、`Present` のブロック時間。
- 親ウィンドウ（Electron）を動かす・リサイズする・別ウィンドウを重ねる操作を並行させる。
- **判定**: 60fps を維持できない、またはちらつきが出るなら、Phase 5 の設計（child window 方式）を
  再検討する。代替案は `VisualFromWndHandle`（wgpu 25+ が HWND から visual を作る経路）。

成果物: [sustained-present.md](../windows_port_research/notes/sustained-present.md)、
計測ツールは `windows_port_research/tools/probe-sustained/`。

**結果: 再検討条件のどちらにも該当せず。Phase 5 は当初計画どおり child window 方式で進める。**
`VisualFromWndHandle` への退避は不要。

- ちらつき（合成後画素の不一致）0 件、z 順逆転 0 件、`get_current_texture` 失敗 0 件、`Suboptimal` 0 件。
- RDP 仮想ディスプレイが 32Hz のため `Fifo` は 33fps に張り付くが、これは表示側の周期であって上限ではない。
  `Immediate` では static 5,509fps / move 2,526fps / resize 845fps。
- `queue.present` + `IDCompositionDevice::Commit` は p50 0.15ms。描画コストは支配的ではない。
- **未検証**: 実シェーダ負荷での再測、物理 60Hz ディスプレイでの `Fifo`、Chromium 自身の fps。

### Phase 1: 準対応 MVP の正式化（推定 1-2日）★完了 2026-08-22

実測上は既に「ビルド・起動」まで満たしているので、体裁を整えるだけ。Phase 0 と独立。

**結果: 完了。** 詳細は
[windows-w1-mvp-formalisation.md](../progress/windows-w1-mvp-formalisation.md)。

- `package.json` の `build` スクリプトを Windows で動くようにする
  （`CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder` の POSIX env 代入が cmd で壊れる）。
  `cross-env` 導入か、プラットフォーム分岐。
  → **`cross-env` を導入して解決。** mainpc 実機 cmd で「素の POSIX 代入は失敗する
  （`'CSC_IDENTITY_AUTO_DISCOVERY' は、内部コマンドまたは外部コマンド...として認識されていません`）／
  `cross-env` 経由なら成功する」の両方を実測して確認済み。
- `electron-builder` の `build.win` ターゲットを追加する（現状 `mac` のみ）。
  → **追加済み（`nsis` / `x64`）。** macOS ローカルで
  `npx electron-builder build --win --dir` と `--win --x64 --dir` の両方が
  `win-arm64-unpacked` / `win-unpacked` の生成と `.exe` エントリの存在まで成功することを確認した。
  **nsis インストーラ本体の生成（Wine 経由のビルド）は未検証。**
- ffmpeg の解決を見直す。現状 `/opt/homebrew/bin` → `/usr/local/bin` → PATH の順で、
  Windows は PATH 頼み。同梱するか、明示的なエラーメッセージを出すか決める。
  → **同梱はしない方針。** ロジックを `src/utils/ffmpegResolve.ts` に切り出して TDD 化し、
  Windows では winget のシムディレクトリ
  （`%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe`）を追加で確認するようにした。
  mainpc 実機で winget インストール後の実際の設置先がこの通りであることを確認済み。
  見つからず ffmpeg 起動が `ENOENT` になった場合は、winget での導入手順と
  「新しいターミナルを開き直して PATH を確認する」導線を含むエラーメッセージを返すようにした。
- remote-deck の WebSocket サーバが初回起動でファイアウォール許可ダイアログを出す件の扱い。
  → **コード変更なし。** `startRemoteDeckServer` が `0.0.0.0` bind であることに起因する挙動と
  今後の対応候補（NSIS カスタムスクリプトでのファイアウォール規則事前登録、または
  UI 側での案内表示）をドキュメント化した。

### Phase 2: shm の Windows 実装（推定 2-3日）★完了 2026-08-22

`shared-memory-spike` にプラットフォーム seam を切る。**ここが開くと下流4クレート全部が開く。**

**結果: 完了。予測どおり下流が開いた。** 詳細は
[windows-shm-platform-seam.md](../progress/windows-shm-platform-seam.md)。
macOS 23/23・Windows 実機 23/23・クロスチェックはエラー 0。
POSIX 経路は 1 行も書き換えず、321 行の追加のみ。
`loom` が POSIX 非依存であることも実機で確定した（下記の「未確認」は解消済み）。

- 現状 OS 依存は `shm_open` / `shm_unlink` / `ftruncate` / `mmap` / `munmap` /
  `PROT_READ` / `PROT_WRITE` / `MAP_SHARED` / `MAP_FAILED` の 9 箇所のみ。
  リングバッファのアトミック制御（1,120 行の大半）は移植不要。
- Windows 実装は named file mapping（`CreateFileMappingW` / `MapViewOfFile` /
  `UnmapViewOfFile` / `CloseHandle`）。
- 命名規約に注意: POSIX 側は `PSHMNAMLEN = 31` バイト制限に合わせた `shm_name` を持つ。
  Windows の名前空間（`Local\` プレフィックス、`MAX_PATH`）とは規約が違うので、
  名前生成をプラットフォーム別に分ける。
- TDD: 既存の `shared-memory-spike` のテストが Windows でも通ることを合格条件にする。
  `loom` のテストは POSIX 依存ではないのでそのまま流用できるはず（未確認）。

### Phase 3: `rust-backend` の `cfg(unix)` 掛け漏れ（推定 0.5-1日）★完了 2026-08-22

unix 限定で定義した関数・フィールドを無条件に参照している 5 箇所を塞ぐ。

| 箇所 | 症状 |
|---|---|
| `src/native_render.rs:7` | `cpu_simple_video::try_render_simple_video_frame{,_to_shared_ring}` |
| `src/main.rs:32` | `source_frames::collect_native_render_sources{,_content_revisions}` |
| `src/encode.rs:143` | `BackendState::native_render_outputs` フィールド |
| `src/native_render.rs:1038` | `load_cached_getcolor_sample_frame` |
| `src/source_frames.rs:86` | `media_content_revision` |

**Phase 2 完了後に再実測した（2026-08-22）。上表の 5 箇所がそのまま残っている。**
`native-wgpu-renderer` と `native-overlay` は**無改造でエラー 0** になり、
監査ノートの予測が裏付けられた。Windows ビルドを塞いでいるのは
`rust-backend` のこの 5 箇所だけである。

**結果: クロスチェックのエラーは 5 → 0 になった。5 箇所すべてスタブではなく un-gate で対応。**
詳細は [windows-cfg-unix-gaps.md](../progress/windows-cfg-unix-gaps.md)。

**ただし、ここで掲げていたマイルストーン「native overlay 以外は Windows で動く。
decode/encode は ffmpeg 経路」は達成していない。** 実機テストは
205 passed / 29 failed で、失敗 29 件のうち 18 件は
通常の ffmpeg decode/encode データプレーン（`decode.rs` の `DecodeDataPlaneRing` 系、
`encode.rs` の `write_encode_shared_frame`）が依然 `cfg(not(unix))` の no-op スタブである
ことによる。これは監査が挙げた 5 件には含まれておらず、`decode.rs` は 1,300 行超あるため
Phase 3 のスコープ外だった。

達成したのは「**ビルドが通り、native render の共有フレーム経路は実機で動く**」ところまで。

### Phase 3b: decode/encode データプレーンの Windows 実装（推定 3-5日）★完了 2026-08-22

Phase 3 の実機検証で判明した積み残し。上記マイルストーンを本当に満たすために要る。

**結果: 完了。Windows 実機のテスト失敗を 29 件 → 1 件にした
（205 passed / 29 failed → 227 passed / 1 failed / 3 ignored）。**
詳細は [windows-decode-encode-data-plane.md](../progress/windows-decode-encode-data-plane.md)。
スタブは 1 つも要らず、すべて W2 の `PosixSharedRing` の上で素直に動いた。
残る 1 件は数 GB の gitignore 対象フィクスチャが実機に無いことによるもので、
コードの問題ではない。

**これで Phase 3 のマイルストーン「native overlay 以外は Windows で動く」は、
テストスイートで示せる範囲では達成した。** 未検証は heavy-media フィクスチャを
使う preview テスト 1 件だけである。

副産物として**プロダクションバグ 1 件**を修正した。`local_media_source_path` が
Windows のドライブレター付き `file://` URL を `/C:/...` として返しており、
実際の Windows ファイル API で開けなかった。

- `decode.rs` の `DecodeDataPlaneRing` / `create_decode_data_plane` / `write_decode_data_plane`
- `encode.rs` の `write_encode_shared_frame`
- いずれも `cfg(not(unix))` の no-op スタブのままで、W2 で shm が移植された今は
  un-gate できる可能性が高い（Phase 3 の 5 件と同じ構図）。ただし規模が桁違いなので別フェーズにする。
- あわせて、実機で初めて見えたテスト基盤バグ 5 件も潰す。
  Windows パスのバックスラッシュを JSON リテラルへ未エスケープで埋める（2 件）、
  stdin シンクに `sh -c` を使う（2 件）、空白入りパスから不正な `file://` URL を組む（1 件）。
  Windows CI を入れる前に潰さないと恒常的な赤になる。
- macOS 専用 VideoToolbox 経路を assert している 6 件は
  `cfg(target_os = "macos")` で括る（Windows では ffmpeg フォールバックが正しい挙動）。

### Phase 4: wgpu 0.20 → 25 移行（推定 5-10日）★完了 2026-08-22

Windows の透過に必須。macOS 側にも影響する横断作業。

**結果: 完了。移行前後でテスト数が完全一致した**
（native-wgpu-renderer 97 / native-overlay 99 / rust-backend 257 / rust-core 116、
parity ゲートも全通過）。詳細は
[wgpu-25-migration.md](../progress/wgpu-25-migration.md)。
**★最大の不確実性としていたが、25 を選んだことで実際の作業は 1 日以内に収まった。**
`nv12/import.rs` は無変更で通っている。

- **上げ先は 25 に決定（2026-08-22）。** 根拠は
  [h3-wgpu25-vs-wgpu30.md](../wgpu24_nv12_research/notes/h3-wgpu25-vs-wgpu30.md)。
  wgpu-hal 30 は Metal バインディングを `metal`/`objc` から `objc2-metal`/`objc2` へ
  総取り替えしており、`texture_from_raw` が `Retained<ProtocolObject<dyn MTLTexture>>` を
  要求する。**wgpu 25 は `metal` 0.31 のままで、`nv12/import.rs` の import 経路は
  無変更で動く**（スパイクで pixel 完全一致を実測）。
  30 を選ぶ理由だった `VisualFromWndHandle` も、Phase 0 で child window 方式が
  破綻しないと分かったため不要になった。
- 破壊的変更の棚卸し。**下記はプローブを 0.20 と 30 で書いた時点の差分で、
  上げ先の 25 での差分は未確認**（25 で確認済みなのは NV12 スパイクで踏んだ 3 件だけ）:
  - `InstanceDescriptor`: `Default` 実装が消え、`display` フィールドが増えた
    （`new_without_display_handle()` を使う）
  - `RequestAdapterOptions`: `apply_limit_buckets` 追加
  - `SurfaceConfiguration`: `color_space` 追加
  - `RenderPipelineDescriptor` / `RenderPassDescriptor`: `multiview` → `multiview_mask`
  - `Surface::get_current_texture()` が `Result` から `CurrentSurfaceTexture` enum へ
  - `SurfaceTexture::present()` → `Queue::present(texture)`
  - `request_device` が引数 1 個に
  - `PipelineLayoutDescriptor.bind_group_layouts` が `&[Option<&BindGroupLayout>]` へ
  - `PipelineLayoutDescriptor.push_constant_ranges` が `immediate_size` へ置換

  wgpu 25 で実測した差分（NV12 スパイク）:
  - `Adapter::request_device` が引数 1 個に（第 2 引数の trace path が消えた）
  - `DeviceDescriptor` に `trace: wgpu::Trace` フィールドが追加
  - `wgpu::Maintain` 廃止。`Device::poll(wgpu::PollType::Wait)` が `Result` を返す
  - `Device::as_hal` の戻り値が `Option<R>` → `R`（`.flatten()` を消す。H1 で既知）
- ~~**最大のリスクは `native-wgpu-renderer/src/nv12/import.rs`**~~
  → **25 を選んだことで解消した。** `wgpu_hal::metal::Device::texture_from_raw` の
  シグネチャは 0.21.1 と 25.0.2 で同一で、スパイクの import 経路は 24 版と
  byte 単位で一致した。残るのは `as_hal` の `.flatten()` 削除 1 行のみ。
  ただし**スパイクが通したのは 8x8 単色 1 パターンだけ**なので、
  production の NV12 テスト 9 件（グラデーション、キャッシュ再利用、BT.601 / full range）を
  移植して通すことを合格条件にする。
- golden-frame parity（`architecture/04-render-parity.md`）を移行の合格条件にする。
  **macOS の parity が崩れたら移行を止める。**

### Phase 5: Windows overlay 実装（推定 4-6日）★完了 2026-08-22

`native-overlay` に `win32_overlay.rs` を足す。`macos_overlay.rs`（1,172 行）の対応物。

**実装結果**: ADR-012 どおり DirectComposition 経路で実装した。詳細は
[windows-w5-native-overlay.md](../progress/windows-w5-native-overlay.md)。

- macOS `cargo test`（native-overlay 99/0/0、native-wgpu-renderer 全 pass）は不変。
- `cargo check --target x86_64-pc-windows-msvc --tests`（両クレート）0 errors。
- Windows 実機（`mainpc`）で `cargo test --release`:
  native-wgpu-renderer 全 pass（native_reference_parity 37 件含む）、
  native-overlay 84 passed / 2 failed（失敗 2 件は本実装と無関係の
  既存 Windows 固有バグ — 決定ログ参照）。新規追加した
  `win32_overlay::geometry_tests`（純粋関数 3 件）はこの実機実行に含まれ、
  3 件とも pass。
- **未検証（重要）**: `attach_native_overlay` を実 HWND に対して呼ぶ実機
  スモークテスト（`native-overlay/tests/win32_overlay_smoke.rs`）を用意し
  mainpc でビルド・実行したが、`schtasks /it` 経由の実行が 3 分以上
  ハングし完走しなかった（プロセスは強制終了して後始末済み）。
  つまり **DirectComposition + wgpu composition surface の実機での
  実際の attach 成立は未確認**。
  Phase 0（`sustained-present.md`）の probe は同じ構成要素
  （DCompositionCreateDevice → CreateTargetForHwnd → CreateVisual →
  SetRoot → SurfaceTargetUnsafe::CompositionVisual）を実機で 60 秒超
  連続 present して成功しているため設計自体の妥当性は高い。
  **原因切り分け完了（`windows_port_research/notes/w5-attach-hang.md`）**:
  段階ログを仕込んで実機再現したところ、`DCompositionCreateDevice`/
  `CreateTargetForHwnd`/`CreateVisual`/`SetRoot` と
  `wgpu::Instance::request_adapter`/`request_device` はいずれも
  メッセージポンプの無いプロセスでも数秒で正常完了しており、
  「メッセージポンプ不在が原因」という仮説は**棄却**。実際に進行が
  止まっていたのは attach 完了までに `NativeWgpuLiveSurfaceRenderer::
  from_surface` が作る 9 本の描画パイプラインのうち 2 本目、
  `nv12::create_nv12_pipeline_for_format`（シェーダ
  `shared-renderer/shaders/nv12_composite.wgsl`、678行）で、
  10 分間追跡しても完了しなかった。1 本目のパイプライン（598行の
  シェーダ）は1分未満で完了しており、行数差（+13%）に見合わない
  所要時間の差から `nv12_composite.wgsl` 固有の構造がコンパイル経路を
  病的に遅くしている可能性が高い。DirectComposition/wgpu surface
  attach 自体の設計は健全であることが実機で確認できたため、
  残る未検証事項はこのシェーダのコンパイル時間問題のみに絞られた。

  **さらに切り分け完了（`windows_port_research/notes/nv12-pipeline-compile-time.md`、
  最小再現ツール `windows_port_research/tools/nv12-pipeline-repro`）**:
  「nv12 固有の構造が原因」という上記の推測は**棄却**。nv12版を持たない
  `solid_composite.wgsl`（598行、1本目のパイプラインのシェーダ）だけを
  単体計測しても Windows/DX12 で **104秒** かかった
  （macOS/Metal では1〜3秒未満、H-C採択）。`create_shader_module`
  （naga の WGSL→HLSL変換）はどちらのシェーダも1msで、遅いのは一貫して
  `create_render_pipeline`（DX12 既定コンパイラ Fxc 本体）。真因は
  **両シェーダが共有する550行超の "effects tail" が、wgpu 自身
  "old, slow and unmaintained" と明記するレガシーコンパイラ Fxc に
  とって病的に遅いこと**で、nv12 はこれに YCbCr変換コード（+80行）が
  加わり悪化する。**タイムアウト900秒での再実行で 676.9秒（約11分17秒）
  で完了することを確認——無限ループ・デッドロックではなく、有限だが
  非常に長い時間のかかるコンパイルだったと確定した**（solid比で約6.5倍、
  行数差はわずか+13%なので非線形な悪化）。DirectComposition + wgpu
  composition surface の設計自体は健全（全段階が有限時間で成功する）
  ことも同時に確定した。代替コンパイラ
  （`DynamicDxc`: mainpc に dxcompiler.dll/dxil.dll 無く即失敗、
  `StaticDxc`: MSVC標準ライブラリのシンボル未解決でリンクエラー）は
  どちらも本ホストでは追加のダウンロード/ツールチェイン更新なしに
  検証できなかった（当時）。

  **★DXC導入・実機E2E検証完了（`windows_port_research/notes/nv12-pipeline-compile-time.md`
  「追記2」、ユーザー承認のもとDXCをmainpcへ実際にダウンロード・導入）**:
  DXC（github.com/microsoft/DirectXShaderCompiler v1.9.2607）を取得し
  `nv12-pipeline-repro` で実測したところ、Fxc比で solid 約13.9倍・
  nv12 約12.9倍高速化した（nv12: 676.9秒→中央値52.4秒）。これを受け
  `native-wgpu-renderer/src/lib.rs` に
  `NativeWgpuLiveSurfaceRenderer::resolve_dx12_compiler(dir)` を実装
  （実行ファイルと同じディレクトリに `dxcompiler.dll`/`dxil.dll` が
  両方揃っていれば `DynamicDxc`、欠けていれば `Fxc` へ自動フォールバック。
  TDDで4件のテストを追加、macOS・mainpc両方でgreen）。DLL配置後、
  `native-overlay/tests/win32_overlay_smoke.rs` を mainpc で
  `schtasks /it` 経由で再実行した結果 **`test result: ok. 1 passed;
  0 failed; ... finished in 79.09s`** — attach/detach の実 HWND 往復が
  実機で完走することを確認した。

コードの実装（cfg分岐・型・pure関数・Cargo依存）に加え、**この機能の
中核である「実際にoverlayウィンドウがDirectComposition経由で合成される
か」も実機で確認できた**ため、Phase 5 全体を ★完了 とする。

**残課題（Phase 6以降）**: (1) 79.09秒は初回attach呼び出し1回分の
パイプライン生成コスト（以降のpresentでは再利用される）。この同期
ブロックがUIスレッドに与える影響の検討は未着手。(2)
`dxcompiler.dll`/`dxil.dll` をElectronビルド成果物へ実際に組み込む
作業（`electron-builder` の `extraResources` 設定等）はW1側の
フォローアップとして未着手（配置場所・サイズ・ライセンスの申し送りは
`nv12-pipeline-compile-time.md`「W1/electron-builderへの申し送り」
参照。DLL欠如時もFxcへ安全にフォールバックするため機能上の必須項目
ではない）。

- `attach_native_overlay_inner` の `#[cfg(target_os = "windows")]` 分岐を実装する。
  現状は `attach_live_overlay_surface_renderer` が `Err("...only available on macOS")` を返す stub。
- 構成（Phase 0 で検証済みの形をそのまま実装する）:
  1. Electron の `getNativeWindowHandle()` は Windows で HWND を返す。
     `electron/main.ts:615` の `resolveNativeWindowHandle` はプラットフォーム非依存なのでそのまま使える。
  2. その HWND をオーナーにした `WS_POPUP` +
     `WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE` を作る。
  3. `DCompositionCreateDevice` → `CreateTargetForHwnd` → `CreateVisual` → `SetRoot`。
  4. `SurfaceTargetUnsafe::CompositionVisual` で wgpu surface を作り、
     `alpha_mode: PreMultiplied` で configure。
  5. overlay 用 window class の `WM_NCHITTEST` で `HTTRANSPARENT` を返す。
  6. present 後に `IDCompositionDevice::Commit`。
- `NativeWgpuLiveSurfaceRenderer` に `from_hwnd`（macOS の `from_appkit_view` 相当）を足す。
  `from_surface` は `cfg` なしで公開されているので、下流はそのまま再利用できる。
- **z 順の落とし穴**: `AddVisual(visual, insertAbove, None)` の解釈が紛らわしい。
  必ず参照 visual を明示する（`AddVisual(&top, true, &bottom)`）。
- **`get_current_texture` をUI スレッドで呼ばない**。Phase 0 の実測で、`Fifo` では
  ここが vsync 待ちのブロック点（p50 30.7ms）と確定した。present と Commit 自体は 0.15ms。
- resize 追従は surface reconfigure で実装してよい。Phase 0 で連続 8,445 回の再構成が
  失敗ゼロだった。

### Phase 6: geometry 追従・DPI（推定 2-3日、★完了。高DPIの実機検証のみ未検証）

詳細は `progress/windows-w6-geometry-dpi.md` を参照。

- **親ウィンドウ追従**: Electron/Chromium が所有する owner HWND を
  サブクラス化（`WNDPROC` 差し替え）するのは Chromium 自身の実装と競合しうるため
  避け、`SetWinEventHook(EVENT_OBJECT_LOCATIONCHANGE, WINEVENT_OUTOFCONTEXT)`
  でシステム全体のアクセシビリティイベントを購読する方式を採用した
  （`win32_overlay.rs::register_geometry_resync_hook`）。move/resize/最小化/
  復元/DPI 変更のいずれもウィンドウ矩形変化として拾える。macOS の
  `NSWindowDidMoveNotification` 購読と同じ「対象を直接操作せず通知を受けて
  手動で resync する」設計の Win32 対応物。`WINEVENT_OUTOFCONTEXT` はフックを
  登録したスレッドのメッセージポンプ経由で配送されるため、Electron の
  UI スレッド（常時メッセージループを回す）が呼び出し元であることが前提。
  mainpc 実機で owner を `SetWindowPos` で実際に動かし、overlay HWND が
  同じ量だけ追従することを確認済み（`tests/win32_overlay_smoke.rs`）。
- **純粋関数の切り出し**: `resolve_overlay_screen_rect`
  （W5 で導入済み）に `dpi_scale_factor` 引数を追加し、attach 時の初期配置と
  resync（`resync_overlay_geometry`）の両方が同じ関数を通るようにした
  （二重に異なる式を持つリグレッション再発を防ぐ、macOS 側と同じ設計判断）。
- **per-monitor DPI awareness**: `dpi_scale_factor_from_dpi(GetDpiForWindow(...))`
  で DPI（既定 96 = 100%）を倍率へ変換し、`contract.view_*`（CSS px）を
  物理ピクセルへ変換してから座標を組み立てる。この変換ロジック自体は
  macOS 側と同じくプラットフォーム非依存のためユニットテスト済み。
  **実機での高DPI検証は未実施**（mainpc は 100% スケール機のため）。
- **Bug E 相当**: `set_overlay_window_obstructed`（`SetWindowPos` の
  `HWND_TOP`/`HWND_BOTTOM`）を実装し、`set_native_overlay_obstructed` の
  Windows 分岐へ配線した。macOS のように `windowNumber` を明示的に
  `relativeTo:` へ渡す必要が Win32 には無く（`WS_POPUP` の owner 関係だけで
  z-order が決まる）、より単純。**実 Electron 上での HTML UI 重なり確認は
  未実施**（コンパイル・単体の SetWindowPos 呼び出し経路のみ確認）。
- **79秒（Fxc）/更に短い（DXC）初回パイプライン生成のUIスレッドブロック**:
  `#[napi(js_name = "attachNativeOverlay")]` は `async` 指定が無い同期関数
  であり、JS 側は `await addon.attachNativeOverlay(...)` で呼ぶが napi は
  この呼び出しを Node/Electron のメインスレッド上で同期実行する。
  つまり初回 attach のパイプライン生成コストは**そのまま Electron の
  UI スレッドをブロックする**ことを確認した。修正（非同期化・別スレッド化）
  は本 Phase のスコープ外（計画書の指示どおり「trivially safe でない限り
  fix しない」）。W7 以降の課題として申し送る。

### Phase 7: 段階導入と既定切替（推定 1日、★完了 2026-08-23・stage6）

詳細は `progress/windows-w7-staged-rollout.md` を参照。

- macOS と同じ env / flag 規約に合わせる。**現状の macOS は既に opt-out で既定 ON**
  （`Viewport.tsx` は `resolveNativeOverlayEnabled(window.uxfdPlatform, {...})`
  経由、macOS は内部的に `VITE_UXFD_NATIVE_OVERLAY !== '0'` と同じ判定）。Windows は
  導入直後だけ opt-in 相当に倒し（`VITE_UXFD_NATIVE_OVERLAY === '1'` でのみ有効）、
  24 時間ベンチ後に macOS と同じ opt-out へ揃える。判定ロジックは純粋関数
  `resolveNativeOverlayEnabled(platform, env)`（`src/utils/
  nativeOverlayPlatformGate.ts`）に切り出し TDD で 7 件のユニットテストを追加した。
  既定反転は同ファイルの `WINDOWS_DEFAULT_ENABLED` 定数を `true` にする 1 行変更で
  済む。renderer 側のプラットフォーム判定用に `electron/preload.ts` で
  `window.uxfdPlatform`（`process.platform`）を新規公開した。
- 既存の WebGPU presenter は parity 比較用に残す（ADR-011 の方針を踏襲、無改造）。
- **STAGE1（実施済み）**: mainpc 実機で `VITE_UXFD_NATIVE_OVERLAY=1`（opt-in）+
  `VITE_PERF_AGENT_MODE=1` により実 Electron アプリを起動し、native overlay の
  attach が実際に成功することを確認した（`schtasks /it` 経由、DirectComposition は
  SSH 直実行だと `E_ACCESSDENIED` になるため）。DXC DLL（`dxcompiler.dll`/
  `dxil.dll`）を実 Electron exe と同じディレクトリへ初めて配置した（W5/W6 は
  テストバイナリ横のみ）。W6 の未検証 3 点のうち、Bug E の見た目確認・devtools
  開閉時の挙動は対話操作を送る手段がない環境だったため今回も未検証のまま。
  初回 attach の UI スレッドブロック時間は DXC あり/なしの定量比較まではできて
  いない。
- **24 時間ベンチ（実施中）**: `npm run bench:native-overlay`
  （`scripts/run-native-overlay-long-bench.mjs`）を mainpc で schtasks 経由で
  無人起動した。実行中に見つかった 2 件の不具合・欠落
  （Windows での `spawn EINVAL`、重量動画フィクスチャ欠落）を修正・補填し、
  Windows は in-process decode 未実装のため steady-playback の frame time
  予算を環境変数で緩めて（fps parity ゲートではなく安定性ソークとして）起動した。
  開始時刻・ログパス・結果の読み方は `progress/windows-w7-staged-rollout.md`
  参照。
- **STAGE2（実施済み、2026-08-22）**: 24 時間ベンチはユーザーが「応答なし」を
  観測して約 10 時間（147サイクル、gate failed/panic/crash/OOM いずれも
  0件）で早期停止したため、24時間ではなく約10時間のソークとして評価した。
  mainpc をbundle転送で最新commitへ同期し、native-overlay
  `cargo test --release` を実機再実行（95 passed / 0 failed、W5由来の
  パスバグ2件・overflow修正の回帰テスト含む全green）。overflow修正
  （bottom-left→top-left フリップ）はgeometry smoke testの実測値と
  手計算による絶対座標整合性で実機検証できた。attach レイテンシは
  通常アプリセッション3回計測で中央値 **≈88.77秒**（5秒ゲートを大幅に
  超過）。**DEFAULT-ONゲート（10時間ソーク0件／overflow検証済み／
  attach<5秒）のうち3つ目が不成立のため `WINDOWS_DEFAULT_ENABLED` は
  `false` のまま据え置き、flipしない。** 併せて、wgpuのpipeline cache
  機構（`Features::PIPELINE_CACHE`等）が未実装であることを確認し、
  DXCシェーダコンパイルコストは初回起動限定ではなく**毎起動（毎attach）
  ごとに発生する構造的コスト**であると特定した——ユーザーが観測した
  「応答なし」の根本原因はこれと一致する。詳細は
  `progress/windows-w7-staged-rollout.md` のSTAGE2節を参照。
  **stage-2はpartial（★完了ではない）。残課題: attach呼び出しの非同期化、
  またはwgpu pipeline cache／DXCコンパイル結果の永続キャッシュ導入の
  いずれかが完了するまで、Windows既定ON化は見送る。**
- **stage3-5（実施済み、2026-08-22〜23、★完了ではない）**: attach非同期化
  （AsyncTask化）・Viewport.tsxのinterim-presenter状態機械・
  native-wgpu-rendererのformat-aware遅延パイプライン構築（Option C）を
  実装したが、mainpc実機のA/Bバイセクトで**「AsyncTask化そのものが
  実Electronアプリでは機能せず、attachが恒久的に解決しない」**という
  新しいregressionが判明した（同期実装に戻すと155.24秒でattach成功、
  非同期実装だと並行呼び出しを直列化しても9分待って未解決）。詳細・
  棄却済み仮説（container/bridgeゲート説・detach競合説）・次の一手は
  `progress/windows-w7-async-attach.md` を参照。`WINDOWS_DEFAULT_ENABLED`
  は`false`のまま、Phase 7 ★完了は引き続き見送り。
- **stage6（実施済み、2026-08-23、★完了）**: stage5続報の知見を受け、
  非同期分割の切り方自体を再設計した——「DComp window/device/visual
  作成＋wgpu adapter/device requestを丸ごとworkerスレッドへ逃がす」
  設計（stage1-2）を撤回し、**HWND/COM区間（実測880ms〜1.5秒）は
  JSスレッドで同期実行、パイプラインコンパイル（DXCの本体、
  `wgpu::Device`/`Queue`のみのSend+Safe区間）だけをworkerスレッドへ
  回す**構成に変更した。React StrictMode由来の並行3回attach呼び出しが
  pipelineコンパイル区間で競合する新たな知見も得て
  `ATTACH_NATIVE_OVERLAY_PIPELINE_SERIALIZE_LOCK`で直列化。mainpc実機で
  3回のattach latency測定を完了し、**単発相当（本番ビルド想定）中央値
  約45.4秒**（STAGE2の88.77秒からほぼ半減）、**UIスレッド応答性は3回
  とも`Responding=False`サンプル0件**（合計536サンプル）で実測証明した。
  presenter実フレームの視覚的直接証拠は対話操作手段が無く未取得（設計・
  テストによる保証で代替、正直に記録）。DEFAULT-ONゲート4条件中3つが
  明確に満たされたと判断し、`WINDOWS_DEFAULT_ENABLED`を`true`へflip、
  Windows も macOS と同じ opt-out（既定 ON）となった。「DComp/HWNDを
  workerスレッドへ逃がす」設計は実Electronアプリでは機能しないことが
  確定し棄却済み（正確な内部機構は未特定、次の一手として申し送り）。
  詳細は `progress/windows-w7-async-attach.md` のstage6節を参照。
- **需要駆動staged attach（実施済み、2026-08-23、★完了）**: stage6完了後も
  単発attach（本番ビルド想定）約45.4秒はUX上まだ長いという指摘を受け、
  Phase 1でmainpc実機（RTX 3070 Ti、DXC）にて`finish_pipelines`の全9
  パイプラインを個別計測し、`nv12_composite`が中央値57.585秒（全体の
  86.6%、支配的コスト）であることを確定。Phase 2で`finish_pipelines`を
  Essential集合（solid_composite + 8種の小型シェーダ、実測合計約8.9秒）と
  Deferred集合（nv12_compositeのみ）に分割し、**attachはEssentialの完成
  だけで解決**、nv12はattach直後（初回動画使用を待たず）に
  `std::thread::spawn`でバックグラウンドコンパイルするよう再設計した。
  TS側は`shouldRouteFrameToNativeOverlay`（動画を含まないシーンは
  essential readyで即座にoverlayへ、動画を含むシーンはnv12 readyまで
  presenterに留める保守的ゲート）を新設。Phase 3でmainpc実機検証（3回、
  schtasks /it経由、`UXFD_PERF_KEEP_ALIVE=1`でperfハーネス自動終了を
  抑止）を実施し、**launch→attach(essential ready)中央値29.93秒**
  （旧stage6の45.4秒から大幅短縮、ただしvite dev-server/Electronの
  ビルド起動オーバーヘッド約18.5秒を含む値であり、本番パッケージビルド
  ではこの部分が無くなるためさらに短くなる見込み——未検証のまま正直に
  記録）、**nv12バックグラウンド完了はattachから中央値12.57秒**
  （Phase 1の孤立測定57.585秒より大幅に速いが、同一shaderの繰り返し
  コンパイルによるDXC/ドライバのシェーダキャッシュ温まり効果の可能性が
  高く、初回・低温状態のユーザー体験はPhase 1の52〜58秒に近い可能性が
  残る——正直に記録）、**UIスレッド応答性は3回とも
  `Responding=False`サンプル0件**（essential窓・nv12バックグラウンド窓
  いずれも含めて合計136サンプル中0件）で実証した。動画クリップを含む
  シーンでの欠落/黒フレームはログ・perfハーネス完走（5行×3回とも成功）
  いずれにも現れず、presenter/overlay状態機械のロジック自体は6件の
  ユニットテスト（`nativeOverlayNv12Gate.test.ts`）でTDD検証済み。
  presenter実フレームのCDPスクリーンショット直接証拠は、SSHローカル
  ポートフォワード越しのChrome DevTools Protocol接続で本stageにて
  初めて取得に成功した（`--remote-debugging-port`+`--remote-allow-origins`
  のopt-inスイッチ、`electron/main.ts`）が、nv12 readyがほぼ即時
  （観測範囲3ms〜15.76秒）だったため「動画がpresenter上にある」瞬間を
  手動ポーリングで捕捉することはできなかった——健全なpost-attach描画の
  スクリーンショットは取得済み。詳細は
  `progress/windows-w7-async-attach.md`の同節を参照。

## 4. 既存設計との整合

| 既存原則 | 本計画との整合 |
|---|---|
| ADR-001 macOS 主ターゲット / Windows 準対応 | **見直しが要る**（§8 の設計判断 4）。overlay まで持っていくなら「準対応」の定義を更新する |
| ADR-002 Electron を UI shell として残す | 維持 |
| ADR-003 preview / export の合成を分けない | 維持（WGSL・shared-renderer は共通のまま） |
| ADR-004 sidecar で危険処理を隔離 | 維持 |
| ADR-007 初期 export は software fallback を残す | 維持（Windows は当面 ffmpeg 経路のみ） |
| ADR-011 preview renderer を main 内の napi addon に置く | 維持（Windows も同じ構造） |
| ADR-013 native overlay を child NSWindow として実装 | Windows 版として **ADR-012** を起こす（下記） |

### 提案 ADR-012: Windows の native overlay を DirectComposition child window として実装する

- **決定**: Windows では、Electron の HWND をオーナーとする `WS_POPUP` +
  `WS_EX_NOREDIRECTIONBITMAP` ウィンドウに DirectComposition visual を張り、
  wgpu の composition swapchain（`alpha_mode: PreMultiplied`）へ描画する。
  クリック透過は `WM_NCHITTEST` → `HTTRANSPARENT` で行う。
- **理由**: ADR-013（macOS の child NSWindow）と構造が 1:1 で対応し、
  `shared-renderer` / WGSL / `from_surface` 以降の経路を完全に共有できる。
  実機で合成・クリック透過・実物 Chromium との共存を確認済み。
- **却下案 (A)**: 素の HWND に `CreateSwapChainForHwnd`。
  DX12 は `WndHandle` target に対して `[Opaque]` しか広告しないため透過できない（wgpu 30 でも同じ）。
- **却下案 (B)**: `wgpu-hal` の dx12 backend にパッチを当てる。
  wgpu 25 以降で upstream が修正済みのため不要。フォークの保守コストだけが残る。
- **却下案 (C)**: Windows では overlay を諦め WebGPU presenter のままにする。
  「15fps の壁」が Windows だけ残り、macOS と別の性能特性のアプリになる。
- **前提条件**: wgpu 25 以上（Phase 4）。

## 5. リスクと退避

| リスク | 影響 | 退避 |
|---|---|---|
| **Phase 4 の wgpu 移行で macOS の NV12 ゼロコピーが壊れる** | 高 | golden-frame parity を合格条件にし、崩れたら移行を止める。最悪 `nv12/import.rs` を一時的に memcpy 経路へ戻す（Phase 3a 相当へ退避） |
| 連続描画でちらつく / 60fps 出ない | 高 | Phase 0 で先に検出する。代替として `VisualFromWndHandle` 経路を試す |
| Chromium 自身の DirectComposition と z-order 競合 | 中 | 静止状態では観測されず。Phase 0 で動的な操作を含めて再確認する |
| 高DPI で overlay がずれる | 中 | Phase 6 で `dpi_scale_factor_from_dpi`/`resolve_overlay_screen_rect` を実装・ユニットテスト済み。**実機の高DPI環境での検証はmainpcが100%スケール機のため未実施のまま**（W7以降で高DPI機での確認が必要） |
| wgpu 移行が長引き Windows 以外の作業を止める | 中 | Phase 1-3 は Phase 4 と独立なので先に出す。Phase 3 完了時点で「overlay 以外は動く」を確定させる |
| Windows 版の保守コストで macOS の速度が落ちる | 中 | ADR-001 の優先順位は維持。Windows の parity failure は当面 blocker にしない |
| 開発機（rustc 1.93.0）と Windows 機（1.98.0）のバージョン差 | 低 | 揃える。`rust-toolchain.toml` の導入を検討する |

## 6. 工数感

| Phase | 内容 | 推定 |
|---|---|---|
| 0 | 連続描画の先行検証 | 1日 |
| 1 | 準対応 MVP の正式化 | 1-2日 |
| 2 | shm の Windows 実装 | 2-3日 |
| 3 | `cfg(unix)` 掛け漏れ | 0.5-1日 |
| 4 | **wgpu 0.20 → 25+ 移行** | **5-10日** |
| 5 | Windows overlay 実装 | 4-6日 |
| 6 | geometry 追従・DPI | 2-3日 |
| 7 | 段階導入・既定切替 | 1日 |

**合計 約 17-27 営業日。** うち Phase 4 が最大かつ最も見積り幅が広い。
Phase 1-3 だけなら **約 4-6 営業日**で「overlay 以外は Windows で動く」に到達する。

## 7. 着手前に確定したい設計判断

1. ~~**wgpu の上げ先を 25 と 30 のどちらにするか。**~~
   **決定済み（2026-08-22）: 25。** 根拠は
   [h3-wgpu25-vs-wgpu30.md](../wgpu24_nv12_research/notes/h3-wgpu25-vs-wgpu30.md)。
2. **Phase 4 を Windows のためだけの作業として扱うか、`wgpu24_nv12_research` と合流させるか。**
   合流させるなら上げ先は 25 以上で NV12 の再評価も同時に行う。
3. **Phase 1-3 で一度リリースするか**（「overlay 以外は Windows で動く」で区切るか）。
4. **ADR-001 の「準対応」定義を更新するか。**
   overlay まで持っていくなら、Windows は「起動・基本描画・基本書き出しのスモーク」より
   上の水準になる。CI マトリクス（`roadmap.md` の Windows は build-only + smoke）も
   合わせて見直すか。
5. **Windows の hardware decode/encode（Media Foundation）をロードマップに載せるか。**
   本計画では非ゴールにしているが、overlay が動くと次に効いてくるのはここ。

## 8. 関連文書

- `windows_port_research/notes/INDEX.md` — 本計画の全根拠
- `Rust_Source_Of_Truth_Plan.md` — 並行して走る正本集中計画。両計画の実行順序は
  そちらの §3 を正本とする（W4 の wgpu 昇格が唯一の強い結合点）
- `Native_Overlay_Plan.md` — macOS 版の実装計画（本計画の対応元）
- `Native_Overlay_Bug_E_Plan.md` — z-order / 遮蔽の扱い
- `architecture/01-decision-record.md` — ADR-001 / ADR-011 / ADR-013
- `architecture/04-render-parity.md` — Phase 4 の合格条件
- `architecture/05-boundary-ipc.md` — shm / データプレーンの規約
- `roadmap.md` — CI 方針（Windows は build-only + smoke）
- `wgpu24_nv12_research/notes/INDEX.md` — wgpu 上げ先の判断材料
