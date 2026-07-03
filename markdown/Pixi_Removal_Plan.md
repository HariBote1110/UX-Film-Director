# PixiJS 排除計画（Pixi Removal Plan）

作成日: 2026-07-03
状態: **全フェーズ完了（2026-07-03、版 429a）。pixi.js は依存から削除済み・boundary テストで再侵入防止。機能退行リストの Rust 移植が後続タスク（progress.md 参照）。**
進捗の詳細は `progress.md` の 2026-07-03 エントリ群を参照。
背景: 「Rust オーバーレイと Pixi が混在した preview 構造がスパゲッティ化している」というユーザー判断により、PixiJS（`pixi.js ^8.1.0`）を段階的に排除し、preview 描画を Rust（native overlay + wgpu）へ一本化する。

## 1. 現状の依存マップ（2026-07-03 調査）

### 直接 import は4ファイルのみ（テスト除く）

| ファイル | 規模 | 役割 |
|---|---|---|
| `src/utils/pixiRenderHelper.ts` | 986行 | シーン→Pixi 描画変換（`updatePixiContent`）、エフェクト適用、リップシンク、振動、グループグラデーション |
| `src/components/Viewport.tsx` | 2211行（PIXI参照28箇所） | `PIXI.Application` 生成・破棄、preview 2D キャンバス |
| `src/hooks/usePixiInteraction.ts` | 262行 | キャンバス上の選択・ドラッグ等ポインタ操作 |
| `src/utils/pixiUtils.ts` | 229行 | 補助ユーティリティ |

### すでに Pixi から独立しているもの

- **エクスポート経路**: `useProjectExportBoundary.test.ts` が「export コードに PIXI import・`pixiAppRef` を含まない」ことを契約テストで強制済み。
- **動画の decode / present**: rust-backend（ffmpeg + VideoToolbox）→ POSIX shm ring → native overlay（wgpu）で完結。
- **シーンモデル**: rust-core `schema.rs` の `MediaKind` / `ClipKind` が Video / Image / SolidColour / Psd / Generated 系35種を網羅。
- **幾何・デコード要求**: presenter 診断上 `rust-wasm` がソース。

### 移行機構（cutover）はすでに敷設済み

`pixiRenderHelper` は描画時に `shouldSkipPixi{SolidColour,Image,Psd,GeneratedEffect}ForSharedRenderer` を判定し、オブジェクト ID が shared renderer 側の所有集合に入っていれば Pixi 描画をスキップする設計になっている（`sharedRenderer*Ownership.ts` / `pixiVideoCutoverStack.ts` ほか）。つまり**メディア種別ごとの段階的所有権移転のレールは既にある**。

### Pixi にしか無いもの（= 移行の本体）

1. **テキスト描画**: rust-core schema に Text 系の Kind が存在せず、native-wgpu-renderer にグリフ描画機構が無い。最大のギャップ。
2. **インタラクション**: `usePixiInteraction` のヒットテスト・ドラッグは Pixi のシーングラフに依存。
3. **一部エフェクトのランタイム適用**: `applyObjectEffects` / `getLipSyncViseme` / `getVibrationOffset` / `applyGroupGradientEffect` は Pixi コンテナ前提（幾何計算部分は純粋関数として分離可能。`visionTrackingKeyframes.ts` が `getGroupTransforms` を既に純関数として利用中）。
4. **fallback presenter**: 動画アップロード不能時等の `pixi-passthrough` 経路と、`parallelCompare`（Pixi/Rust 並行比較）計画モード。

## 2. フェーズ計画

### Phase 0 — 所有権の実態監査（小、半日）
- parallelCompare / 診断 DOM を使い、実運用で「どの種別が実際に Rust 所有へ cutover しているか」を計測する。
- 種別ごとの parity 差分（描画結果の一致度）を readback 比較で棚卸しし、Phase 1 の対象順を決める。
- 成果物: 種別×所有状態×parity の一覧表（本ファイルに追記）。

