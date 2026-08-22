# nv12_composite.wgsl パイプライン生成コンパイル時間の実測

## 目的 / 仮説

[w5-attach-hang.md](w5-attach-hang.md) で、W5 attach スモークテストの
「ハング」の正体が DirectComposition/メッセージポンプではなく、
`NativeWgpuLiveSurfaceRenderer::from_surface` が作る9本の描画パイプラインの
うち `nv12::create_nv12_pipeline_for_format`（シェーダ
`shared-renderer/shaders/nv12_composite.wgsl`、678行）で止まることを
突き止めた。本ノートはこれを最小再現し、(1) DX12 上で本当に停止する
（有限時間で終わらない）のか、(2) DX12 固有か、(3) 遅い場合はどの段階
（`create_shader_module` か `create_render_pipeline` か）が支配的か、
を切り分ける。

**H-A**: naga→HLSL 変換または wgpu の既定 DX12 コンパイラである Fxc
（wgpu 自身のドキュメントコメントに "old, slow and unmaintained" と
明記）が、この規模の fragment shader で病的に遅い。
反証条件: `create_shader_module`（naga の変換のみ）が支配的に遅ければ
Fxc 固有ではなく naga の HLSL バックエンド自体の問題を疑う必要がある。

**H-B**: nv12_composite.wgsl 固有の構造（YCbCr→RGB 変換部分、+80行）が
病的な原因であり、`solid_composite.wgsl`（598行、共通の "effects tail" を
nv12版と一字一句共有）は正常な時間で完了する。
反証条件: `solid_composite.wgsl` 単体でも同程度に遅ければ、原因は
nv12 固有ではなく両シェーダが共有する550行超の "effects tail"
（ぼかし・色調補正・ワイプ・クリッピング・アウトライン・グラデーション・
displacement・fake DOF・auto blur・stretch・multi slicer 等）の複雑さに
起因すると考えられる。

**H-C**: macOS（Metal バックエンド）では同じシェーダが正常な時間で
コンパイルされる（＝ DX12/Fxc 固有の問題であり WGSL の記述そのものに
本質的な欠陥は無い）。

## 環境

- Windows: `ssh mainpc`（Windows 11 Pro、RTX 3070 Ti、rustc/cargo 1.98.0）。
  `windows_port_research/tools/nv12-pipeline-repro`（本調査で新規作成）を
  `C:\Users\gzabu\UXFD\windows_port_research\tools\nv12-pipeline-repro`
  へ `scp` で配置し `cargo build --release` した。
  **DirectComposition/window を一切使わないため、`schtasks /it` は不要で
  SSH 直実行できた**（W5 のスモークテストが `schtasks /it` を要したのは
  `CreateWindowExW`/`DCompositionCreateDevice` が対話セッションを要求する
  ためであり、device 単体・パイプライン単体の作成には無関係）。
- macOS: ローカル worktree（Apple M4）、`cargo build --release`、
  `--shader nv12`/`--shader solid` を直接実行。
- wgpu 25.0.2（本体クレートと同一バージョン）。

## 手順

1. `windows_port_research/tools/nv12-pipeline-repro` を新規作成。
   `native-wgpu-renderer`/`native-overlay` に依存せず、wgpu 単体で
   「device 作成 → `create_shader_module` → `create_render_pipeline`」の
   3段階だけを実行し、各段階に個別のタイムアウトと経過時間ログ
   （`[nv12-repro] stage=... status=ok|TIMED_OUT elapsed_ms=...`）を付けた。
   タイムアウトは別スレッドで実行し `mpsc::Receiver::recv_timeout` で
   待つ方式（Rust のスレッドは強制キャンセルできないため、タイムアウト後は
   バックグラウンドスレッドが残ったままプロセスを終了する。計測目的には
   十分）。
