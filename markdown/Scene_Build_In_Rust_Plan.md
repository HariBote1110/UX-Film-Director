# Scene Build In Rust 計画

最終更新: 2026-09-13

## 位置づけ

`Rust_Source_Of_Truth_Plan.md` の責務台帳に残る「クロスオブジェクト配線」を解消するための、次段階の設計・移行計画である。詳細な判断が確定したら `architecture/01-decision-record.md` に ADR-017 として転記する。本書は計画であり、実装済みであることを示さない。

## 0. ゴールと非ゴール

### ゴール

- 編集可能な object graph（`ProjectSettings`、`LayerState[]`、42 kind の `TimelineObject[]`、および解決に必要な runtime media 情報）を Rust に渡し、Rust が評価用 `Project`、`SceneMediaReference`、group-control の target track を構築する。
- `audio_visualization`、`audio_sphere`、`getcolor_dot_field`、`group_control` のクロスオブジェクト参照を Rust で一度だけ解決する。
- preview の常駐 `scene.replace` / `scene.evaluate` 経路と、export / interim presenter が使う直接 snapshot 経路を同じ Rust builder に収束させる。
- TS の `rustSceneSnapshot.ts` にある snapshot / media serializer を削除し、TS を UI と RPC の薄い配線に戻す。

### 非ゴール

- UI、object kind、エフェクト、保存形式の新機能を追加・変更しない。
- `timeline.rs::evaluate_frame` の評価規則を再設計しない。builder は既存 `Project` を作り、評価は既存の `evaluate_frame` を再利用する。
- Windows の NV12 attach 窓に必要な `sharedRendererWebGpuPresenter.ts` を削除しない（ADR-016）。
- PSD の parser / デコード実装を置換しない（ADR-015）。本計画は PSD の選択 active layer と media path の所有権を builder に移すだけである。

## 1. 現在地（As-Is）

### 1.1 データと責務の流れ

| 段階 | 現在の入力・出力 | 実際の責務 | 実行頻度 / コスト |
| --- | --- | --- | --- |
| Zustand | `ProjectSettings`、`LayerState[]`、`TimelineObject[]` | UI が保持する編集 graph。audio、非表示 object、PSD `activeLayerIds` を含む。 | 編集ごと / UI 状態変化ごと |
| TS serializer | `src/utils/rustSceneSnapshot.ts:928-1339` | kind→media、path/proxy、寸法、PSD active layer、生成 source JSON を作る。audio / GetColor の参照をここで解決する。 | direct 経路ではフレームごと。resident 経路でも `scene.replace` 前 |
| TS resident builder | `src/utils/editableRustScene.ts:378-457` | 可視 object を track / clip / `Project` に射影し、media を serializer に委譲。group-control の target track も TS で計算する。 | scene 置換（編集後）。`scene.evaluate` 自体は 0.4–4ms との既存計測 (`src/e2e/realisticHeavyEditSecondPlaybackStart.ts:9`) |
| Rust session | `rust-backend/src/scene.rs:8-76`, `state.rs:12-17` | 受領済みの `Project` と `SceneMediaReference[]` を revision ごとに保持するだけ。 | `scene.replace` ごと |
| Rust evaluator | `rust-backend/src/scene.rs:114-138` → `rust-core/src/timeline.rs:28-120` | frame の clip/effect/transform を評価し、参照された media だけを返す。media source は構築しない。 | フレームごと |
| native consumers | `rust-backend/src/source_frames.rs:16-63`, `native-overlay/src/lib.rs:4153-4212`, `native-wgpu-renderer/src/lib.rs:4793-4845` | `SceneMediaReference.source` の完成済み JSON / path を読み、CPU/GPU source を構築・描画する。 | フレームごと。ただし content revision cache を利用 |

### 1.2 解決済み値が失われる地点

`mediaReferenceForObject` は `objects` と `time` を受ける (`src/utils/rustSceneSnapshot.ts:928-934`)。そこで以下を**完成済みの文字列**へ射影する。

