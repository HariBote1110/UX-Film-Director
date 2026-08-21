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
