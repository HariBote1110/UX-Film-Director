# 透過 overlay が実際に合成されるかの目視確認（Windows 実機）

## 目的 / 仮説

[dx12-alpha-real-hardware.md](dx12-alpha-real-hardware.md) で
「wgpu 25+ なら DX12 の composition surface に `PreMultiplied` を `configure` できる」
ことは確かめた。しかし確かめたのは **API が通るところまで**で、
半透明の絵が実際に下の内容と合成されて見えるかは未確認だった。ここを潰す。

- H-1: `alpha_mode = PreMultiplied` で描いた完全透明の領域は、下の visual の内容がそのまま見える。
- H-2: 半透明（alpha=0.5）の領域は、premultiplied のブレンド式どおりの色になる。

## 環境

`ssh mainpc` / Windows 11 Pro 22631 / RTX 3070 Ti / rustc 1.98.0 x86_64-pc-windows-msvc。
wgpu 30.0.0、windows crate 0.58。計測日 2026-08-22。詳細は
[dx12-alpha-real-hardware.md](dx12-alpha-real-hardware.md) の環境節と同じ。

### キャプチャ手段でハマった点（重要）

1. **SSH から直接起動すると DirectComposition が `E_ACCESSDENIED`。**
   `schtasks /create ... /it` でログオン済みセッションへ流し込む必要がある。
2. **切断中の RDP セッションでは画面キャプチャが全面黒になる。**
   `BitBlt` を screen DC から取ると、overlay どころか素の GDI ウィンドウすら
   真っ黒（`R=0 G=0 B=0`）で返る。セッションに描画先のスクリーンが存在しないため。
3. **`PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT)` はその状況でも中身を返す。**
   ウィンドウ単位で DWM から取るため、スクリーン不在でも DirectComposition の
   内容が取れる。今回の検証はすべてこの経路で行った。
   なお windows crate では `PrintWindow` は `Win32::Storage::Xps` にある。

## 手順

`windows_port_research/tools/probe-visual`。

1 つの `WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT` な `WS_POPUP` ウィンドウを作り、
その DirectComposition visual tree に 2 枚を積む:

| visual | 内容 | `alpha_mode` |
|---|---|---|
| 下 | 40px の市松模様（マゼンタ / イエロー） | `Opaque` |
| 上 | 左1/3=不透明の緑 / 中1/3=premultiplied 50% 青 / 右1/3=完全透明 | `PreMultiplied` |

どちらも wgpu 30 の composition swapchain。`IDCompositionDevice::Commit` の後、
`PrintWindow(PW_RENDERFULLCONTENT)` で合成結果を取得する。

**z 順の注意**: `AddVisual(visual, insertAbove, None)` の解釈はリスト順の向きに
依存して紛らわしい。`AddVisual(&bottom, false, None)` → `AddVisual(&top, true, &bottom)`
のように **参照 visual を明示する**こと。`None` 指定で積んだ最初の実験では
z 順が逆になり、下の市松しか見えなかった（上の visual が完全に隠れた）。

## 結果

`y=100` の画素サンプル（期待値は premultiplied ブレンド `result = src + dst * (1 - a)`）:

| 領域 | x | 実測 RGB | 期待 RGB | 判定 |
|---|---|---|---|---|
| 不透明の緑 | 100 | (0, 255, 0) | (0, 255, 0) | 一致 |
| 50% 青 / 下はイエロー | 300 | (128, 128, 127) | (128, 128, 127) | 一致 |
| 完全透明 / 下はイエロー | 520 | (255, 255, 0) | (255, 255, 0) | 一致 |

中央の計算: 下がイエロー `(255,255,0)`、上が premultiplied な `(0,0,127)` / `a=0.5` なので
`(0,0,127) + (255,255,0) * 0.5 = (127.5, 127.5, 127)` → 実測 `(128,128,127)`。

合成後の画像: [images/dcomp-composite.png](images/dcomp-composite.png)
（左1/3が緑で塗り潰され、中1/3は市松が青みがかって透けて見え、右1/3は市松がそのまま出る）。
上の visual 単体の内容: [images/dcomp-overlay-layer.png](images/dcomp-overlay-layer.png)。

## 結論

- **H-1・H-2 ともに採用。** Windows 実機で、wgpu 30 の composition swapchain に
  premultiplied alpha で描いた内容が DirectComposition によって正しく合成された。
  数値も画像も期待どおり。
- これで「Windows で透過 overlay が作れるか」という問いは **作れる** で決着した。
  macOS の CAMetalLayer + `setOpaque:NO` + 透明 clear に対応する構成が、
  DirectComposition + `alpha_mode: PreMultiplied` + 透明 clear でそのまま成立する。
- 逆に言えば、[cametallayer-equivalent-and-alpha.md](cametallayer-equivalent-and-alpha.md) で
  挙げた退避策（wgpu-hal パッチ / 自前 swapchain / 透過を諦める）は**すべて不要**。
  必要なのは wgpu を 25 以上に上げることだけ。

## 未検証事項（ここは残っている）

- **別ウィンドウとの合成は未確認。** 今回確かめたのは *同一ウィンドウの visual tree 内*
  での合成。実際のアプリでは overlay ウィンドウが **Chromium が描く Electron ウィンドウの上**に
  乗るので、そちらの合成は別問題として残る。親ウィンドウ＋オーナー付き `WS_POPUP` の
  構成でも試したが、画面キャプチャが黒くなる制約で判定できなかった
  （`PrintWindow` はウィンドウ単位のため、ウィンドウ間の合成結果は取れない）。
  判定するにはセッションをアクティブにする必要がある
  （`tscon <id> /dest:console` で物理コンソールへ繋ぐ、または RDP で接続して目視）。
- Chromium 自身の DirectComposition と z-order が競合しないか（macOS の Bug E 相当）は未検証。
- クリック透過（`WS_EX_TRANSPARENT` は付けてあるが、実際にマウスイベントが
  下の WebView に抜けるか）は未検証。
- overlay の geometry 追従（親ウィンドウの移動・リサイズ・DPI 変更）は未着手。
  macOS 側は `NSWindowDidMoveNotification` 等を自前 observer で拾って再同期している
  （`macos_overlay.rs` の `GEOMETRY_RESYNC_OBSERVERS`）。Windows でも同等の仕掛けが要る。