- audio: `serialiseGeneratedAudioWaveformSource` / `serialiseGeneratedAudioSphereSource` は `target_audio_id` と `target_source` を埋める (`:1434-1471`)。ID 指定は時間外でも選び、layer fallback のみ半開区間で候補を絞る (`:2044-2065`)。
- GetColor: `sampleSourcePath` を最優先し、なければ当該時刻に有効な image / PSD の object ID または layer を探す (`:1885-1959`)。object ID が候補外なら layer fallback をしない。PSD は有効な layer ID をソートして source JSON に埋める (`:1354-1358`, `:1908-1913`)。
- group control: 表示対象だけを layer 順にし、control より上の layer を一意な `layer-N` track ID へ畳む。`targetLayerCount: 0` は全上側、同一 layer は対象外 (`src/utils/editableRustScene.ts:422-445`)。

従って現行 `scene.replace` wire の `Project.group_controls.target_track_ids` は `targetLayerCount`、非表示 object、元の layer graph を失い、`Project.media` は `id` / `kind` / `source` だけ (`rust-core/src/schema.rs:82-87,2763-2773`) である。さらに `scene.replace` に渡す実体は評価用 `Project` と別配列 `SceneMediaReference` であり (`rust-backend/src/scene.rs:10-16`)、audio object は resident track/media に残らない。この状態で Rust に resolver 関数だけを追加しても再解決できない。

### 1.3 二つの経路

```text
A. 常駐 preview / playback
Zustand → buildEditableRustScene → scene.replace(Project, media)
       → scene.evaluate(frame) → native overlay / presenter

B. direct snapshot（export と interim presenter を含む）
Zustand → buildRustSceneSnapshotForTimeline(time) → SceneSnapshot, media
       → surface gate / native renderer
```

経路 B は `sharedRendererPreviewBridge.ts:41-77` から `buildRustSceneSnapshotForTimeline` を呼び、export は同 bridge を `exportOriginal` で使う (`src/utils/sharedRendererExportSession.ts:48-81`)。そのため片方だけを新 wire に替えると、preview と export で参照先が再び分岐する。常駐結果を既存 surface gate に接続する入口は `sharedRendererEvaluatedScenePreviewSession.ts:26-51` に既にある。

### 1.4 Rust schema の到達度

`rust-core/src/schema.rs:3415-3712` には 42 kind の `TimelineObject` があり、各 variant は `BaseObject` と kind 固有 `*ObjectFields` の flatten で、project file / command の編集 object union として使われる。`Command` もこの union を受ける (`rust-core/src/command.rs:63-169`)。したがって新しい「全 object graph」の核として再利用できる。

ただしそのまま wire にできることは**未確認ではなく否定されている**。`Psd` variant は TS `PsdObject` と 1 対 1 の byte 互換ではないと明記されている (`schema.rs:3411-3414`)。また、評価用 `Project` は `TimelineObject[]` / `LayerState[]` / runtime path ではなく評価済み track と簡略 `MediaReference` を持つだけである。このため P1 で `EditableSceneGraph`（仮称）を schema に導入し、PSD runtime fields と preview proxy / export original の選択を明示する必要がある。全 field の TS 保存 JSON との byte 互換は P1 の schema fixture で確認するまで**未確認**とする。

### 1.5 既存キャッシュと無効化

- backend の image / PSD cache は path + mtime + size + active layer IDs + expected size を key にする (`rust-backend/src/state.rs:66-77`)。生成 media は `id`、kind、source JSON、寸法、active layer、source rate の hash を content revision にする (`source_frames.rs:216-231`)。
- native overlay も同じ source JSON / PSD active layer / file metadata を revision に含める (`native-overlay/src/lib.rs:4153-4232`)。audio reactive / video は `None` で毎フレーム扱いである (`:4157-4162`)。
- よって builder が media を Rust 側で再構築しても、**同じ意味の source と active layer が同じ canonical 表現で出ること**、変更時は session revision と source content revision の双方が進むことが必須である。

### 責務台帳（本計画の完了条件）