2. bind group layout は `native-wgpu-renderer/src/nv12/pipeline.rs` /
   `native-wgpu-renderer/src/lib.rs` の実際の binding 番号に合わせた
   （中身のリソースは使わないため型だけ一致させれば良い）。
   `--shader solid|nv12` で `solid_composite.wgsl`（598行、
   `create_pipeline_for_format` が使う1本目のパイプライン相当）と
   `nv12_composite.wgsl`（678行、2本目で止まっていたパイプライン）を
   切り替えられる。
3. `--compiler fxc|dxc`（Windows のみ意味を持つ。既定は wgpu のデフォルトと
   同じ `Fxc`）を用意し、`Dx12Compiler::DynamicDxc`（システムの
   `dxcompiler.dll`/`dxil.dll` を動的ロード）も試せるようにした。
   `static-dxc` cargo feature で `Dx12Compiler::StaticDxc`
   （`mach-dxcompiler-rs` 静的リンク）も試せるようにした。
4. macOS でローカルビルド・実行（3回）。mainpc へ `scp` して
   `cargo build --release` → SSH 直実行。

## 結果

### macOS / Metal（H-C の検証）

| シェーダ | 実行 | `create_shader_module` | `create_render_pipeline` | 備考 |
|---|---|---|---|---|
| nv12 (678行) | 1回目 | 1ms | **2,789ms** | プロセス起動後最初の1本（Metal側のコールドコンパイル） |
| nv12 (678行) | 2回目 | 1ms | 1ms | 同一プロセス内の別実行、または直後の再実行でキャッシュ命中 |
| nv12 (678行) | 3回目 | 1ms | 1ms | 同上 |
| solid (598行) | 1回目 | 1ms | 1,277ms | 同上（別プロセスなのでコールド） |

**H-C: 採択。** Metal では nv12/solid とも数秒未満（最悪でも2.8秒）で
完了し、DX12 で観測された「10分待っても終わらない」水準の遅延は
一切再現しない。WGSL の記述自体（naga のフロントエンド解釈）に本質的な
欠陥は無い。

### Windows / DX12 / Fxc（既定コンパイラ、H-A・H-B の検証）

| シェーダ | `create_shader_module` | `create_render_pipeline` | 判定 |
|---|---|---|---|
| nv12 (678行) | 1ms | 30,000ms でタイムアウト（未完了） | timeout=30s |
| nv12 (678行) | — | 60,000ms でも同様に完走せず（別実行、w5-attach-hang.md 本編、10分超で強制終了） | timeout=10分超 |
| nv12 (678行) | 1ms | **676,907ms で完了**（timeout=900sで再実行） | **約11分17秒** |
| solid (598行) | 1ms | 60,000ms でタイムアウト（未完了） | timeout=60s |
| solid (598行) | 1ms | **104,324ms で完了**（timeout=300sで再実行） | 約104秒 |

**nv12 は有限時間で完了する（無限ループ・デッドロックではない）ことを確定した。**
所要時間は 676,907ms（約11分17秒）。solid（104,324ms、約104秒）との比、
約6.5倍。行数差はわずか+13%（598→678行）なので、Fxc のコンパイル時間は
シェーダサイズに対してほぼ確実に**非線形**（YCbCr変換コードが追加する
分岐・定数畳み込み対象がその後の550行超の共通処理全体に波及し、
組み合わせ的に悪化している可能性が高い）。

adapter/device 取得はいずれも数百ms以内（`elapsed_ms=184`〜211、
`elapsed_ms=55`〜77）で、[w5-attach-hang.md](w5-attach-hang.md) の
「H-1・H-2棄却」の追認にもなっている。

**H-A: 採択。** `create_shader_module`（naga の WGSL→HLSL変換のみ、
DX12コンパイラ本体は呼ばれない）はどちらのシェーダでも 1ms と一瞬。
遅いのは一貫して `create_render_pipeline`（内部で Fxc が HLSL を
DXBC へコンパイルする段階）。naga 側の変換自体は問題ではない。

