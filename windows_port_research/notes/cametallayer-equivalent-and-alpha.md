# CAMetalLayer 相当は Windows に何があるか（透過合成の可否）

## 目的 / 仮説

前ノート（[current-portability-audit.md](current-portability-audit.md)）で
`native-overlay` / `native-wgpu-renderer` が Windows target で型検査を通ることを示したが、
これは「macOS 専用経路が `cfg` で丸ごと消えているから通った」だけである可能性が高い。
overlay の心臓部である **CAMetalLayer による透過合成**が Windows で何に対応するのか、
そして wgpu 経由でそれが可能なのかを確定させる。

- H-1: overlay の surface 生成経路は macOS 専用で、Windows には代替の入口が無い。
- H-2: wgpu には CAMetalLayer 相当（IDCompositionVisual）の入口が無いので、
  wgpu-hal を自前で叩く必要がある。

## 環境

- 開発機 macOS (Apple M4)、rustc 1.93.0
- 読解対象: `~/.cargo/registry/src/*/wgpu-0.20.1`、`wgpu-hal-0.21.1`、`wgpu-core-0.21.1`
  （本プロジェクトが実際に使っているバージョン）
- 参考比較: `wgpu-hal-24.0.4`（`wgpu24_nv12_research` で取得済みの新しい版）
- 計測日: 2026-08-22

## 結果

### 1. surface 生成の入口は macOS 専用（H-1: 採用）

`native-wgpu-renderer/src/lib.rs`:

| 行 | 項目 | cfg |
|---|---|---|
| 368 | `NativeWgpuLiveSurfaceRenderer::from_appkit_view` | `#[cfg(target_os = "macos")]` |
| 1060-1079 | `AppKitSurfaceView` と `HasWindowHandle` 実装 | `#[cfg(target_os = "macos")]` |
| 383 | `from_surface(instance, surface, ...)` | **cfg なし** |

Windows では「ウィンドウから surface を作る」関数が存在しない。ただし
`from_surface` は素の `wgpu::Surface` を受け取る形で公開されているので、
**Windows 版の入口を1本足すだけで下流のレンダラ本体はそのまま再利用できる**構造に
なっている（型検査が通ったのはこの構造のおかげ）。

### 2. wgpu には IDCompositionVisual の入口がある（H-2: 棄却）

`wgpu-0.20.1/src/lib.rs:659` の `SurfaceTargetUnsafe`:

```rust
#[cfg(metal)] CoreAnimationLayer(*mut c_void),      // ← macOS で使っているもの相当
#[cfg(dx12)]  CompositionVisual(*mut c_void),       // ← IDCompositionVisual
#[cfg(dx12)]  SurfaceHandle(*mut c_void),
#[cfg(dx12)]  SwapChainPanel(*mut c_void),
```

`wgpu-hal-0.21.1/src/dx12/mod.rs:104` に `create_surface_from_visual`、
同 717 行で `IDXGIFactory4::CreateSwapChainForComposition` を呼んでいる。
つまり **CAMetalLayer ↔ IDCompositionVisual の対応は wgpu の公開 API レベルで既にある**。

### 3. しかし DX12 backend は透過を一切通さない（新発見・本ノートの主眼）

| 場所 | 内容 |
|---|---|
| `wgpu-hal-0.21.1/src/dx12/adapter.rs:708` | `composite_alpha_modes: vec![CompositeAlphaMode::Opaque]` — **Opaque しか広告しない** |
| `wgpu-hal-0.21.1/src/auxil/dxgi/conv.rs:269` | `map_acomposite_alpha_mode(_mode)` が引数を**捨てて** `AlphaMode::Ignore` を返す |
| `wgpu-core-0.21.1/src/device/global.rs:1910` | 広告外の alpha mode を要求すると `UnsupportedAlphaMode` |

新しい `wgpu-hal-24.0.4` でも同じ（`adapter.rs:831` が `vec![Opaque]`、
`conv.rs:284` が `DXGI_ALPHA_MODE_IGNORE` を直返し）。**wgpu を上げても直らない。**

### 4. 現行コードは「エラーにならず、黙って不透明になる」

`native-wgpu-renderer/src/lib.rs:2732` の `choose_live_surface_alpha_mode` は
PreMultiplied → PostMultiplied → `alpha_modes.first()` の順に落ちる。
DX12 では `first()` が `Opaque` なので **`configure` は成功し、例外も警告も出ない**。

macOS 側の Bug D 対策は次の2点セットで成立している:

- `macos_overlay.rs:663` `setOpaque: NO` / `setBackgroundColor: clearColor`（child NSWindow）
- `apply_overlay_layer_opaque`（`macos_overlay.rs:797`）で CAMetalLayer 自体にも `setOpaque: NO`
  ——しかも `wgpu::create_surface_unsafe` が layer を差し替えるため
  **surface 構築後に再適用**が必要（Bug E、`set_overlay_view_opaque`）

この「layer の opaque を後から上書きする」という逃げ道が、DX12 側には無い。
swapchain の `DXGI_ALPHA_MODE` は生成時に決まり、wgpu はそれをハードコードしている。

## 結論

- CAMetalLayer の Windows 相当は **IDCompositionVisual + `CreateSwapChainForComposition`** で、
  wgpu 0.20 の公開 API にも入口がある（H-2 は棄却）。設計の対応関係はきれいに写る。
- **ただし wgpu 経由では透過 overlay が作れない。** DX12 backend が
  `DXGI_ALPHA_MODE_IGNORE` を固定しているため、`LoadOp::Clear(TRANSPARENT)` の結果が
  compositor に届かず、overlay 矩形が下層 WebView を不透明に覆う。
  しかもエラーではなく**無言の見た目バグ**として出る。
- したがって Windows の native overlay は「AppKit を Win32 に書き換える」だけでは終わらない。
  透過を通すには次のいずれかが要る:
  1. `wgpu-hal` の dx12 backend にパッチを当てる（`map_acomposite_alpha_mode` と
     `composite_alpha_modes` の2箇所。変更量自体は小さい）＋ upstream へ PR
  2. swapchain だけ自前で `CreateSwapChainForComposition`（`DXGI_ALPHA_MODE_PREMULTIPLIED`）
     で作り、wgpu には `SurfaceHandle` / 外部テクスチャとして渡す
  3. 透過を諦め、Windows では overlay を使わず既存の WebGPU presenter fallback に留める
     （＝ ADR-001 の「準対応」の線）
- 前ノートの「native-overlay が無改造で型検査通過」は、**移植が終わっているという意味では
  まったくない**。overlay の本体機能は cfg で消えた側にあり、そこが本番。

## 次の一手 / 未検証事項

- 上記 1（wgpu-hal パッチ）が本当に 2 箇所で足りるか、実際に Windows 実機で
  `DXGI_ALPHA_MODE_PREMULTIPLIED` の composition swapchain が Chromium の HWND 上で
  正しく合成されるかは未検証。
- Electron の BrowserWindow HWND に child HWND をぶら下げて DirectComposition target を
  作る手順（`DCompositionCreateDevice` → `CreateTargetForHwnd` → `IDCompositionVisual`）は
  未調査。macOS の child NSWindow + `setIgnoresMouseEvents:` に相当する
  クリック透過（`WS_EX_TRANSPARENT` / `WS_EX_LAYERED` / `WS_EX_NOREDIRECTIONBITMAP`）の
  組み合わせも未調査。
- Chromium 側が既に DirectComposition を使っている環境で、外部の child HWND を
  重ねたときの z-order とちらつきは未検証（macOS の Bug E に相当する問題が
  Windows でも別の形で出る可能性が高い）。
