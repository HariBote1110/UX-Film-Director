//! コマンド層: undo/redo が実際にスナップショットしている
//! `SceneData`（objects/layers/camera/stageCamera3D。R4-1a の 42 kind
//! `TimelineObject` 判別共用体をベースとする実際の編集状態）を対象に、
//! 二層構成の `Command` を提供する。
//!
//! ## 状態型の選定（R4-6）
//!
//! `historySlice.ts`（`pushHistory`/`undo`/`redo`）が実際にスナップショット
//! しているのは `objects`/`layers`/`camera`/`stageCamera3D` の 4 フィールドの
//! みであり（`id`/`name`/`duration` は含まれない。`duration` は
//! `calculateAutoDuration(objects)` から undo/redo のたびに再計算される）、
//! これは `rust-core/src/schema.rs` の `SceneData` から `id`/`name`/`duration`
//! を除いた形とちょうど一致する。`schema.rs` にはもう一つ `Project`
//! （`Clip`/`Track` ベース、R0 由来の評価器 MVP モデルで `id`/`version`/`size`/
//! `fps`/`colour`/`media`/`tracks`/`group_controls` を持つ）があるが、これは
//! 実際のエディタ編集状態とは無関係の別モデルであり、`historySlice` は
//! これを一切参照していない。よってコマンド層は `SceneData` を対象とする
//! （`duration` は `apply_command` 側では変更しない — 呼び出し側が
//! `calculateAutoDuration` 相当を再計算する既存の役割分担を保つ）。
//!
//! ## MVP `SetClipOpacity` の扱い（R4-6）
//!
//! R4-1a 以前の MVP は `Project`/`Clip` モデル専用の `SetClipOpacity` の
//! みを持っていた。`rust-backend`/`src/` のいずれからも
//! `Command`/`apply_command`/`CommandError`/`AppliedCommand` を参照する
//! コードは存在せず（配線は R4-8 で行う予定のまま未着手）、外部依存はない。
//! `SetClipOpacity` が対象としていた「単一フィールドの不透明度編集」は、
//! 汎用 `SetObjectField { object_id, field: "opacity", .. }` で表現でき、
//! 個別バリアントを残す理由がないため **廃止して `SetObjectField` へ統合
//! （fold）した**。専用の構造コマンド（AddObject/RemoveObject/
//! ReorderLayer/Filter 系/SetCamera/SetStageCamera3D 等）は R4-7 で追加する。

use std::collections::BTreeSet;

use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use ts_rs::TS;

use crate::schema::{
    AsanohaPatternObjectFields, AudioObjectFields, AudioSphereObjectFields,
    AudioVisualizationObjectFields, BarcodeObjectFields, BaseObject, CameraState,
    CircularArrowObjectFields, ClippingParams, ColorCorrection, ColourWheelObjectFields,
    ContourTraceObjectFields, DisplacementPolyObjectFields, FocusLinesPlusObjectFields,
    GearObjectFields, GetColorDotFieldObjectFields, GourdObjectFields, GradientFilterParams,
    GroupControlObjectFields, HistogramObjectFields, HksyCheckerGridObjectFields,
    HologramObjectFields, HoundstoothObjectFields, ImageObjectFields, LayerState, ObjectFilter,
    PaperAirplaneObjectFields, ParticleObjectFields, PieChartObjectFields,
    PlainEffectorLineObjectFields, ProtractorObjectFields, PsdObjectFields,
    PuzzlePieceObjectFields, RandomLineExObjectFields, RegionFrameObjectFields, SceneData,
    ShadowEffect, ShakingPolygonObjectFields, ShapeGradientFill, ShapeObjectFields,
    ShatteredSphereObjectFields, SimpleTubeObjectFields, SphereDotsObjectFields,
    SphericalFieldObjectFields, StageCamera3D, SunburstObjectFields, TartanCheckObjectFields,
    TextObjectFields, TimelineObject, ToneCurveObjectFields, TrackBarObjectFields,
    TriangleBracketObjectFields, Vibration, VideoObjectFields, YagasuriObjectFields,
};

/// 編集コマンド。第一層（本バッチ）は 42 kind 共通の汎用フィールド編集
/// `SetObjectField` のみを持つ。構造変更コマンド（オブジェクト追加/削除/
/// 並び替え/フィルタ操作/カメラ設定等）は第二層として R4-7 で追加する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind")]
pub enum Command {
    /// `SceneData.objects` 中の `object_id` を持つオブジェクトの 1 フィールド
    /// を `next` に書き換える。`previous` は undo 用に呼び出し側が明示する
    /// （`apply_command` は現在値の読み取りではなく、この `previous` が
    /// 実際に一致していることを検証しない — 楽観的コマンドであり、
    /// `invert` は `next`/`previous` を単純に入れ替えるだけで済む）。
    #[serde(rename = "setObjectField")]
    SetObjectField {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        field: String,
        next: Value,
        previous: Value,
    },

    /// `SceneData.objects` へ `object` を `index`（0..=len）位置に挿入する。
    /// `src/store/useStore.ts` の `addObject` に対応するが、TS 側は常に
    /// 末尾追加（`index == objects.len()`）である一方、`invert(RemoveObject)`
    /// が任意位置への復元を必要とするため、コマンドとしては任意の `index`
    /// を許容する（R4-8 で `addObject` を配線する際は常に `objects.len()` を
    /// 渡せばよい）。
    #[serde(rename = "addObject")]
    AddObject {
        object: TimelineObject,
        index: usize,
    },

    /// `SceneData.objects` から `index` 位置にある `object_id` のオブジェクトを
    /// 削除する。`removed` は undo 用に呼び出し側が明示する（`SetObjectField`
    /// と同じ楽観的コマンドの流儀）。`index` は「削除対象がその位置に実在する
    /// こと」の検証にも使う — `deleteObject` は id でフィルタするだけで
    /// 位置を意識しないが、`invert(RemoveObject)` で元の位置へ正確に
    /// 復元するにはコマンド自体が位置を保持する必要があるため。
    #[serde(rename = "removeObject")]
    RemoveObject {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        removed: TimelineObject,
        index: usize,
    },

    /// `SceneData.layers[index]` を丸ごと `next` へ置き換える。
    /// `layerSlice.ts` の `setLayerName`/`toggleLayerVisibility`/
    /// `toggleLayerLock` はいずれも「1 レイヤーの `LayerState` を丸ごと
    /// 差し替える」操作であり、`SetObjectField` のようなフィールド単位の
    /// 汎用パスを別途設けるより、`LayerState` が 3 フィールドしかない
    /// 軽量な値であることを活かして丸ごと swap するほうが単純で済む。
    #[serde(rename = "setLayerState")]
    SetLayerState {
        index: usize,
        next: LayerState,
        previous: LayerState,
    },

    /// `SceneData.layers` と `SceneData.objects` を丸ごと差し替える。
    /// `layerSlice.ts` の `swapLayerTracks`/`insertLayerTrackAt`/
    /// `deleteLayerTrackAt`（`src/utils/layerTrackOps.ts` 実装）は、
    /// レイヤー入れ替え・挿入・削除のたびに全オブジェクトの `layer`
    /// フィールド（および PSD の lipSync ターゲットや audio_visualization の
    /// targetLayer）を再計算し、挿入で `MAX_LAYERS` を超えるオブジェクトを
    /// 削除するなど、単純な配列操作では表現できない副作用を持つ。この
    /// 複雑なリマップロジックを Rust 側で再実装すると TS 側の実装と
    /// 挙動がずれるリスクがあるため、`historySlice.ts` の
    /// `pushHistory`/`undo`/`redo` が既に採用している「変更前後の全状態を
    /// スナップショットして丸ごと差し替える」方式をこのコマンドでも踏襲する
    /// （呼び出し側の TS が `layerTrackOps.ts` で計算した結果をそのまま
    /// `next_layers`/`next_objects` として渡す）。
    #[serde(rename = "reorderLayers")]
    ReorderLayers {
        #[serde(rename = "previousLayers")]
        #[ts(rename = "previousLayers")]
        previous_layers: Vec<LayerState>,
        #[serde(rename = "nextLayers")]
        #[ts(rename = "nextLayers")]
        next_layers: Vec<LayerState>,
        #[serde(rename = "previousObjects")]
        #[ts(rename = "previousObjects")]
        previous_objects: Vec<TimelineObject>,
        #[serde(rename = "nextObjects")]
        #[ts(rename = "nextObjects")]
        next_objects: Vec<TimelineObject>,
    },

