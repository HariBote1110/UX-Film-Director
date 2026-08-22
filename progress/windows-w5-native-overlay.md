# Windows native overlay 実装（Windows Port W5）

## Decision

- `native-overlay/src/win32_overlay.rs` を追加し、`attach_native_overlay_inner` /
  `detach_native_overlay_inner` の `#[cfg(target_os = "windows")]` 分岐を実装した
  （従来は `attach_live_overlay_surface_renderer` が
  `Err("...only available on macOS")` を返す stub だった）。
- 構成は `markdown/Windows_Port_Plan.md` Phase 5（ADR-012）どおり:
  Electron の owner HWND に `WS_POPUP` +
  `WS_EX_NOREDIRECTIONBITMAP | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`
  ウィンドウを作り、`DCompositionCreateDevice` → `CreateTargetForHwnd` →
  `CreateVisual` → `SetRoot` した root visual へ wgpu surface
  （`SurfaceTargetUnsafe::CompositionVisual`、`alpha_mode: PreMultiplied`）を張る。
  `WM_NCHITTEST` は常に `HTTRANSPARENT` を返しクリック透過する。present 後は
  `IDCompositionDevice::Commit` を呼ぶ。
- geometry 解決を `resolve_overlay_screen_rect` という純粋関数に切り出した
  （macOS の `resolve_view_local_rect_for_parent_bounds` と同じ狙い）。
  Win32 は top-left origin 一本のため `isFlipped` 相当の分岐は不要で、
  macOS 版より単純（owner のクライアント原点へ `view_x`/`view_y` を足すだけ）。
  単体テスト3件で検証。
- `NativeWgpuLiveSurfaceRenderer::from_hwnd`（`from_appkit_view` 相当）を追加。
  DirectComposition の `IDCompositionDevice`/`IDCompositionVisual` を受け取り、
  `SurfaceTargetUnsafe::CompositionVisual` で surface を作って
  `from_surface`（既存・無改造）に渡す。present 経路 6 箇所すべての
  `surface_texture.present()` 直後に `commit_platform_composition()` を追加し、
  Windows では `IDCompositionDevice::Commit` を、macOS では no-op を呼ぶ。

## Constraints / Gotchas

- **Rust 2021 の disjoint closure capture が `unsafe impl Send/Sync` ラッパーを
  素通りさせる。** `IDCompositionDevice` を `SendSyncDcompDevice` でラップし
  `unsafe impl Send/Sync` したが、クロージャ内で `dcomp_device.0.Commit()` の
  ようにフィールドへ直接アクセスすると、closure はラッパー全体ではなく内側の
  `IDCompositionDevice` だけを capture してしまい、E0277（`NonNull<c_void>` が
  `Send`/`Sync` でない）で弾かれる。`let dcomp_device = &dcomp_device;` で
  変数全体を先に束縛して capture 単位を struct 全体へ強制する必要がある。
- **windows-rs 0.58 の `Param<T>` は `Option<T>` を素通しできない箇所がある。**
  `CreateWindowExW` の `hMenu`/`hInstance` 引数へ `Some(HMENU::default())` /
  `Some(hinstance.into())` を渡すと `Param<HMENU, CopyType>` 系のトレイト境界で
  失敗する。`probe-sustained` と同じく `None` / `hinstance` を直接渡す。
- `ClientToScreen`/`GetClientRect` は windows 0.58 で `Result` ではなく
  `BOOL` を返す（GDI 系の古い呼び出し規約）ため `.then_some()` は使えず
  `.as_bool()` で判定する。
- **`attach_overlay_window` は `IDCompositionDevice` と `IDCompositionVisual` の
  両方を呼び出し元へ返す必要がある。** `IDCompositionVisual` から
  `IDCompositionDevice` を逆引きする API は無いため（別の COM オブジェクトで
  QueryInterface の対象にならない）、device 自体を素直に持ち回す設計にした。
- `native-overlay` の `crate-type` に `"rlib"` を追加した
  （従来 `["cdylib"]` のみ）。napi addon としての `cdylib` 出力は変わらないが、
  `tests/` 配下の統合テストが `uxfd_native_overlay::attach_native_overlay` 等を
  ライブラリとして呼ぶために必要だった。

## 実測

| 項目 | 結果 |
|---|---|
| macOS `cargo test`（native-overlay） | 99 / 0 / 0（不変） |
| macOS `cargo test`（native-wgpu-renderer） | 全 pass（不変） |
| `cargo check --target x86_64-pc-windows-msvc --tests`（両クレート） | 0 errors |
| Windows 実機（`mainpc`, rustc 1.98.0）`cargo test --release`（native-wgpu-renderer） | 全 pass（`native_reference_parity` 37 件含む） |
| Windows 実機（`mainpc`）`cargo test --release`（native-overlay） | **84 passed / 2 failed**（新規 `win32_overlay::geometry_tests` 3 件は pass） |
| Windows 実機での attach smoke test（`tests/win32_overlay_smoke.rs`） | **未完走。schtasks 経由の実行が 3 分以上ハングし、プロセスを強制終了した** |