| 責務 | 現在 | 完了時 |
| --- | --- | --- |
| object graph→評価用 `Project` | TS `buildEditableRustScene` | Rust builder |
| object→`SceneMediaReference` / generator source JSON | TS `mediaReferenceForObject` | Rust builder |
| audio / GetColor / group-control 解決 | TS | Rust builder |
| frame 評価 | Rust `timeline.rs` | Rust（不変） |
| path 選択・PSD runtime metadata の取得 | TS/UI | wire で Rust builder に入力。ファイル I/O は既存 backend / overlay |
| UI state、RPC scheduling | TS | TS（不変） |

## 2. 目標アーキテクチャ（To-Be）

### 2.1 wire と所有権

`scene.replace` を次の意味へ変更する（名称は P1 で確定）。旧 `project` / `media` payload は feature flag 中だけ受理し、同一 revision で両 builder を比較できるようにする。

```text
SceneReplaceParams {
  scene_id, revision,
  editable_scene: {
    settings: ProjectSettings,
    layers: Vec<LayerState>,
    objects: Vec<TimelineObject>,
    media_context: { purpose: PreviewProxy | ExportOriginal, resolved local paths / PSD runtime fields }
  }
}
  → rust-core::build_evaluation_scene(editable_scene)
  → { project: Project, media: Vec<SceneMediaReference>, diagnostics }
  → SceneSession に raw graph と build 済み評価 scene を同一 revision で常駐
```

`rust-backend` は session の authoritative scene を保持できる。既に `scene.replace` が revision を単調増加で検査し (`rust-backend/src/scene.rs:45-68`)、`scene.evaluate` が resident state だけから評価する (`:78-140`) ためである。ただし Zustand と command RPC の二重更新をこの計画だけで廃止するかは、§6 の決定事項とする。初期移行は「TS が編集 graph 全量を replace、Rust が評価 scene の正本」とし、後に command.apply の結果を session に適用する最適化を別に判断する。

`media_context` は UI が所有するファイル選択結果を渡す境界である。preview は proxy を、export は original を選ぶ現行規則 (`rustSceneSnapshot.ts:2067-2075`) をそのまま Rust builder に移す。PSD は `activeLayerIds`、file path、必要なら root/layer metadata を raw graph / context で渡し、source JSON 内の `source_active_layer_ids` は Rust が canonical なソート順で生成する。

### 2.2 direct 経路の収束

direct caller は raw graph と目的（`PreviewProxy` / `ExportOriginal`）を `scene.build/evaluate` 相当の Rust RPC へ送るか、短命の scene session を作る。TS で `SceneSnapshot` を作らない。export のフレーム列では、同一 graph を一度 replace / build して各 frame を `evaluate` するため、全 graph を各 frame に送らない。Windows interim presenter もこの評価結果を既存の boundary validation と surface gate に渡す。

### 2.3 cache invalidation

- raw graph の変更は新 revision を作り、builder が media content revision の入力（source JSON、寸法、PSD active layers、proxy/original path）を更新する。
- backend / overlay の既存 cache key を維持し、canonical source JSON の key 順・配列順を Rust に固定する。GetColor の sample image / PSD metadata hash と PSD active layer の cache key を必ず通す。
- session replacement 時、revision が変わっても内容 revision が同じ media は GPU / source cache を再利用可能とする。media ID が削除された場合の cache eviction は現行 LRU に委ねる。明示 purge が必要かは性能測定まで**未確認**。

## 3. 段階的移行

全フェーズの共通ゲートは、既存 `rust-core/tests/ts_evaluation_parity.rs:264-295` の fixture parity（現状 447 frame、`KNOWN_DIFFERENCES.json` は空）と、preview/export の代表 E2E を維持することとする。fixture は `npm run fixture:evaluation-parity` で再生成される。

### P0: 契約固定と差分ハーネス拡張（小、2–4日）

**進捗（2026-09-13）**: TS 現行実装から生成・drift 検証する cross-object 契約 fixture と、Rust 側の構造 JSON 比較器・fixture 妥当性テストを追加した。Rust builder 比較は P1 実装まで ignore の pending test とし、production wire / runtime の変更は行っていない。

