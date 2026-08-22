# W7: Windows native overlay 初回 attach コスト（DX12/DXC パイプライン生成）の緩和策評価

## 目的 / 仮説

[windows-w7-staged-rollout.md](../../progress/windows-w7-staged-rollout.md) STAGE2 で、24時間ベンチ中に
ユーザーが実 Electron アプリの断続的な「応答なし」を観測し早期停止した。ログベースの安定性評価
（crash/panic/OOM = 0件）ではこの症状を検出できておらず、直接の原因候補は
[w5-attach-hang.md](w5-attach-hang.md)/[nv12-pipeline-compile-time.md](nv12-pipeline-compile-time.md) で
確定済みの「初回 `attach_native_overlay` が DX12 の 9 本のパイプライン生成（DXC 導入後でも実測 79.09秒）
を UI スレッド上で同期的にブロックする」問題だと考えられる。本ノートは W7 の既定 ON 化（macOS と同じ
opt-out 化）を妨げているこの ~89秒（W5 実測 79.09秒 + STAGE2 前後のオーバーヘッド見込み）のコストを
どう緩和するか、3 案＋αを証拠ベースで評価する。

**前提として確認済み・再調査不要な事項**（[w5-attach-hang.md](w5-attach-hang.md) 参照、H-1/H-2 棄却済み）:
メッセージポンプ・DirectComposition 初期化・wgpu adapter/device 取得はいずれも数秒以内で健全。
ボトルネックは一貫して `create_render_pipeline`（DX12コンパイラのHLSL→DXBC変換段階）のみ。

## 環境

- コード読み: ローカル worktree（`feature-proxy`, tip `cdebfa23`）。
- wgpu ソース確認: `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/`
  配下の `wgpu-hal-25.0.2`、`wgpu-types-25.0.0`、`wgpu-25.0.2`（本プロジェクトの
  `native-wgpu-renderer`/`native-overlay` が依存する実バージョンと同一）。
  mainpc への新規 SSH 実験は本タスクでは実施していない（既存ノートの実測値を
  再利用し、コードリーディングで裏付けを取る方針。理由は「次の一手」参照）。

## 手順

- `grep`/`Read` で wgpu-hal の DX12/Vulkan バックエンド実装を比較（Option A）。
- `native-wgpu-renderer/src/lib.rs` の `from_surface`（502行目〜）を読み、9本の
  パイプライン生成呼び出しと各シェーダの行数を確認（Option C）。
- `native-overlay/src/lib.rs` の `#[napi]` 関数シグネチャ、`electron/preload.ts`・
  `electron/nativeOverlayMainBridge.ts`・`src/components/Viewport.tsx` の
  attach 呼び出し経路を読み、同期/非同期の実態を確認（Option B）。
- `wgpu-hal-25.0.2/src/dx12/shader_compilation.rs` で DXC 呼び出し時の
  コンパイル引数を確認（Option D）。

## 結果

### Option A: `wgpu::Features::PIPELINE_CACHE` — DX12 未対応（確定・棄却）

`wgpu-hal-25.0.2/src/dx12/adapter.rs:337-361` の DX12 アダプタが公開する
`wgt::Features` 一覧に **`PIPELINE_CACHE` は含まれていない**
（Vulkan は `wgpu-hal-25.0.2/src/vulkan/adapter.rs:546` に
`| F::PIPELINE_CACHE` を明記）。さらに実装そのものも空実装:

```rust
// wgpu-hal-25.0.2/src/dx12/device.rs:1907
unsafe fn create_pipeline_cache(
    &self,
    _desc: &crate::PipelineCacheDescriptor<'_>,
) -> Result<super::PipelineCache, crate::PipelineCacheError> {
    Ok(super::PipelineCache)   // no-op: 中身のないユニット構造体を返すだけ
}
unsafe fn destroy_pipeline_cache(&self, _: super::PipelineCache) {}
```

```rust
// wgpu-hal-25.0.2/src/dx12/mod.rs:1120
pub struct PipelineCache;   // フィールド無し。Vulkan版は `raw: vk::PipelineCache` を持つ
```

対照的に Vulkan の `create_render_pipeline`（`vulkan/device.rs:2091,2313`）は
`pipeline_cache` を実際に `vkCreateGraphicsPipelines` へ渡している。DX12 の
`create_render_pipeline`（`dx12/device.rs:1654`）のシグネチャには `PipelineCache`
型引数こそ存在するが、本体側で一切参照されない（`grep` で cache 関連トークンが
ヒットしない）。