### Phase 1 — 非テキスト静的コンテンツの完全 cutover（中）
- SolidColour / Image / Psd / Generated 系35種の所有権を常時 Rust 側に倒し、`shouldSkipPixi*` が全 ID で真になる状態にする。
- parity が不足する Generated 種別は native-wgpu-renderer 側を修正（Red: readback parity テスト → Green）。
- 完了条件: 動画なし・テキストなしのシーンで Pixi キャンバスが完全に空。

### Phase 2 — テキストの Rust 描画（大、最難関）
- 選択肢:
  - **(a) glyphon / cosmic-text を native-wgpu-renderer に統合**（本命。字詰め・折返し・絵文字は cosmic-text が担う）
  - (b) 暫定: HTML Canvas でラスタライズ→Image ソースとして shm 経由アップロード（品質は出るが編集中の再ラスタライズ負荷と2系統残留が難点。恒久解にしない）
- schema へ `Text` Kind（フォント・サイズ・字間・縁取り・影）を追加し、rustSceneSnapshot に serialise を実装。
- 完了条件: テキストオブジェクトの preview / export の描画が一致し、Pixi の `PIXI.Text` 経路が不要になる。

### Phase 3 — インタラクションの脱 Pixi（中）
- ヒットテスト: rust-wasm の幾何（既にシーン変形を持つ）へ「座標→オブジェクト ID」問合せを追加し、`usePixiInteraction` を DOM イベント + wasm ヒットテストへ置換。
- 選択ハンドル・バウンディングボックスは HTML/SVG オーバーレイで描画（Pixi 不要、Bug E の child NSWindow 化とも整合：UI は常に HTML 層）。

### Phase 4 — presenter 一本化と PIXI.Application 撤去（中）
- `pixi-passthrough` fallback と `parallelCompare` を撤去し、native overlay を唯一の presenter にする。
- `Viewport.tsx` から `PIXI.Application` / キャンバス生成を削除。`pixiRenderHelper.ts` の純粋関数（`getGroupTransforms` 等）は `sceneTransforms.ts` 等へ移設。
- 注意: overlay が唯一のレンダラになるため、**Bug E（overlay が HTML UI より上）の解決（child NSWindow 化）が実質的な前提条件**になる。Phase 4 着手前に Bug E 計画（`Native_Overlay_Bug_E_Plan.md`）の実施判断が必要。

### Phase 5 — 依存削除と再侵入防止（小）
- `package.json` から `pixi.js` を削除、`pixiUtils.ts` / `usePixiInteraction.ts` / `pixiRenderHelper.ts` / `pixi*Cutover.ts` を削除。
- `useProjectExportBoundary.test.ts` と同型の boundary テストを**アプリ全体**に拡大（「src 配下に `from 'pixi.js'` が存在しない」）して再導入を恒久的に防ぐ。

## 3. リスクと判断メモ

- **テキストが最大の壁**: Generated 35種は既にレールがあるが、テキストはスキーマから無い。Phase 2 の工数が全体を支配する。
- **順序の根拠**: fallback（Phase 4）を最後にするのは、移行中の描画不具合時に Pixi へ即時退避できる安全網を保つため。
- **Bug E との連動**: Phase 4 で Pixi を消すと「HTML UI の下に描く汎用キャンバス」が無くなるため、overlay の z-order 問題は放置できなくなる。Bug E の child NSWindow 化と Phase 4 は同一マイルストーンとして扱うのが安全。
- 各 Phase は従来どおり TDD（Red→Green→docs）＋ Sonnet サブエージェント委譲＋親セッション実機検証の運用で進める。

## Phase 0 監査結果（2026-07-03）

コードリーディングのみで確定（アプリ起動・実機操作は行っていない）。HEAD `26746abd` 時点。

### 切替フラグの仕組み（所有権集合が実行時にどう埋まるか）

所有権判定の中枢は `src/utils/sharedRendererPreviewPresenterController.ts`。以下の2段構えで決まる。