- **Scope**: raw graph builder の入出力を fixture 化し、現 TS serializer と将来 Rust builder の `Project` / media の構造比較器を作る。audio direct-ID の時間外選択、layer fallback の時間内限定、GetColor の path 優先・ID 不一致時 non-fallback・PSD sorted active layer、group-control の `0` / 同一 layer / hidden object を表にして固定する。
- **主なファイル**: `rust-core/tests/ts_evaluation_parity.rs`、新規 `rust-core/tests/editable_scene_builder_parity.rs`、`src/utils/rustSceneEvaluationParityFixture.ts`、`src/utils/rustSceneSnapshot.test.ts`、新しい fixture directory。
- **受入条件**: 447 frame snapshot parity に加え、各非対称規則の builder unit test が Rust で赤→緑になる。TS serializer の出力と fixture の全 media が byte 比較ではなく JSON 構造比較で一致する（JSON key order は仕様化前のため）。
- **rollback**: テストだけなので production wire は不変。差分が出たら P1 を開始しない。

### P1: Rust editable-scene builder と dual-run `scene.replace`（大、7–12日）

**進捗（2026-09-13、P1a 完了）**: `TimelineObject::Psd` の JSON 保存 shape を
TS `PsdObject` と照合し、`layerTree` を旧 `.uxfd` の保存値を失わない互換
フィールドとして Rust schema に追加した。`rootLayer`、`activeLayerIds`、
`filePath`、寸法、`lipSync`、`worldPlacement` は既存どおり Rust の編集モデル
で往復する。`File` と `ImageBitmap` は非 JSON runtime 値のため対象外であり、
builder/wire の変更はまだ行っていない。

**進捗（2026-09-13、P1b 着手）**: `rust-core` に純粋な
`EditableSceneGraph` / `build_evaluation_scene` を追加し、P0 の12 cross-object
契約ケースを Rust builder 経由で通した。常駐経路は現行 TS と同様に object の
`startTime` で resolver を実行する。未移植kind は明示 diagnostic とし、P1c の
wire cut-over は行っていない。詳細と残作業は
`progress/scene-build-p1b-rust-builder.md` を参照する。

**追補（2026-09-13）**: builder の canonical media dispatch を全 generated kind
へ拡張し、resident の対応済み effects、position keyframes、wipe、subject crop、fade を
移植した。fixture generator は各 realistic scene の TS editable Project/media と
raw graph も保存し、Rust 側で 3 scene / 447 frame の構造 parity（診断ゼロ）を検証
する。ただし既存 fixture は 42 kind を網羅しておらず、runtime の dual-run/cut-over
と全 kind coverage scene は未完了である。未対応 feature は clip を返さず明示診断を
返す。特殊 clamp を持つ一部 generated serializer と smart_clipping/auto_blur 等は
未確認のため diagnostic として拒否する。

- **Scope**: `rust-core` に `EditableSceneGraph` / runtime media context と純粋 `build_evaluation_scene` を追加する。42 kind の raw graph を入力に、visible layer の clip/track、media、group control を作る。`rust-backend::scene` は flag 下で raw graph を受け、旧 TS `project/media` と Rust build 結果を比較してから旧結果を常用する。
- **主なファイル**: `rust-core/src/schema.rs`、新規 `rust-core/src/editable_scene_builder.rs`、`rust-core/src/lib.rs`、`rust-backend/src/scene.rs`、`rust-backend/src/state.rs`、`src/utils/rustBackendSceneControl.ts`、`src/utils/editableRustScenePreviewController.ts`、生成型 / schema。
- **テスト**: P0 fixture、schema deserialize/round-trip、`scene.replace` stale revision test、PSD/media path case、`cargo test -p rust-core -p rust-backend`。
- **受入条件**: dual-run で `Project`、media、447 frames の評価済み snapshot が一致し、preview と export の source JSON（audio / GetColor / PSD を含む）が一致する。payload size と replace latency を計測し基準値を記録する（閾値は §6 で決める）。
- **rollback**: flag を旧 `project/media` builder に戻す。wire は両方を受理するため既存 session は継続する。

### P2: kind 群ごとの Rust builder cut-over と両経路収束（大、8–15日）