    /// `object_id` の `BaseObject.filters` の `index`（0..=len）位置へ
    /// `filter` を挿入する。`src/utils/filterStack.ts` の
    /// `addFilterToObject` は常に末尾追加（`index == filters.len()`）だが、
    /// `AddObject`/`RemoveObject` と同じ理由で任意位置への挿入を許容する
    /// （`invert(RemoveFilter)` が元の位置へ正確に復元するため）。
    #[serde(rename = "addFilter")]
    AddFilter {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        filter: ObjectFilter,
        index: usize,
    },

    /// `object_id` の `filters[index]` にある `filter_id` のフィルタを削除
    /// する。`removeFilterFromObject`（id でフィルタするだけ）に対応するが、
    /// `AddFilter` と対になる `index` を保持する。
    #[serde(rename = "removeFilter")]
    RemoveFilter {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        #[serde(rename = "filterId")]
        #[ts(rename = "filterId")]
        filter_id: String,
        removed: ObjectFilter,
        index: usize,
    },

    /// `object_id` の `filters` 中 `filter_id` の `enabled` を反転する。
    /// `toggleFilterEnabledInObject` は `!filter.enabled` を書き込むだけの
    /// 自己逆操作（同じコマンドをもう一度 apply すれば元に戻る）なので、
    /// `next`/`previous` を持たない。
    #[serde(rename = "toggleFilterEnabled")]
    ToggleFilterEnabled {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        #[serde(rename = "filterId")]
        #[ts(rename = "filterId")]
        filter_id: String,
    },

    /// `object_id` の `filters` 中 `filter_id` を `from_index` から
    /// `to_index` へ移動する（配列の remove + insert）。
    /// `moveFilterInObject` は `direction: 'up' | 'down'` を受け取り、
    /// 対象が配列の端にあるときは無操作（無視）にクランプする —
    /// このクランプは呼び出し側（TS）の責務のまま維持し、コマンド自体は
    /// クランプ後の具体的な `from_index`/`to_index` のみを持つ
    /// （`SetObjectField` の `next`/`previous` と同じ「呼び出し側が最終値を
    /// 明示する」設計）。**意図的なクランプ**: `to_index == from_index` は
    /// 「既に端にあり移動しない」ケースを表す正当な無操作として許可し、
    /// エラーにはしない（`apply_command` はシーンを変更せず `Ok` を返す）。
    #[serde(rename = "moveFilter")]
    MoveFilter {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        #[serde(rename = "filterId")]
        #[ts(rename = "filterId")]
        filter_id: String,
        #[serde(rename = "fromIndex")]
        #[ts(rename = "fromIndex")]
        from_index: usize,
        #[serde(rename = "toIndex")]
        #[ts(rename = "toIndex")]
        to_index: usize,
    },

    /// `object_id` の `filters` 中 `filter_id` の `params` を部分パッチする。
    /// `updateFilterParamsInObject` の `{ ...filter.params, ...paramsPatch }`
    /// マージ + `normaliseFilter` 再検証と同じ意味論を、`next`/`previous` を
    /// 「変更されたキーのみを含む部分オブジェクト」として持つことで表現する
    /// （`SetObjectField` のフィールド単位パッチと同じ「patch は部分マージ」
    /// パターン）。
    #[serde(rename = "updateFilterParams")]
    UpdateFilterParams {
        #[serde(rename = "objectId")]
        #[ts(rename = "objectId")]
        object_id: String,
        #[serde(rename = "filterId")]
        #[ts(rename = "filterId")]
        filter_id: String,
        next: Value,
        previous: Value,
    },

    /// `SceneData.camera` を丸ごと差し替える。`CameraState` は 4 フィールド
    /// の値型で、フィールド単位の部分編集を UI 側が要求する場面がないため
    /// （カメラパン/ズーム操作は毎フレーム全体を再計算する）、丸ごと swap
    /// が最も単純で誤りが起きにくい。
    #[serde(rename = "setCamera")]
    SetCamera {
        next: CameraState,
        previous: CameraState,
    },

    /// `SceneData.stage_camera_3d` を丸ごと差し替える。`SetCamera` と同じ
    /// 理由で丸ごと swap を採用する。
    #[serde(rename = "setStageCamera3D")]
    #[ts(rename = "setStageCamera3D")]
    SetStageCamera3D {
        next: StageCamera3D,
        previous: StageCamera3D,
    },

    /// 複数の `Command` を「1 個の undo ステップ」として束ねる（R4-8 で判明
    /// した複数オブジェクト削除/分割/貼り付け/グループ化等、11 の UI 操作に
    /// 対応するために追加した）。
    ///
    /// - **apply は all-or-nothing**: `commands` を作業用コピー上へ順番に
    ///   適用し、途中の 1 つでも失敗したらその `CommandError` をそのまま
    ///   返す。元の `scene`（呼び出し元が保持する参照）は一切変更しない
    ///   （`apply_command` はどのバリアントでも「ローカル clone 上でのみ
    ///   変更し、失敗したら破棄する」設計を貫いているため、`Batch` も他の
    ///   バリアントと同じ規約に従うだけで自然に成立する）。
    /// - **invert は逆順**: `invert(Batch[a, b, c]) == Batch[invert(c),
    ///   invert(b), invert(a)]`。一部だけ undo するという状態は存在しない
    ///   （apply が all-or-nothing のため、Batch は「全部成功した」か
    ///   「一切適用されていない」のいずれかでしか履歴に積まれない）ので、
    ///   単純な逆順 + 各要素の invert で正しい undo になる。
    /// - **入れ子は拒否**: `commands` に `Command::Batch` 自体が含まれる
    ///   場合は `apply_command` が `CommandError::NestedBatch` を返す。
    ///   nested Batch を許すと「内側の Batch が部分失敗したら外側はどこまで
    ///   ロールバックするか」を再帰的に考える必要が生じ、invert の逆順則
    ///   （フラットな 1 段の逆順で十分）が壊れるため、設計をシンプルに保つ
    ///   ためにあえて禁止する。
    /// - **空 Batch は拒否**: `commands` が空の `Batch` は
    ///   `CommandError::EmptyBatch` で apply 時に拒否する。呼び出し側
    ///   （UI）が「対象 0 件の操作」を誤って undo 履歴へ積んでしまうと、
    ///   undo/redo が何もしないスタックエントリを生み、ユーザーから見て
    ///   「undo を押しても何も起きない」不可解な挙動になるため、
    ///   コマンド構築側（呼び出し元）に「積む前に対象が 1 件以上あるか」を
    ///   確認させる設計とした。
    #[serde(rename = "batch")]
    Batch { commands: Vec<Command> },
}