| 項目 | 結果 |
|---|---|
| DX12 アダプタが `PIPELINE_CACHE` feature を公開するか | していない |
| `request_device` で `PIPELINE_CACHE` を要求した場合 | wgpu core の feature 検証で拒否される（未公開feature要求はエラー） |
| DX12 の `create_pipeline_cache`/`create_render_pipeline` の実処理 | 完全な no-op スタブ |

**結論: 棄却済み。** wgpu 25.0.2 の DX12 バックエンドは `PIPELINE_CACHE` を
実装しておらず（Vulkan専用）、D3D12 の `ID3D12PipelineLibrary`/`ID3DBlob`
シリアライズドPSOキャッシュに相当する機能が wgpu-hal レイヤに存在しない。
この事実は `windows-w7-staged-rollout.md` STAGE2 で既に記されていた
「PIPELINE_CACHE unused」を、実装レベルで「そもそも実装が無い」まで
確定させるものである。将来の wgpu バージョンで DX12 対応が入る可能性は
あるが（本タスクでは changelog/tracking issue の網羅的な調査は未実施）、
25.0.2 では選択肢として成立しない。Option A は今回の意思決定から除外する。

### Option B: 非同期 attach への再構成

**現状は完全に同期的。** `native-overlay/src/lib.rs:1442`:

```rust
#[napi(js_name = "attachNativeOverlay")]
pub fn attach_native_overlay(payload: NativeOverlayAttachPayload) -> NativeOverlayResponse {
```

`pub fn`（`pub async fn` ではない）であり、napi-rs はこれを**呼び出しスレッド上で
同期実行**する。呼び出し経路は
`Viewport.tsx:800 → window.nativeOverlay.attach()`
（`electron/preload.ts:244`、`contextBridge` 経由）
`→ electron/nativeOverlayIpc.ts:65（ipcRenderer.invoke）`
`→ electron/nativeOverlayMainBridge.ts:250（async attach、しかし内部で
bridge.attach を await するだけで、bridge.attach 自体（napi 関数）は同期）`
`→ Rust attach_native_overlay`。

TS 側の `async`/`.then()` は Promise の皮を被せているだけで、実体である
napi 呼び出しは **Electron の main process スレッドをブロックする**
（renderer プロセスではなく main process のIPCハンドラ内で実行されるため、
main process が担う他の全 IPC・ウィンドウメッセージポンプまで巻き添えで
止まる——STAGE2 で観測された「アプリ全体の応答なし」と整合的）。

napi-rs で真の非同期化をするには2つの経路がある:
1. `pub async fn attach_native_overlay(...) -> ...`（napi-rs 3.x はネイティブに
   async fn を Rust 側のスレッドプール実行 + JS Promise 解決へマッピングする
   ビルトイン機構を持つ。追加の tokio feature 明記は `Cargo.toml`
   （`napi = "3.9.2"`、features 指定なし）を見る限り無いが、napi-rs 3系は
   `async fn` サポートをデフォルトで持つため機能的には到達可能——本タスクでは
   実際にビルドして確認するところまでは行っていない）。
2. `napi::bindgen_prelude::AsyncTask` トレイトを手動実装し、`Env::spawn` で
   バックグラウンドスレッドへディスパッチする（napi 2/3系の伝統的な方法）。

**設計上の要点（実装はしていない、方針のみ）**:
- `from_surface`（9本のパイプライン生成を含む重い初期化）を async task 内へ
  移し、完了時に `attach_call_end` 相当のイベントを JS へ通知する
  （napi の `ThreadsafeFunction` でコールバック、または attach 呼び出し自体を
  Promise にして解決を遅らせる）。
- **presenter との共存が鍵**: `windows-w7-staged-rollout.md` にある通り、
  `nativeOverlayPreviewEnabled` が false/未attach の間は既存の WebGPU
  presenter（ADR-011 の parity 用に無改造のまま残存）へフォールバックする
  経路が W1〜W6 の時点で既に存在する。Viewport.tsx の
  `nativeOverlayPreviewEnabled` はブール値の即時判定ではなく「attach
  完了イベントを受けて true になる」ステートマシンへ変更すれば、
  attach 完了までは presenter が描画を継続し、attach 完了後にシームレスに
  native overlay へ切り替える、という設計にできる。これは新規のUI状態
  （「attach中」）を Viewport.tsx（736行目付近の算出値、970〜1985行目付近の
  多数の `nativeOverlayPreviewEnabled` 依存箇所）に導入する必要があり、
  影響範囲は同ファイル内だけで少なくとも10箇所超の分岐に及ぶ
  （`grep` 実測で `nativeOverlayPreviewEnabled` の出現13件）。
