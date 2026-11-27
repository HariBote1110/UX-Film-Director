# W5 attach スモークテストのハング原因調査

## 目的 / 仮説

`progress/windows-w5-native-overlay.md` に記録の通り、`native-overlay/tests/win32_overlay_smoke.rs`
（`attach_native_overlay` → `detach_native_overlay` の実 HWND 往復）を mainpc で
`schtasks /it` 経由で実行したところ、`running 1 test` から 3 分以上進まずハングした。
同じ構成要素（`DCompositionCreateDevice` → `CreateTargetForHwnd` → `CreateVisual` →
`SetRoot` → `SurfaceTargetUnsafe::CompositionVisual`）を使う
`windows_port_research/tools/probe-sustained`（Phase 0）は同じ mainpc で完走している。
この差分から原因を切り分ける。

事前に読んだコードの比較（実行前に記録):

- `probe-sustained/src/main.rs` は owner 相当の実 Electron ウィンドウを `FindWindowW` で
  掴んだ後 `pump(1500)`、overlay ウィンドウを `CreateWindowExW` した直後にも
  `pump(300)` を呼んでから `DCompositionCreateDevice` に入っている。さらに
  `PeekMessageW`/`TranslateMessage`/`DispatchMessageW` の明示的なメッセージポンプ
  (`drain_messages`) を持つ。
- `native-overlay/tests/win32_overlay_smoke.rs` は owner ウィンドウを
  `CreateWindowExW` するが、その後 `PeekMessageW`/`GetMessageW` を一度も呼ばない。
  `attach_native_overlay` → `win32_overlay::attach_overlay_window` の内部
  （`CreateWindowExW` → `ShowWindow` → `DCompositionCreateDevice` →
  `CreateTargetForHwnd` → `CreateVisual` → `SetRoot`）にもメッセージポンプは無い。
- 本番（Electron）経路では、attach は Chromium の UI スレッド上で呼ばれるため、
  そのスレッドは呼び出し前後で継続的にメッセージポンプを回している。
  スモークテストは「メッセージポンプの無いプロセス」という、本番にも
  `probe-sustained` にも存在しない条件を作ってしまっている。

**H-1（本命）**: `DCompositionCreateDevice` または `CreateTargetForHwnd` は、
呼び出しスレッドのメッセージキューが継続的に処理されることを前提にしており
（DWM とのクロスプロセス COM 呼び出し、またはウィンドウの
`WS_EX_NOREDIRECTIONBITMAP` 反映に伴う内部メッセージ配送のため）、
メッセージポンプが一度も回らないスモークテストのプロセスでは
これらのどちらかで無期限にブロックする。
反証条件: eprintln 計装後、`DCompositionCreateDevice`/`CreateTargetForHwnd` の
呼び出し前後のログが両方出る（＝ここでは止まっていない）。

**H-2**: `wgpu::Instance::request_adapter`/`request_device`
（`pollster::block_on` 経由）が、CompositionVisual をターゲットにした surface に
対して普段と異なる待ち方をしている。
反証条件: 計装ログで adapter/device 取得の前後が出る（＝ここでは止まっていない）。

**H-3**: `schtasks /it` のログオン済みセッションに前回のハングしたテストプロセスの
残骸（ウィンドウクラス登録、GPU リソース）が残っており、今回の実行を妨げている
（環境要因であり、コード自体の問題ではない）。
反証条件: セッションをクリーンにして（前回プロセスを確実に kill、必要なら
サインアウト/サインインし直す）から再実行しても同じ箇所で止まる。

切り分け方針: スモークテスト側の `attach_overlay_window` 相当の各段階に
`eprintln!("[w5-hang] ...")` を仕込み、mainpc で再実行してどこで出力が止まるかを見る。
H-1 が正しければ、メッセージポンプをスモークテストに追加するだけで解消するはず
（TDD で Red→Green として実装し、実機で再検証する）。

## 環境

- ホスト: `mainpc`（`ssh mainpc`、Windows 11 Pro、RTX 3070 Ti）。
- 準備状況（`git status` で確認、2026-08-22 時点）:
  `C:\Users\gzabu\UXFD` は `origin/feature-proxy`（5f078554、W5 より後のコミット）
  だが、`native-overlay/src/win32_overlay.rs` と `native-overlay/tests/` は
  **git 管理外の untracked ファイル**として既に配置されている
  （前フェーズの手動配置。内容は本 worktree の commit 済み版と一致、行数確認済み）。
  多数の `modified` 表示は改行コード差分によるもの。