- **Scope**: 低依存 kind（shape/text/image/video/PSD）から、生成系、最後に audio / GetColor / group-control の順に Rust build 結果を常用する。direct snapshot caller を短命 / resident Rust scene 評価へ変え、`buildRustSceneSnapshotForTimeline` の評価済み出力を使わない。各 kind 群ごとに dual-run を残して切替える。
- **主なファイル**: `src/utils/sharedRendererPreviewBridge.ts`、`src/utils/sharedRendererPreviewSession.ts`、`src/utils/sharedRendererExportSession.ts`、`src/utils/sharedRendererEvaluatedScenePreviewSession.ts`、export orchestration、`electron/main.ts:615-622,1290-1306`、`native-overlay/src/lib.rs`、`rust-backend/src/source_frames.rs`、`native-wgpu-renderer/src/lib.rs`。
- **テスト**: kind 群ごとの media source fixture、`sharedRendererExportSession` / surface gate tests、native overlay の cache revision tests、native renderer audio/GetColor tests、447-frame parity、既存 video export E2E。
- **受入条件**: preview、native overlay、export、Windows interim presenter が同じ Rust-built media を消費する。各 cut-over で 447-frame parity と export parity が緑。audio direct-ID / layer fallback、GetColor 4規則、group-control 4規則が Rust unit test と E2E fixture に存在する。
- **rollback**: kind feature flag を旧 direct serializer に戻す。P2 完了まで旧 serializer と bridge は残す。

### P3: TS serializer の撤去と責務台帳の解消（中、4–7日）

- **Scope**: `mediaReferenceForObject`、3 resolver、generator source の TS serialization、`buildEditableRustScene`、`buildRustSceneSnapshotForTimeline` を削除または Rust RPC の型-only adaptor に縮小する。TS boundary validator は Rust response の防御として残すかをレビューする。ADR-014 の逸脱記録と責務台帳を更新する。
- **主なファイル**: `src/utils/rustSceneSnapshot.ts`、`src/utils/editableRustScene.ts`、`src/utils/sharedRendererPreviewBridge.ts` と各テスト、`progress/cross-object-wiring-to-rust.md`、`markdown/Rust_Source_Of_Truth_Plan.md`、`markdown/architecture/01-decision-record.md`。
- **テスト**: `rg` による削除対象 import / serializer 残存チェック、type generation drift、Rust builder tests、447-frame fixture、native/export E2E。
- **受入条件**: TS が `SceneSnapshot` / `SceneMediaReference` の値を組み立てず、4つのクロスオブジェクト規則の実装は Rust に一箇所だけ存在する。責務台帳の第1項目を解消済みにできる。
- **rollback**: P2 で旧経路を完全削除する前に release を一度挟む。削除後の rollback は P2 時点の互換 wire を復元するリリース revert とする。

### P4: UI 評価値の Rust 評価結果への付け替えと TS 評価関数の削除（中、5–8日、2026-09-13 決定で追加）

- **Scope**: §7 の表にある UI 側の TS 評価利用（`PropertyPanel.tsx` の現在値表示、`SceneSelectionDecorationLayer.tsx` の選択枠位置、`visionTrackingKeyframes.ts`、`storeHelpers.ts` / `useStore.ts` の位置評価）を、常駐 session の `scene.evaluate` 結果の購読へ付け替える。その後 `keyframes.ts` の評価関数、`easings.ts` の `easingFunctions`、`objectVisibility.ts`、`sceneTransforms.ts` の `getGroupTransforms` / `getVibrationOffset`、`subjectCropKeyframes.ts` を削除し、R2 を完了させる。
- **担当**: 購読・評価 RPC・ストア配線は Codex、表示コンポーネント側の付け替えで見た目の確認が要る部分は UI 担当として分離する。
- **テスト**: 各 UI 利用箇所の表示値が 447-frame fixture の Rust 評価値と一致する vitest、ドラッグ・再生中の購読頻度と `scene.evaluate` 呼び出し回数の計測、既存 E2E。
- **受入条件**: 上記モジュールが non-test から import されない（型・定数のみ残す場合は理由を記録）。選択枠と PropertyPanel の値が Rust 評価と一致し、ドラッグ・スクラブ時の表示遅延が P1 で記録した基準値から悪化しない。`Rust_Source_Of_Truth_Plan.md` の R2 を★完了に更新できる。
- **rollback**: 付け替えは UI 箇所ごとに flag で旧 TS 評価へ戻せるようにし、全箇所の切替後に TS 関数を削除する。