- **macOS への影響を避ける必須要件**: macOS の attach は現状十分高速
  （STAGE1 の実測で「ハング」報告なし、opt-out のまま運用中）であるため、
  同期実装のまま変更しないのが安全。`from_hwnd`/`from_appkit_view` は
  すでに Windows/macOS でエントリポイントが分かれている
  （`resolve_dx12_compiler` は `from_hwnd` 専用、`nv12-pipeline-compile-time.md`
  「追記2」参照）ので、**napi 関数を async化しても中身の分岐で
  macOS 側は従来どおり即座に完了する経路を維持できる**——ただし
  「常に非同期呼び出しになる」というJS側APIの契約変更自体は
  プラットフォーム問わず波及するため、`electron/nativeOverlayMainBridge.ts`・
  `electron/nativeOverlayIpc.ts`・`preload.ts` の型定義・呼び出し側は
  両OS共通で変更が要る（実処理速度は変えず、コールバックタイミングの
  意味論だけを変える）。

| 変更ブラスト半径（推定、コード読みベース） | ファイル |
|---|---|
| napi関数のasync化 + イベント通知配線 | `native-overlay/src/lib.rs` |
| main process IPCハンドラの待ち方 | `electron/nativeOverlayMainBridge.ts`, `electron/nativeOverlayIpc.ts` |
| renderer側の状態機械（attach中→attach完了） | `src/components/Viewport.tsx`（13箇所の `nativeOverlayPreviewEnabled` 依存を「attach完了後」の派生値に整理し直す必要あり） |
| プリロードの型定義 | `electron/preload.ts` |
| macOSの挙動 | 変更不要（分岐で従来どおり同期的に速いまま。ただしAPI契約はOS非依存で変わる） |

**リスク**: 中〜高。Viewport.tsx の attach 依存ロジックは選択デコレーション・
scene direct render・resize 再attach 等、複数のuseEffectが絡み合っており
（385行目・1055行目のコメントにある既知の複雑さ）、「attach完了まで
presenterで代替描画し、完了後に切り替える」状態機械への書き換えは
リグレッションリスクを伴う中規模改修になる。TDD前提で1〜2週間規模の
見積りが妥当（実測ではなく規模観測からの見積り）。

### Option C: シェーダ/パイプライン再構成（プロファイルの再確認 + lazy pipeline creation の妥当性）

**9本のパイプラインの内訳**（`native-wgpu-renderer/src/lib.rs:548-572`、
実装読みで確認、行数は `wc -l` 実測）:

| # | 生成呼び出し | 使用シェーダ | 行数 |
|---|---|---|---|
| 1 | `create_pipeline_for_format` | `solid_composite.wgsl` | 598 |
| 2 | `nv12::create_nv12_pipeline_for_format` | `nv12_composite.wgsl` | 678 |
| 3 | `create_pipeline_for_format_with_layout`（Bgra8UnormSrgb版） | `solid_composite.wgsl`（同一シェーダの別フォーマット版） | 598 |
| 4 | `nv12::create_nv12_pipeline_for_format_with_layout`（Bgra8UnormSrgb版） | `nv12_composite.wgsl`（同上） | 678 |
| 5 | `particle::ParticleGpuRenderer::new` | `particle.wgsl` | 51 |
| 6 | `audio_reactive::AudioReactiveGpuRenderer::new` | `audio_reactive.wgsl` | 112 |
| 7 | `getcolor::GetColorGpuRenderer::new` | `getcolor.wgsl` | 151 |
| 8 | `hksy::HksyGpuRenderer::new` | `hksy_lines.wgsl` + `hksy_fill.wgsl`（2本の可能性、73+133行） | 73/133 |
| 9 | `simple_tube::SimpleTubeGpuRenderer::new` | （専用wgslファイルは未確認、`hologram_fill.wgsl`等と共有の可能性） | — |
| (追加) | `focus_lines`/`shaking_polygon`/`shattered_sphere` の各 `::new` | `focus_lines.wgsl`(37)/`shaking_polygon.wgsl`(45)/`shattered_sphere.wgsl`(152) | 37/45/152 |

`from_surface` は実際には8種類の `_renderer::new`（#5〜#12相当）＋4本の
uber-shaderパイプライン（#1〜#4）を呼んでおり、「9本」という表現は
`w5-attach-hang.md` が数えた際の暫定カウント（正確な内訳は本ノートで
初めて列挙した）。**重要なのは本数の正確な一致ではなく、シェーダサイズの
分布**: uber-shader系（598〜678行）が4本、それ以外（37〜152行）が8本前後。

**per-pipeline実測は本タスクでは新規に取得していない**（`nv12-pipeline-repro`
ツールは現状 `nv12`/`solid` の2種類のみ対応。他シェーダを流すには
bind group layout の合わせ込みが必要で、8種の renderer それぞれに個別の
実装が要る——1〜数時間規模の追加実装 + mainpc実行が必要）。代わりに、
既存の実測値からの逆算で推定した:

| 項目 | 値 | 出典 |
|---|---|---|
| DXC導入後の全体attach（`win32_overlay_smoke.rs`実測） | 79.09秒 | `w5-attach-hang.md`「追記2」 |
| nv12単体（DXC、中央値） | 52.42秒 | `nv12-pipeline-compile-time.md` |
| solid単体（DXC、中央値） | 7.51秒 | 同上 |
| bgra版2本（推定、solid/nv12と同シェーダ・別フォーマットのため近似同等時間） | 推定 solid相当×1 + nv12相当×1 ≒ +60秒 | 未実測（下記参照） |
| 残り8本の小シェーダ合計（逆算） | 79.09 - 52.42 - 7.51 ≒ **19.2秒**（bgra版を含めた場合は数値が合わない） | 逆算・要検証 |

**逆算には矛盾がある点を正直に記録する**: 単純に「4本のuber-shader版
（solid×2, nv12×2）」を積算すると 2×7.51 + 2×52.42 = 119.9秒となり、
実測79.09秒を超えてしまう。考えられる説明（いずれも未検証）:
(a) 同一 `wgpu::Device` 内でシェーダモジュール/PSOキャッシュがOS側
（D3D12ドライバのシェーダキャッシュ、`%LOCALAPPDATA%\...\D3DSCache`等）で
効くため2本目のフォーマット版は初回よりかなり速い、
(b) `create_pipeline_for_format_with_layout` はBind Group Layoutを共有し
Pipeline Layout生成を省略しているため、フォーマット違いのバリエーションは
最初の非Bgra版よりコンパイル対象のバリエーションが少ない、
(c) 単純に nv12-pipeline-compile-time.md の測定は単発プロセス
（毎回ゼロからdevice作成）だが実際のattachは同一device内で4本を
連続生成するため何らかの内部再利用が効いている。
**このため「小さい8本で19.2秒」という逆算値は信頼度が低く、次の一手として
実測すべき項目として残す。**

**それでも確度高く言えること**: 598〜678行のuber-shader（4本）が支配的
コストであることは`nv12-pipeline-compile-time.md`のH-A/H-B検証で確定済み。
37〜152行の小シェーダ8本は、行数がuber-shaderの1/4〜1/17であり、
Fxc時代の「行数に対し非線形」という知見を踏まえても、DXCでは
uber-shader1本分（7.5〜52秒）を大きく下回る（数百ms〜数秒オーダー）と
推測するのが妥当。したがって**lazy pipeline creationで削減できる余地は
主に「Bgra8UnormSrgbフォーマット版の2本（bgra_pipeline, nv12_bgra_pipeline）
を初回attach時に作らない」ことにある**。

**典型シーンでの必要パイプライン数**: `Viewport.tsx`の`present_scene_to_surface_texture`
呼び出し経路を確認した範囲では、surface自体のフォーマット
（`choose_live_surface_format`が返す値、通常surface_formatの1本）に対応する
`pipeline`/`nv12_pipeline`のペアが最初に使われ、`bgra_pipeline`/`nv12_bgra_pipeline`
はBgra8UnormSrgb**専用**（用途はコード上未特定——本タスクでは呼び出し元を
特定するところまで踏み込めていない。`grep bgra_pipeline`で使用箇所の
洗い出しが次の一手）。もしBgra版が特定シナリオ（例: 特定エクスポート経路や
特殊フォーマット時）でしか使われないなら、lazy化で初回attachから
2本（uber-shader版のBgra版2本）を除外できる可能性があり、
逆算の不確実性を踏まえても数十秒オーダーの短縮が見込める。

| 案 | 削減見込み | 実装コスト | リスク |
|---|---|---|---|
| Bgra版2本の遅延生成（初回使用時まで先送り） | 未確定（要 bgra_pipeline 使用箇所調査 + 実測） | 小〜中（既存のpipeline生成コードをlazy化するだけ、新規シェーダ設計は不要） | 低（初回使用がUIスレッドで起きるなら結局そこでブロックする——Option Bと組み合わせないと根本解決にならない） |
| 小シェーダ8本の並列/バックグラウンド生成 | 推定小（逆算値19.2秒が正しければこの程度が上限） | 中 | 中（wgpu Deviceがスレッド安全にconcurrent pipeline生成できるか要確認） |
| uber-shader自体の分割（effects tailの条件コンパイル） | 大（本命だが最大の設計変更） | 大（Phase 5/6超えの再設計、`nv12-pipeline-compile-time.md`で既にスコープ外と明記済み） | 高 |