- rustc / cargo バージョンは `progress/windows-w5-native-overlay.md` 記載の
  「rustc 1.98.0」を継続使用（本調査でも `rustc --version` を実行時に記録する）。

## 手順

1. `native-overlay/src/win32_overlay.rs`（`attach_overlay_window` 内、
   `CreateWindowExW` → `ShowWindow` → `DCompositionCreateDevice` →
   `CreateTargetForHwnd` → `CreateVisual` → `SetRoot` の各段）と
   `native-wgpu-renderer/src/lib.rs`（`from_hwnd`/`from_surface` 内、
   wgpu instance/surface 作成 → `request_adapter` → `request_device` →
   `surface.configure` → 9 本のパイプライン生成 → 各種レンダラ初期化の各段）に
   `eprintln!("[w5-hang] stage=...")` を仕込んだ。
2. `native-overlay/tests/win32_overlay_smoke.rs` にもテスト開始・owner window
   作成・`attach_native_overlay` 呼び出し前後のログを追加した。
3. `scp` で `mainpc`（`C:\Users\gzabu\UXFD`、既存の untracked 配置を上書き）へ
   3 ファイルを転送し、`cargo build --release --tests`（`native-overlay`）を
   実行して `win32_overlay_smoke-4df38378b6ea2ffa.exe` を再ビルドした。
4. `schtasks /create /tn uxfdw5hang /tr <bat> /sc once /st 23:59 /it /f` +
   `schtasks /run` で、ログオン済みセッション（SI=2）へ流し込んで実行した
   （`probe-sustained/run.ps1` と同じ手法。SSH 直実行は DirectComposition が
   `E_ACCESSDENIED` になるため不可）。bat は
   `...exe --nocapture --test-threads=1 > w5hang.log 2>&1` の後に
   `echo DONE_MARKER >> w5hang.log` を追加し、完了検知をマーカーの有無で行った
   （`probe-sustained/run.ps1` の「ログ末尾のマーカーで完了判定する」を踏襲）。
5. ログの増分と `Get-Process ... | Select-Object CPU,WS` を数十秒間隔で
   ポーリングし、どの段で止まっているか・CPU 使用量が伸び続けているか
   （＝計算中）か横ばいか（＝ブロック）を確認した。

**注意（今後の再現者向け）**: `DONE_MARKER` は bat の 2 行目
（`echo DONE_MARKER >> log`）が無条件に実行されるため、**exe を外部から
強制終了した場合にも出力される**。「ログに `DONE_MARKER` がある」ことは
「テストが正常完了した」ことの証明にならない。完了判定には
`test result: ok` / `FAILED` など libtest 自身が出す文字列を使うべき
だった（本調査では手動で `Get-Process` の CPU 推移を見て判断したため
実害はなかったが、自動化する場合は要修正）。

**手戻り**: 初回の bat 生成はシェル経由のエスケープ崩れで
`> w5hang.log 2>&1` のリダイレクトが欠落し、ログが一切書かれない状態で
プロセスだけが起動してしまった（`schtasks /query /v` の状態が「実行中」に
なっているのに `w5hang.log` が存在しないことで発覚）。ローカルでファイルを
作ってから `scp` する方式に切り替えて解決した。

## 結果

計装後 1 回目の実機実行（`native-wgpu-renderer` の細粒度ログを入れる前のビルド）
でのログ末尾:

```
[w5-hang] stage=request_device_begin
[w5-hang] stage=request_device_end
```

この時点で `Get-Process` の CPU 時間は 52.2s → 57.1s → 72.3s → 77.2s → 81.1s と
（ポーリング間隔に対してやや遅いが）**単調に伸び続けており**、メモリ
（WS）は 537〜555MB でほぼ一定だった。ハンドル数も安定。
→ **古典的なデッドロック（メッセージ待ち・ロック待ち）ではなく、CPU を
使い続ける処理が進行中**という所見。これは H-1・H-2 のどちらとも矛盾する
（メッセージポンプ待ちなら CPU はほぼ 0% のはず）。

