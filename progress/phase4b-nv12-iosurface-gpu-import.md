# Phase 4b: NV12 IOSurface ゼロコピー import + GPU 上 YCbCr→RGB 合成

## 決定

`native-wgpu-renderer`（Rust, wgpu on Metal）に、NV12 (biplanar 4:2:0)
IOSurface を CPU ピクセルコピーなしで直接 `wgpu::Texture` として import し、
YCbCr→RGB 変換をフラグメントシェーダで行う経路を追加した。CPU RGBA デコード
パイプライン置き換えの GPU 側半分（デコード側は AVAssetReader → NV12
IOSurface-backed CVPixelBuffer を別 agent が並行実装）。

### wgpu / import API

- `wgpu = "0.20.1"`（既存ピン）、実体の hal backend は `wgpu-hal 0.21.1`
  （Cargo.lock 解決）。IOSurface import はこのバージョンに存在する
  `wgpu_hal::metal::Device::texture_from_raw`（`unsafe fn`、
  `raw: metal::Texture` を `wgpu_hal::metal::Texture` へ包む関連関数）と
  `wgpu::Device::create_texture_from_hal::<wgpu::hal::api::Metal>`
  （hal Texture → 通常の `wgpu::Texture` への昇格）の組み合わせで実現した。
  wgpu のアップグレードは不要だった。
- Metal デバイスへのアクセスは `wgpu::Device::as_hal::<wgpu::hal::api::Metal, _, _>`
  で `&wgpu_hal::metal::Device` を取得し、`.raw_device()`（`&parking_lot::Mutex<metal::Device>`）
  をロックして使う。
- `metal` クレート 0.28.0 には IOSurface からのテクスチャ作成 API
  （`-[MTLDevice newTextureWithDescriptor:iosurface:plane:]`）が無いため、
  `objc::msg_send!` で直接呼び出す拡張トレイト
  （`src/nv12/import.rs::IOSurfaceTextureExt`）を自作した。
  `metal::DeviceRef` は metal-rs 内部で `unsafe impl objc::Message` 済みなので
  安全に呼べる。

### 依存クレートのバージョン一致（重複回避）

`Cargo.lock` を調べたところ、wgpu-hal 0.21.1 の metal backend は既に
`metal = "0.28.0"` と `objc = "0.2.7"`（`core-graphics-types` 経由で
`core-foundation = "0.9.4"`）を要求していた。これに合わせて:

- production 依存（`[target.'cfg(target_os = "macos")'.dependencies]`）:
  `metal = "0.28"`, `objc = "0.2.4"` — 上記と同一バージョンに解決され、
  クレート重複なし。
- IOSurface 自体の Rust バインディングとして crates.io の `io-surface`
  クレートは**採用しなかった**。理由: (1) crate 自体が
  `#![deprecated = "use the objc2-io-surface crate instead"]` になっている、
  (2) `core-foundation` の workspace 依存が 0.10 系に解決され、上記の 0.9 系
  と重複する、(3) 不要な `cgl`（OpenGL）依存を引き込む。代わりに
  `src/nv12/sys.rs` へ必要最小限の `IOSurfaceLookup`/`IOSurfaceGetID`/
  `CFRelease` だけを自前で `extern "C"` 宣言した（`IOSurface`/
  `CoreFoundation` framework をリンク）。
- テスト用の CVPixelBuffer フィクスチャ（`src/lib.rs`
  `tests::nv12_iosurface::nv12_fixture`）だけ `core-foundation = "0.9"` を
  **dev-dependencies** に追加した（`CFDictionary`/`CFString` で
  `kCVPixelBufferIOSurfacePropertiesKey` プロパティ辞書を組み立てるため）。
  production 依存には含めていないので、配布物の依存グラフには影響しない。

### プレーンフォーマットと色変換係数

- Y plane: `R8Unorm`、CbCr plane（半解像度・インターリーブ）: `RG8Unorm`。
  どちらも `MTLStorageMode::Shared`（IOSurface 由来テクスチャは Private
  不可。Apple Silicon には Managed が無いため両アーキテクチャで有効な
  Shared を選んだ）、`MTLTextureUsage::ShaderRead` のみ。