/// コマンド適用が失敗した理由。
#[derive(Debug, Clone, PartialEq)]
pub enum CommandError {
    /// `object_id` を持つオブジェクトが `SceneData.objects` に存在しない。
    ObjectNotFound { object_id: String },
    /// `field` が対象 kind の既知フィールドではない、または `next` を
    /// 適用した結果が対象 kind として無効（型不一致等）だった。
    InvalidFieldPatch {
        object_id: String,
        field: String,
        reason: String,
    },
    /// `AddObject` の `object.id` が既に `SceneData.objects` に存在する。
    DuplicateObjectId { object_id: String },
    /// `AddObject`/`AddFilter` の `index` が挿入先の長さ（0..=len）を
    /// 超えている、または `RemoveObject`/`RemoveFilter`/`SetLayerState` の
    /// `index` が対象配列の範囲外。
    IndexOutOfRange {
        index: usize,
        len: usize,
        context: String,
    },
    /// `RemoveObject`/`RemoveFilter` の `index` にある要素の id が
    /// コマンドで指定された id と一致しない（配列がコマンド発行後にずれた
    /// ことを示す — 楽観的コマンドが前提とする「index は発行時点の位置」が
    /// 崩れているため安全のため拒否する）。
    IndexMismatch {
        expected_id: String,
        actual_id: String,
        index: usize,
    },
    /// `filter_id` を持つフィルタが対象オブジェクトの `filters` に存在しない。
    FilterNotFound { object_id: String, filter_id: String },
    /// パッチ適用後の `ObjectFilter`/`LayerState`/`CameraState`/
    /// `StageCamera3D` の値が型として無効（deserialize 失敗）。
    InvalidFilterPatch {
        object_id: String,
        filter_id: String,
        reason: String,
    },
    /// `Batch` の `commands` が空だった。
    EmptyBatch,
    /// `Batch` の `commands` に `Command::Batch` 自体が含まれていた
    /// （入れ子の Batch は許可しない）。
    NestedBatch,
}

/// `command` を `scene` に適用し、新しい `SceneData` を返す。
///
/// 失敗時は `scene` を変更しない（`next_scene` はローカルの clone 上でのみ
/// 変更し、検証に失敗したら破棄する）。
pub fn apply_command(scene: &SceneData, command: &Command) -> Result<SceneData, CommandError> {
    let mut next_scene = scene.clone();
    match command {
        Command::SetObjectField {
            object_id,
            field,
            next,
            ..
        } => {
            if field == "type" {
                return Err(CommandError::InvalidFieldPatch {
                    object_id: object_id.clone(),
                    field: field.clone(),
                    reason: "type フィールドは構造コマンド専用のため SetObjectField では変更できません"
                        .to_string(),
                });
            }

            let index = next_scene
                .objects
                .iter()
                .position(|object| base_of(object).id == *object_id)
                .ok_or_else(|| CommandError::ObjectNotFound {
                    object_id: object_id.clone(),
                })?;

            let known_fields = known_field_names(&next_scene.objects[index]);
            if !known_fields.contains(field.as_str()) {
                return Err(CommandError::InvalidFieldPatch {
                    object_id: object_id.clone(),
                    field: field.clone(),
                    reason: format!("kind に存在しないフィールドです: {field}"),
                });
            }

            let mut patched_value = serde_json::to_value(&next_scene.objects[index])
                .map_err(|error| CommandError::InvalidFieldPatch {
                    object_id: object_id.clone(),
                    field: field.clone(),
                    reason: format!("オブジェクトの直列化に失敗しました: {error}"),
                })?;
            patched_value
                .as_object_mut()
                .expect("TimelineObject は常に JSON object へ直列化される")
                .insert(field.clone(), next.clone());

            let patched_object: TimelineObject = serde_json::from_value(patched_value)
                .map_err(|error| CommandError::InvalidFieldPatch {
                    object_id: object_id.clone(),
                    field: field.clone(),
                    reason: format!("パッチ適用後の値が対象 kind として無効です: {error}"),
                })?;

            next_scene.objects[index] = patched_object;
        }

        Command::AddObject { object, index } => {
            let object_id = base_of(object).id.clone();
            if next_scene
                .objects
                .iter()
                .any(|existing| base_of(existing).id == object_id)
            {
                return Err(CommandError::DuplicateObjectId { object_id });
            }
            let len = next_scene.objects.len();
            if *index > len {
                return Err(CommandError::IndexOutOfRange {
                    index: *index,
                    len,
                    context: "AddObject".to_string(),
                });
            }
            next_scene.objects.insert(*index, object.clone());
        }

        Command::RemoveObject {
            object_id,
            index,
            ..
        } => {
            let len = next_scene.objects.len();
            if *index >= len {
                return Err(CommandError::IndexOutOfRange {
                    index: *index,
                    len,
                    context: "RemoveObject".to_string(),
                });
            }
            let actual_id = base_of(&next_scene.objects[*index]).id.clone();
            if actual_id != *object_id {
                return Err(CommandError::IndexMismatch {
                    expected_id: object_id.clone(),
                    actual_id,
                    index: *index,
                });
            }
            next_scene.objects.remove(*index);
        }

        Command::SetLayerState { index, next, .. } => {
            let len = next_scene.layers.len();
            if *index >= len {
                return Err(CommandError::IndexOutOfRange {
                    index: *index,
                    len,
                    context: "SetLayerState".to_string(),
                });
            }
            next_scene.layers[*index] = next.clone();
        }

        Command::ReorderLayers {
            next_layers,
            next_objects,
            ..
        } => {
            next_scene.layers = next_layers.clone();
            next_scene.objects = next_objects.clone();
        }

        Command::AddFilter {
            object_id,
            filter,
            index,
        } => {
            let object_index = find_object_index(&next_scene, object_id)?;
            let filters = filters_mut(&mut next_scene.objects[object_index]);
            let len = filters.len();
            if *index > len {
                return Err(CommandError::IndexOutOfRange {
                    index: *index,
                    len,
                    context: "AddFilter".to_string(),
                });
            }
            let filter_value =
                serde_json::to_value(filter).map_err(|error| CommandError::InvalidFilterPatch {
                    object_id: object_id.clone(),
                    filter_id: filter_id_of(filter),
                    reason: format!("フィルタの直列化に失敗しました: {error}"),
                })?;
            let normalised_value = normalise_filter_value(filter_value).ok_or_else(|| {
                CommandError::InvalidFilterPatch {
                    object_id: object_id.clone(),
                    filter_id: filter_id_of(filter),
                    reason: "未知のフィルタ種別です".to_string(),
                }
            })?;
            let normalised_filter = serde_json::from_value(normalised_value).map_err(|error| {
                CommandError::InvalidFilterPatch {
                    object_id: object_id.clone(),
                    filter_id: filter_id_of(filter),
                    reason: format!("正規化後のフィルタが無効です: {error}"),
                }
            })?;
            filters.insert(*index, normalised_filter);
            sync_legacy_effects_with_filters(&mut next_scene.objects[object_index]);
        }

        Command::RemoveFilter {
            object_id,
            filter_id,
            index,
            ..
        } => {
            let object_index = find_object_index(&next_scene, object_id)?;
            let filters = filters_mut_with_preferred_id(
                &mut next_scene.objects[object_index],
                Some(filter_id),
            );
            let len = filters.len();
            if *index >= len {
                return Err(CommandError::IndexOutOfRange {
                    index: *index,
                    len,
                    context: "RemoveFilter".to_string(),
                });
            }
            let actual_id = filter_id_of(&filters[*index]);
            if actual_id != *filter_id {
                return Err(CommandError::IndexMismatch {
                    expected_id: filter_id.clone(),
                    actual_id,
                    index: *index,
                });
            }
            filters.remove(*index);
            sync_legacy_effects_with_filters(&mut next_scene.objects[object_index]);
        }

        Command::ToggleFilterEnabled {
            object_id,
            filter_id,
        } => {
            let object_index = find_object_index(&next_scene, object_id)?;
            let filters = filters_mut_with_preferred_id(
                &mut next_scene.objects[object_index],
                Some(filter_id),
            );
            let filter = filters
                .iter_mut()
                .find(|filter| filter_id_of(filter) == *filter_id)
                .ok_or_else(|| CommandError::FilterNotFound {
                    object_id: object_id.clone(),
                    filter_id: filter_id.clone(),
                })?;
            set_filter_enabled(filter, !filter_enabled(filter));
            sync_legacy_effects_with_filters(&mut next_scene.objects[object_index]);
        }

        Command::MoveFilter {
            object_id,
            filter_id,
            from_index,
            to_index,
        } => {
            let object_index = find_object_index(&next_scene, object_id)?;
            let filters = filters_mut_with_preferred_id(
                &mut next_scene.objects[object_index],
                Some(filter_id),
            );
            let len = filters.len();
            if *from_index >= len {
                return Err(CommandError::IndexOutOfRange {
                    index: *from_index,
                    len,
                    context: "MoveFilter.fromIndex".to_string(),
                });
            }
            if *to_index >= len {
                return Err(CommandError::IndexOutOfRange {
                    index: *to_index,
                    len,
                    context: "MoveFilter.toIndex".to_string(),
                });
            }
            let actual_id = filter_id_of(&filters[*from_index]);
            if actual_id != *filter_id {
                return Err(CommandError::IndexMismatch {
                    expected_id: filter_id.clone(),
                    actual_id,
                    index: *from_index,
                });
            }
            // 意図的なクランプ: from == to は「既に端で移動しない」正当な
            // 無操作（moveFilterInObject のクランプ挙動を反映）。
            if from_index != to_index {
                let moved = filters.remove(*from_index);
                filters.insert(*to_index, moved);
            }
            sync_legacy_effects_with_filters(&mut next_scene.objects[object_index]);
        }

        Command::UpdateFilterParams {
            object_id,
            filter_id,
            next,
            ..
        } => {
            let object_index = find_object_index(&next_scene, object_id)?;
            let filters = filters_mut_with_preferred_id(
                &mut next_scene.objects[object_index],
                Some(filter_id),
            );
            let filter_index = filters
                .iter()
                .position(|filter| filter_id_of(filter) == *filter_id)
                .ok_or_else(|| CommandError::FilterNotFound {
                    object_id: object_id.clone(),
                    filter_id: filter_id.clone(),
                })?;

            let mut patched_value =
                serde_json::to_value(&filters[filter_index]).map_err(|error| {
                    CommandError::InvalidFilterPatch {
                        object_id: object_id.clone(),
                        filter_id: filter_id.clone(),
                        reason: format!("フィルタの直列化に失敗しました: {error}"),
                    }
                })?;
            merge_json_object(&mut patched_value, "params", next);

            let normalised_value = normalise_filter_value(patched_value).ok_or_else(|| {
                CommandError::InvalidFilterPatch {
                    object_id: object_id.clone(),
                    filter_id: filter_id.clone(),
                    reason: "未知のフィルタ種別です".to_string(),
                }
            })?;
            let patched_filter: ObjectFilter =
                serde_json::from_value(normalised_value).map_err(|error| {
                    CommandError::InvalidFilterPatch {
                        object_id: object_id.clone(),
                        filter_id: filter_id.clone(),
                        reason: format!("パッチ適用後の値がフィルタとして無効です: {error}"),
                    }
                })?;
            filters[filter_index] = patched_filter;
            sync_legacy_effects_with_filters(&mut next_scene.objects[object_index]);
        }

        Command::SetCamera { next, .. } => {
            next_scene.camera = *next;
        }

        Command::SetStageCamera3D { next, .. } => {
            next_scene.stage_camera_3d = *next;
        }

        Command::Batch { commands } => {
            if commands.is_empty() {
                return Err(CommandError::EmptyBatch);
            }
            if commands
                .iter()
                .any(|sub_command| matches!(sub_command, Command::Batch { .. }))
            {
                return Err(CommandError::NestedBatch);
            }
            for sub_command in commands {
                next_scene = apply_command(&next_scene, sub_command)?;
            }
        }
    }

    Ok(next_scene)
}