**H-B: 棄却。** `solid_composite.wgsl`（598行、nv12版が持つ
YCbCr変換コードを持たない）も **104秒** かかっており、
「nv12 固有の構造が原因」という当初の見立ては誤りだった。
実際には **両シェーダが共有する550行超の "effects tail" 自体が
Fxc にとって病的に遅い**。nv12 はこれに加えて YCbCr 変換コード
（約80行）を持つため、比例よりもさらに悪化して10分超（未完走）に
達していると考えられる（行数差 +13% に対し、確認できた所要時間の下限が
solid の104秒に対しnv12は10分超なので、少なくとも6倍以上——単純な
行数比例ではなくコンパイラの計算量が非線形に悪化している可能性が高い）。

## 結論

- W5 attach「ハング」の真因は **DirectComposition でもメッセージポンプでも
  wgpu adapter/device 取得でもなく、DX12 バックエンドの既定シェーダ
  コンパイラ Fxc が、`solid_composite.wgsl`/`nv12_composite.wgsl` が共有する
  550行超の "effects tail" を含む fragment shader のコンパイルに
  非常に長い時間（confirmed: solid 単体で104.3秒、nv12 は676.9秒
  ＝約11分17秒）を要すること**だと確定した。**厳密には「ハング」ではなく
  「非常に遅いが有限時間で完了するコンパイル」であり、W5 実装時に
  3分で強制終了した判断が早すぎただけだった可能性が高い**
  （元の smoke test のデフォルトタイムアウトは Rust テストランナーの
  60秒警告のみで強制終了はしない設定だが、手動killのタイミングが
  11分の完了より早かった）。
- Fxc は wgpu 自身が「古く低速でメンテナンスされていない」と明記する
  レガシーコンパイラであり、この規模・複雑度の shader では実用に耐えない
  （nv12 パイプライン1本だけで W5 attach 全体を10分以上ブロックする）。
- 代替コンパイラの実機での試行は両方とも**このホストでは即座に失敗**した:
  - `Dx12Compiler::DynamicDxc`（既定パス `dxcompiler.dll`/`dxil.dll` を
    動的ロード）: mainpc に両DLLとも存在せず、DX12 バックエンド自体が
    初期化されず `no adapter`（`active_backends: 0x0`）で失敗した。
  - `Dx12Compiler::StaticDxc`（`static-dxc` cargo feature、
    `mach-dxcompiler-rs` を静的リンク）: **リンクエラーで棄却**。
    `__std_find_trivial_8` 等、MSVC 標準ライブラリの比較的新しい
    シンボルが未解決（`LNK2001`/`LNK2019` 多数）。mainpc の MSVC
    ツールセット/Windows SDK のバージョンが `mach-dxcompiler-rs` の
    要求と噛み合っていないと考えられる（バージョン特定は未実施）。

## 追記: DXC 導入後の実測（ユーザー承認済み、mainpc へ実際に配置して比較）

### DXC の入手

- 配布元: **github.com/microsoft/DirectXShaderCompiler** の Releases
  （公式リポジトリであることを URL で確認した。他の配布元は使っていない）。
- バージョン: **v1.9.2607**（"DX Compiler Release for July 2026"）。
- 取得したアセット: `dxc_2026_07_29.zip`
  （<https://github.com/microsoft/DirectXShaderCompiler/releases/download/v1.9.2607/dxc_2026_07_29.zip>、
  41,625,275 bytes）。mainpc 上で `Invoke-WebRequest` により直接取得し、
  `C:\Users\gzabu\uxfd-win-probe\dxc\dxc_2026_07_29.zip` へ保存、
  `Expand-Archive` で展開した。
- 使用した DLL: `bin\x64\dxcompiler.dll`（28,079,968 bytes）、
  `bin\x64\dxil.dll`（3,831,600 bytes）。x64 版のみ使用（mainpc・本アプリ
  ともに x64 のため。x86/arm64 版も同梱されているが未使用）。
