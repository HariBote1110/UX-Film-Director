# Native Overlay Preview 実装計画（Option A）

最終更新: 2026-06-30

## 位置づけ

本計画は、UX Film Director vNext における preview path の不安定性（`Rust_Preview_Jank_Handoff.md` の残2問題、特に「backend GPU→shm→frontend GPU の往復が重い」）を、preview の合成・提示を **Electron main プロセス内の wgpu addon が CAMetalLayer に直接描画する**構造に置換することで解消する計画である。

本計画は `architecture/00-overview.md` の層構成の上位互換であり、ADR-002 / 003 / 004 を維持する。新規方針として ADR-011（後述）を追加することを提案する。

Single Source of Truth: 本ファイル。設計判断は確定し次第 `architecture/01-decision-record.md` へ ADR として転記する。

## 0. ゴールと非ゴール

### ゴール

- preview の WebGPU 描画を、Rust + wgpu が **CAMetalLayer に直接描く** 構成へ置換する。
- decoded RGBA の per-frame data movement を「sidecar(decode) → main(render+present)」の1ホップに圧縮する。
- JS heap / Chromium GPU process / `writeTexture` を preview 経路から排除する。
- 体感 60fps を 1080p preview で達成する（プロキシ縮小と直交する改善）。

### 非ゴール

- export 経路（native wgpu → readback → ffmpeg）は触らない。`architecture/04-render-parity.md` の round-trip parity gate を壊さない。
- `shared-renderer` の WGSL は再利用する。新規 shader を書かない（ADR-003 維持）。
- Windows 対応は本計画の MVP には含めない。Phase 6 完了後に別 ADR を起こす。
- 滑らかな再生・音声同期は MVP 対象外（ADR-005 維持）。

## 1. アーキテクチャ概要

```text
[sidecar process: rust-backend]   decode のみ（ADR-004 維持）
  ffmpeg → POSIX shm (Phase 3a) または IOSurface (Phase 3b)
                       │
                       ▼
[Electron main process]           ★新規: napi-rs addon「native-overlay」
  native-overlay addon:
    - BrowserWindow.contentView へ NSView + CAMetalLayer を addSubview
    - wgpu Surface を Metal layer から生成
    - shared-renderer の合成パイプラインを再利用して present
                       │
                       ▼ CALayer 合成（Chromium GPU process 非経由）
[Electron renderer process]
  React UI（timeline / properties / inspector）
  preview 領域は透明 div として overlay の hit-through 領域にする
```

### プロセス境界の整理

- **decode は sidecar 維持**。ffmpeg / メディア panic は引き続き Electron main から隔離（ADR-004 維持）。
- **render は main 同居**。wgpu / objc2 / shared-renderer は純粋・安全側のコードなので、main に同居しても crash domain への寄与が小さい。
- **renderer process** は UI と入力受付に専念。preview に関する WebGPU code path はフラグで切替可能な状態で残し、最終的に parity 用のみへ縮退。

## 2. データプレーン2案（macOS）

| 案 | 1フレームのコピー | 実装難度 | 採用フェーズ |
|---|---|---|---|
| B1: POSIX shm + in-process memcpy | 1回（shm read → wgpu Buffer） | 低 | Phase 3a（必須） |
| B2: IOSurface ゼロコピー | 0回（GPU texture 直接共有） | 中（mach port 越し） | Phase 3b（任意） |

B1 だけで「JS heap 経由」「Chromium GPU process 経由」を消せる。B2 は最終最適化として段階導入する。

## 3. フェーズ計画

すべて TDD（Red → Green → Refactor）。各 Phase 完了時に `progress.md` 先頭へ追記し、`package.json` の版を規約通り更新する。

### Phase 0: 真因の数値確定（推定 1日）

**目的**: 「readback + writeTexture が真因」を実測で固定する。違うなら本計画を停止する。

- spike1: `decode.requestFrame` のレスポンスを presenter で「読まずに捨てる」変種で fps 測定。
- spike2: `writeTexture` を no-op に差し替えた変種で fps 測定。
- 計測条件: 1080p / 720p の両方、`perf/heavy-media/GX010052.MP4` を再生。
- **ゲート**: readback + upload を抜くと 60fps が出る → 続行。出なければ decode 側に真因あり、本計画を一旦停止して再計画。
- 出力: `progress.md` に数値、`markdown/Native_Overlay_Plan.md` 末尾に実測表を追記。

### Phase 1: NSView / CAMetalLayer overlay の生成（推定 2日）

**目的**: Electron BrowserWindow に CAMetalLayer overlay を attach し、固定色を描画する。GPU 描画とライフサイクルだけを通す。

- Red test (Rust): `objc2` で NSView 生成、CAMetalLayer を attach し `pixelFormat=bgra8Unorm`、`drawableSize` が指定通りであることを assert。
- Red test (TS): preload 越しに `nativeOverlay.attach({ windowId, x, y, w, h })` を呼ぶと `attached: true` が返り、`detach()` で `attached: false` になる vitest。GPU 描画は確認しない（main 側で mock 可能なライフサイクルのみ）。
- 実装:
  - 新規 crate `native-overlay/`（napi-rs addon、main プロセス用）。
  - macOS: `BrowserWindow.getNativeWindowHandle()` から `NSWindow*` を取得、`contentView` に subview を addSubview。