- WGSL 側 (`shared-renderer/shaders/nv12_composite.wgsl`) で
  `Nv12Params { colour_range: f32, colour_matrix: f32 }` uniform により
  video/full range・BT.601/BT.709 を実行時選択する。
  - video(limited) range: `y' = clamp((Y*255-16)/219, 0, 1)`,
    `cb'/cr' = clamp((Cb/Cr*255-128)/224, -0.5, 0.5)`
  - full range: `y' = Y`, `cb'/cr' = Cb/Cr - 0.5`
  - BT.601: `R = y'+1.402cr'`, `G = y'-0.344136cb'-0.714136cr'`, `B = y'+1.772cb'`
  - BT.709: `R = y'+1.5748cr'`, `G = y'-0.187324cb'-0.468124cr'`, `B = y'+1.8556cb'`
  - CbCr は `pixel/2`（整数除算、最近傍）でサンプルする。バイリニア chroma
    upsampling は今回のスコープ外（画質改善の余地として残す）。

### エフェクト統合ポイント（既存 RGBA パイプラインとの合流点）

既存シェーダ (`solid_composite.wgsl`) を読むと、`fs_main` 以下のブレンド・
エフェクト計算（ぼかし・色調補正・ワイプ・クリッピング・アウトライン・
グラデーション等）はすべて `load_source_linear(pixel) -> vec4<f32>`
（線形 RGBA を返す関数）1点だけを経由してソースを参照している。これが
まさに「変換はサンプリング時に行い、以降は既存エフェクトがそのまま動く」
統合ポイントだった（要件の (a)）。

- `nv12_composite.wgsl` は `solid_composite.wgsl` の `fs_main` 以下（`vs_main`・
  全エフェクト関数・ブレンド計算・`RenderParams` 構造体）を**一字一句同一**
  にコピーし、`load_source_linear` だけを YCbCr→RGB 変換に差し替えた別ファイル
  にした。`RenderParams` の Rust 側構築（旧 `prepare_scene_clips_with_upload_fence`
  内の巨大なインラインリテラル）を `build_render_params(clip, rotation_radians,
  width, height) -> RenderParams`（`src/lib.rs`）として関数抽出し、RGBA/NV12
  両方の経路から同一実装を呼ぶことで、`EvaluatedClip.effects` を渡せば NV12
  クリップでも既存エフェクトが完全に同じ計算式で動く（スコープを削らずに
  (a) を実現できた）。
- 既存 68 テストへの影響を避けるため、`solid_composite.wgsl` 自体は一切
  変更していない（`nv12_composite.wgsl` は独立ファイル）。代償として
  ~470 行の共通テールが2ファイルに重複している。WGSL に `#include` が無い
  ため、Rust 側で文字列結合して1ファイルに見せかける手もあったが、
  「既存の RGBA パイプラインのシェーダソースを一切変更しない」制約を最優先
  し、重複を許容した。**既知の技術的負債**: 将来 `solid_composite.wgsl`側の
  エフェクトを変更する際は `nv12_composite.wgsl` にも同じ変更を手動で
  反映すること。
- 出力の premultiplied blend state（`src=One, dst=OneMinusSrcAlpha`）・
  頂点シェーダ・出力フォーマットは RGBA パイプラインと完全に同一の
  `create_nv12_pipeline_for_format`（`src/nv12/pipeline.rs`）で作っている
  ため、同一レンダーパス内で `set_pipeline` を交互に切り替えて RGBA クリップ
  と NV12 クリップを混在合成できる（`compositing_with_rgba_clip_matches_two_rgba_clip_reference`
  テストで検証）。

### API サーフェス・本番統合の範囲

- `pub struct Nv12IoSurfaceSource { surface_id: u32, width, height,
  colour_range: Nv12ColourRange, colour_matrix: Nv12ColourMatrix }`。
  `surface_id` は `IOSurfaceLookup` で解決可能なグローバル ID
  （典型的には `CVPixelBufferGetIOSurface` → `IOSurfaceGetID`）。
  CVPixelBuffer そのものへの型依存は持たせていない
  （デコード側の実装詳細から意図的に切り離した。要件の「IOSurfaceLookup
  経由」を選び、「CVPixelBuffer 参照」は将来デコード側が固まった時点で
  薄いヘルパー関数を足すだけで対応できる）。
- `NativeWgpuRenderer::render_layers_to_rgba(&self, layers: &[SceneLayer])
  -> Result<RgbaFrame, ..>` を新設。`SceneLayer { clip: EvaluatedClip,
  content: SceneLayerContent::{Rgba(RgbaFrame), Nv12 { source, revision }} }`
  を z_index 昇順で 1 レンダーパスに合成する。