## 4. リスクと緩和策

| リスク | 影響 | 緩和策 |
| --- | --- | --- |
| frame ごとに raw graph を送る | IPC / GC / scrub 遅延 | raw graph は replace 時のみ送る。direct export は session を一度構築し frame は index のみ送る。|
| raw graph payload が大きい | 編集中の replace が遅い | P1 で size / RTT を計測。初期は全量 replace、閾値超過時のみ command.apply による resident graph 更新を次計画にする。|
| canonical JSON の相違で native cache miss | CPU/GPU 再生成、ちらつき | Rust の serializer を唯一化し、source/active layer/revision の構造 fixture と overlay/backend cache test を追加する。|
| Windows interim presenter が旧 direct snapshot を要求 | attach 窓だけ別挙動 | P2 の受入条件に Windows interim path を含め、`SharedRendererEvaluatedScenePreviewSession` に Rust 評価を接続する。|
| export が preview と別の source path を選ぶ | proxy が export に混入、画質差 | `media_context.purpose` を明示し、previewProxy/exportOriginal を同じ Rust function の分岐にする。|
| PSD raw object が schema と byte 互換でない | graph を Rust が deserialize できない | P1 の最初に PSD adapter/wire を固定し、active layer / path / layer metadata の round-trip fixture を必須にする。未解決なら PSD を cut-over 対象外にして P2 を止める。|
| Rust session と Zustand の authoritative state が競合 | command 応答で UI の後発変更を消す | 既存 filter/layer command の revision / stale-response 規則を踏襲する。session authoritative 化は P1 の必須範囲に入れず、明示判断後にのみ実施する。|

## 5. 提案 ADR-017: 編集 object graph からの評価 scene 構築を Rust に一本化する

**状態**: 提案

### 判断

`scene.replace` および direct evaluation の入力を、TS が射影済みの `Project` / `SceneMediaReference` から editable object graph へ移す。`rust-core` が graph から評価用 `Project` と media references を構築し、クロスオブジェクト参照と generator source JSON の唯一の実装を持つ。

### 理由

現在の TS serializer は audio、GetColor、group-control の解決に必要な候補 object、layer visibility、時間窓、PSD active layer を、Rust 到達前に情報落ちした文字列 / track ID に変換する。このため resolver 関数を Rust に追加するだけでは TS と Rust の二重実装になり、ADR-014 の「編集モデル・評価の正本は Rust」に反する。raw graph を一度渡せば、既存 `timeline::evaluate_frame` と native renderer source cache を同じ Rust ownership 下で再利用できる。

### 却下した案

- generator source JSON に未解決参照だけを足し、renderer 側で解決する。候補 object、可視性、時間、PSD state を全 consumer に再配布する必要があり、backend / overlay / export の cache invalidation が分裂するため却下する。
- TS の resolver を残し、Rust に同名の純粋関数だけを置く。Rust call site が必要入力を受けないため、正本を増やすだけになるため却下する。
- 毎フレーム評価済み snapshot を送る。基本方針 6（フレーム単位 JSON 転送禁止）に反するため却下する。

## 6. ユーザーの決定が必要な未解決事項

**決定済み（2026-09-13、ユーザー判断）**