/// `object_id` を持つオブジェクトの `SceneData.objects` 内インデックスを
/// 返す。存在しなければ `ObjectNotFound`。
fn find_object_index(scene: &SceneData, object_id: &str) -> Result<usize, CommandError> {
    scene
        .objects
        .iter()
        .position(|object| base_of(object).id == object_id)
        .ok_or_else(|| CommandError::ObjectNotFound {
            object_id: object_id.to_string(),
        })
}

/// 対象オブジェクトの `BaseObject.filters` への可変参照を返す。
/// `filters` が未設定なら、`filterStack.ts` の
/// `buildFiltersFromLegacyEffects` と同じ順序で legacy effect を stack 化する。
fn filters_mut(object: &mut TimelineObject) -> &mut Vec<ObjectFilter> {
    filters_mut_with_preferred_id(object, None)
}

fn filters_mut_with_preferred_id<'a>(
    object: &'a mut TimelineObject,
    preferred_filter_id: Option<&str>,
) -> &'a mut Vec<ObjectFilter> {
    if base_of(object).filters.is_none() {
        let legacy_filters = build_filters_from_legacy_effects(object, preferred_filter_id);
        base_of_mut(object).filters = Some(legacy_filters);
    }
    base_of_mut(object).filters.get_or_insert_with(Vec::new)
}

fn legacy_filter_id(filter_type: &str, preferred_filter_id: Option<&str>) -> String {
    preferred_filter_id
        .filter(|id| id.starts_with(&format!("{filter_type}-")))
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("legacy-{filter_type}"))
}

fn build_filters_from_legacy_effects(
    object: &TimelineObject,
    preferred_filter_id: Option<&str>,
) -> Vec<ObjectFilter> {
    let base = base_of(object);
    let mut filters = Vec::new();

    if let Some(value) = base.color_correction {
        filters.push(ObjectFilter::ColorCorrection {
            id: legacy_filter_id("color_correction", preferred_filter_id),
            enabled: value.enabled,
            params: crate::schema::ColorCorrectionParams {
                brightness: value.brightness,
                contrast: value.contrast,
                saturation: value.saturation,
                hue: value.hue,
            },
        });
    }
    if let Some(value) = base.custom_clipping {
        filters.push(ObjectFilter::Clipping {
            id: legacy_filter_id("clipping", preferred_filter_id),
            enabled: value.enabled,
            params: crate::schema::ClippingFilterParams {
                top: value.top,
                bottom: value.bottom,
                left: value.left,
                right: value.right,
                angle: value.angle,
                radius: value.radius,
            },
        });
    }
    if let Some(value) = base.vibration {
        filters.push(ObjectFilter::Vibration {
            id: legacy_filter_id("vibration", preferred_filter_id),
            enabled: value.enabled,
            params: crate::schema::VibrationParams {
                strength: value.strength,
                speed: value.speed,
            },
        });
    }
    if let Some(value) = base.shadow.as_ref() {
        filters.push(ObjectFilter::Shadow {
            id: legacy_filter_id("shadow", preferred_filter_id),
            enabled: value.enabled,
            params: crate::schema::ShadowFilterParams {
                colour: value.colour.clone(),
                blur: value.blur,
                offset_x: value.offset_x,
                offset_y: value.offset_y,
                opacity: value.opacity,
            },
        });
    }
    if let TimelineObject::Shape { fields, .. } = object {
        if let Some(value) = fields.gradient.as_ref() {
            filters.push(ObjectFilter::Gradient {
                id: legacy_filter_id("gradient", preferred_filter_id),
                enabled: value.enabled,
                params: GradientFilterParams {
                    kind: value.kind,
                    scope: value.scope,
                    colours: value.colours.clone(),
                    stops: value.stops.clone(),
                    direction: value.direction,
                },
            });
        }
    }

    filters
}