### Option D: DXC最適化フラグ（-Od等）でコンパイル時間短縮

`wgpu-hal-25.0.2/src/dx12/shader_compilation.rs:255`以降の`compile_dxc`を確認。
DXCへ渡すコンパイル引数はwgpu-hal内部でハードコードされており、
**アプリ側（`wgpu::Device`/`Instance`のpublic API）から最適化レベルを
指定する手段は無い**。唯一の分岐点:

```rust
// shader_compilation.rs 299-300
compile_args.push(Dxc::DXC_ARG_DEBUG);
compile_args.push(Dxc::DXC_ARG_SKIP_OPTIMIZATIONS);
```

これは`wgt::InstanceFlags::DEBUG`が立っている場合のみ有効化される
（デバッグビルド/検証レイヤー有効時の挙動で、`instance_flags.contains(DEBUG)`
がゲート）。`DXC_ARG_SKIP_OPTIMIZATIONS`はまさに「最適化パスを飛ばして
コンパイルを速くする」フラグそのものだが、**同時にDXC_ARG_DEBUGも立つため
デバッグ情報埋め込み・検証コストが増え、かつ本番ビルドでInstanceFlags::DEBUGを
立てる運用は通常望ましくない**（他のバリデーション・パフォーマンスコストが
連動して増える可能性が高い。本タスクでは実測していない）。

wgpu 25.0.2のpublic APIレベルでは、DXCの最適化レベルを個別に制御する
専用オプション（`Dx12Compiler`列挙体、`instance.rs:381-406`参照）は
存在しない——`Fxc`/`DynamicDxc{dxc_path, dxil_path, max_shader_model}`/
`StaticDxc`の3種のみで、いずれも最適化レベル引数を持たない。

**結論**: 小規模実験（mainpcでの`-Od`相当フラグ比較）は**wgpu本体を
フォークしてshader_compilation.rsを改造しない限り不可能**であり、
「小さい実験で試せる」という前提を満たさない。Option Dはコスト（wgpu
フォーク維持）に見合わないと判断し、これ以上の実験は見送る。

## 結論

- **Option A（PIPELINE_CACHE）: 棄却確定。** wgpu 25.0.2のDX12バックエンドは
  未実装（空スタブ）であり、featureとしても公開されていない。Vulkan専用。
- **Option D（DXCフラグ）: 事実上不可（wgpu本体の改造が必要なため、
  「小さい実験」の枠を超える）。** 優先度最低、今回は見送り。
- **Option B（非同期attach）: 技術的に実現可能。** 現状`attach_native_overlay`は
  完全同期（`pub fn`）でElectron main processをブロックしており、
  STAGE2で観測された「応答なし」の直接原因として最も説明力が高い。
  presenterフォールバックの既存資産があるため設計の土台はあるが、
  Viewport.tsxの状態機械書き換え（13箇所の依存整理）を伴う中規模改修。
- **Option C（lazy pipeline creation）: 部分的に有望だが実測不足。**
  598〜678行のuber-shader 4本（solid×2, nv12×2フォーマット版）が支配的
  コストであることは確定済みだが、Bgra版2本を本当に遅延できるかは
  使用箇所調査が未着手。小シェーダ8本の削減余地は逆算ベースで
  「大きくない」と推測されるに留まる。

### RECOMMENDATION（time-to-ship / UX品質 / リスクでランク付け）

1. **最優先・短期: Option B（非同期attach化）。**
   time-to-ship: 中（中規模改修だが設計方針は明確、presenterフォールバックの
   資産を流用できる）。UX品質: 高（UIスレッドブロックそのものを解消し、
   79秒間のアプリ無応答を根本的に防げる——STAGE2で観測された症状に
   直接効く）。リスク: 中（Viewport.tsxの状態機械変更はリグレッション
   リスクを伴うが、macOSの同期パスは分岐で温存できるため既存の速い
   プラットフォームを壊す心配は小さい）。
   **W7の既定ON化を進める上で、Option Bなしに他の案だけで「89秒の
   同期ブロック」自体を消すことはできない**——CもDも「速くする」策で
   あり「ブロックしない」策ではないため、UXの本質的な問題（アプリが
   固まって見える）を解決するのはBだけである。
2. **次点・中期の補完: Option C の一部（Bgra版2本の遅延生成)。**
   time-to-ship: 短い（bgra_pipeline/nv12_bgra_pipelineの使用箇所調査が
   前提だが、調査後の実装自体は小さい）。UX品質: 中（Bと組み合わせて
   初回attachの絶対時間を削れば、非同期化後も「攻略成功までの体感時間」
   は短い方が良い）。リスク: 低。**Bと独立に着手可能**なので、Bの設計・
   実装と並行して先に済ませておく価値がある。