native-overlay の失敗 2 件（`getcolor_source_image_metadata_changes_native_overlay_media_revision`、
`overlay_image_source_loaders_accept_percent_encoded_jpeg_file_urls`）は本 Phase の変更と無関係な
既存 Windows 固有バグ（ファイル URL のパーセントエンコーディング・GetColor
メタデータの revision 生成）。別タスクとして切り出した
（progress spawn: "Fix Windows path bugs in native-overlay tests"）。

## 未解決の課題（重要）

**DirectComposition 経路の実機での実際の attach 成立を確認できていない。**
`attach_native_overlay` を実 HWND（テスト内で作った通常の top-level window）へ
呼ぶスモークテストを書き、mainpc で release ビルドまでは成功したが、
`schtasks /create ... /it` 経由の実行（DirectComposition が SSH 直実行だと
`E_ACCESSDENIED` になるため、`probe-sustained` と同じ手法を踏襲した）が
`running 1 test` から 3 分以上進まずハングした。プロセスメモリは緩やかに
減少しており完全なデッドロックというより低速なリークか GPU 待ちの可能性も
あるが、60 秒のタイムアウト表示（Rust テストランナーの既定警告）を大幅に
超えている時点で異常。原因の切り分けは行っていない（当時）。候補:

1. ~~`DCompositionCreateDevice`/`CreateTargetForHwnd` 自体が、
   メッセージポンプの無いプロセスでブロックしている
   （COM アパートメント初期化や `CreateTargetForHwnd` が内部で
   ウィンドウメッセージのやり取りを要求する可能性）。~~
   **棄却済み**（`windows_port_research/notes/w5-attach-hang.md` 参照。
   メッセージポンプ無しでも数秒で完了することを実機で確認した）。
2. ~~`wgpu::Instance::request_adapter`/`request_device`
   （`pollster::block_on` 経由）が、DirectComposition visual を
   target にした surface に対して普段と異なる待ち方をしている。~~
   **棄却済み**（同上ノート。両方とも数秒で完了することを確認した）。
3. `schtasks /it` のログオン済みセッションが、このテスト実行専用の
   環境では probe-sustained のときと異なる状態
   （前回のスモークテストプロセスの残骸、GPU リソース枯渇等）にあった。

`windows_port_research/notes/sustained-present.md`（Phase 0）は同じ構成要素
（DCompositionCreateDevice → CreateTargetForHwnd → CreateVisual → SetRoot →
SurfaceTargetUnsafe::CompositionVisual）を実 Electron ウィンドウに対して
60 秒超・連続 present で成功させているため、設計自体（ADR-012）の妥当性は
高いと考えられる。

**追記（原因切り分け結果、`windows_port_research/notes/w5-attach-hang.md` 参照）**:
上記の「メッセージポンプ不在」仮説は、`attach_overlay_window`/`from_hwnd`/
`from_surface` の各段階に `eprintln` を仕込んで実機再現した結果、**棄却**した。
`DCompositionCreateDevice` → `CreateTargetForHwnd` → `CreateVisual` →
`SetRoot` はメッセージポンプが一切無いプロセスでも数秒で正常完了し、
`wgpu::Instance::request_adapter`/`request_device` も同様に問題なく通過する。
実際に進行が止まる箇所は、attach 完了までに `from_surface` が作る
9 本の描画パイプラインのうち 2 本目、`nv12::create_nv12_pipeline_for_format`
（シェーダ `shared-renderer/shaders/nv12_composite.wgsl`、678行）。10 分間
追跡しても完了ログが出ず、CPU 使用量は単調増加するが増加率は鈍化しており、
1 本目のパイプライン（598行のシェーダ、1分未満で完了）との所要時間差が
行数差に見合わないことから、単純な「シェーダが大きいから遅い」ではなく
`nv12_composite.wgsl` 固有の構造が naga→HLSL 変換または DXC のコード生成を
病的に遅くしている可能性が高いと判断した（当時点の暫定判断）。

**追記2（`windows_port_research/notes/nv12-pipeline-compile-time.md` 参照、
最小再現ツール `windows_port_research/tools/nv12-pipeline-repro` による
切り分け結果）**: 「nv12 固有」という上記の暫定判断は**棄却**した。
`nv12_composite.wgsl` を持たない `solid_composite.wgsl`（1本目のパイプライン
のシェーダ、598行）だけを単体で計測したところ、Windows/DX12 上では
**104秒** かかった（macOS/Metal では1〜3秒未満）。真因は
「シェーダが大きい／nv12固有」ではなく、**両シェーダが共有する550行超の
"effects tail"（ぼかし・色調補正・ワイプ・クリッピング・アウトライン・
グラデーション等）自体が、wgpu の DX12 既定シェーダコンパイラ Fxc
（wgpu 自身が "old, slow and unmaintained" と明記するレガシーコンパイラ）
にとって病的に遅い**こと。`create_shader_module`（naga の WGSL→HLSL変換）は
両シェーダとも1msで、遅いのは一貫して `create_render_pipeline`
（Fxc本体のHLSL→DXBCコンパイル）。nv12はこの共通部分に加えYCbCr変換
コード（+80行）を持つため、タイムアウト900秒での再実行では
**676.9秒（約11分17秒）で完了**した（solid比で約6.5倍、行数差はわずか
+13%なので非線形な悪化と判断）。**「無限ループ・デッドロックではなく、
有限だが非常に長い時間のかかるコンパイル」だったことが確定した。**
W5 のスモークテスト実行時に3分で強制終了した判断は、結果的に早すぎた
（あと8分待てば正常完了していた）ことになる。