1. **`nativeRenderFrameReady`（実行時フラグ、種別非依存の単一ゲート）**: rust-wasm がシーンをレンダリングし video frame texture の upload に成功すると `true` になる（`sharedRendererPreviewPresenterController.ts:394` 付近 `nativeRenderFrameReady = true`）。これが立てば SolidColour / Image / Psd / GeneratedEffect / Video いずれも無条件で Rust 側所有と判定される（各 `build*Ownership` 関数の最初の分岐）。
2. **個別 cutover フラグ（`nativeRenderFrameReady` が false のときのフォールバック経路）**:
   - SolidColour: `VITE_UXFD_SHARED_RENDERER_SHAPE_CUTOVER`（`sharedRendererPreviewPresenterController.ts:902-903`、`!== '0'` なので**未設定時は有効**）。加えて `geometrySource === 'rust-wasm'` かつスタック安全性判定（自分より上に Pixi 専用オブジェクトが無いこと、`buildSharedRendererSolidColourStackSafety`）を通過する必要がある。
   - Video: `VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER`（`Viewport.tsx:524`、`!== '0'` でデフォルト有効）。加えて decode request / frame upload 成功が必要。
   - Image / Psd / GeneratedEffect: **専用 cutover フラグは存在しない**。`buildSharedRendererImageOwnership` / `buildSharedRendererPsdOwnership`（`src/utils/sharedRendererImageOwnership.ts` / `sharedRendererPsdOwnership.ts`）は `nativeRenderFrameReady` の真偽のみで決まる二値判定。`collectSharedRendererGeneratedEffectObjectIdsFromSession`（`src/utils/sharedRendererPreviewSession.ts:67-70`）も `session.surfaceGate.ok`（≒ nativeRenderFrameReady 相当）のみで決まる。つまりこの3種は「フラグで段階的に有効化する」設計ではなく「native render frame が来た瞬間に全部 Rust 所有になる」設計。

判定結果は `Viewport.tsx:510-513` の4つの ref（`sharedRenderer{SolidColour,Image,Psd,GeneratedEffect}ObjectIdsRef`）に格納され、`pixiRenderHelper.ts` の `shouldSkipPixi*ForSharedRenderer` がこれを参照して Pixi 描画をスキップする。

### 種別ごとの所有状態判定

| 種別 | 実行時の所有状態 | 判定ファイル |
|---|---|---|
| SolidColour | 条件付き（`SHAPE_CUTOVER` フラグ＋rust-wasm 幾何＋スタック安全性、いずれもデフォルト条件は緩い＝実質ほぼ常時 Rust） | `sharedRendererSolidColourOwnership.ts` |
| Image | 二値（`nativeRenderFrameReady` のみ）＝native frame が来れば常時 Rust | `sharedRendererImageOwnership.ts` |
| Psd | 二値（`nativeRenderFrameReady` のみ）＝同上 | `sharedRendererPsdOwnership.ts` |
| Generated 35種 | 二値（`session.surfaceGate.ok` のみ）＝同上 | `sharedRendererPreviewSession.ts:67-83` |
| Video | 条件付き（`VIDEO_CUTOVER` フラグ＋decode/upload 成功＋スタック安全性） | `sharedRendererVideoOwnership.ts` |
| Text | 所有権レール自体が無い（Rust schema に Text Kind が無いため） | — |

### parity テストの被覆状況

`reference-renderer` crate（CPU側の期待値合成、`Effect` 適用込み）と `native-wgpu-renderer/tests/native_reference_parity.rs`（wgpu実装が CPU reference と画素一致するかを `golden-harness::compare_rgba_frames` で検証）が実質的な parity テストの本体。