3. **保留・長期: Option C の残り（uber-shader分割/効果別条件コンパイル）。**
   time-to-ship: 長い（Phase 5/6超えの再設計、`nv12-pipeline-compile-time.md`
   で既にスコープ外と明記済み）。UX品質: 高（根本的なコンパイル時間短縮）だが
   Bが先に「ブロックしない」を達成していれば緊急度は下がる。リスク: 高
   （550行超のeffects tailを条件分岐で割る設計は仕様全体に触れる）。
4. **却下: Option A（PIPELINE_CACHE）。** wgpu 25.0.2のDX12未実装のため
   実装不可能。将来wgpuがDX12対応を追加した場合に再評価する
   （tracking issueの追跡は次の一手）。
5. **却下: Option D（DXCフラグ）。** アプリ側から制御する手段が無く、
   wgpu本体のフォークという「小さい実験」を超えるコストを要するため
   見送り。

**総合方針**: W7既定ON化には**Option Bの実装が必須**（UIスレッドブロックの
根絶なしに「89秒固まって見える」体験は解消しない）。Cのbgra遅延生成は
Bと並行して着手できる低リスクな補完策として推奨する。

## 次の一手 / 未検証事項

- `bgra_pipeline`/`nv12_bgra_pipeline`（Bgra8UnormSrgb版）の実際の使用箇所を
  `grep -rn "bgra_pipeline\|nv12_bgra_pipeline" native-wgpu-renderer/src/`
  で洗い出し、初回attach時に本当に不要か（遅延生成の対象にできるか）を
  確定させる。
- `nv12-pipeline-repro`ツールを拡張し、`particle`/`audio_reactive`/`getcolor`/
  `hksy`/`simple_tube`/`focus_lines`/`shaking_polygon`/`shattered_sphere`
  各シェーダの単体DXCコンパイル時間をmainpcで実測する（本ノートの
  「19.2秒」逆算値の検証。bind group layout合わせ込みに数時間規模の
  追加実装が必要）。
- 「4本のuber-shader版を積算すると119.9秒になり実測79.09秒と矛盾する」
  逆算の不一致を、同一device内での複数pipeline連続生成を模した
  実験（`nv12-pipeline-repro`に「4本連続生成」モードを追加）で解消する。
  D3D12ドライバのシェーダキャッシュ（`%LOCALAPPDATA%`配下）の影響も
  切り分け対象（キャッシュクリア前後の比較）。
- napi-rs 3.9.2の`async fn`サポート（tokio feature不要かどうか）を
  実際に最小コードでビルドして確認する（Option Bの実装着手前の前提確認）。
- wgpu本体（github.com/gfx-rs/wgpu）のDX12 `PIPELINE_CACHE`対応
  tracking issueの有無をWebで確認する（本タスクでは未実施。オフライン環境
  のため次回オンライン接続時に着手）。

## 追記（2026-08-22、W7 stage5-7・mainpc実機検証）

Option B（async attach、native-overlay/src/lib.rs）とOption Cの一部
（Bgra版2本の遅延構築、native-wgpu-renderer/src/lib.rs）を実装した上で
mainpc実機検証を実施した。詳細は`progress/windows-w7-async-attach.md`
「Stage 5-7」節を参照。要点のみ記録する:

- napiアドオン単体プローブ・`cargo test --release`（実HWND attach+detach
  + W6 geometry resyncスモーク、95 passed/0 failed）は実機でgreen。
  非同期化・遅延化のメカニズム自体は健全に機能している。
- しかし**実Electronアプリからのnative overlay attachが3回の独立試行
  （perfハーネス駆動、最大180秒待機）で一度も発火しなかった**
  ——STAGE1/STAGE2では同一起動方法で確実に成功していたため、本現象は
  それ以降（stage1-4のいずれかの変更、またはmainpc環境側の変化）で
  生じた新しい問題であり、非同期化・遅延化そのものの欠陥ではなく
  実Electron統合経路のどこかにattach起動を妨げる要因があると判断した。
- この未解決ブロッカーにより、attach window durationの実測・presenterの
  実フレームカバレッジ証拠のいずれも取得できず、DEFAULT-ON判定は
  flipしない（`WINDOWS_DEFAULT_ENABLED`は`false`のまま）。

## 追記（2026-08-23、W7 需要駆動 staged attach Phase 1: 全パイプライン個別計測）

### 目的 / 仮説