/// `src/utils/filterStack.ts` の `materialiseSyncedObject` を Rust 側へ移植
/// したもの（R4-9）。`filters` 配列を正本として、legacy ミラーフィールド
/// (`colorCorrection`/`customClipping`/`vibration`/`shadow`、shape のみ
/// `gradient`) を「該当 type の最後方の filter」から再構築する。
/// フィルタ系コマンド (`AddFilter`/`RemoveFilter`/`ToggleFilterEnabled`/
/// `MoveFilter`/`UpdateFilterParams`) の適用後に必ず呼ぶことで、TS 側の
/// forward 経路と undo/redo (Rust apply 経由) の忠実性ギャップを解消する
/// (R4-8 で記録された既知の限界の解消)。
fn sync_legacy_effects_with_filters(object: &mut TimelineObject) {
    let filters = filters_mut(object).clone();

    let mut last_color_correction: Option<&ObjectFilter> = None;
    let mut last_clipping: Option<&ObjectFilter> = None;
    let mut last_vibration: Option<&ObjectFilter> = None;
    let mut last_shadow: Option<&ObjectFilter> = None;
    let mut last_gradient: Option<&ObjectFilter> = None;
    for filter in filters.iter().rev() {
        match filter {
            ObjectFilter::ColorCorrection { .. } if last_color_correction.is_none() => {
                last_color_correction = Some(filter);
            }
            ObjectFilter::Clipping { .. } if last_clipping.is_none() => {
                last_clipping = Some(filter);
            }
            ObjectFilter::Vibration { .. } if last_vibration.is_none() => {
                last_vibration = Some(filter);
            }
            ObjectFilter::Shadow { .. } if last_shadow.is_none() => {
                last_shadow = Some(filter);
            }
            ObjectFilter::Gradient { .. } if last_gradient.is_none() => {
                last_gradient = Some(filter);
            }
            _ => {}
        }
        if last_color_correction.is_some()
            && last_clipping.is_some()
            && last_vibration.is_some()
            && last_shadow.is_some()
            && last_gradient.is_some()
        {
            break;
        }
    }

    let base = base_of_mut(object);
    base.color_correction = match last_color_correction {
        Some(ObjectFilter::ColorCorrection { enabled, params, .. }) => Some(ColorCorrection {
            enabled: *enabled,
            brightness: params.brightness,
            contrast: params.contrast,
            saturation: params.saturation,
            hue: params.hue,
        }),
        _ => None,
    };
    base.custom_clipping = match last_clipping {
        Some(ObjectFilter::Clipping { enabled, params, .. }) => Some(ClippingParams {
            enabled: *enabled,
            top: params.top,
            bottom: params.bottom,
            left: params.left,
            right: params.right,
            angle: params.angle,
            radius: params.radius,
        }),
        _ => None,
    };
    base.vibration = match last_vibration {
        Some(ObjectFilter::Vibration { enabled, params, .. }) => Some(Vibration {
            enabled: *enabled,
            strength: params.strength,
            speed: params.speed,
        }),
        _ => None,
    };
    base.shadow = match last_shadow {
        Some(ObjectFilter::Shadow { enabled, params, .. }) => Some(ShadowEffect {
            enabled: *enabled,
            colour: params.colour.clone(),
            blur: params.blur,
            offset_x: params.offset_x,
            offset_y: params.offset_y,
            opacity: params.opacity,
        }),
        _ => None,
    };

    // `gradient` は shape kind のみが持つ (`ShapeObjectFields.gradient`)。
    // TS 側 `materialiseSyncedObject` の `object.type !== 'shape'` ガードと同じ。
    if let TimelineObject::Shape { fields, .. } = object {
        fields.gradient = match last_gradient {
            Some(ObjectFilter::Gradient { enabled, params, .. }) => Some(ShapeGradientFill {
                enabled: *enabled,
                kind: params.kind,
                scope: params.scope,
                colours: params.colours.clone(),
                stops: params.stops.clone(),
                direction: params.direction,
            }),
            _ => None,
        };
    }
}

fn base_of_mut(object: &mut TimelineObject) -> &mut BaseObject {
    match object {
        TimelineObject::Text { base, .. } => base,
        TimelineObject::Shape { base, .. } => base,
        TimelineObject::Image { base, .. } => base,
        TimelineObject::Video { base, .. } => base,
        TimelineObject::Audio { base, .. } => base,
        TimelineObject::Psd { base, .. } => base,
        TimelineObject::GroupControl { base, .. } => base,
        TimelineObject::AudioVisualization { base, .. } => base,
        TimelineObject::AudioSphere { base, .. } => base,
        TimelineObject::Particle { base, .. } => base,
        TimelineObject::Barcode { base, .. } => base,
        TimelineObject::PuzzlePiece { base, .. } => base,
        TimelineObject::ColourWheel { base, .. } => base,
        TimelineObject::Gourd { base, .. } => base,
        TimelineObject::Gear { base, .. } => base,
        TimelineObject::TrackBar { base, .. } => base,
        TimelineObject::PieChart { base, .. } => base,
        TimelineObject::Histogram { base, .. } => base,
        TimelineObject::ToneCurve { base, .. } => base,
        TimelineObject::HksyCheckerGrid { base, .. } => base,
        TimelineObject::GetColorDotField { base, .. } => base,
        TimelineObject::RegionFrame { base, .. } => base,
        TimelineObject::SimpleTube { base, .. } => base,
        TimelineObject::SphereDots { base, .. } => base,
        TimelineObject::SphericalField { base, .. } => base,
        TimelineObject::Sunburst { base, .. } => base,
        TimelineObject::CircularArrow { base, .. } => base,
        TimelineObject::TriangleBracket { base, .. } => base,
        TimelineObject::TartanCheck { base, .. } => base,
        TimelineObject::Houndstooth { base, .. } => base,
        TimelineObject::Yagasuri { base, .. } => base,
        TimelineObject::PaperAirplane { base, .. } => base,
        TimelineObject::AsanohaPattern { base, .. } => base,
        TimelineObject::FocusLinesPlus { base, .. } => base,
        TimelineObject::RandomLineEx { base, .. } => base,
        TimelineObject::ContourTrace { base, .. } => base,
        TimelineObject::DisplacementPoly { base, .. } => base,
        TimelineObject::PlainEffectorLine { base, .. } => base,
        TimelineObject::Hologram { base, .. } => base,
        TimelineObject::Protractor { base, .. } => base,
        TimelineObject::ShakingPolygon { base, .. } => base,
        TimelineObject::ShatteredSphere { base, .. } => base,
    }
}

fn filter_id_of(filter: &ObjectFilter) -> String {
    match filter {
        ObjectFilter::ColorCorrection { id, .. } => id.clone(),
        ObjectFilter::ColourAberration { id, .. } => id.clone(),
        ObjectFilter::Outline { id, .. } => id.clone(),
        ObjectFilter::Clipping { id, .. } => id.clone(),
        ObjectFilter::Vibration { id, .. } => id.clone(),
        ObjectFilter::Shadow { id, .. } => id.clone(),
        ObjectFilter::Gradient { id, .. } => id.clone(),
        ObjectFilter::Blur { id, .. } => id.clone(),
        ObjectFilter::Fade { id, .. } => id.clone(),
        ObjectFilter::Wipe { id, .. } => id.clone(),
        ObjectFilter::SpotLight { id, .. } => id.clone(),
        ObjectFilter::DisplacementMap { id, .. } => id.clone(),
        ObjectFilter::FakeDof { id, .. } => id.clone(),
        ObjectFilter::AutoBlur { id, .. } => id.clone(),
        ObjectFilter::Stretch { id, .. } => id.clone(),
        ObjectFilter::MultiSlicer { id, .. } => id.clone(),
        ObjectFilter::OctTransform { id, .. } => id.clone(),
        ObjectFilter::AreaExpand { id, .. } => id.clone(),
        ObjectFilter::SmartClipping { id, .. } => id.clone(),
    }
}