代替コンパイラの実機試行はどちらも当初は即座に失敗した:
`DynamicDxc`（システムの`dxcompiler.dll`/`dxil.dll`）は両DLLが
mainpcに存在せずDX12バックエンド自体が初期化できず失敗。`StaticDxc`
（`mach-dxcompiler-rs`静的リンク、`static-dxc` cargo feature）は
MSVC標準ライブラリの新しめのシンボル（`__std_find_trivial_8`等）が
未解決でリンクエラー。

## 追記3: DXC導入・本番実装・実機E2E検証完了（★完了）

ユーザー承認のもと、DXC（github.com/microsoft/DirectXShaderCompiler
v1.9.2607、`dxc_2026_07_29.zip`）をmainpcへダウンロード・展開し、
`dxcompiler.dll`/`dxil.dll`（x64）を取得した。`nv12-pipeline-repro`で
Fxc比の実測を取ったところ、solidは104.3秒→中央値7.5秒（約13.9倍）、
nv12は676.9秒→中央値52.4秒（約12.9倍）と大幅に改善した
（詳細は`windows_port_research/notes/nv12-pipeline-compile-time.md`
「追記: DXC導入後の実測」）。

これを受け、`native-wgpu-renderer/src/lib.rs`に
`NativeWgpuLiveSurfaceRenderer::resolve_dx12_compiler(dir)`を実装した。
実行ファイルと同じディレクトリに両DLLが揃っていれば`DynamicDxc`を、
どちらか一方でも欠けていればwgpu既定の`Fxc`へ自動フォールバックする
（Fxcでも最終的には有限時間で成功することは確認済みなので、DLL未配置
環境でも機能的には壊れず単に遅いだけになる）。`wgpu::Dx12Compiler`は
プラットフォーム非依存のデータ型なのでこの判定ロジック自体はmacOSでも
ユニットテストでき、TDDで4件のテスト（DLL不在→Fxc、片方のみ→Fxc、
両方揃い→DynamicDxc）を追加、macOS・mainpc両方でgreenを確認した。
`from_hwnd`（Windows専用のattachエントリポイント）のinstance作成直後に
この判定を呼ぶ。macOS側（`from_appkit_view`）は無変更。

DLLをテスト実行ファイルと同じディレクトリ
（`native-overlay/target/release/deps/`）へ配置した上で、
`native-overlay/tests/win32_overlay_smoke.rs`をmainpcで
`schtasks /it`経由で再実行した結果:

```
test attach_and_detach_native_overlay_round_trip_on_real_hwnd ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 79.09s
```

**W5 attachスモークテストが実機で完走することを確認した。**
Fxc時代の「10分待って強制終了」から、DXC導入後は**79.09秒で正常完了**
へ改善した。DirectComposition + wgpu composition surfaceという設計、
DXC自動選択・Fxcフォールバックの両方が実機で検証済みとなったため、
`markdown/Windows_Port_Plan.md`のPhase 5を**★完了**とした。

**未解決のまま残るもの**（Phase 6以降の検討課題）: 79.09秒は初回attach
呼び出し1回分のコスト（9本のパイプライン生成はレンダラ生成時に1回のみ
発生し、以降のpresentでは再利用される）。1分強の同期ブロックがUIスレッド
に与える影響（非同期化・事前ウォームアップの要否）は未検討。また
`dxcompiler.dll`/`dxil.dll`をElectronビルド成果物へ実際に組み込む作業
（electron-builder設定）はW1側のフォローアップとして未着手
（`nv12-pipeline-compile-time.md`「W1/electron-builderへの申し送り」参照）。

## Phase 6 への申し送り

- 上記のハング原因を先に解消しない限り、Phase 6（geometry 追従・DPI）の
  実機検証もブロックされる。
- Phase 6 は `WM_MOVE`/`WM_SIZE`/`WM_DPICHANGED`/`WM_WINDOWPOSCHANGED` への
  対応と per-monitor DPI awareness が主題。本 Phase では
  `resolve_overlay_screen_rect` を「attach 時 1 回分」の解決にとどめ、
  resync 相当のロジックは未実装（計画書の指示どおりスコープ外とした）。
- 高 DPI は Phase 0 と同じく mainpc が 100% スケールのため未検証のまま。