- 配置場所（今回の再現ツール向け）: **`nv12-pipeline-repro.exe` と
  同じディレクトリ**（`target\release\`）。`Dx12Compiler::default_dynamic_dxc()`
  は `dxcompiler.dll`/`dxil.dll` を相対パス文字列として渡し、Windows の
  標準 DLL 探索順序（実行ファイルと同じディレクトリが最優先）で解決される
  ため、これが最も単純で確実な配置場所だった。
  **本番アプリ（Electron）でどこに置く必要があるかは本ノート末尾の
  「W1/electron-builder への申し送り」を参照。**

### Fxc vs DXC 比較（mainpc、RTX 3070 Ti、rustc/wgpu 25.0.2、DX12）

| シェーダ | コンパイラ | 実行1 | 実行2 | 実行3 | 中央値 | Fxc比 |
|---|---|---|---|---|---|---|
| solid (598行) | Fxc | — | — | 104,324ms | 104,324ms | 1.0x（基準） |
| solid (598行) | **DXC** | 8,667ms | 7,472ms | 7,513ms | **7,513ms** | **約13.9倍高速** |
| nv12 (678行) | Fxc | — | — | 676,907ms | 676,907ms | 1.0x（基準） |
| nv12 (678行) | **DXC** | 54,620ms | 52,419ms | 49,950ms | **52,419ms** | **約12.9倍高速** |

（Fxc は1回の実測のみ——1本あたり最大11分超かかるため中央値を取る時間的
余裕がなく、本タスクでは1本のみとした。DXC は数十秒で完走するため
3回とも取得できた。）

`create_shader_module`（naga の WGSL→HLSL変換）はどのコンパイラ設定でも
一貫して1ms。差はすべて `create_render_pipeline` 内の HLSL→DXBC
コンパイル段階に閉じている。

### 結論（更新）

- **DXC への切替は実用的な速度改善をもたらす。** nv12 は 676.9秒
  （約11分17秒）→ 52.4秒（中央値）に短縮。solid は 104.3秒 → 7.5秒。
  どちらも桁で速くなったが、**nv12 は DXC でも solid よりなお約7倍
  遅い**（52.4秒 vs 7.5秒）。DXC はレガシー Fxc の病的な遅さを解消するが、
  「両シェーダが共有する550行超の effects tail」自体が重いこと自体は
  変わらないため、nv12 特有の追加コスト（YCbCr変換 +80行）による
  相対的な遅さの構造は残る。
- attach 全体（9本のパイプライン、nv12 が最も重いと仮定）で見積もると、
  Fxc では合計で15分超かかっていた可能性が高いのに対し、DXC では
  1分強程度に収まる見込み。**実用範囲に入った**と判断できる。
- 実装判断: **DXC への切替を本番の attach 経路（Windows のみ）に
  導入する価値がある。** ただし DLL が存在しない環境（DXC 未配布の
  ビルド・古い環境）でクラッシュしないよう、**Fxc へのグレースフル
  フォールバックが必須**（`windows_port_research/notes/w5-attach-hang.md`
  で確認済みの通り Fxc でも最終的には有限時間で成功するため、
  フォールバックしても機能的には壊れない。単に遅いだけ）。

## 次の一手 / 未検証事項

- **推奨される是正方向（実装はしない、本タスクの範囲外）**:
  1. **`dxcompiler.dll`/`dxil.dll` を同梱して `DynamicDxc` を使う。**
     Microsoft 公式配布（DirectXShaderCompiler リリース、または
     Windows SDK 同梱分）からダウンロードしアプリの実行ディレクトリへ
     配置すれば、Fxc よりはるかに高速な新しい DXC コンパイラへ切替可能。
     ダウンロード判断はユーザー承認が要る操作のため本タスクでは実施
     していない。
  2. **`static-dxc` を使うなら mainpc の MSVC ビルドツール
     （Visual Studio Build Tools / Windows SDK）を `mach-dxcompiler-rs`
     が要求するバージョンへ更新する。** 具体的な必要バージョンの特定は
     未着手（`mach-dxcompiler-rs` のドキュメント/issue を要調査）。
  3. **shader 側の削減**（本タスクではやらない・スコープ外）: 550行超の
     "effects tail" を条件分岐で分割し、実際に有効な effect だけを
     選択的にコンパイルする（uber-shader をやめる）、または
     プリコンパイル済み DXBC をビルド時に生成しランタイムでは
     `create_shader_module` を経由しない、といった設計変更が要る。
     どちらも Phase 5/6 の範囲を超える再設計であり、別タスクとして
     切り出すべき。
- solid の再現性確認（median of 3）は1本しか取れていない（104,324ms）。
  nv12 も同様に1本のみ（676,907ms）。次の一手として各2回追加実行し
  中央値を確定させる余地がある（本タスクでは時間の都合で見送った）。
- Fxc がどのコード領域で病的に遅くなっているか（分岐数、定数畳み込み対象、
  ローカル変数のスカラー化など）はプロファイルしていない。DXC/StaticDxc が
  使えるようになった時点で比較すれば、Fxc 固有のパス（レジスタ割付や
  最適化パスの計算量）が原因かどうかを追加で切り分けられる。

## W5/W6 を止めているものへの結論（コーディネーターからの追加依頼への回答）

- **attach 経路の設計（DirectComposition + wgpu composition surface）
  自体は健全**。実機で確認できた全段階（window作成・DComp device/target/
  visual・wgpu adapter/device 取得・surface configure）は数秒以内に完了する。
- **`attach_native_overlay` の初回呼び出しは、`from_surface` が9本の
  パイプラインを作る間、最悪ケースで合計 十数分オーダーの同期ブロックに
  なりうる**（nv12 だけで11分17秒。他の7本の実測はまだ無いが、
  solid の104秒がベースラインなら数分単位の追加コストが乗る可能性が
  高い）。これは Phase 0 の知見「`get_current_texture` は UI スレッドで
  呼んではいけない」と同種だが、規模が全く違う制約であり、
  **W5/W6 を実機で「完了」と呼べるようにするには、この初回コンパイル
  コストを何らかの形で解消する必要がある**。
- 推奨する解消順序（実装は本タスクのスコープ外、次セッションへ）:
  1. **最優先: DXC への切替。** `dxcompiler.dll`/`dxil.dll` をアプリに
     同梱して `Dx12Compiler::DynamicDxc` を使う（ユーザー承認を要する
     ダウンロード作業なので次セッションで判断）。DXC は "new, fast and
     maintained" と wgpu 自身が明記しており、Fxc の非線形な遅さが
     解消される可能性が高い。まずは `nv12-pipeline-repro` で
     DXC 使用時の実測を取り、実際に速くなるかを検証してから本実装へ
     進めるべき（本ノートでは DLL 未配置のため未検証のまま）。
  2. 次点: `static-dxc` を使うための mainpc の MSVC ビルドツール更新
     （`mach-dxcompiler-rs` が要求するバージョンの特定から着手）。
  3. 最終手段: shader 分割・軽量化（uber-shader をやめる）。設計変更を
     伴うため他の2つが不可能だった場合のみ検討する。
- **Phase 5 を ★完了 にするための条件**: 上記のいずれかでコンパイル時間を
  実用的な水準（数秒〜数十秒オーダー）まで落とし、
  `native-overlay/tests/win32_overlay_smoke.rs` が数十秒〜数分程度で
  完走することを実機で確認すること。現状のままでも「有限時間で成功する」
  ことは確定したため、DirectComposition 設計自体の再検討（代替案の
  検討）は不要と判断してよい。
- Fxc がどのコード領域で病的に遅くなっているか（分岐数、定数畳み込み対象、
  ローカル変数のスカラー化など）はプロファイルしていない。DXC/StaticDxc が
  使えるようになった時点で比較すれば、Fxc 固有のパス（レジスタ割付や
  最適化パスの計算量）が原因かどうかを追加で切り分けられる。