- **SolidColour の合成・opacity・blend**: 厚くカバー（`native_reference_parity.rs:14-176`、半透明合成・alpha×opacity・gain clamp 等）。
- **Effect 系（clipping / colour_aberration / outline / wipe / spot_light / displacement_map / fake_dof / auto_blur / stretch / multi_slicer / oct_transform / area_expand）**: 全て parity テストあり（`native_reference_parity.rs:178-594`）。これらは `rust-core/src/schema.rs:169-244` の `Effect` 列挙に対応物があり、`pixiRenderHelper.ts` の `applyObjectEffects` が適用する PIXI filter とほぼ1対1対応。
- **Transform（平行移動・回転・バイリニアサンプリング）**: parity テストあり（`native_reference_parity.rs:700-838`）。
- **GeneratedAudioWaveform / GeneratedAudioSphere**: `native-wgpu-renderer/src/lib.rs` に専用ラスタライズ関数（`rasterise_audio_waveform_input:899`, `rasterise_audio_sphere_input:944`）があり、`native_reference_parity.rs:596-698` でレンダリング結果を検証。**35種中この2種のみ実描画テストあり**。
- **その他 Generated 33種（Particle / Barcode / PuzzlePiece / ColourWheel / Gourd / Gear / TrackBar / PieChart / Histogram / ToneCurve / GetColorDots / HksyCheckerGrid / RegionFrame / SimpleTube / SphereDots / SphericalField / Sunburst / CircularArrow / TriangleBracket / TartanCheck / Houndstooth / Yagasuri / PaperAirplane / AsanohaPattern / FocusLinesPlus / RandomLineEx / ContourTrace / DisplacementPoly / PlainEffectorLine / Hologram / Protractor / ShakingPolygon / ShatteredSphere）**: **重大な欠落**。`native-wgpu-renderer/src/lib.rs` は `MediaKind` を一切参照せず、合成対象を常に事前ラスタライズ済み `RgbaFrame`（`HashMap<String, RgbaFrame>`）として受け取るだけ（`render_native_wgpu_frame` 系関数のシグネチャ、`lib.rs:214,258,399...`）。つまり **native-wgpu-renderer 自身はこれら33種の絵作りロジックを持たない**。`rust-core` / `rust-core-wasm` にも該当するラスタライズ関数は見つからず（`grep -rl "GeneratedParticle" rust-core rust-core-wasm` は `schema.rs` と契約テストのみヒット）。`src/utils/sharedRendererNativeMediaSupport.ts` の `isSharedRendererNativeGenerated*SourceSupported` はソース JSON のスキーマ妥当性チェックに過ぎず、実描画の有無を保証しない。→ **これら33種が `sharedRenderer` 所有に切り替わった際、実際にどこで RGBA にラスタライズされているのか（TS側で事前ラスタライズしてアップロードしているのか、未実装なのか）を Phase 1 着手前に追跡する必要がある。本監査ではラスタライズ元を特定できなかった。**
- **Image / Psd のソース合成**: `native_reference_parity.rs` の sources は単色 `RgbaFrame::from_rgba8` のみで、実画像ファイル・PSD レイヤ合成を入力にした parity テストは見当たらない。ソーステクスチャの読み込み・アップロード経路自体（decode → shm/GPU upload）は別途 `shm_decoded_frame_render.rs` 等でカバーされている可能性があるが、Image/Psd 固有の parity（Pixi の `renderPsdTree` 等との一致）は未確認。
- **`overlay_surface_matches_export_readback_for_phase3a_reference_scenes`**（`native-wgpu-renderer/tests/overlay_surface_parity.rs:11`）: overlay 提示結果と export readback の一致を見るテストで、preview/export 間の parity。Pixi との比較ではない。
- **vitest 側**（`pixiSolidColourCutover.test.ts` 等の `pixi*Cutover.test.ts` 群、`sharedRenderer*Ownership.test.ts`）: いずれも所有権判定ロジックの**単体テスト**（入力条件→`owner`値の期待値検証）であり、実際の画素比較・parity テストではない。`nativeOverlayParityBoundary.test.ts` は「overlay/WebGPU preview/export readback の parity ゲートを CI コマンドとして持つこと」自体を境界テストとして固定するもので、parity の実体は上記 Rust 側テスト。

### Pixi 固有機能とRust対応の対応表（`pixiRenderHelper.ts`）