fn filter_enabled(filter: &ObjectFilter) -> bool {
    match filter {
        ObjectFilter::ColorCorrection { enabled, .. } => *enabled,
        ObjectFilter::ColourAberration { enabled, .. } => *enabled,
        ObjectFilter::Outline { enabled, .. } => *enabled,
        ObjectFilter::Clipping { enabled, .. } => *enabled,
        ObjectFilter::Vibration { enabled, .. } => *enabled,
        ObjectFilter::Shadow { enabled, .. } => *enabled,
        ObjectFilter::Gradient { enabled, .. } => *enabled,
        ObjectFilter::Blur { enabled, .. } => *enabled,
        ObjectFilter::Fade { enabled, .. } => *enabled,
        ObjectFilter::Wipe { enabled, .. } => *enabled,
        ObjectFilter::SpotLight { enabled, .. } => *enabled,
        ObjectFilter::DisplacementMap { enabled, .. } => *enabled,
        ObjectFilter::FakeDof { enabled, .. } => *enabled,
        ObjectFilter::AutoBlur { enabled, .. } => *enabled,
        ObjectFilter::Stretch { enabled, .. } => *enabled,
        ObjectFilter::MultiSlicer { enabled, .. } => *enabled,
        ObjectFilter::OctTransform { enabled, .. } => *enabled,
        ObjectFilter::AreaExpand { enabled, .. } => *enabled,
        ObjectFilter::SmartClipping { enabled, .. } => *enabled,
    }
}

fn set_filter_enabled(filter: &mut ObjectFilter, value: bool) {
    match filter {
        ObjectFilter::ColorCorrection { enabled, .. } => *enabled = value,
        ObjectFilter::ColourAberration { enabled, .. } => *enabled = value,
        ObjectFilter::Outline { enabled, .. } => *enabled = value,
        ObjectFilter::Clipping { enabled, .. } => *enabled = value,
        ObjectFilter::Vibration { enabled, .. } => *enabled = value,
        ObjectFilter::Shadow { enabled, .. } => *enabled = value,
        ObjectFilter::Gradient { enabled, .. } => *enabled = value,
        ObjectFilter::Blur { enabled, .. } => *enabled = value,
        ObjectFilter::Fade { enabled, .. } => *enabled = value,
        ObjectFilter::Wipe { enabled, .. } => *enabled = value,
        ObjectFilter::SpotLight { enabled, .. } => *enabled = value,
        ObjectFilter::DisplacementMap { enabled, .. } => *enabled = value,
        ObjectFilter::FakeDof { enabled, .. } => *enabled = value,
        ObjectFilter::AutoBlur { enabled, .. } => *enabled = value,
        ObjectFilter::Stretch { enabled, .. } => *enabled = value,
        ObjectFilter::MultiSlicer { enabled, .. } => *enabled = value,
        ObjectFilter::OctTransform { enabled, .. } => *enabled = value,
        ObjectFilter::AreaExpand { enabled, .. } => *enabled = value,
        ObjectFilter::SmartClipping { enabled, .. } => *enabled = value,
    }
}

fn finite_number(params: &serde_json::Map<String, Value>, key: &str, fallback: f32) -> f32 {
    params
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| value as f32)
        .filter(|value| value.is_finite())
        .unwrap_or(fallback)
}

fn boolean(params: &serde_json::Map<String, Value>, key: &str, fallback: bool) -> bool {
    params.get(key).and_then(Value::as_bool).unwrap_or(fallback)
}

fn string(params: &serde_json::Map<String, Value>, key: &str, fallback: &str) -> String {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn clamp(value: f32, minimum: f32, maximum: f32) -> f32 {
    value.max(minimum).min(maximum)
}

fn normalised_gradient_params(params: &serde_json::Map<String, Value>) -> Value {
    let mut colours: Vec<String> = params
        .get("colours")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .filter(|value| !value.trim().is_empty())
                .take(8)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default();
    if colours.is_empty() {
        colours = vec!["#ffffff".to_string(), "#000000".to_string()];
    }
    if colours.len() == 1 {
        colours.push(colours[0].clone());
    }

    let raw_stops = params.get("stops").and_then(Value::as_array);
    let stops: Vec<f32> = (0..colours.len())
        .map(|index| {
            let fallback = index as f32 / (colours.len() - 1) as f32;
            let value = raw_stops
                .and_then(|values| values.get(index))
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite())
                .map(|value| value as f32)
                .filter(|value| value.is_finite())
                .unwrap_or(fallback);
            clamp(value, 0.0, 1.0)
        })
        .collect();

    let mut normalised = json!({
        "type": if params.get("type").and_then(Value::as_str) == Some("radial") { "radial" } else { "linear" },
        "colours": colours,
        "stops": stops,
        "direction": finite_number(params, "direction", 0.0),
    });
    if matches!(params.get("scope").and_then(Value::as_str), Some("group" | "connected")) {
        normalised["scope"] = params["scope"].clone();
    }
    normalised
}