`progress/windows-w7-async-attach.md` stage4-6完了後もなお、summed-vs-measured
不一致（4本uber-shader版の単純合算119.9秒 vs 実測79.09〜88.77秒）が
「次の一手」として未解決のまま残っていた。本タスクの目的は、
`PreparedLiveSurface::finish_pipelines`（`native-wgpu-renderer/src/lib.rs`）が
実際に構築する全パイプライン（Bgra版2本のOnceLock遅延variantを除く）を
**同一device・同一プロセス内で・本番と同一の生成コードを呼びながら**個別に
計測すれば、この不一致が「別々のプロセス/deviceで測ったことによる方法論の
アーティファクト」であり「pipeline再利用のような未知の機構」ではないことを
示せる、という仮説を立てた。あわせて、staged attach（Essential/Deferred分割）の
設計判断に必要な「nv12が本当に支配的コストか」を確定させる。

### 環境

- mainpc（`ssh mainpc`、Windows実機、GPU: NVIDIA GeForce RTX 3070 Ti、
  DX12バックエンド、`Dx12Compiler::default_dynamic_dxc()`＝DXC、
  `dxcompiler.dll`/`dxil.dll`は`native-overlay/target/release/deps/`・
  `node_modules/electron/dist/`に既存配置分を流用）。
- mainpcのgit checkout（`C:\Users\gzabu\UXFD`、branch `w7final2`、
  tip `610f4b5e`＝ローカル`feature-proxy`と同一コミット）に、未コミットの
  計測用差分（`native-wgpu-renderer/src/lib.rs`・
  `windows_port_research/tools/nv12-pipeline-repro/{Cargo.toml,src/main.rs}`）
  のみを`scp`で直接転送（bundle転送ではなく差分3ファイルのみ、
  git treeはそのまま）。
- 計測前にmainpc上の残留`electron.exe`/`node.exe`プロセスを`taskkill /F`で
  終了（schtasksタスクは今回未使用、plain SSH + `cargo run`のみ——DComp/
  実HWNDを一切介さない純粋なパイプラインコンパイル計測のため schtasks /it
  は不要と判断）。
- `cargo build --release`（`nv12-pipeline-repro`、`--features static-dxc`は
  リンクエラー`__std_find_trivial_*`未解決で失敗したため不使用——
  `mach-dxcompiler-rs`の静的リンクとmainpcのMSVC STLバージョンの不整合と
  推測、既存のDXC DLL動的ロード経路で十分なため深追いせず`dxc`
  （`default_dynamic_dxc`）を採用）。

### 手順

1. `native-wgpu-renderer/src/lib.rs`に計測専用の`pub fn
   bench_finish_pipelines_per_stage(device, surface_format) -> Vec<(&str,
   Duration)>`を追加。`finish_pipelines`が実際に呼ぶ生成関数
   （`create_pipeline_for_format`・`nv12::create_nv12_pipeline_for_format`・
   `particle`/`audio_reactive`/`getcolor`/`hksy`/`simple_tube`/
   `focus_lines`/`shaking_polygon`/`shattered_sphere`各`GpuRenderer::new`）を
   構築順序どおりに呼び、各段階を`Instant`で個別計測する
   （Bgra版2本＝`bgra_pipeline`/`nv12_bgra_pipeline`はOnceLock遅延のまま
   `finish_pipelines`内で未構築のため、本計測でも意図的に対象外——
   スコープ外として指示どおりラベル分離）。本番コードパス
   （`from_surface`/`finish_pipelines`自体）は無改修、この関数は計測専用の
   追加コードのみ。
2. `windows_port_research/tools/nv12-pipeline-repro`に`--all`モードを追加し、
   `uxfd-native-wgpu-renderer`をpath依存として追加（既存の`--shader nv12|solid`
   モードは無改修、コメントで役割分担を明記）。`--all`は単一の
   `wgpu::Instance`/`Device`を1回だけ作成し、上記ベンチ関数を1回呼んで
   全段階のタイミングをまとめて出力する（＝本番の`finish_pipelines`呼び出し
   1回分と完全に同一の構造）。`surface_format`は`Bgra8UnormSrgb`固定
   （Windows実機のDComp overlayが`choose_live_surface_format`で実際に選ぶ
   フォーマットと一致）。
3. macOSでビルド確認（`cargo check --lib`/`cargo check --target
   x86_64-pc-windows-msvc --tests`両方クリーン）、`cargo run --release -- --all`
   でツール自体の動作をMetal上でスモークテスト（正常終了・全段階の
   タイミングが出力されることを確認）。
4. mainpcへ差分転送・ビルド・`target\release\nv12-pipeline-repro.exe --all
   --compiler dxc`を3回連続実行（ウォームアップ切り離しなし——1回目から
   3回とも同一プロセス内蔵の新規`Instance`/`Device`のため、OS/ドライバの
   シェーダキャッシュ効果を含めた「実際の単発attach相当」の値をそのまま
   採用する方針。3回とも独立プロセスとして起動）。