| # | 論点 | 決定 | P1以降への影響 |
| --- | --- | --- | --- |
| 1 | session の authoritative 範囲 | 評価用 scene のみ。編集 command の session 内適用は後続計画へ切り出す | P1 は「TS が編集 graph 全量を replace、Rust が評価 scene の正本」で開始 |
| 2 | payload size / RTT 上限 | 未決（P1 で計測してから決める） | P1 受入条件の計測値を基に再判断 |
| 3 | PSD schema | **`TimelineObject::Psd` を TS `PsdObject` と完全一致へ拡張**（runtime context で補う案は不採用） | P1 冒頭に PSD schema 拡張サブフェーズ（P1a）を置く。保存形式 `.uxfd` の読み書き round-trip と既存プロジェクトファイル互換を受入条件に追加 |
| 4 | direct export の方式 | 短命 session に統一（`scene.replace` → 各 frame `scene.evaluate`） | P2 で `sharedRendererExportSession` を短命 session 化。新 RPC は追加しない |
| 5 | UI 評価値の付け替え | 本計画に P4 として追加（§3 P4） | P3 完了後に実施し R2 を完全に閉じる |

以下は決定前の論点の原文（記録として残す）。

1. Rust session を「評価用 scene のみ authoritative」として P1 を始め、編集 command の session 内適用は後続に切り出してよいか。それとも command.apply と session graph を P1 から同時に一本化するか。
2. raw graph `scene.replace` の payload size / RTT の許容上限を何 ms / MiB にするか。現状の計測値は本調査で取得しておらず**未確認**である。
3. PSD の `TimelineObject::Psd` が TS `PsdObject` と byte 互換ではない点を、専用 runtime context で補うか、P1 で schema を完全一致へ拡張するか。前者は小さく、後者は保存形式の正本性が高い。
4. direct export を short-lived session に統一するか、`scene.buildAndEvaluate` の純粋 RPC を追加するか。前者は wire を再利用でき、後者は export lifecycle を明示できる。性能比較は未確認である。
5. UI が評価済み値を必要とする箇所（下記 §7）を、`scene.evaluate` 結果の購読へ付け替えるのを P3 に含めるか、別計画に切り出すか。

## 7. `Rust_Source_Of_Truth_Plan.md` R2 残作業との関係（2026-09-13 親レビューで追記）

R2 は「TS 評価経路（経路 B）を消す」ことが本来の目標だったが、実施されたのは TS と Rust の評価差 3 クラス（source_frame 規約、keyframe clamp、subject crop 二重焼き込み）の解消までで、R2 節の削除対象は 2026-09-13 時点ですべて残っている。

| R2 削除対象 | 現在の non-test 利用箇所 |
| --- | --- |
| `src/utils/keyframes.ts` `evaluateObjectPositionAtTime` 等 | `rustSceneSnapshot.ts:49,198`、`visionTrackingKeyframes.ts:2`、`storeHelpers.ts`、`useStore.ts`、`PropertyPanel.tsx`、`SceneSelectionDecorationLayer.tsx` |
| `src/utils/easings.ts` | `types.ts`、`PropertyPanel.tsx` |
| `src/utils/objectVisibility.ts` | `rustSceneSnapshot.ts:50` |
| `src/utils/sceneTransforms.ts` `getGroupTransforms` / `getVibrationOffset` | `rustSceneSnapshot.ts:51,200`、`visionTrackingKeyframes.ts:3` |
| `src/utils/subjectCropKeyframes.ts` | `rustSceneSnapshot.ts:52` |
| `filterStack.ts` `getEnabledObjectFiltersInOrder` / `getFadeOpacityMultiplier` | `rustSceneSnapshot.ts:48` |

本計画の P2（direct 経路の Rust 評価への収束）と P3（TS serializer 撤去）が完了すると、`rustSceneSnapshot.ts` 経由の利用は消える。残るのは UI の評価済み値の利用（PropertyPanel の現在値表示、選択枠の位置、vision tracking）であり、これらを `scene.evaluate` 結果の購読へ付け替えない限り TS の評価関数は削除できない（R2 節の「性能上の要注意点」§7 設計判断 4 と同じ論点）。

- P3 の受入条件に「`rustSceneSnapshot.ts` から上表の評価関数 import が消える」ことを加える。
- UI 利用の付け替えと評価関数そのものの削除は、§6 決定事項 5 の結論に従い P4 として追加するか別計画にする。P4 とする場合の受入条件は「上表のモジュールが non-test から import されない、または型・定数のみになる」「選択枠・PropertyPanel の表示値が 447-frame fixture の Rust 評価値と一致する」とする。