`request_device_end` の直後（`surface.configure` 呼び出し）に細粒度ログを
追加して再実行したところ:

```
[w5-hang] stage=request_device_end
[w5-hang] stage=surface_configure_begin
[w5-hang] stage=surface_configure_end   ← 数秒で通過
[w5-hang] stage=pipeline_created        ← 1本目のパイプライン。ここまでで
                                            CPU 6.25s → 8.4s → 20.9s → 26.2s
                                            （数十秒かけて到達）
```

その後 **2 本目のパイプライン（`nv12::create_nv12_pipeline_for_format`）で
`nv12_pipeline_created` ログが長時間出ないまま停止**。CPU は
26.2s → 34.4s → 36.4s → 37.9s → 39.4s → 40.8s と、間隔は開いてきているが
依然として単調増加（完全な停止ではなく低速な処理継続）。

| 経過 | ログ末尾 | CPU (s) | WS (MB) |
|---|---|---|---|
| 実行直後 | `request_device_end` | 6.25 | 249 |
| +数十秒 | 同上 | 8.4 | 248 |
| +数十秒 | `surface_configure_end` | 20.9 | — |
| +数十秒 | `pipeline_created` | 26.2 | 555 |
| +数十秒 | 同上（nv12 待ち） | 34.4 | 555 |
| +数十秒 | 同上 | 36.4〜40.8 | 555 |

## 結論

- **H-1（`DCompositionCreateDevice`/`CreateTargetForHwnd` のメッセージポンプ待ち）:
  棄却済み。** 計装ログで両方の呼び出し前後（`dcomp_device_begin/end`,
  `create_target_begin/end`）が問題なく通過することを確認した。
  メッセージポンプを一切持たないプロセスでも DirectComposition の
  デバイス／ターゲット／ビジュアル作成は即座に完了する。
- **H-2（`request_adapter`/`request_device` の異常な待ち）: 棄却済み。**
  両方とも計装ログで前後が通過し、体感上も他の段より速かった
  （`surface_created` → `request_adapter_end` → `request_device_end` は
  数秒〜十数秒程度）。
- **新知見（暫定、次の一手で確定させる）**: 「ハング」と報告された症状の
  正体は、**古典的なデッドロックではなく、`NativeWgpuLiveSurfaceRenderer::from_surface`
  が作る 9 本の描画パイプライン（`create_pipeline_for_format` /
  `nv12::create_nv12_pipeline_for_format` / bgra 版 / `particle` /
  `audio_reactive` / `getcolor` / `hksy` / `simple_tube` /
  `focus_lines` / `shaking_polygon` / `shattered_sphere` の各シェーダ
  モジュール・パイプライン生成）が、この mainpc 上では 1 本あたり
  数十秒かかるほど遅い**ことである可能性が高い。
  `Get-Process` の CPU 時間が終始単調に伸び続けている（ブロックではなく
  計算中）ことと、`probe-sustained` がシェーダ 1 本・パイプライン 1 本
  しか作らずに一瞬で完走していることの対比が根拠。9 本前後のパイプライン
  すべてを合計すれば、当初報告の「3 分以上ハング」と矛盾しない所要時間になる。
  **この場合、`schtasks /it` 経由の実行そのものは正常に機能しており、
  単に手動で 3 分で kill してしまったために「ハング」に見えていた
  だけの可能性がある。** この節は本ノート内で継続監視した実行が完走するか
  で確定する（本文は実行完了後に更新）。
- H-3（セッション残骸）は未検証のまま（今回はクリーンな状態から実行できたため
  優先度を下げた）。

### 追試: `nv12_pipeline_created` で実際に停止することを確認（棄却済みではない、要再現）

上記の暫定所見を確定させるため、同じプロセスを約 10 分間（プロセス開始
9:15:56 → 観測終了 9:26 ごろ）追跡した。

| 経過（プロセス起動からの目安） | ログ末尾 | `Get-Process` CPU 累計(s) |
|---|---|---|
| 0 分（起動直後） | `request_device_end` | 6.25 |
| 〜1 分 | `pipeline_created`（1本目 = `solid_composite.wgsl` 598行） | 20.9〜26.2 |
| 〜1.5 分 | `pipeline_created`（変化なし = nv12 待ち） | 34.4 |
| 〜3.5 分 | 同上 | 76.8〜88.2 |
| 〜5 分 | 同上 | 99.4〜109.9 |
| 〜7.5 分 | 同上 | 120.1〜129.1 |
| 〜10 分 | 同上（プロセスを強制終了して打ち切り） | 146.4 |

