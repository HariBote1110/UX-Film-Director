# DX12 透過 overlay の可否をWindows実機で確定（＋wgpu バージョン境界）

## 目的 / 仮説

[cametallayer-equivalent-and-alpha.md](cametallayer-equivalent-and-alpha.md) はソース読解で
「wgpu 経由では DX12 の透過 overlay が作れない」と結論した。これを実機で検証し、
併せて「wgpu を上げれば直るのか」を確定させる。

- H-1: 実機でも `surface.get_capabilities().alpha_modes` は `[Opaque]` のみ。
- H-2: wgpu を最新（30）にしても状況は変わらない（前ノートで hal 24.0.4 も同じだったため）。

## 環境

計測機（新規に本研究へ投入した Windows 実機）:

| 項目 | 値 |
|---|---|
| ホスト | `ssh mainpc`（192.168.0.30, user gzabu） |
| OS | Windows 11 Pro 10.0.22631 |
| CPU / RAM | i7-12700KF / 31.8 GB |
| GPU | **NVIDIA GeForce RTX 3070 Ti**（Dx12 / DiscreteGpu） |
| MSVC | VS2019 Community の VC++ x86/x64 tools |
| Windows SDK | 10.0.19041.0 |
| Rust | rustc 1.98.0 (88d9e12ae 2026-08-18) x86_64-pc-windows-msvc（本調査で winget 導入） |
| Node / Git | v22.14.0 / あり |
| ffmpeg | **なし** |

計測日: 2026-08-22。開発機 Mac 側は rustc 1.93.0 で、**バージョンが揃っていない**点に注意。

### 重要な実行上の制約

**SSH セッションから直接実行すると DirectComposition が使えない。**
`DCompositionCreateDevice` が `HRESULT(0x80070005) E_ACCESSDENIED`（アクセスが拒否されました）
を返す。Windows の OpenSSH はインタラクティブなウィンドウステーション（WinSta0）とは
別のセッションで動くため。

回避策として `schtasks /create ... /it`（interactive）でログオン済みセッションへ流し込み、
標準出力をファイルに落として SSH 側から読んだ。セッション 2（gzabu）は RDP 切断状態
（`Disc`）だったが、それでもデスクトップは生きており DirectComposition は成功した。

## 手順

`windows_port_research/tools/probe-wgpu020` / `probe-wgpu030`。どちらも:

1. `DCompositionCreateDevice(None)` → `IDCompositionDevice::CreateVisual()` で
   **本物の `IDCompositionVisual`** を作る
2. `SurfaceTargetUnsafe::CompositionVisual(ptr)` で `create_surface_unsafe`
3. `compatible_surface` 付きで adapter を取り、`surface.get_capabilities()` を印字
4. `PreMultiplied` / `PostMultiplied` / `Inherit` / `Opaque` の順に `configure` を試し、
   panic を `catch_unwind` で捕まえて成否を印字

## 結果

### wgpu 0.20（プロジェクト現行）

```
adapter: NVIDIA GeForce RTX 3070 Ti / Dx12 / DiscreteGpu
formats       = [Bgra8UnormSrgb, Rgba8UnormSrgb, Bgra8Unorm, Rgba8Unorm, Rgb10a2Unorm, Rgba16Float]
present_modes = [Mailbox, Fifo, Immediate]
ALPHA_MODES   = [Opaque]
configure(alpha_mode = PreMultiplied)  -> FAILED
configure(alpha_mode = PostMultiplied) -> FAILED
configure(alpha_mode = Inherit)        -> FAILED
configure(alpha_mode = Opaque)         -> OK
```

失敗時のメッセージは
`Requested alpha mode PreMultiplied is not in the list of supported alpha modes: [Opaque]`。

### wgpu 30（最新）— 同じ機械・同じ GPU・同じ visual

```
ALPHA_MODES   = [Auto, Inherit, Opaque, PostMultiplied, PreMultiplied]
configure(alpha_mode = PreMultiplied)  -> OK
configure(alpha_mode = PostMultiplied) -> OK
configure(alpha_mode = Inherit)        -> OK
configure(alpha_mode = Opaque)         -> OK
```

### 修正が入ったバージョンの特定