/// `filterStack.ts` の `normaliseFilter` と同じく、部分パッチ後の params を
/// filter 種別ごとの完全な形へ戻す。`ObjectFilter` は Rust では型付きなので、
/// この境界で正規化してから再 deserialize する。
fn normalise_filter_value(value: Value) -> Option<Value> {
    let object = value.as_object()?;
    let filter_type = object.get("type")?.as_str()?;
    let id = object.get("id")?.as_str()?.to_string();
    let enabled = object
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let params = object
        .get("params")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let normalised = match filter_type {
        "color_correction" => json!({
            "brightness": finite_number(&params, "brightness", 1.0),
            "contrast": finite_number(&params, "contrast", 1.0),
            "saturation": finite_number(&params, "saturation", 1.0),
            "hue": finite_number(&params, "hue", 0.0),
        }),
        "colour_aberration" => json!({
            "offsetX": finite_number(&params, "offsetX", 3.0).max(0.0),
            "offsetY": finite_number(&params, "offsetY", 0.0).max(0.0),
        }),
        "outline" => json!({
            "colour": string(&params, "colour", "#000000"),
            "thickness": finite_number(&params, "thickness", 3.0).max(0.0),
            "opacity": clamp(finite_number(&params, "opacity", 0.85), 0.0, 1.0),
        }),
        "clipping" => json!({
            "top": finite_number(&params, "top", 0.0),
            "bottom": finite_number(&params, "bottom", 0.0),
            "left": finite_number(&params, "left", 0.0),
            "right": finite_number(&params, "right", 0.0),
            "angle": finite_number(&params, "angle", 0.0),
            "radius": finite_number(&params, "radius", 0.0),
        }),
        "vibration" => json!({
            "strength": finite_number(&params, "strength", 0.0),
            "speed": finite_number(&params, "speed", 1.0),
        }),
        "shadow" => json!({
            "colour": string(&params, "colour", "#000000"),
            "blur": finite_number(&params, "blur", 4.0),
            "offsetX": finite_number(&params, "offsetX", 2.0),
            "offsetY": finite_number(&params, "offsetY", 2.0),
            "opacity": finite_number(&params, "opacity", 0.5),
        }),
        "gradient" => normalised_gradient_params(&params),
        "blur" => json!({
            "strength": finite_number(&params, "strength", 4.0).max(0.0),
            "quality": clamp(finite_number(&params, "quality", 3.0).round(), 1.0, 4.0),
        }),
        "fade" => json!({
            "opacity": clamp(finite_number(&params, "opacity", 1.0), 0.0, 1.0),
        }),
        "wipe" => json!({
            "edge": match params.get("edge").and_then(Value::as_str) {
                Some("right") => "right",
                Some("top") => "top",
                Some("bottom") => "bottom",
                _ => "left",
            },
            "reverse": boolean(&params, "reverse", false),
        }),
        "spot_light" => json!({
            "centreX": clamp(finite_number(&params, "centreX", 0.5), 0.0, 1.0),
            "centreY": clamp(finite_number(&params, "centreY", 0.5), 0.0, 1.0),
            "radius": finite_number(&params, "radius", 0.65).max(0.0),
            "intensity": finite_number(&params, "intensity", 0.75).max(0.0),
            "colour": string(&params, "colour", "#fff4c2"),
        }),
        "displacement_map" => json!({
            "amountX": finite_number(&params, "amountX", 24.0).max(0.0),
            "amountY": finite_number(&params, "amountY", 12.0).max(0.0),
            "size": finite_number(&params, "size", 128.0).max(1.0),
            "strength": clamp(finite_number(&params, "strength", 1.0), 0.0, 1.0),
        }),
        "fake_dof" => json!({
            "focusX": clamp(finite_number(&params, "focusX", 0.5), 0.0, 1.0),
            "focusY": clamp(finite_number(&params, "focusY", 0.5), 0.0, 1.0),
            "focusRadius": clamp(finite_number(&params, "focusRadius", 0.25), 0.01, 1.0),
            "blur": finite_number(&params, "blur", 8.0).max(0.0),
            "strength": clamp(finite_number(&params, "strength", 1.0), 0.0, 1.0),
        }),
        "auto_blur" => json!({
            "blur": finite_number(&params, "blur", 10.0).max(0.0),
            "speed": finite_number(&params, "speed", 1.0).max(0.0),
            "strength": clamp(finite_number(&params, "strength", 1.0), 0.0, 1.0),
            "colourShift": clamp(finite_number(&params, "colourShift", 0.0), 0.0, 1.0),
        }),
        "stretch" => json!({
            "angle": finite_number(&params, "angle", 0.0),
            "amount": finite_number(&params, "amount", 1.0).max(0.0),
            "strength": clamp(finite_number(&params, "strength", 1.0), 0.0, 1.0),
        }),
        "multi_slicer" => json!({
            "angle": finite_number(&params, "angle", 45.0),
            "offset": finite_number(&params, "offset", 16.0).max(0.0),
            "slices": finite_number(&params, "slices", 18.0).round().max(2.0),
            "expansion": finite_number(&params, "expansion", 0.0).max(0.0),
            "strength": clamp(finite_number(&params, "strength", 1.0), 0.0, 1.0),
        }),
        "oct_transform" => json!({
            "scale": finite_number(&params, "scale", 1.0).max(0.01),
            "rotation": finite_number(&params, "rotation", 0.0),
            "vertexCount": finite_number(&params, "vertexCount", 8.0).round().max(3.0),
            "warp": finite_number(&params, "warp", 0.2).max(0.0),
            "strength": clamp(finite_number(&params, "strength", 1.0), 0.0, 1.0),
        }),
        "area_expand" => json!({
            "top": finite_number(&params, "top", 0.0).max(0.0),
            "bottom": finite_number(&params, "bottom", 0.0).max(0.0),
            "left": finite_number(&params, "left", 0.0).max(0.0),
            "right": finite_number(&params, "right", 32.0).max(0.0),
            "fill": boolean(&params, "fill", true),
        }),
        "smart_clipping" => json!({
            "top": finite_number(&params, "top", 0.0).max(0.0),
            "bottom": finite_number(&params, "bottom", 0.0).max(0.0),
            "left": finite_number(&params, "left", 0.0).max(0.0),
            "right": finite_number(&params, "right", 0.0).max(0.0),
            "linkAxes": boolean(&params, "linkAxes", false),
            "mode": clamp(finite_number(&params, "mode", 0.0).round(), 0.0, 5.0),
            "amount": finite_number(&params, "amount", 1.0).max(0.0),
            "seed": finite_number(&params, "seed", 1.0).round(),
            "reverse": boolean(&params, "reverse", false),
        }),
        _ => return None,
    };
    Some(json!({ "id": id, "type": filter_type, "enabled": enabled, "params": normalised }))
}

/// `target["key"]` を `patch` の各キーで部分マージする（`patch` が object
/// でなければ何もしない）。`SetObjectField` の「単一フィールド上書き」を
/// 拡張し、`UpdateFilterParams` では「`params` オブジェクトの部分マージ」
/// を表す（`updateFilterParamsInObject` の `{ ...filter.params,
/// ...paramsPatch }` と同じ意味論）。
/// patch 値が `null` の key は、undo 時に元々 absent だった任意 key を
/// 削除するための印として扱う。
fn merge_json_object(target: &mut Value, key: &str, patch: &Value) {
    let Some(patch_object) = patch.as_object() else {
        return;
    };
    let target_object = target
        .as_object_mut()
        .expect("TimelineObject/ObjectFilter は常に JSON object へ直列化される");
    let existing = target_object
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let existing_object = existing
        .as_object_mut()
        .expect("params は常に JSON object");
    for (patch_key, patch_value) in patch_object {
        if patch_value.is_null() {
            existing_object.remove(patch_key);
        } else {
            existing_object.insert(patch_key.clone(), patch_value.clone());
        }
    }
}

/// `command` の逆操作を返す。`apply_command(state, invert(command))` を
/// `apply_command(state, command)` の結果へ適用すると元の状態へ戻る
/// （undo は「invert を apply する」ことで実現する）。
pub fn invert(command: &Command) -> Command {
    match command {
        Command::SetObjectField {
            object_id,
            field,
            next,
            previous,
        } => Command::SetObjectField {
            object_id: object_id.clone(),
            field: field.clone(),
            next: previous.clone(),
            previous: next.clone(),
        },

        Command::AddObject { object, index } => Command::RemoveObject {
            object_id: base_of(object).id.clone(),
            removed: object.clone(),
            index: *index,
        },

        Command::RemoveObject {
            removed, index, ..
        } => Command::AddObject {
            object: removed.clone(),
            index: *index,
        },

        Command::SetLayerState {
            index,
            next,
            previous,
        } => Command::SetLayerState {
            index: *index,
            next: previous.clone(),
            previous: next.clone(),
        },

        Command::ReorderLayers {
            previous_layers,
            next_layers,
            previous_objects,
            next_objects,
        } => Command::ReorderLayers {
            previous_layers: next_layers.clone(),
            next_layers: previous_layers.clone(),
            previous_objects: next_objects.clone(),
            next_objects: previous_objects.clone(),
        },

        Command::AddFilter {
            object_id,
            filter,
            index,
        } => Command::RemoveFilter {
            object_id: object_id.clone(),
            filter_id: filter_id_of(filter),
            removed: filter.clone(),
            index: *index,
        },

        Command::RemoveFilter {
            object_id,
            removed,
            index,
            ..
        } => Command::AddFilter {
            object_id: object_id.clone(),
            filter: removed.clone(),
            index: *index,
        },

        Command::ToggleFilterEnabled {
            object_id,
            filter_id,
        } => Command::ToggleFilterEnabled {
            object_id: object_id.clone(),
            filter_id: filter_id.clone(),
        },

        Command::MoveFilter {
            object_id,
            filter_id,
            from_index,
            to_index,
        } => Command::MoveFilter {
            object_id: object_id.clone(),
            filter_id: filter_id.clone(),
            from_index: *to_index,
            to_index: *from_index,
        },

        Command::UpdateFilterParams {
            object_id,
            filter_id,
            next,
            previous,
        } => Command::UpdateFilterParams {
            object_id: object_id.clone(),
            filter_id: filter_id.clone(),
            next: previous.clone(),
            previous: next.clone(),
        },

        Command::SetCamera { next, previous } => Command::SetCamera {
            next: *previous,
            previous: *next,
        },

        Command::SetStageCamera3D { next, previous } => Command::SetStageCamera3D {
            next: *previous,
            previous: *next,
        },

        Command::Batch { commands } => Command::Batch {
            commands: commands.iter().rev().map(invert).collect(),
        },
    }
}