### 結果

mainpc実測（3回、単位ミリ秒、DXC）:

| パイプライン | Run1 | Run2 | Run3 | 中央値 | 全体に占める比率 |
|---|---:|---:|---:|---:|---:|
| solid_composite (rgba) | 9007 | 8571 | 8553 | **8571** | 12.9% |
| nv12_composite | 58394 | 57585 | 52713 | **57585** | 86.6% |
| particle | 204 | 14 | 15 | 15 | 0.02% |
| audio_reactive | 57 | 25 | 26 | 26 | 0.04% |
| getcolor | 61 | 36 | 32 | 36 | 0.05% |
| hksy | 112 | 69 | 70 | 70 | 0.11% |
| simple_tube | 18 | 21 | 22 | 21 | 0.03% |
| focus_lines | 24 | 16 | 13 | 16 | 0.02% |
| shaking_polygon | 47 | 45 | 37 | 45 | 0.07% |
| shattered_sphere | 124 | 79 | 81 | 81 | 0.12% |
| **TOTAL（プロセス実測）** | 68052 | 66465 | 61566 | **66465** | 100% |

GPU/backend: `NVIDIA GeForce RTX 3070 Ti`、`Dx12`、`DiscreteGpu`
（3回とも同一）。

**summed-vs-measured不一致の解消**: 各段階の中央値を単純合算すると
`8571+57585+15+26+36+70+21+16+45+81 = 66466ms`となり、実測TOTAL中央値
`66465ms`と**誤差1ms（測定誤差の範囲内）で一致した**。旧ノート
（stage4節、`windows-w7-async-attach.md`）が記録した「4本のuber-shader版を
単純合算すると119.9秒になり実測79.09〜88.77秒と矛盾する」不一致は、
**「複数の独立プロセス・独立deviceで別々に測った単体実測値を、実際には
1プロセス1device内で連続生成される本番の`finish_pipelines`呼び出しの
合計と直接比較した」という方法論上のアーティファクトであり、
device内でのpipeline再利用のような未知の機構は存在しない**ことが
本計測で確定した。9本を同一device・同一プロセスで連続生成した場合、
所要時間は単純合算とほぼ一致する（＝各パイプラインの生成コストは
互いに独立、キャッシュ的な相互作用はほぼ無視できる）。

### 結論

- 仮説採択: summed-vs-measured不一致は方法論アーティファクトであり、
  正確な内訳は上表のとおり。**nv12_compositeが全体の86.6%（中央値
  57.585秒）を占め、圧倒的な支配的コストである**ことを実測で確定した
  （旧ノートの推定「nv12 ~45-52s」よりやや高い52.7〜58.4秒だが、
  同じオーダーで整合）。
- solid_compositeは12.9%（8.571秒）で無視できない副次コストだが、
  nv12単体より1桁小さい。
- 8種の小型シェーダ（particle/audio_reactive/getcolor/hksy/simple_tube/
  focus_lines/shaking_polygon/shattered_sphere）は合計311ms（0.47%）と
  完全に無視できるレベルで、「小型シェーダは高速」という当初の想定
  （タスクブリーフィング）を実測で裏付けた。
- **Phase 2のEssential/Deferred分割方針への示唆**: Essential集合を
  「solid_composite + 8種の小型シェーダ」（中央値合計 約8.9秒）、
  Deferred集合を「nv12_compositeのみ」（中央値 57.585秒）とすれば、
  attach-to-overlay switchoverの理論上の短縮は約87%（66.465秒→約8.9秒）。
  Bgra版2本（`bgra_pipeline`/`nv12_bgra_pipeline`）は既にstage4で
  OnceLock遅延構築済みのため、Essential/Deferredいずれの集合にも
  含めない（BGRA IOSurface export呼び出し時に初めて構築される、
  live attach経路では到達しない設計は変更なし）。

### 次の一手 / 未検証事項

- Phase 2: 上記Essential/Deferred分割を`finish_pipelines`に実装し、
  Deferred（nv12）をserialize lock配下のバックグラウンドタスクへ
  切り出す。video-in-scene時の`nv12Ready`ゲーティング設計（TS側）が
  必須（このPhase 1計測はcorrectness側には触れていない）。
- 本計測は「ウォームアップなしの初回コンパイル」を3回とも独立プロセスで
  行った値であり、OS/ドライバのシェーダキャッシュが2回目以降の実行を
  高速化する可能性を意図的に排除していない（3回間でのバラつき、
  特にnv12の52.7〜58.4秒の幅はこの影響を含む可能性がある）。
  Phase 3の実attach latency測定で最終的な数値を確定させる。