`wgpu-hal-*/src/dx12/adapter.rs` に `CompositeAlphaMode::PreMultiplied` が現れるかで判定
（`windows_port_research/tools/` の halscan 手順、crates.io から各版を `cargo fetch`）:

| wgpu-hal | DX12 が広告する alpha mode |
|---|---|
| 0.21.1（＝ wgpu 0.20 系、現行） | Opaque のみ |
| **25.0.2** | **PreMultiplied を含む** |
| 26.0.6 / 27.0.4 / 28.0.1 / 29.0.4 / 30.0.0 | PreMultiplied を含む |

wgpu 30 の `dx12/adapter.rs:1364` は target 別に分岐しており、
`WndHandle` は `[Opaque]` のまま、`Visual` / `VisualFromWndHandle` / `SurfaceHandle` /
`SwapChainPanel` に対してのみ全 alpha mode を広告する。
`auxil/dxgi/conv.rs:292` の `map_acomposite_alpha_mode` も 25 以降は
`PreMultiplied -> DXGI_ALPHA_MODE_PREMULTIPLIED` を正しく写すようになっている
（0.21.1 は引数を捨てて `IGNORE` 固定だった）。

## 結論

- **H-1 は採用**（現行 wgpu 0.20 では実機でも `[Opaque]` のみ、透過不可）。
- **H-2 は棄却。** wgpu 25 以降で修正済みで、実機でも `PreMultiplied` が通った。
  つまり **Windows の透過 overlay は「プラットフォームの制約」ではなく
  「wgpu のバージョンの問題」だった**。前ノートで挙げた退避策のうち
  「wgpu-hal にパッチを当てる」「swapchain を自前で作る」は**どちらも不要**。
- 加えて wgpu 25+ には `SurfaceTargetUnsafe::VisualFromWndHandle` があり、
  HWND から DirectComposition visual を wgpu 側が作ってくれる。
  Win32 側に書く必要のあるコード量がさらに減る。
- ただし DX12 で透過が効くのは **composition 系 target のみ**。素の HWND
  （`WndHandle`）は 30 でも `[Opaque]` のまま。Windows 版 overlay は
  「child HWND に直接 swapchain」ではなく **DirectComposition 経由**で設計する必要がある。

## 移植計画への影響

Windows overlay の前提条件に **「wgpu を 0.20 から 25 以上へ上げる」** が加わった。
これは Windows のためだけの作業ではなく、既に
[wgpu24_nv12_research](../../wgpu24_nv12_research/notes/INDEX.md) で wgpu 24 系を調べているので、
**その上げ先を 24 ではなく 25+ にすれば Windows の透過がついてくる**という関係になる。
0.20 → 25 は破壊的変更を多数またぐため、移行コストの見積りは別途必要
（本プローブでも 0.20 → 30 で `InstanceDescriptor` / `RequestAdapterOptions` /
`SurfaceConfiguration` の各構造体にフィールド追加・Default 削除があり、
`request_device` の引数も変わっていた）。

## 次の一手 / 未検証事項

- **透過が「見える」ことは未確認。** 本プローブが確かめたのは `configure` が通るところまでで、
  実際に半透明の overlay が下層ウィンドウと合成される絵は出していない。
  DirectComposition target（`DCompositionCreateDevice` → `CreateTargetForHwnd` → `SetRoot` → `Commit`）
  を組んで、下に別ウィンドウを置いた状態での目視確認が要る。
- Electron の BrowserWindow HWND に対して上記を行ったとき、Chromium 自身の
  DirectComposition と競合しないか（macOS の Bug E に相当する z-order / ちらつき問題）は未検証。
- クリック透過（`WS_EX_TRANSPARENT` / `WS_EX_NOREDIRECTIONBITMAP`、macOS の
  `hitTest:` nil ＋ `setIgnoresMouseEvents:` 相当）の組み合わせは未調査。
- wgpu 0.20 → 25+ の移行コスト見積り（特に `nv12/import.rs` が触っている
  `wgpu_hal::metal` 内部 API の変化）は未着手。
- Windows 機に ffmpeg が無いため、起動 smoke（準対応 MVP の3基準）はまだ実施できない。