| 関数 | 内容 | Rust 対応 |
|---|---|---|
| `applyObjectEffects`（`pixiRenderHelper.ts:713`） | `clipping/colour_aberration/outline/wipe/spot_light/displacement_map/fake_dof/auto_blur/stretch/multi_slicer/oct_transform/area_expand` フィルタ適用 | **対応あり**（`rust-core/src/schema.rs:169-244` の `Effect` 列挙＋`native_reference_parity.rs` で parity 済み）。ただし `color_correction`（`PIXI.ColorMatrixFilter` による hue/saturate/contrast/brightness）は Rust `Effect` に**対応なし** |
| `getLipSyncViseme`（`pixiRenderHelper.ts:657`） | PSD オブジェクトのリップシンク viseme 判定（`obj.type === 'psd'` 専用、`getCurrentViseme` に委譲） | **対応なし**（Rust schema にリップシンク関連の型が無い） |
| `getVibrationOffset`（`pixiRenderHelper.ts:672`） | vibration フィルタによる位置オフセット計算（純粋関数、幾何演算のみ） | **対応なし**（Rust `Effect` に vibration 相当が無い）。ただし純粋関数のため移設自体は容易 |
| `applyGroupGradientEffect`（`pixiRenderHelper.ts:624`） | グループコンテナへの `GroupGradientFilter` 適用 | **対応なし**（`GeneratedGradient` は独立した MediaKind であり、グループへのグラデーションフィルタ適用とは別物） |
| `getGroupTransforms`（`pixiRenderHelper.ts:643`） | グループの累積 transform 計算（純粋関数） | 対応不要（`visionTrackingKeyframes.ts` の `getGroupTransforms` 利用例と同様、TS側純粋関数として独立移設可能） |
| テキスト描画（`PIXI.Text` 系、pixiUtils 経由） | — | **対応なし（既知）**。Rust schema に Text Kind が無い |

### Phase 1 の推奨着手順

parity 被覆と実装状況から、着手コストの低い順に並べる。

1. **SolidColour の cutover 常時 ON 化**（最小変更）: すでに `SHAPE_CUTOVER` フラグ＋rust-wasm 幾何＋スタック安全性の3条件で実質ほぼ常時 Rust 所有。parity テストも厚い。デフォルト値の見直し・スタック安全性判定の残存ブロックケースの洗い出しのみで完遂できる可能性が高い。
2. **Image / Psd の cutover 確認**: 判定ロジック自体はすでに二値（フラグ不要）。ただし Image/Psd 自体の描画結果 parity テストが存在しないため、**Phase 1着手前に readback parity テストを追加**（Red）してから安全性を確認するのが必須（既存 Pixi 実装 `renderPsdTree` との比較）。
3. **GeneratedAudioWaveform / GeneratedAudioSphere**: 唯一 native-wgpu-renderer に実描画ロジックと parity テストがある2種。cutover 自体は上記2種同様フラグ不要（二値）だが、実描画の存在が確認済みなので優先度は高い。
4. **Generated 33種（AudioWaveform/AudioSphere以外）**: **native-wgpu-renderer 側の描画修正（というより新規実装）が必要な最大の作業ブロック**。所有権を `sharedRenderer` に倒す前に、まず「現在これらが `nativeRenderFrameReady` 時にどこで RGBA 化されているか」を特定する追加調査が必須（本監査では特定できず、TS側の未知の事前ラスタライズ経路がある可能性と、単に描画されず透明/欠落している可能性の両方が残る）。特定できなければ Red テスト（期待画素との readback 比較）を先に書いて実態を固定するところから始める。
5. **Video**: SolidColour と同型のフラグ構成で parity も一定あるが、decode/upload の非同期性が絡むため SolidColour より複雑。Phase 1 の対象という位置づけは変えず、優先度は33種着手より後でよい。

**Phase 1 最小変更点まとめ**: SolidColour と Image/Psd/GeneratedAudioWaveform/GeneratedAudioSphere は「フラグを常時有効にする／既存二値判定を維持する」だけで cutover 完了に近づけられる。一方、Generated 33種は cutover 云々の前に「実描画実装の有無」という設計レベルの疑問が残っており、Phase 1 のスコープの中でも別枠（サブフェーズ）として扱うべき。