- **意図的なスコープ限定**: `render_layers_to_rgba` は本番の
  `SceneSnapshot`／`sources: &HashMap<String, RgbaFrame>` を直接受け取る
  既存エントリポイント（`render_frame_stages`/`present_frame_stages`/
  `prepare_scene_clips_with_upload_fence` 等、`rust-backend`/`native-overlay`
  が実際に呼ぶ経路）とは**統合していない**。理由: 本番のフレームソースは
  今も CPU の `RgbaFrame` のみを供給しており（デコード側の NV12
  IOSurface 出力は別 agent が並行実装中で本タスクでは利用できない）、
  `SceneSnapshot`/`EvaluatedClip` に「このクリップのソースは NV12 IOSurface
  である」という情報を渡す経路が rust-backend 側にまだ存在しない。
  無理に `sources: &HashMap<String, RgbaFrame>` の型を拡張しようとすると
  `uxfd-rust-core`（`rust-backend`/`native-overlay` 双方が依存する共有クレート）
  の変更が必要になり、触ってはいけない2クレートに間接的な影響が及ぶため
  見送った。`render_layers_to_rgba` は (a) IOSurface import、(b) NV12→RGB
  シェーダ変換、(c) 既存エフェクト・ブレンドとの合流、(d) プレーン
  テクスチャキャッシュ、の4点を実証・テストするための独立エントリポイントで
  あり、デコード側が完成した次フェーズで `SceneSnapshot` 側にソース種別を
  追加し、本経路と統合する想定。
- RGBA レイヤー側は本メソッド内では `media_texture_cache`（Phase 3a の
  per-media キャッシュ）を経由せず毎回アップロードする（このメソッドは
  NV12 検証用の縮小版であり、高頻度本番パスは既存の
  `render_frame_stages`/`present_frame_stages` が担うため）。

### media_texture_cache との整合（NV12 版キャッシュ）

- `Nv12MediaTextureCache`（`src/nv12/cache.rs`）は Phase 3a の
  `MediaTextureCache` と同じ設計（`HashMap` + 挿入順 `VecDeque` による
  単純 LRU、`idle_frames` によるスケール即時退避）を踏襲。
- キー: `media_id: String`。エントリは `(surface_id, revision)` を両方
  保持し、hit 条件は「両方が前回と一致」（revision だけでなく surface_id
  も比較することで、万一 revision 管理側にバグがあっても誤って古い
  IOSurface のテクスチャを使い回さないようにする防御）。
- バイト予算は 256MB（RGBA 版の 512MB より小さめ。NV12 クリップの同時
  再生数は通常 RGBA 静止画/PSD 等より少ないため）。
- `unchanged_revision_reuses_imported_plane_textures` テストで
  「同一 (surface_id, revision) では `import_nv12_iosurface_textures`
  を再実行しない（ミス→ヒット→revision変更で再ミス）」を固定した。

## 代替案として却下したもの

- **`io-surface` crate の採用**: 上記の通り deprecated・依存重複・不要な
  `cgl` 依存のため却下。
- **`objc2`/`objc2-metal`/`objc2-io-surface` の採用**: wgpu-hal 0.21.1 の
  metal backend は `objc`（1系ではなく無印 0.2 系）を使っており、`objc2`
  系を追加すると Objective-C ランタイムバインディングが2系統併存する
  ことになり「重複クレート回避」の趣旨に反するため却下。
- **`solid_composite.wgsl` を書き換えて共通化**: 共通テールを別ファイルに
  切り出し Rust 側で文字列結合する案も検討したが、既存 68 テストが検証
  している RGBA パイプラインのシェーダソース自体を変更するリスクを
  避けるため、`nv12_composite.wgsl` への手動コピーで妥協した
  （前述の技術的負債として記録）。
- **バイリニア chroma upsampling**: 画質は向上するが今回のテスト
  （solid colour / gradient / compositing parity）を通すには不要と判断し、
  スコープ外にした。

## 制約・今後の課題

- `render_layers_to_rgba` は本番の `SceneSnapshot` 経路と未統合（上述）。
  デコード側（NV12 IOSurface-backed CVPixelBuffer を供給する AVAssetReader
  実装）が完成し、`rust-backend`/`native-overlay` 側でクリップのソース種別
  を判定できるようになった時点で、`EvaluatedClip` にソース種別を持たせるか
  `sources` 相当の型を拡張する設計が必要。
- CbCr は最近傍サンプルのみ。エッジのギザつきが気になる場合はバイリニア化
  を検討。
- NV12 ソースの `max_texture_dimension_2d` 超過時のダウンスケールは未実装
  （RGBA 側は `downscale_rgba_frame_to_fit` で対応済み）。動画解像度は通常
  device 上限内に収まるため優先度低と判断したが、将来 8K 素材等では対応が
  必要になる可能性がある。
- `nv12_composite.wgsl` と `solid_composite.wgsl` の共通テール重複は
  上述の技術的負債。将来どちらかを変更する際は両方に反映すること。