- 目視ゲート: preview 想定領域に赤い矩形が出る。ウィンドウリサイズ、devtools 開閉で追従する。
- 失敗 fallback: ADR-002 維持のため、`UXFD_NATIVE_OVERLAY` env が未設定の場合は overlay を作成せず既存経路を使う。

### Phase 2: shared-renderer を overlay surface に接続（推定 2-3日）

**目的**: `shared-renderer` の合成パイプラインを overlay の wgpu Surface へ描画する。

- Red test (Rust): `OverlayRenderer::present(scene_snapshot, source_rgba)` を呼ぶと、surface texture へ描画した内容が、export 経路の readback と pixel parity（max channel delta = 0）であることを offscreen surface で検証する。
- 実装:
  - `native-wgpu-renderer/` に **surface 描画モード**を追加する。export 用の readback path は別関数として残し、両者は内部の合成関数を共有する（重複ではなく、上位 wrap が違うだけ）。
  - WGSL は変更しない（ADR-003 維持）。
- parity ゲート: 既存 `04-render-parity.md` Phase 3a の reference scene（white 50% over black、opacity 0.25 など）を overlay surface で描画し、export readback と一致することを CI で検証する。

### Phase 3a: POSIX shm 経由で decoded RGBA を受け取る（推定 2-3日）

**目的**: sidecar が POSIX shm に書いた decoded RGBA を、main プロセス側の overlay renderer が読み出し texture upload する。

- Red test (Rust): native-overlay addon が `decode.start` で得た `memoryId` / `slotByteLen` / `slotCount` を attach し、`SharedFrame.descriptor` を渡すと、slot bytes を wgpu Buffer に memcpy し、texture へ upload できる。`shared-video-frame-bridge` の Rust core を main 側 napi binding として再利用する。
- 実装:
  - 既存 `shared-video-frame-bridge-node` は renderer process 用なので、main process 用 napi binding を新設する。
  - `decode.releaseFrame(copyOutState=gpuUploadFenceSignalled)` を render 完了の wgpu queue submit 後に呼ぶ。lease generation を厳守する。
- 計測ゲート: 1080p preview で `UXFD_DECODE_TRACE=1` の `decodeMs` が 16ms 未満、presenter 提示も 16ms 未満が定常で続く。

### Phase 3b: IOSurface ゼロコピー（任意、推定 +3-4日）

**目的**: cross-process GPU texture 共有で memcpy も消す。

- Red test (Rust): sidecar 側で IOSurface backed buffer を作り mach port 越しに main へ送付、main 側で `MTLDevice.newTextureWithDescriptor:iosurface:plane:` で texture 化、reference scene の pixel parity を確認する。
- 実装:
  - rust-backend decode の出力先を `feature = "iosurface"` で IOSurface に切替。POSIX shm は Phase 3a の互換 path として残す。
  - 制御プレーン（sidecar-protocol）に IOSurface mach port id を載せる項目を追加（base64 / bytes は引き続き禁止）。
- 採用判定: Phase 3a 完了時に体感 60fps が安定していれば Phase 3b は延期可。

### Phase 4: ウィンドウ位置同期（推定 1-2日）

**目的**: preview 領域の DOM 矩形に overlay 位置を追従させる。

- Red test (TS): preview 領域の `ResizeObserver` 変化、ウィンドウ resize、devtools 開閉、Mission Control 切替で、overlay の x/y/w/h が正しく更新される。座標計算ロジックは pure function として単体テスト可能にする。
- 実装: ResizeObserver の差分通知を Electron IPC で main へ送り、addon が `setFrame:` で reposition する。**per-frame ではない**（per-resize イベントのみ）。
- 既知罠: macOS HiDPI で `backingScaleFactor` を main 側で正本化する。renderer の `devicePixelRatio` だけを信用しない。

### Phase 5: 入力イベントの取り回し（推定 1日）

**目的**: overlay は描画専用とし、マウス・キーボード・ドラッグは HTML 側で受ける。

- 実装: NSView の `hitTest:` を nil 返しに設定し、overlay 上のクリックを下層の WebView に通す。
- 既存テスト走査: D&D、スクラブ、ショートカット、コンテキストメニューに regression がないことを `npx vitest run` で確認する。

### Phase 6: 段階導入と既定切替（推定 1日）

- `VITE_UXFD_NATIVE_OVERLAY=1` で opt-in、`npm run dev:native-overlay` を追加。
- 既存 WebGPU presenter は **parity 比較用に残す**（同一 scene を両経路で描画し pixel diff を取る harness を `04-render-parity.md` に追記）。
- 24時間ベンチで安定したら既定 ON、`package.json` の PhaseVer を +1、SubVer を `a` にリセット。

