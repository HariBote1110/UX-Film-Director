# 計測ツール

- `probe-wgpu020/` — プロジェクト現行の wgpu 0.20 で、DX12 composition-visual surface の
  `alpha_modes` を実機列挙し、各 `CompositeAlphaMode` で `configure` を試す使い捨てプローブ。
- `probe-wgpu030/` — 同じ質問を wgpu 30 に投げる版。

いずれも **Windows のインタラクティブセッションで実行する必要がある**。SSH から直接
起動すると DirectComposition が `E_ACCESSDENIED` を返す（ウィンドウステーションが違うため）。
`schtasks /create ... /it` でログオン済みセッションに流し込み、ログをファイルへ落として読む。

```bat
schtasks /create /tn uxfdalphaprobe /tr "C:\path\runprobe.bat" /sc once /st 23:59 /it /f
schtasks /run /tn uxfdalphaprobe
```

- `probe-visual/` — 透過が実際に合成されるかの目視確認。1つの
  `WS_EX_NOREDIRECTIONBITMAP` ウィンドウの DirectComposition visual tree に
  「下＝不透明の市松（alpha_mode=Opaque）」「上＝3バンド（alpha_mode=PreMultiplied）」を
  積み、`PrintWindow(PW_RENDERFULLCONTENT)` で合成後の絵を PNG に落とす。

`PrintWindow` は `Win32::Storage::Xps` にある（`WindowsAndMessaging` ではない）。
また **切断中の RDP セッションでは画面キャプチャ（`BitBlt` from screen DC）が
全面黒になる**——スクリーンが存在しないため。ウィンドウ単位の `PrintWindow` は
その状況でも DirectComposition の内容を返す。
