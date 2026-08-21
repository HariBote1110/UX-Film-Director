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

2 本の present mode で 4 フェーズを流した。`static` 60s / `move` 45s / `resize` 45s、
その前に `baseline` 20s。ログは `sustained-fifo.log` / `sustained-immediate.log`、
生データは `sustained-frames-{fifo,immediate}.csv`（Windows 側 `C:\Users\gzabu\uxfd-win-probe\`）。

**ディスプレイは RDP 仮想ディスプレイで refresh = 32Hz。** 物理 60Hz ではないので、
`Fifo` の fps は「出せる上限」ではなく「表示側の周期」を表す。上限は `Immediate` で測る。

### Fifo（本番と同じ構成 / 表示 32Hz）

| phase | mean fps | frame p50 | frame p95 | frame p99 | present p50 | present p99 |
|---|---|---|---|---|---|---|
| static | 33.03 | 31.211ms | 32.035ms | 32.814ms | 0.150ms | 0.484ms |
| move | 32.44 | 31.231ms | 32.013ms | 62.411ms | 0.181ms | 0.788ms |
| resize | 30.83 | 31.235ms | 62.254ms | 62.939ms | 0.276ms | 1.770ms |

フレームタイムの実体は `get_current_texture`（`acquire` p50 = 30.7ms）で、これは vsync 待ち。
**`queue.present` + `IDCompositionDevice::Commit` は p50 0.15ms・p99 0.48ms** しかかからない。

### Immediate（present 自体の上限 / ヘッドルーム）

| phase | mean fps | frame p50 | frame p95 | frame p99 | frame max | present p50 |
|---|---|---|---|---|---|---|
| static | 5,508.9 | 0.144ms | 0.293ms | 0.945ms | 11.04ms | 0.062ms |
| move | 2,525.8 | 0.249ms | 1.247ms | 2.538ms | 28.85ms | 0.082ms |
| resize | 844.6 | 0.269ms | 4.546ms | 6.098ms | 127.74ms | 0.087ms |

60fps の予算は 16.67ms。最悪の `resize` フェーズ（毎フレーム surface を再構成している）でも
p99 が 6.1ms で、桁で余っている。

### 破綻の有無

| 指標 | Fifo | Immediate |
|---|---|---|
| z 順（overlay が base より手前） | 167 / 167 | 169 / 169 |
| z 順の逆転 | 0 | 0 |
| 合成後画素の一致 | 148 / 148 | 150 / 150 |
| 画素不一致 | 0 | 0 |
| キャプチャ不能（黒） | 0 | 0 |
| `get_current_texture` 失敗 | 0 | 0 |
| `Suboptimal` | 0 | 0 |
| surface reconfigure | 1,260 回 | 7,185 回 |

**`resize` フェーズで surface を合計 8,445 回再構成して、失敗もちらつきもゼロ。**

### GPU 使用率（nvidia-smi 1Hz、フェーズ端 2 秒を除外）

| mode | phase | gpu_util mean | sm clock mean | power mean |
|---|---|---|---|---|
| Fifo | baseline（present しない） | 12.4% | 1,222MHz | 57.1W |
| Fifo | static | 16.3% | 1,187MHz | 57.0W |
| Fifo | move | 18.0% | 1,189MHz | 52.9W |
| Fifo | resize | 21.9% | 1,232MHz | 53.6W |
| Immediate | baseline | 19.4% | 1,184MHz | 53.4W |
| Immediate | static | 28.9% | 1,923MHz | 101.3W |

Fifo では baseline から static で +3.9 ポイント、消費電力はほぼ不変（57.1W → 57.0W）。
Immediate の 101W は 5,500fps で回し続けた結果で、本番構成の値ではない。

## 結論

- **H-W0-1（連続 present で破綻しない）: 採択。**
  ちらつき（画素不一致）0 件、z 順逆転 0 件、acquire 失敗 0 件、`Suboptimal` 0 件。
  static / move / resize のどのフェーズでも、どちらの present mode でも観測されなかった。
- **60fps 可否: 問題にならない。**
  Fifo が 33fps なのは RDP 仮想ディスプレイが 32Hz だからで、上限ではない。
  Immediate では最悪の `resize` でも 845fps、frame p99 = 6.1ms。16.67ms の予算に対して桁で余る。
- **H-W0-2（親の移動・リサイズ中も present はブロックされない）: 採択。**
  present p99 は Fifo で 0.48〜1.77ms、Immediate で 0.19〜0.41ms。
  Fifo の `resize` で frame p95 が 62ms（vsync 1 回落ち）になるが、これは毎フレーム
  surface を再構成する計測用の負荷によるもので、本実装では `WM_SIZE` 駆動になる。
- **H-W0-3（Chromium の描画を阻害しない）: 反証されず。ただし証拠は弱い。**
  Fifo の GPU 使用率増分は +3.9 ポイント、消費電力は不変。overlay 1 枚分として説明できる。
  ただし RDP デスクトップ自体のノイズが大きく（baseline の max が 70%）、1Hz サンプリングで
  強い主張はできない。**Chromium 自身の描画レートは直接測っていない。**

### `Windows_Port_Plan.md` Phase 0 の判定

再検討条件は「60fps を維持できない、またはちらつきが出る」。**どちらにも該当しない。**
Phase 5 は当初計画どおり **child window + DirectComposition 方式**で進めてよい。
代替案の `VisualFromWndHandle` は不要。

### 実装へ持ち込む知見

- `get_current_texture` が vsync 待ちのブロック点（Fifo で p50 30.7ms）。
  **UI スレッドで呼んではいけない。** present と Commit 自体は 0.15ms で無視できる。
- surface reconfigure は連続 8,445 回でも壊れない。resize 追従を reconfigure で実装してよい。
- wgpu 30 の破壊的変更を 2 件追加で確認した（W4 の棚卸しへ）:
  - `PipelineLayoutDescriptor.bind_group_layouts` が `&[Option<&BindGroupLayout>]` へ
  - `PipelineLayoutDescriptor.push_constant_ranges` が `immediate_size` へ置換
- PowerShell 5.1 は BOM 無し UTF-8 の `.ps1` を ANSI(CP932) として読む。
  日本語コメントを含む `.ps1` には UTF-8 BOM が必須（無いと構文エラーになる）。

## 次の一手 / 未検証事項

- **実シェーダ負荷での再測**。本プローブは 600x400 に 3 バンドを塗るだけで、
  `native-wgpu-renderer` の実際の合成コストを含まない。W0 が問うのは present / 合成経路
  そのものなので判定は変わらないが、実負荷での再測は W5 完了後に行う。
- **物理ディスプレイ（60Hz 以上）での Fifo 実測**。RDP 仮想ディスプレイ 32Hz でしか
  測れていない。コンソールセッションでの再実行が要る。
- **Chromium 自身の描画レートの直接計測**。H-W0-3 の証拠を強くするなら、
  Electron 側に fps カウンタを出させて overlay の有無で比較する。
- **高DPI**。実機は 100% スケール。W6 の範囲。
- **長時間安定性**。今回は最長 60 秒の連続 present。24 時間ベンチは W7 の範囲。