### Windows 対応（別フェーズ・未着手）

- 候補: HWND child window + DirectComposition による透過合成、または DXGI swap chain への直接描画。
- 別 ADR（ADR-012 想定）を起こして決定する。本計画には含めない。

## 4. 既存設計との整合

| 既存原則 | 本計画との整合 |
|---|---|
| ADR-001 macOS 主ターゲット | 強化（mac-only 最適化を Phase 6 まで先行） |
| ADR-002 Electron を UI shell として残す | 維持（UI は Electron renderer のまま） |
| ADR-003 preview / export の合成を分けない | 維持（shared-renderer / WGSL 同一） |
| ADR-004 sidecar で危険処理を隔離 | 維持（decode は sidecar、render のみ main 同居） |
| 05-boundary-ipc データプレーン禁則（JSON / base64 / 高頻度 ArrayBuffer IPC 禁止） | 維持（shm or IOSurface） |
| 04-render-parity golden | 拡張: overlay vs WebGPU preview vs export readback の3経路 parity を Phase 6 で追加 |

### 提案 ADR

- **ADR-011（提案）**: preview renderer を napi-rs addon として Electron main プロセスに同居させる。decode は引き続き sidecar に隔離する。
  - 理由: data plane のプロセス越えとフレームバイトの JS heap 経由を排除しないと、preview の往復コストが構造的に解消できない。renderer 自体は純粋・安全側のコードで、main の crash domain への寄与が小さい。
  - 却下案: renderer も sidecar に置き、IOSurface だけで描画結果を main へ送る案。CALayer overlay は cross-process surface ownership の制約があり、`MTLDrawable` を mach port 越しに使う公的 API は不安定なため初期は避ける。

## 5. リスクと退避

| リスク | 影響 | 退避 |
|---|---|---|
| napi-rs addon の panic が Electron main を巻き込む | 高 | wgpu / NSView 部分を `catch_unwind` で包み、復帰失敗時は既存 WebGPU presenter 経路へ fallback。env 切替で即時退避可能。 |
| BrowserWindow のレイヤツリーで CAMetalLayer がフリッカ | 中 | 親 NSView の `wantsLayer=YES`、`subviews` 順制御で固定。Phase 1 の目視ゲートで早期検出。 |
| devtools 開閉や HiDPI スケーリング差で overlay 位置ズレ | 中 | Phase 4 の pure function テストで網羅。`scaleFactor` は main 側を正本化。 |
| IOSurface mach port の所有権バグで GPU リソース leak | 中 | Phase 3a (memcpy) を **commit して安定化**してから 3b に進む。3b は feature flag。 |
| 既存 WebGPU presenter 経路を壊し、export parity が崩れる | 低 | flag gate で完全別経路。撤去せず parity 比較に転用。 |
| overlay 上のマウスイベントが UI に届かない | 中 | NSView `hitTest:` で hit-through、Phase 5 の regression テストで確認。 |

## 6. 期待効果（数値見積）

- per-frame data movement: 1080p RGBA writeTexture 経路 約 8MB → **0 byte (B2) / 約 8MB の単一プロセス内 memcpy (B1)**
- プロセス越え: 2回（sidecar → renderer → Chromium GPU process）→ **1回（sidecar → main）**
- Chromium GPU process: バイパス（compositor が CALayer overlay を直接合成）
- 「15fps 壁」（`Rust_Preview_Jank_Handoff.md` 残問題1）はおおむね消える見込み。proxy / 720 化と直交する改善。
- 暗さ（残問題2）は本計画と独立。decode 側 colour matrix / range の明示が必要で、本計画とは別 task として並行解決する。

## 7. 工数感

- Phase 0-1: 約3日
- Phase 2-3a: 約5日
- Phase 4-6: 約3-4日
- Phase 3b (IOSurface, 任意): +3-4日

**macOS 単体で約 11-15 営業日**、Windows は別フェーズ。

## 8. 着手前に確定したい設計判断

1. **napi-rs を Electron main に導入してよいか**（ADR-011 として記録するため、判断と理由を残したい）。
2. **既存 WebGPU presenter を「parity 比較用に残す」前提でよいか**（保守コスト < 検証価値、と判断したい）。
3. **Phase 3b（IOSurface）まで本計画に含めるか、Phase 3a 完了時点の体感で再判断するか**（後者を推奨）。

## 9. 関連文書

- [architecture/00-overview.md](./architecture/00-overview.md)
- [architecture/01-decision-record.md](./architecture/01-decision-record.md)
- [architecture/04-render-parity.md](./architecture/04-render-parity.md)
- [architecture/05-boundary-ipc.md](./architecture/05-boundary-ipc.md)
- [Rust_Preview_Jank_Handoff.md](./Rust_Preview_Jank_Handoff.md)（本計画の起点となった残問題）

## 10. 実測ログ（Phase 0 以降、追記）

Phase 0 の実測値はここに追記する。

```text
（未計測）
```
