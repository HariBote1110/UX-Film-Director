use crate::keyframe::evaluate_easing;
use crate::schema::{BaseObject, EditableSceneGraph, TimelineObject};
use serde::{Deserialize, Serialize};

const KEYFRAME_TIME_EPSILON: f64 = 0.0001;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePositionQuery {
    pub request_id: String,
    pub object_id: String,
    pub time_seconds: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenePoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneObjectPosition {
    pub request_id: String,
    pub object_id: String,
    pub time_seconds: f64,
    pub local_position: ScenePoint,
    pub world_position: ScenePoint,
    pub world_rotation_degrees: f32,
    pub world_scale_x: f32,
    pub world_scale_y: f32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenePositionQueryError {
    InvalidTime { object_id: String },
    MissingObject { object_id: String },
}

impl std::fmt::Display for ScenePositionQueryError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidTime { object_id } => {
                write!(
                    formatter,
                    "query time for object '{object_id}' must be finite"
                )
            }
            Self::MissingObject { object_id } => {
                write!(
                    formatter,
                    "object '{object_id}' is not present in the editable scene"
                )
            }
        }
    }
}

impl std::error::Error for ScenePositionQueryError {}

/// Evaluate logical object positions at arbitrary timeline seconds.
///
/// This operates on the revision-bound editable graph rather than a frame snapshot:
/// keyframe timestamps remain continuous seconds and text render insets are not applied.
pub fn query_editable_scene_positions(
    graph: &EditableSceneGraph,
    queries: &[ScenePositionQuery],
) -> Result<Vec<SceneObjectPosition>, ScenePositionQueryError> {
    queries
        .iter()
        .map(|query| {
            if !query.time_seconds.is_finite() {
                return Err(ScenePositionQueryError::InvalidTime {
                    object_id: query.object_id.clone(),
                });
            }
            let object = graph
                .objects
                .iter()
                .find(|object| base(object).id == query.object_id)
                .ok_or_else(|| ScenePositionQueryError::MissingObject {
                    object_id: query.object_id.clone(),
                })?;
            let object_base = base(object);
            let local_position = evaluate_object_position(object_base, query.time_seconds);
            let (group_x, group_y, rotation, scale_x, scale_y) =
                evaluate_group_transform(graph, object_base, query.time_seconds);
            Ok(SceneObjectPosition {
                request_id: query.request_id.clone(),
                object_id: query.object_id.clone(),
                time_seconds: query.time_seconds,
                local_position,
                world_position: ScenePoint {
                    x: local_position.x + group_x,
                    y: local_position.y + group_y,
                },
                world_rotation_degrees: object_base.rotation + rotation,
                world_scale_x: object_base.scale_x * scale_x,
                world_scale_y: object_base.scale_y * scale_y,
            })
        })
        .collect()
}

fn evaluate_object_position(object: &BaseObject, time_seconds: f64) -> ScenePoint {
    let mut keyframes = object
        .keyframes
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|keyframe| {
            (
                (keyframe
                    .time
                    .clamp(object.start_time, object.start_time + object.duration)) as f64,
                keyframe.id.as_str(),
                keyframe.x,
                keyframe.y,
                keyframe.easing.unwrap_or(object.easing),
            )
        })
        .collect::<Vec<_>>();
    keyframes.sort_by(|left, right| {
        if (left.0 - right.0).abs() > KEYFRAME_TIME_EPSILON {
            left.0.total_cmp(&right.0)
        } else {
            left.1.cmp(right.1)
        }
    });

    if keyframes.len() >= 2 {
        let first = keyframes[0];
        if time_seconds <= first.0 {
            return ScenePoint {
                x: first.2,
                y: first.3,
            };
        }
        let mut left_index = 0;
        let mut right_index = keyframes.len() - 1;
        while left_index < right_index {
            let mid = (left_index + right_index + 1) / 2;
            if keyframes[mid].0 <= time_seconds {
                left_index = mid;
            } else {
                right_index = mid - 1;
            }
        }
        if left_index >= keyframes.len() - 1 {
            let last = keyframes[keyframes.len() - 1];
            return ScenePoint {
                x: last.2,
                y: last.3,
            };
        }
        let left = keyframes[left_index];
        let right = keyframes[left_index + 1];
        let duration = right.0 - left.0;
        if duration <= KEYFRAME_TIME_EPSILON {
            return ScenePoint {
                x: right.2,
                y: right.3,
            };
        }
        let raw_progress = ((time_seconds - left.0) / duration) as f32;
        let progress = evaluate_easing(left.4, raw_progress).clamp(0.0, 1.0);
        return ScenePoint {
            x: left.2 + (right.2 - left.2) * progress,
            y: left.3 + (right.3 - left.3) * progress,
        };
    }

    if object.enable_animation && object.duration as f64 > KEYFRAME_TIME_EPSILON {
        let progress = (((time_seconds - object.start_time as f64)
            / object.duration as f64) as f32).clamp(0.0, 1.0);
        let eased = evaluate_easing(object.easing, progress);
        return ScenePoint {
            x: object.x + (object.end_x - object.x) * eased,
            y: object.y + (object.end_y - object.y) * eased,
        };
    }

    ScenePoint {
        x: object.x,
        y: object.y,
    }
}