/// `TimelineObject` の判別共用体 42 kind いずれであっても、共通フィールド
/// を保持する `BaseObject` への参照を返す。
fn base_of(object: &TimelineObject) -> &BaseObject {
    match object {
        TimelineObject::Text { base, .. } => base,
        TimelineObject::Shape { base, .. } => base,
        TimelineObject::Image { base, .. } => base,
        TimelineObject::Video { base, .. } => base,
        TimelineObject::Audio { base, .. } => base,
        TimelineObject::Psd { base, .. } => base,
        TimelineObject::GroupControl { base, .. } => base,
        TimelineObject::AudioVisualization { base, .. } => base,
        TimelineObject::AudioSphere { base, .. } => base,
        TimelineObject::Particle { base, .. } => base,
        TimelineObject::Barcode { base, .. } => base,
        TimelineObject::PuzzlePiece { base, .. } => base,
        TimelineObject::ColourWheel { base, .. } => base,
        TimelineObject::Gourd { base, .. } => base,
        TimelineObject::Gear { base, .. } => base,
        TimelineObject::TrackBar { base, .. } => base,
        TimelineObject::PieChart { base, .. } => base,
        TimelineObject::Histogram { base, .. } => base,
        TimelineObject::ToneCurve { base, .. } => base,
        TimelineObject::HksyCheckerGrid { base, .. } => base,
        TimelineObject::GetColorDotField { base, .. } => base,
        TimelineObject::RegionFrame { base, .. } => base,
        TimelineObject::SimpleTube { base, .. } => base,
        TimelineObject::SphereDots { base, .. } => base,
        TimelineObject::SphericalField { base, .. } => base,
        TimelineObject::Sunburst { base, .. } => base,
        TimelineObject::CircularArrow { base, .. } => base,
        TimelineObject::TriangleBracket { base, .. } => base,
        TimelineObject::TartanCheck { base, .. } => base,
        TimelineObject::Houndstooth { base, .. } => base,
        TimelineObject::Yagasuri { base, .. } => base,
        TimelineObject::PaperAirplane { base, .. } => base,
        TimelineObject::AsanohaPattern { base, .. } => base,
        TimelineObject::FocusLinesPlus { base, .. } => base,
        TimelineObject::RandomLineEx { base, .. } => base,
        TimelineObject::ContourTrace { base, .. } => base,
        TimelineObject::DisplacementPoly { base, .. } => base,
        TimelineObject::PlainEffectorLine { base, .. } => base,
        TimelineObject::Hologram { base, .. } => base,
        TimelineObject::Protractor { base, .. } => base,
        TimelineObject::ShakingPolygon { base, .. } => base,
        TimelineObject::ShatteredSphere { base, .. } => base,
    }
}

/// 対象オブジェクトの kind（`BaseObject` の共通フィールド ∪ kind 固有
/// `*ObjectFields`）について、`SetObjectField` で編集可能な既知フィールド
/// 名（JSON キー、camelCase）の集合を返す。
///
/// `schemars::schema_for!` が生成する JSON Schema の `properties` を
/// 既知フィールドの正とすることで、42 kind 分のフィールド一覧を手書きで
/// 二重管理しない（新しい kind やフィールドが増えても schema.rs 側の
/// derive を更新するだけで自動的に反映される）。
fn known_field_names(object: &TimelineObject) -> BTreeSet<String> {
    let mut names = property_names(&schema_for!(BaseObject));

    let fields_schema = match object {
        TimelineObject::Text { .. } => schema_for!(TextObjectFields),
        TimelineObject::Shape { .. } => schema_for!(ShapeObjectFields),
        TimelineObject::Image { .. } => schema_for!(ImageObjectFields),
        TimelineObject::Video { .. } => schema_for!(VideoObjectFields),
        TimelineObject::Audio { .. } => schema_for!(AudioObjectFields),
        TimelineObject::Psd { .. } => schema_for!(PsdObjectFields),
        TimelineObject::GroupControl { .. } => schema_for!(GroupControlObjectFields),
        TimelineObject::AudioVisualization { .. } => schema_for!(AudioVisualizationObjectFields),
        TimelineObject::AudioSphere { .. } => schema_for!(AudioSphereObjectFields),
        TimelineObject::Particle { .. } => schema_for!(ParticleObjectFields),
        TimelineObject::Barcode { .. } => schema_for!(BarcodeObjectFields),
        TimelineObject::PuzzlePiece { .. } => schema_for!(PuzzlePieceObjectFields),
        TimelineObject::ColourWheel { .. } => schema_for!(ColourWheelObjectFields),
        TimelineObject::Gourd { .. } => schema_for!(GourdObjectFields),
        TimelineObject::Gear { .. } => schema_for!(GearObjectFields),
        TimelineObject::TrackBar { .. } => schema_for!(TrackBarObjectFields),
        TimelineObject::PieChart { .. } => schema_for!(PieChartObjectFields),
        TimelineObject::Histogram { .. } => schema_for!(HistogramObjectFields),
        TimelineObject::ToneCurve { .. } => schema_for!(ToneCurveObjectFields),
        TimelineObject::HksyCheckerGrid { .. } => schema_for!(HksyCheckerGridObjectFields),
        TimelineObject::GetColorDotField { .. } => schema_for!(GetColorDotFieldObjectFields),
        TimelineObject::RegionFrame { .. } => schema_for!(RegionFrameObjectFields),
        TimelineObject::SimpleTube { .. } => schema_for!(SimpleTubeObjectFields),
        TimelineObject::SphereDots { .. } => schema_for!(SphereDotsObjectFields),
        TimelineObject::SphericalField { .. } => schema_for!(SphericalFieldObjectFields),
        TimelineObject::Sunburst { .. } => schema_for!(SunburstObjectFields),
        TimelineObject::CircularArrow { .. } => schema_for!(CircularArrowObjectFields),
        TimelineObject::TriangleBracket { .. } => schema_for!(TriangleBracketObjectFields),
        TimelineObject::TartanCheck { .. } => schema_for!(TartanCheckObjectFields),
        TimelineObject::Houndstooth { .. } => schema_for!(HoundstoothObjectFields),
        TimelineObject::Yagasuri { .. } => schema_for!(YagasuriObjectFields),
        TimelineObject::PaperAirplane { .. } => schema_for!(PaperAirplaneObjectFields),
        TimelineObject::AsanohaPattern { .. } => schema_for!(AsanohaPatternObjectFields),
        TimelineObject::FocusLinesPlus { .. } => schema_for!(FocusLinesPlusObjectFields),
        TimelineObject::RandomLineEx { .. } => schema_for!(RandomLineExObjectFields),
        TimelineObject::ContourTrace { .. } => schema_for!(ContourTraceObjectFields),
        TimelineObject::DisplacementPoly { .. } => schema_for!(DisplacementPolyObjectFields),
        TimelineObject::PlainEffectorLine { .. } => schema_for!(PlainEffectorLineObjectFields),
        TimelineObject::Hologram { .. } => schema_for!(HologramObjectFields),
        TimelineObject::Protractor { .. } => schema_for!(ProtractorObjectFields),
        TimelineObject::ShakingPolygon { .. } => schema_for!(ShakingPolygonObjectFields),
        TimelineObject::ShatteredSphere { .. } => schema_for!(ShatteredSphereObjectFields),
    };
    names.extend(property_names(&fields_schema));

    names
}

fn property_names(schema: &schemars::Schema) -> BTreeSet<String> {
    schema
        .as_value()
        .get("properties")
        .and_then(|properties| properties.as_object())
        .map(|properties| properties.keys().cloned().collect())
        .unwrap_or_default()
}