**`nv12_pipeline_created` のログは最後まで一度も出力されなかった。**
CPU 累計は単調に増え続けたが、増加率は時間とともに鈍化した
（起動〜1分で+20秒/分 → 7.5〜10分区間で+7秒/2.5分）。これは
「完全なブロック（CPU 0%）」ではないが「一定速度で仕事が進んでいる」
とも言えず、**進行が実質的に頭打ちになりかけている**状態に見える。

wgsl シェーダ行数を比較すると、1本目に使われた `solid_composite.wgsl`
（598行）は 1 分未満で通過したのに対し、2本目の
`nv12::create_nv12_pipeline_for_format` が使う
`shared-renderer/shaders/nv12_composite.wgsl`（**678行**）は 10 分経過しても
完了しなかった。行数の差（598→678、+13%）に対して所要時間の差が
桁違い（<1分 →10分超）であり、**単純な「シェーダが大きいから遅い」では
説明がつかない**。`nv12_composite.wgsl` 固有の構造（分岐、定数畳み込み対象の
大きな条件分岐など）が wgpu の naga→HLSL 変換または DXC のコード生成を
病的に遅くしている、あるいは無限に近いループに陥っている可能性が高い。

## 次の一手 / 未検証事項

- **最優先**: `nv12::create_nv12_pipeline_for_format`
  （`native-wgpu-renderer/src/nv12/pipeline.rs:55`、
  シェーダは `shared-renderer/shaders/nv12_composite.wgsl`）だけを
  スタンドアロンで作る最小再現（`wgpu::Instance` → 適当な headless
  surface 不要の compute/render pipeline 作成のみ）を Windows 実機で
  タイムアウト付きで実行し、
  - (a) 本当に無限に近い時間がかかるのか（native-wgpu-renderer の
    既存 Windows CI/実機テストでは検出されていない可能性が高い。
    `native-wgpu-renderer` の Windows 実機テストが「全 pass」と
    記録されている `progress/windows-w5-native-overlay.md` の実測行と
    矛盾しないか要確認 — 当該テストが `nv12_composite.wgsl` を
    実際に使っているか、使っていてもキャッシュ済み PSO のため
    速いのか、を切り分ける）、
  - (b) macOS（Metal）でも同様に遅いのか（Metal 側は shader compile
    経路が別なので Windows/DX12 固有の可能性が高い）、
  を確認する。
- `nv12_composite.wgsl` の内容を precompiled DXIL キャッシュの有無、
  シェーダの分岐構造（特に色空間変換の条件分岐）の観点でレビューし、
  病的に遅くなりうる箇所（大きな `if`/`switch` の組み合わせ爆発、
  未使用分岐の定数畳み込みなど）を特定する。
- 上記が「単なる激重コンパイルであり、待てば完了する」だと分かった場合:
  本番の Electron 経路でも同じ初回コストが発生するはずなので、
  「attach 呼び出しを UI スレッドで同期的に待たせてよいか」を
  `markdown/Windows_Port_Plan.md` Phase 5/6 に申し送る必要がある
  （`sustained-present.md` の「`get_current_texture` は UI スレッドで
  呼んではいけない」と同種の制約が pipeline 生成にも生じている可能性）。
  対応候補: attach 時のシェーダ事前ウォームアップ、DXIL シェーダキャッシュの
  永続化、`nv12` パイプラインの遅延生成（初回 NV12 ソース使用時まで先送り）。
- 上記が「実質的な無限ループ／異常終了しない不具合」だと分かった場合:
  `nv12_composite.wgsl` を簡略化した縮小版で二分探索し、原因となっている
  構文・構造を特定する。wgpu/naga 側の既知issueも当たる。
- **H-1・H-2 は棄却済み**（本ノート「結論」参照）。次回この症状を調査する
  エージェントは、メッセージポンプ・DirectComposition 初期化・
  wgpu adapter/device 取得を再度疑う必要はない。疑うべきは
  **`nv12_composite.wgsl` のパイプライン生成**である。
