# 別ウィンドウ間の透過合成とクリック透過（Windows 実機）

## 目的 / 仮説

[dcomp-transparent-composite-visual.md](dcomp-transparent-composite-visual.md) で確かめたのは
*同一ウィンドウの visual tree 内*での合成だった。実アプリでは overlay が
**Chromium が描く Electron ウィンドウの上**に別ウィンドウとして乗るので、そこを詰める。
あわせて、macOS の `hitTest:` nil ＋ `setIgnoresMouseEvents:` に相当する
クリック透過が Windows でどう実現されるかも確かめる。

- H-1: オーナー付き `WS_POPUP` の overlay ウィンドウは、別ウィンドウである親の
  内容の上に per-pixel alpha で合成される。
- H-2: `WS_EX_TRANSPARENT` を付ければマウスのヒットテストは下のウィンドウへ抜ける。

## 環境

`ssh mainpc` / Windows 11 Pro 22631 / RTX 3070 Ti / rustc 1.98.0 / wgpu 30.0.0 /
windows crate 0.58。計測日 2026-08-22。

**前ノートとの差分: RDP で接続してセッションをアクティブにした**（`query session` が
`rdp-tcp#0 gzabu 2 Active`）。これにより画面キャプチャ（screen DC からの `BitBlt`）が
機能するようになり、ウィンドウ間の合成結果を実際に取得できるようになった。
切断中（`Disc`）のままだと全面黒で判定できない。

## 手順

`windows_port_research/tools/probe-crosswindow`。

| ウィンドウ | 役割 | スタイル |
|---|---|---|
| base | Chromium/WebView の代役。GDI で 40px の市松（マゼンタ/イエロー）を描く | `WS_OVERLAPPEDWINDOW` |
| overlay | macOS の child NSWindow 相当。base をオーナーに持つ | `WS_POPUP` + `WS_EX_NOREDIRECTIONBITMAP \| WS_EX_TRANSPARENT \| WS_EX_TOOLWINDOW \| WS_EX_NOACTIVATE` |

overlay に DirectComposition target/visual を張り、wgpu 30 の composition swapchain
（`alpha_mode: PreMultiplied`）へ左1/3=不透明の緑 / 中1/3=premultiplied 50% 青 /
右1/3=完全透明 を描く。base のクライアント矩形を screen DC からキャプチャして判定。
ヒットテストは `WindowFromPoint` で確認する。

## 結果

### 合成（H-1: 採用）

base クライアント座標 `y=200` の画素（**画面キャプチャ**＝ウィンドウ間合成の結果）:

| 領域 | x | 実測 RGB | 期待 RGB | 判定 |
|---|---|---|---|---|
| 不透明の緑 | 160 | (0, 255, 0) | (0, 255, 0) | 一致 |
| 50% 青 / 下はマゼンタ | 360 | (128, 0, 255) | (128, 0, 255) | 一致 |
| 完全透明 / 下はイエロー | 580 | (255, 255, 0) | (255, 255, 0) | 一致 |
| overlay 外 / 素の市松 | 20 | (255, 255, 0) | (255, 255, 0) | 一致 |

画像: [images/dcomp-crosswindow.png](images/dcomp-crosswindow.png)

### クリック透過（H-2: 棄却 → 正しい方法を確定）

**`WS_EX_TRANSPARENT` だけではヒットテストは抜けなかった。**
`WindowFromPoint` は overlay 内のどの点でも overlay の HWND を返した——
完全透明のバンドの上でも同じ。

overlay 専用の window class を用意し、`WM_NCHITTEST` に `HTTRANSPARENT`(-1) を
返すようにしたところ、3点すべてで base の HWND が返るようになった:

```
inside overlay / opaque green    -> base
inside overlay / transparent     -> base
outside overlay                  -> base
```

これは macOS 側で `NSView` の `hitTest:` に nil を返しているのと構造的に同じ対処。
`WS_EX_TRANSPARENT` は残しておいてよいが、**それ単体を当てにしてはいけない**。

## 結論

- **Windows の native overlay は、macOS 版と同じ設計でそのまま写せる。**
  対応表:

  | macOS | Windows |
  |---|---|
  | child NSWindow（`setOpaque: NO` / `backgroundColor: clearColor`） | オーナー付き `WS_POPUP` + `WS_EX_NOREDIRECTIONBITMAP` |
  | CAMetalLayer（`setOpaque: NO`） | DirectComposition visual + composition swapchain |
  | surface 構築後の opaque 再適用（Bug E） | 不要（`alpha_mode` は configure 時に確定し、wgpu が奪わない） |
  | `LoadOp::Clear(TRANSPARENT)` + PreMultiplied | 同じ |
  | `hitTest:` に nil / `setIgnoresMouseEvents: YES` | `WM_NCHITTEST` に `HTTRANSPARENT` |

- macOS 側で苦労した Bug E（wgpu が layer を差し替えるので opaque を再適用する必要がある）に
  相当する問題は Windows には無い。DirectComposition では alpha は swapchain 生成時に
  確定し、wgpu が後から壊さない。

## 未検証事項

- **Chromium 実物との組み合わせは未検証。** 今回の base は GDI で描いた素のウィンドウで、
  Chromium 自身の DirectComposition が動いている状況ではない。z-order 競合・ちらつきは
  Electron 実物で確かめる必要がある（macOS の Bug E に相当する問題が別の形で出る可能性）。
- overlay の geometry 追従（親の移動・リサイズ・DPI 変更・devtools 開閉）は未着手。
  macOS 側は `NSWindowDidMoveNotification` 等を自前 observer で拾って再同期している
  （`macos_overlay.rs` の `GEOMETRY_RESYNC_OBSERVERS`）。Windows でも `WM_MOVE` /
  `WM_SIZE` / `WM_DPICHANGED` 相当の再同期が要る。
- 本プローブのプロセスは DPI 非対応のまま。実機は 100% スケールだったため座標が一致したが、
  高DPI 環境では別途 per-monitor DPI awareness の検討が要る。
- 連続描画時の安定性（本プローブは1フレームだけ描いて止まる）は未検証。