fn evaluate_group_transform(
    graph: &EditableSceneGraph,
    object: &BaseObject,
    time_seconds: f64,
) -> (f32, f32, f32, f32, f32) {
    let mut x = 0.0;
    let mut y = 0.0;
    let mut rotation = 0.0;
    let mut scale_x = 1.0;
    let mut scale_y = 1.0;
    let object_track_id = format!("layer-{}", object.layer as i32);
    if !is_layer_visible(graph, object.layer)
        || matches!(
            graph
                .objects
                .iter()
                .find(|candidate| base(candidate).id == object.id),
            Some(TimelineObject::Audio { .. } | TimelineObject::GroupControl { .. })
        )
    {
        return (x, y, rotation, scale_x, scale_y);
    }
    for candidate in &graph.objects {
        let TimelineObject::GroupControl {
            base: group,
            fields,
        } = candidate
        else {
            continue;
        };
        if group.layer >= object.layer
            || time_seconds < group.start_time as f64
            || time_seconds >= (group.start_time + group.duration) as f64
        {
            continue;
        }
        let targets_object_layer = graph.objects.iter().any(|target| {
            let target_base = base(target);
            is_layer_visible(graph, target_base.layer)
                && target_base.layer > group.layer
                && (fields.target_layer_count == 0
                    || target_base.layer <= group.layer + fields.target_layer_count as f32)
                && format!("layer-{}", target_base.layer as i32) == object_track_id
        });
        if !targets_object_layer {
            continue;
        }
        let position = evaluate_object_position(group, time_seconds);
        x += position.x;
        y += position.y;
        rotation += group.rotation;
        scale_x *= group.scale_x;
        scale_y *= group.scale_y;
    }
    (x, y, rotation, scale_x, scale_y)
}

fn is_layer_visible(graph: &EditableSceneGraph, layer: f32) -> bool {
    let index = layer.max(0.0) as usize;
    graph.layers.get(index).is_none_or(|layer| layer.visible)
}

fn base(object: &TimelineObject) -> &BaseObject {
    match object {
        TimelineObject::Text { base, .. }
        | TimelineObject::Shape { base, .. }
        | TimelineObject::Image { base, .. }
        | TimelineObject::Video { base, .. }
        | TimelineObject::Audio { base, .. }
        | TimelineObject::Psd { base, .. }
        | TimelineObject::GroupControl { base, .. }
        | TimelineObject::AudioVisualization { base, .. }
        | TimelineObject::AudioSphere { base, .. }
        | TimelineObject::Particle { base, .. }
        | TimelineObject::Barcode { base, .. }
        | TimelineObject::PuzzlePiece { base, .. }
        | TimelineObject::ColourWheel { base, .. }
        | TimelineObject::Gourd { base, .. }
        | TimelineObject::Gear { base, .. }
        | TimelineObject::TrackBar { base, .. }
        | TimelineObject::PieChart { base, .. }
        | TimelineObject::Histogram { base, .. }
        | TimelineObject::ToneCurve { base, .. }
        | TimelineObject::HksyCheckerGrid { base, .. }
        | TimelineObject::GetColorDotField { base, .. }
        | TimelineObject::RegionFrame { base, .. }
        | TimelineObject::SimpleTube { base, .. }
        | TimelineObject::SphereDots { base, .. }
        | TimelineObject::SphericalField { base, .. }
        | TimelineObject::Sunburst { base, .. }
        | TimelineObject::CircularArrow { base, .. }
        | TimelineObject::TriangleBracket { base, .. }
        | TimelineObject::TartanCheck { base, .. }
        | TimelineObject::Houndstooth { base, .. }
        | TimelineObject::Yagasuri { base, .. }
        | TimelineObject::PaperAirplane { base, .. }
        | TimelineObject::AsanohaPattern { base, .. }
        | TimelineObject::FocusLinesPlus { base, .. }
        | TimelineObject::RandomLineEx { base, .. }
        | TimelineObject::ContourTrace { base, .. }
        | TimelineObject::DisplacementPoly { base, .. }
        | TimelineObject::PlainEffectorLine { base, .. }
        | TimelineObject::Hologram { base, .. }
        | TimelineObject::Protractor { base, .. }
        | TimelineObject::ShakingPolygon { base, .. }
        | TimelineObject::ShatteredSphere { base, .. } => base,
    }
}
