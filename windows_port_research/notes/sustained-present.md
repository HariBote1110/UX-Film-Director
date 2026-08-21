# 連続 present の実機検証（Windows Port Phase 0 / W0）

## 目的 / 仮説

これまでの Windows プローブはすべて「1 フレーム描いて止まる」作りで、
`Windows_Port_Plan.md` Phase 0 が唯一の未測定リスクとして残していた
「毎フレーム present し続けても破綻しないか」を潰す。

`Windows_Port_Plan.md` Phase 0 の判定条件:
**60fps を維持できない、またはちらつきが出るなら、Phase 5 の設計（child window 方式）を
再検討する。代替案は `VisualFromWndHandle`。**

仮説（実行前に記録）:

- **H-W0-1**: overlay を連続 present しても、フレームタイムは vsync 周期に張り付き、
  ちらつき・z 順逆転は発生しない。
  - 反証条件: 平均 fps がディスプレイのリフレッシュレートを大きく下回る、
    または合成後画素の不一致が観測される、または overlay が base より背面になる。
- **H-W0-2**: 親（Chromium）ウィンドウの移動・リサイズ中も overlay の present は
  ブロックされない。
  - 反証条件: `move` / `resize` フェーズの present p99 が `static` フェーズより
    桁違いに悪化する、または `get_current_texture` が繰り返し失敗する。
- **H-W0-3**: overlay の連続 present は Chromium 自身の描画を阻害しない。
  - 反証条件: baseline（present しない）と `static` の GPU 使用率差が、
    overlay 1 枚分として説明できない水準まで上がる。

## 環境

- ホスト: `mainpc`（Windows, RTX 3070 Ti）。SSH で操作。
- rustc 1.98.0 / cargo 1.98.0
- wgpu 30、windows crate 0.58、backend DX12
- 下のウィンドウ: 実物の UX Film Director（Electron / Chromium）
- 計測ツール: `windows_port_research/tools/probe-sustained/`

**`probe-electron` を拡張せず新しいプローブを作った理由**: `probe-electron` は
`electron-real-app-on-windows.md` の測定を再現するための成果物であり、
書き換えるとそのノートが再現不能になるため。

## 手順

DirectComposition は SSH 直実行だと `E_ACCESSDENIED` になるので、
既存プローブと同じく `schtasks /it` でログオン済みセッションへ流し込む。

1. Electron を起動しておく（`launchelectron.ps1` 相当）。
2. `probe-sustained` を Windows 側でビルドする。
3. `schtasks` 経由で実行し、ログと CSV を回収する。

```
uxfd-win-sustained-probe.exe <baseline_s> <static_s> <move_s> <resize_s> <csv_path>
```

フェーズ構成（1 フェーズ 1 変数）:

| phase | 内容 | 目的 |
|---|---|---|
| `baseline` | overlay は存在するが present しない | GPU/CPU の地の値 |
| `static` | 連続 present、親には触らない | H-W0-1 |
| `move` | 親を動かし続けながら present | H-W0-2 |
| `resize` | 親をリサイズし続けながら present（surface reconfigure 込み） | H-W0-2 |

## 結果

（実行待ち）

## 結論

（実行待ち）

## 次の一手 / 未検証事項

（実行待ち）
