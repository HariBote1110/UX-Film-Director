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
use serde_json::Value;
use ts_rs::TS;

use crate::schema::{
    BaseObject, SceneData, TimelineObject, AsanohaPatternObjectFields, AudioObjectFields, AudioSphereObjectFields, AudioVisualizationObjectFields, BarcodeObjectFields, CircularArrowObjectFields, ColourWheelObjectFields, ContourTraceObjectFields, DisplacementPolyObjectFields, FocusLinesPlusObjectFields, GearObjectFields, GetColorDotFieldObjectFields, GourdObjectFields, GroupControlObjectFields, HistogramObjectFields, HksyCheckerGridObjectFields, HologramObjectFields, HoundstoothObjectFields, ImageObjectFields, PaperAirplaneObjectFields, ParticleObjectFields, PieChartObjectFields, PlainEffectorLineObjectFields, ProtractorObjectFields, PsdObjectFields, PuzzlePieceObjectFields, RandomLineExObjectFields, RegionFrameObjectFields, ShakingPolygonObjectFields, ShapeObjectFields, ShatteredSphereObjectFields, SimpleTubeObjectFields, SphereDotsObjectFields, SphericalFieldObjectFields, SunburstObjectFields, TartanCheckObjectFields, TextObjectFields, ToneCurveObjectFields, TrackBarObjectFields, TriangleBracketObjectFields, VideoObjectFields, YagasuriObjectFields,
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
    }

    Ok(next_scene)
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
