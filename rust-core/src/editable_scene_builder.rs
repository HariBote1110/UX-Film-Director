//! 編集 graph から評価用 scene を作る、副作用を持たない P1b builder。
//!
//! 常駐経路の TS `buildEditableRustScene` と同じく、生成 media の参照解決時刻は
//! 各 object の `startTime` である。P1c の direct 経路は任意時刻を渡す。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use crate::schema::{
    Clip, ClipKind, ColourPipeline, Easing, EditableSceneGraph, EditableSceneMediaPurpose, Effect,
    Fps, GroupControl, MediaKind, MediaReference, ObjectFilter, PositionKeyframe, Project,
    ProjectSize, SamplingMode, SubjectCropAnimation, SubjectCropKeyframe, TimelineObject,
    Transform, WipeAnimation,
};
use crate::solid_colour_scene::SceneMediaReference;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct EditableSceneDiagnostic {
    pub object_id: String,
    pub code: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct BuiltEvaluationScene {
    /// TS builder の `ok` に対応する。canonical media の生成可否とは独立する。
    pub resident_eligible: bool,
    pub project: Project,
    pub media: Vec<SceneMediaReference>,
    pub diagnostics: Vec<EditableSceneDiagnostic>,
}

fn frame(seconds: f32, fps: f32) -> u64 {
    (seconds * fps).round().max(0.0) as u64
}
fn dimension(value: f32) -> u32 {
    value.max(0.0).round() as u32
}
fn finite(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}
fn clamp(value: f32, low: f32, high: f32) -> f32 {
    finite(value, low).clamp(low, high)
}
fn colour(value: &str) -> [f32; 3] {
    let raw = value.trim().trim_start_matches('#');
    if raw.len() != 6 || !raw.chars().all(|c| c.is_ascii_hexdigit()) {
        return [0.0; 3];
    }
    [
        u8::from_str_radix(&raw[0..2], 16).unwrap_or(0) as f32 / 255.0,
        u8::from_str_radix(&raw[2..4], 16).unwrap_or(0) as f32 / 255.0,
        u8::from_str_radix(&raw[4..6], 16).unwrap_or(0) as f32 / 255.0,
    ]
}
fn valid_colour(value: &str, fallback: &str) -> String {
    let raw = value.trim().trim_start_matches('#');
    if raw.len() == 6 && raw.chars().all(|character| character.is_ascii_hexdigit()) {
        value.to_string()
    } else {
        fallback.to_string()
    }
}
fn source_path(src: &str, file_path: &Option<String>) -> String {
    file_path
        .clone()
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| src.to_string())
}
fn base(object: &TimelineObject) -> &crate::schema::BaseObject {
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
fn object_type(object: &TimelineObject) -> &'static str {
    match object {
        TimelineObject::Text { .. } => "text",
        TimelineObject::Shape { .. } => "shape",
        TimelineObject::Image { .. } => "image",
        TimelineObject::Video { .. } => "video",
        TimelineObject::Audio { .. } => "audio",
        TimelineObject::Psd { .. } => "psd",
        TimelineObject::GroupControl { .. } => "group_control",
        TimelineObject::AudioVisualization { .. } => "audio_visualization",
        TimelineObject::AudioSphere { .. } => "audio_sphere",
        TimelineObject::Particle { .. } => "particle",
        TimelineObject::Barcode { .. } => "barcode",
        TimelineObject::PuzzlePiece { .. } => "puzzle_piece",
        TimelineObject::ColourWheel { .. } => "colour_wheel",
        TimelineObject::Gourd { .. } => "gourd",
        TimelineObject::Gear { .. } => "gear",
        TimelineObject::TrackBar { .. } => "track_bar",
        TimelineObject::PieChart { .. } => "pie_chart",
        TimelineObject::Histogram { .. } => "histogram",
        TimelineObject::ToneCurve { .. } => "tone_curve",
        TimelineObject::HksyCheckerGrid { .. } => "hksy_checker_grid",
        TimelineObject::GetColorDotField { .. } => "getcolor_dot_field",
        TimelineObject::RegionFrame { .. } => "region_frame",
        TimelineObject::SimpleTube { .. } => "simple_tube",
        TimelineObject::SphereDots { .. } => "sphere_dots",
        TimelineObject::SphericalField { .. } => "spherical_field",
        TimelineObject::Sunburst { .. } => "sunburst",
        TimelineObject::CircularArrow { .. } => "circular_arrow",
        TimelineObject::TriangleBracket { .. } => "triangle_bracket",
        TimelineObject::TartanCheck { .. } => "tartan_check",
        TimelineObject::Houndstooth { .. } => "houndstooth",
        TimelineObject::Yagasuri { .. } => "yagasuri",
        TimelineObject::PaperAirplane { .. } => "paper_airplane",
        TimelineObject::AsanohaPattern { .. } => "asanoha_pattern",
        TimelineObject::FocusLinesPlus { .. } => "focus_lines_plus",
        TimelineObject::RandomLineEx { .. } => "random_line_ex",
        TimelineObject::ContourTrace { .. } => "contour_trace",
        TimelineObject::DisplacementPoly { .. } => "displacement_poly",
        TimelineObject::PlainEffectorLine { .. } => "plain_effector_line",
        TimelineObject::Hologram { .. } => "hologram",
        TimelineObject::Protractor { .. } => "protractor",
        TimelineObject::ShakingPolygon { .. } => "shaking_polygon",
        TimelineObject::ShatteredSphere { .. } => "shattered_sphere",
    }
}
fn verified_object_type(object: &TimelineObject) -> bool {
    matches!(
        object,
        TimelineObject::Shape { .. }
            | TimelineObject::Image { .. }
            | TimelineObject::Video { .. }
            | TimelineObject::Psd { .. }
            | TimelineObject::Text { .. }
            | TimelineObject::Particle { .. }
            | TimelineObject::AudioVisualization { .. }
            | TimelineObject::AudioSphere { .. }
            | TimelineObject::GetColorDotField { .. }
            | TimelineObject::HksyCheckerGrid { .. }
            | TimelineObject::RegionFrame { .. }
            | TimelineObject::SimpleTube { .. }
            | TimelineObject::Hologram { .. }
            | TimelineObject::ShakingPolygon { .. }
            | TimelineObject::ShatteredSphere { .. }
    )
}

fn resident_filter_supported(object: &TimelineObject, filter: &ObjectFilter) -> bool {
    match filter {
        ObjectFilter::Vibration { .. } => false,
        ObjectFilter::Gradient { .. } => matches!(object, TimelineObject::Shape { .. }),
        _ => true,
    }
}

fn get_color_sample_source_supported(object: &TimelineObject, objects: &[TimelineObject]) -> bool {
    let TimelineObject::GetColorDotField { fields, .. } = object else {
        return true;
    };
    let has_reference = fields
        .sample_source_path
        .as_ref()
        .is_some_and(|s| !s.is_empty())
        || fields.sample_source_object_id.is_some()
        || fields.sample_source_layer.is_some();
    if !has_reference {
        return true;
    }
    let Some(source) = media_for(object, objects, EditableSceneMediaPurpose::PreviewProxy)
        .and_then(|media| serde_json::from_str::<serde_json::Value>(&media.source).ok())
        .and_then(|value| {
            value
                .get("source_image")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
    else {
        return false;
    };
    let source = source.split(['?', '#']).next().unwrap_or("");
    let is_file_url = source.starts_with("file:/") || source.starts_with("file://localhost/");
    let has_unsupported_scheme = source.find(':').is_some_and(|index| {
        !is_file_url
            && source[..index]
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    });
    !source.is_empty()
        && !has_unsupported_scheme
        && [".png", ".jpg", ".jpeg", ".psd"]
            .iter()
            .any(|suffix| source.to_ascii_lowercase().ends_with(suffix))
}

fn resident_diagnostic(
    object: &TimelineObject,
    objects: &[TimelineObject],
) -> Option<EditableSceneDiagnostic> {
    let b = base(object);
    if matches!(
        object,
        TimelineObject::Audio { .. } | TimelineObject::GroupControl { .. }
    ) {
        return None;
    }
    if !verified_object_type(object) {
        return Some(EditableSceneDiagnostic {
            object_id: b.id.clone(),
            code: "unsupportedObjectType".into(),
            detail: format!("{} はV1対象外です", object_type(object)),
        });
    }
    if let Some(group_id) = b
        .group_id
        .as_ref()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
    {
        if objects.iter().any(|candidate| {
            base(candidate)
                .group_id
                .as_ref()
                .is_some_and(|id| id.trim() == group_id)
                && base(candidate)
                    .group_gradient
                    .as_ref()
                    .is_some_and(|gradient| gradient.enabled)
        }) {
            return Some(EditableSceneDiagnostic {
                object_id: b.id.clone(),
                code: "unsupportedGroup".into(),
                detail: "動的なグループグラデーションはV1対象外です".into(),
            });
        }
    }
    if matches!(object, TimelineObject::Video { fields, .. } if fields.reversed == Some(true)) {
        return Some(EditableSceneDiagnostic {
            object_id: b.id.clone(),
            code: "unsupportedVideoMode".into(),
            detail: "逆再生はV1対象外です".into(),
        });
    }
    if b.clipping == Some(true) {
        return Some(EditableSceneDiagnostic {
            object_id: b.id.clone(),
            code: "unsupportedMask".into(),
            detail: "クリッピングマスクはV1対象外です".into(),
        });
    }
    if b.filters.as_ref().is_some_and(|filters| {
        filters
            .iter()
            .any(|filter| filter_enabled(filter) && !resident_filter_supported(object, filter))
    }) {
        return Some(EditableSceneDiagnostic {
            object_id: b.id.clone(),
            code: "unsupportedFilter".into(),
            detail: "有効なfilterはV1対象外です".into(),
        });
    }
    if matches!(object, TimelineObject::GetColorDotField { .. })
        && !get_color_sample_source_supported(object, objects)
    {
        return Some(EditableSceneDiagnostic { object_id: b.id.clone(), code: "unsupportedGetColorSampleSource".into(), detail: "GetColorの参照画像/PSDは、表示開始時点で有効なローカルPNG・JPEG・PSDである必要があります".into() });
    }
    None
}
fn kind_and_dimensions(object: &TimelineObject) -> Option<(MediaKind, f32, f32, String)> {
    match object {
        TimelineObject::Shape { fields, .. } => {
            if matches!(fields.shape_type, crate::schema::ShapeType::Rect) && fields.gradient.as_ref().map(|g| g.enabled).unwrap_or(false) == false {
                Some((MediaKind::SolidColour, fields.width, fields.height, fields.fill.clone()))
            } else if fields.gradient.is_some() { Some((MediaKind::GeneratedGradient, fields.width, fields.height, serde_json::to_string(&fields.gradient).ok()?)) } else { Some((MediaKind::GeneratedShape, fields.width, fields.height, serde_json::to_string(fields).ok()?)) }
        }
        TimelineObject::Image { fields, .. } => Some((MediaKind::Image, fields.width, fields.height, source_path(&fields.src, &fields.file_path))),
        TimelineObject::Video { fields, .. } => Some((MediaKind::Video, fields.width, fields.height, String::new())),
        TimelineObject::Psd { fields, .. } => Some((MediaKind::Psd, fields.width, fields.height, source_path(&fields.src, &fields.file_path))),
        TimelineObject::Text { fields, .. } => {
            let width = fields.measured_width.unwrap_or_else(|| ((fields.text.lines().map(|line| line.encode_utf16().count()).max().unwrap_or(1).max(1) as f32) * fields.font_size * 0.6).ceil());
            let height = fields.measured_height.unwrap_or_else(|| ((fields.text.lines().count().max(1) as f32) * fields.font_size * 1.25).ceil());
            Some((MediaKind::Text, width, height, serde_json::to_string(fields).ok()?))
        }
        TimelineObject::Particle { fields, .. } => Some((MediaKind::GeneratedParticle, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Barcode { fields, .. } => Some((MediaKind::GeneratedBarcode, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::PuzzlePiece { fields, .. } => Some((MediaKind::GeneratedPuzzlePiece, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::ColourWheel { fields, .. } => Some((MediaKind::GeneratedColourWheel, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Gourd { fields, .. } => Some((MediaKind::GeneratedGourd, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Gear { fields, .. } => Some((MediaKind::GeneratedGear, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::TrackBar { fields, .. } => Some((MediaKind::GeneratedTrackBar, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::PieChart { fields, .. } => Some((MediaKind::GeneratedPieChart, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Histogram { fields, .. } => Some((MediaKind::GeneratedHistogram, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::ToneCurve { fields, .. } => Some((MediaKind::GeneratedToneCurve, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::HksyCheckerGrid { fields, .. } => Some((MediaKind::GeneratedHksyCheckerGrid, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::RegionFrame { fields, .. } => Some((MediaKind::GeneratedRegionFrame, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::SimpleTube { fields, .. } => Some((MediaKind::GeneratedSimpleTube, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::SphereDots { fields, .. } => Some((MediaKind::GeneratedSphereDots, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::SphericalField { fields, .. } => Some((MediaKind::GeneratedSphericalField, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Sunburst { fields, .. } => Some((MediaKind::GeneratedSunburst, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::CircularArrow { fields, .. } => Some((MediaKind::GeneratedCircularArrow, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::TriangleBracket { fields, .. } => Some((MediaKind::GeneratedTriangleBracket, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::TartanCheck { fields, .. } => Some((MediaKind::GeneratedTartanCheck, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Houndstooth { fields, .. } => Some((MediaKind::GeneratedHoundstooth, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::Yagasuri { fields, .. } => Some((MediaKind::GeneratedYagasuri, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::PaperAirplane { fields, .. } => Some((MediaKind::GeneratedPaperAirplane, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::AsanohaPattern { fields, .. } => Some((MediaKind::GeneratedAsanohaPattern, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::FocusLinesPlus { fields, .. } => Some((MediaKind::GeneratedFocusLinesPlus, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::RandomLineEx { fields, .. } => Some((MediaKind::GeneratedRandomLineEx, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::ContourTrace { fields, .. } => Some((MediaKind::GeneratedContourTrace, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::DisplacementPoly { fields, .. } => Some((MediaKind::GeneratedDisplacementPoly, fields.width, fields.height, serde_json::to_string(fields).ok()?)),
        TimelineObject::PlainEffectorLine { fields, .. } => Some((MediaKind::GeneratedPlainEffectorLine, fields.width, fields.height, serde_json::to_string(&json!({
            "width": fields.width, "height": fields.height, "radius": clamp(fields.radius, 1.0, 2000.0), "strength": clamp(fields.strength, -10.0, 10.0), "randomness": clamp(fields.randomness, -1000.0, 1000.0), "zoom": clamp(fields.zoom, -2.0, 5.0), "invert": fields.invert,
            "lineCount": clamp(fields.line_count as f32, 1.0, 128.0).trunc(), "lineWidth": clamp(fields.line_width, 0.25, 200.0), "colour": valid_colour(&fields.colour, "#f74d52"), "colourAmount": clamp(fields.colour_amount, 0.0, 1.0), "seed": fields.seed,
        })).ok()?)),
        TimelineObject::Hologram { fields, .. } => Some((MediaKind::GeneratedHologram, fields.width, fields.height, serde_json::to_string(&json!({
            "width": fields.width, "height": fields.height, "tileSize": clamp(fields.tile_size as f32, 10.0, 1000.0).trunc(), "rotationDegrees": clamp(fields.rotation_degrees, -720.0, 720.0), "gradientAngleDegrees": clamp(fields.gradient_angle_degrees, -720.0, 720.0), "colourMode": clamp(fields.colour_mode as f32, 0.0, 2.0).trunc(), "tintColour": valid_colour(&fields.tint_colour, "#ffffff"),
        })).ok()?)),
        TimelineObject::Protractor { fields, .. } => Some((MediaKind::GeneratedProtractor, fields.width, fields.height, serde_json::to_string(&json!({
            "width": fields.width, "height": fields.height, "radius": clamp(fields.radius as f32, 1.0, 2000.0).trunc(), "measuredAngleDegrees": clamp(fields.measured_angle_degrees, 0.0, 180.0), "tickStepDegrees": clamp(fields.tick_step_degrees as f32, 1.0, 90.0).trunc(), "majorTickStepDegrees": clamp(fields.major_tick_step_degrees as f32, 1.0, 180.0).trunc(), "decimalPlaces": clamp(fields.decimal_places as f32, 0.0, 5.0).trunc(), "lineColour": valid_colour(&fields.line_colour, "#ffffff"), "textColour": valid_colour(&fields.text_colour, "#ffffff"), "shadowColour": valid_colour(&fields.shadow_colour, "#000000"),
        })).ok()?)),
        TimelineObject::ShakingPolygon { fields, .. } => Some((MediaKind::GeneratedShakingPolygon, fields.width, fields.height, serde_json::to_string(&json!({
            "width": fields.width, "height": fields.height,
            "lineWidth": clamp(fields.line_width as f32, 1.0, 100.0).trunc(),
            "vertexCount": clamp(fields.vertex_count as f32, 2.0, 16.0).trunc(),
            "fixedDiameter": clamp(fields.fixed_diameter as f32, 0.0, 2000.0).trunc(),
            "verticalDistortionPercent": clamp(fields.vertical_distortion_percent, -100.0, 100.0),
            "repeatCount": clamp(fields.repeat_count as f32, 1.0, 100.0).trunc(),
            "repeatFrequency": (fields.repeat_frequency as f32).max(1.0).trunc(),
            "fill": fields.fill, "jitterRange": clamp(fields.jitter_range, 0.0, 2000.0),
            "jitterInterval": (fields.jitter_interval as f32).max(1.0).trunc(), "stepped": fields.stepped,
            "colour": valid_colour(&fields.colour, "#ffffff"), "seed": fields.seed,
        })).ok()?)),
        TimelineObject::ShatteredSphere { fields, .. } => Some((MediaKind::GeneratedShatteredSphere, fields.width, fields.height, serde_json::to_string(&json!({
            "width": fields.width, "height": fields.height,
            "fractureAmount": clamp(fields.fracture_amount, 0.0, 5000.0), "delay": clamp(fields.delay, 0.0, 1000.0),
            "radius": clamp(fields.radius, 1.0, 10000.0), "limitDistance": clamp(fields.limit_distance, 0.0, 10000.0),
            "thickness": clamp(fields.thickness, 0.0, 1000.0), "fragmentSize": clamp(fields.fragment_size, 1.0, 1000.0),
            "randomShape": clamp(fields.random_shape, 0.0, 100.0), "speed": clamp(fields.speed, 0.0, 1000.0),
            "impact": clamp(fields.impact, 0.0, 1000.0), "gravityX": clamp(fields.gravity_x, -1000.0, 1000.0),
            "gravityY": clamp(fields.gravity_y, -1000.0, 1000.0), "gravityZ": clamp(fields.gravity_z, -1000.0, 1000.0),
            "spin": clamp(fields.spin, 0.0, 1000.0), "directionDiffusion": clamp(fields.direction_diffusion, 0.0, 1000.0),
            "colour": valid_colour(&fields.colour, "#ffffff"), "seed": fields.seed,
        })).ok()?)),
        _ => None,
    }
}
fn audio_source(
    objects: &[TimelineObject],
    id: &Option<String>,
    layer: Option<i32>,
    time: f32,
) -> (String, String) {
    if let Some(id) = id {
        if let Some(TimelineObject::Audio { base, fields }) =
            objects.iter().find(|item| base(item).id == *id)
        {
            return (base.id.clone(), source_path(&fields.src, &fields.file_path));
        }
    }
    if let Some(layer) = layer {
        if let Some(TimelineObject::Audio { base, fields }) = objects.iter().find(|item| {
            let b = base(item);
            matches!(item, TimelineObject::Audio { .. })
                && b.layer == layer as f32
                && time >= b.start_time
                && time < b.start_time + b.duration
        }) {
            return (base.id.clone(), source_path(&fields.src, &fields.file_path));
        }
    }
    (String::new(), String::new())
}
fn media_for(
    object: &TimelineObject,
    objects: &[TimelineObject],
    purpose: EditableSceneMediaPurpose,
) -> Option<SceneMediaReference> {
    let b = base(object);
    if let TimelineObject::AudioVisualization { fields, .. } = object {
        let (target_id, target_source) = audio_source(
            objects,
            &fields.target_audio_id,
            fields.target_layer,
            b.start_time,
        );
        return Some(SceneMediaReference { id:b.id.clone(), kind:MediaKind::GeneratedAudioWaveform, source:serde_json::to_string(&json!({"generator":"audio-waveform-r","target_audio_id":target_id,"target_source":target_source,"sample_window_seconds":0.05,"colour":if fields.color.is_empty(){"#00ff00"}else{&fields.color},"thickness":fields.thickness.max(1.0),"amplitude":fields.amplitude.max(0.0)})).unwrap(), width:dimension(fields.width), height:dimension(fields.height), source_rate:None, active_layer_ids:vec![] });
    }
    if let TimelineObject::AudioSphere { fields, .. } = object {
        let (target_id, target_source) = audio_source(
            objects,
            &fields.target_audio_id,
            fields.target_layer,
            b.start_time,
        );
        return Some(SceneMediaReference { id:b.id.clone(), kind:MediaKind::GeneratedAudioSphere, source:serde_json::to_string(&json!({"generator":"audio-sphere-93","target_audio_id":target_id,"target_source":target_source,"sample_window_seconds":fields.sample_window_seconds.clamp(0.001,10.),"columns":fields.columns.clamp(2,64),"rows":fields.rows.clamp(2,64),"base_radius":fields.base_radius.clamp(1.,2000.),"audio_influence":fields.audio_influence.clamp(0.,4.),"point_size":fields.point_size.clamp(0.,200.),"polygon_size":fields.polygon_size.clamp(0.,4.),"random_amount":fields.random_amount.clamp(0.,4.),"colour":fields.colour,"seed":fields.seed})).unwrap(), width:dimension(fields.width), height:dimension(fields.height), source_rate:None, active_layer_ids:vec![] });
    }
    if let TimelineObject::GetColorDotField { fields, .. } = object {
        let mut value = json!({"generator":"getcolor-v2r-dot-field","columns":fields.columns.clamp(1,512),"rows":fields.rows.clamp(1,512),"dot_size":fields.dot_size.clamp(0.,2000.),"size_influence":fields.size_influence.clamp(0.,4.),"luminance_influence":fields.luminance_influence.clamp(0.,4.),"hue_shift_degrees":fields.hue_shift_degrees.clamp(-720.,720.),"alternate_rows":fields.alternate_rows,"foreground_colour":fields.foreground_colour,"secondary_colour":fields.secondary_colour,"background_colour":fields.background_colour,"seed":fields.seed});
        if let Some(dot_shape) = &fields.dot_shape {
            value["dot_shape"] = json!(dot_shape);
        }
        if let Some(stroke_width) = fields.stroke_width {
            value["stroke_width"] = json!(stroke_width);
        }
        let candidate = fields
            .sample_source_object_id
            .as_ref()
            .and_then(|id| {
                objects.iter().find(|o| {
                    let x = base(o);
                    x.id == *id
                        && b.start_time >= x.start_time
                        && b.start_time < x.start_time + x.duration
                })
            })
            .or_else(|| {
                fields.sample_source_layer.and_then(|layer| {
                    objects.iter().find(|o| {
                        let x = base(o);
                        (x.layer == layer as f32)
                            && b.start_time >= x.start_time
                            && b.start_time < x.start_time + x.duration
                            && sample_path(o).is_some()
                    })
                })
            });
        let sample = fields
            .sample_source_path
            .clone()
            .filter(|s| !s.is_empty())
            .or_else(|| candidate.and_then(sample_path));
        if let Some(path) = sample {
            value["source_image"] = json!(path);
            if let Some(TimelineObject::Psd { fields, .. }) = candidate {
                let mut ids: Vec<_> = fields
                    .active_layer_ids
                    .as_ref()
                    .into_iter()
                    .flat_map(|ids| ids.iter())
                    .filter(|(_, active)| **active)
                    .map(|(id, _)| id.clone())
                    .collect();
                ids.sort();
                value["source_active_layer_ids"] = json!(ids);
            }
            value["sample_strength"] = json!(fields.sample_strength.unwrap_or(1.).clamp(0., 1.));
            value["sample_hue_shift_degrees"] = json!(fields
                .sample_hue_shift_degrees
                .unwrap_or(0.)
                .clamp(-720., 720.));
        }
        return Some(SceneMediaReference {
            id: b.id.clone(),
            kind: MediaKind::GeneratedGetColorDots,
            source: serde_json::to_string(&value).unwrap(),
            width: dimension(fields.width),
            height: dimension(fields.height),
            source_rate: None,
            active_layer_ids: vec![],
        });
    }
    let (kind, width, height, mut source) = kind_and_dimensions(object)?;
    if let TimelineObject::Video { fields, .. } = object {
        source = match purpose {
            EditableSceneMediaPurpose::PreviewProxy => fields
                .proxy_file_path
                .clone()
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| source_path(&fields.src, &fields.file_path)),
            EditableSceneMediaPurpose::ExportOriginal => {
                source_path(&fields.src, &fields.file_path)
            }
        };
    }
    let active_layer_ids = if let TimelineObject::Psd { fields, .. } = object {
        let mut ids: Vec<_> = fields
            .active_layer_ids
            .as_ref()
            .into_iter()
            .flat_map(|ids| ids.iter())
            .filter(|(_, active)| **active)
            .map(|(id, _)| id.clone())
            .collect();
        ids.sort();
        ids
    } else {
        vec![]
    };
    Some(SceneMediaReference {
        id: b.id.clone(),
        kind,
        source,
        width: dimension(width),
        height: dimension(height),
        source_rate: None,
        active_layer_ids,
    })
}
fn sample_path(object: &TimelineObject) -> Option<String> {
    match object {
        TimelineObject::Image { fields, .. } => Some(source_path(&fields.src, &fields.file_path)),
        TimelineObject::Psd { fields, .. } => Some(source_path(&fields.src, &fields.file_path)),
        _ => None,
    }
}

fn position_keyframes(b: &crate::schema::BaseObject, fps: f32) -> Vec<PositionKeyframe> {
    let normalised = b.keyframes.as_ref().filter(|items| items.len() >= 2);
    if let Some(items) = normalised {
        let mut items = items.clone();
        items.sort_by(|left, right| {
            left.time
                .total_cmp(&right.time)
                .then(left.id.cmp(&right.id))
        });
        return items
            .iter()
            .map(|item| PositionKeyframe {
                frame_offset: frame((item.time - b.start_time).clamp(0.0, b.duration), fps),
                x: finite(item.x, 0.0),
                y: finite(item.y, 0.0),
                easing: item.easing.unwrap_or(b.easing),
            })
            .collect();
    }
    if !b.enable_animation {
        return Vec::new();
    }
    vec![
        PositionKeyframe {
            frame_offset: 0,
            x: b.x,
            y: b.y,
            easing: b.easing,
        },
        PositionKeyframe {
            frame_offset: frame(b.duration, fps),
            x: b.end_x,
            y: b.end_y,
            easing: Easing::Linear,
        },
    ]
}

fn subject_crop(object: &TimelineObject, fps: f32) -> Option<SubjectCropAnimation> {
    let TimelineObject::Video { base: b, fields } = object else {
        return None;
    };
    if fields.subject_crop_enabled != Some(true) {
        return None;
    }
    let mut keyframes = fields.subject_crop_keyframes.as_ref()?.clone();
    if keyframes.is_empty() {
        return None;
    }
    let start = b.start_time;
    let end = b.start_time + b.duration;
    keyframes.sort_by(|left, right| {
        left.time
            .total_cmp(&right.time)
            .then(left.id.cmp(&right.id))
    });
    Some(SubjectCropAnimation {
        source_width: fields.width,
        source_height: fields.height,
        keyframes: keyframes
            .into_iter()
            .map(|item| SubjectCropKeyframe {
                frame_offset: frame((item.time.clamp(start, end) - b.start_time).max(0.0), fps),
                x: clamp(item.x, 0.0, 1.0),
                y: clamp(item.y, 0.0, 1.0),
                width: (clamp(item.x, 0.0, 1.0) + clamp(item.width, 0.0, 1.0)).min(1.0)
                    - clamp(item.x, 0.0, 1.0),
                height: (clamp(item.y, 0.0, 1.0) + clamp(item.height, 0.0, 1.0)).min(1.0)
                    - clamp(item.y, 0.0, 1.0),
            })
            .collect(),
    })
}

fn static_effects(object: &TimelineObject) -> (Vec<Effect>, Vec<WipeAnimation>, f32) {
    let b = base(object);
    let mut effects = Vec::new();
    let mut wipes = Vec::new();
    let mut fade = 1.0;
    let mut legacy = Vec::new();
    if b.filters.is_none() {
        if let Some(value) = &b.color_correction {
            legacy.push(serde_json::json!({"type":"color_correction","id":"legacy-colour","enabled":value.enabled,"params":{"brightness":value.brightness,"contrast":value.contrast,"saturation":value.saturation,"hue":value.hue}}));
        }
        if let Some(value) = &b.custom_clipping {
            legacy.push(serde_json::json!({"type":"clipping","id":"legacy-clipping","enabled":value.enabled,"params":{"top":value.top,"bottom":value.bottom,"left":value.left,"right":value.right,"angle":value.angle,"radius":value.radius}}));
        }
        if let Some(value) = &b.shadow {
            legacy.push(serde_json::json!({"type":"shadow","id":"legacy-shadow","enabled":value.enabled,"params":{"colour":value.colour,"blur":value.blur,"offsetX":value.offset_x,"offsetY":value.offset_y,"opacity":value.opacity}}));
        }
    }
    let filters: Vec<ObjectFilter> = b
        .filters
        .clone()
        .unwrap_or_default()
        .into_iter()
        .chain(
            legacy
                .into_iter()
                .filter_map(|value| serde_json::from_value(value).ok()),
        )
        .collect();
    for filter in filters.iter().filter(|filter| filter_enabled(filter)) {
        match filter {
            ObjectFilter::ColorCorrection { params, .. } => {
                effects.push(Effect::ColourCorrection {
                    brightness: clamp(params.brightness, 0.0, f32::MAX),
                    contrast: finite(params.contrast, 0.0),
                    saturation: finite(params.saturation, 0.0),
                    hue_degrees: finite(params.hue, 0.0),
                })
            }
            ObjectFilter::ColourAberration { params, .. } => {
                effects.push(Effect::ColourAberration {
                    offset_x: clamp(params.offset_x, 0.0, f32::MAX),
                    offset_y: clamp(params.offset_y, 0.0, f32::MAX),
                })
            }
            ObjectFilter::Outline { params, .. } => effects.push(Effect::Outline {
                colour: colour(&params.colour),
                thickness: clamp(params.thickness, 0.0, f32::MAX),
                opacity: clamp(params.opacity, 0.0, 1.0),
            }),
            ObjectFilter::Clipping { params, .. } => effects.push(Effect::Clipping {
                top: clamp(params.top, 0.0, f32::MAX),
                bottom: clamp(params.bottom, 0.0, f32::MAX),
                left: clamp(params.left, 0.0, f32::MAX),
                right: clamp(params.right, 0.0, f32::MAX),
                angle_degrees: finite(params.angle, 0.0),
            }),
            ObjectFilter::Shadow { params, .. } => effects.push(Effect::DropShadow {
                colour: colour(&params.colour),
                offset_x: finite(params.offset_x, 0.0),
                offset_y: finite(params.offset_y, 0.0),
                opacity: clamp(params.opacity, 0.0, 1.0),
            }),
            ObjectFilter::Blur { params, .. } if params.strength > 0.05 => {
                effects.push(Effect::Blur {
                    radius: clamp(params.strength, 0.0, f32::MAX),
                    strength: 1.0,
                })
            }
            ObjectFilter::Fade { params, .. } => fade = clamp(params.opacity, 0.0, 1.0),
            ObjectFilter::Wipe { params, .. } => {
                let index = effects.len() as u32;
                wipes.push(WipeAnimation {
                    effect_index: index,
                    edge: params.edge,
                    reverse: params.reverse,
                });
            }
            ObjectFilter::SpotLight { params, .. } => effects.push(Effect::SpotLight {
                centre_x: clamp(params.centre_x, 0.0, 1.0),
                centre_y: clamp(params.centre_y, 0.0, 1.0),
                radius: clamp(params.radius, 0.0, f32::MAX),
                intensity: clamp(params.intensity, 0.0, f32::MAX),
                colour: colour(&params.colour),
            }),
            ObjectFilter::DisplacementMap { params, .. } => effects.push(Effect::DisplacementMap {
                amount_x: clamp(params.amount_x, 0.0, f32::MAX),
                amount_y: clamp(params.amount_y, 0.0, f32::MAX),
                size: clamp(params.size, 1.0, f32::MAX),
                strength: clamp(params.strength, 0.0, 1.0),
            }),
            ObjectFilter::FakeDof { params, .. } => effects.push(Effect::FakeDof {
                focus_x: clamp(params.focus_x, 0.0, 1.0),
                focus_y: clamp(params.focus_y, 0.0, 1.0),
                focus_radius: clamp(params.focus_radius, 0.01, 1.0),
                blur: clamp(params.blur, 0.0, f32::MAX),
                strength: clamp(params.strength, 0.0, 1.0),
            }),
            ObjectFilter::Stretch { params, .. } => effects.push(Effect::Stretch {
                angle_degrees: finite(params.angle, 0.0),
                amount: clamp(params.amount, 0.0, f32::MAX),
                strength: clamp(params.strength, 0.0, 1.0),
            }),
            ObjectFilter::MultiSlicer { params, .. } => effects.push(Effect::MultiSlicer {
                angle_degrees: finite(params.angle, 45.0),
                offset: clamp(params.offset, 0.0, f32::MAX),
                slices: clamp(params.slices, 2.0, f32::MAX).round() as u32,
                expansion: clamp(params.expansion, 0.0, f32::MAX),
                strength: clamp(params.strength, 0.0, 1.0),
            }),
            ObjectFilter::OctTransform { params, .. } => effects.push(Effect::OctTransform {
                scale: clamp(params.scale, 0.01, f32::MAX),
                rotation_degrees: finite(params.rotation, 0.0),
                vertex_count: clamp(params.vertex_count, 3.0, f32::MAX).round() as u32,
                warp: clamp(params.warp, 0.0, f32::MAX),
                strength: clamp(params.strength, 0.0, 1.0),
            }),
            ObjectFilter::AreaExpand { params, .. } => effects.push(Effect::AreaExpand {
                top: clamp(params.top, 0.0, f32::MAX),
                bottom: clamp(params.bottom, 0.0, f32::MAX),
                left: clamp(params.left, 0.0, f32::MAX),
                right: clamp(params.right, 0.0, f32::MAX),
                fill: params.fill,
            }),
            ObjectFilter::SmartClipping { params, .. } => effects.push(Effect::Clipping {
                top: clamp(params.top, 0.0, f32::MAX),
                bottom: clamp(params.bottom, 0.0, f32::MAX),
                left: clamp(params.left, 0.0, f32::MAX),
                right: clamp(params.right, 0.0, f32::MAX),
                angle_degrees: 0.0,
            }),
            ObjectFilter::Gradient { .. }
            | ObjectFilter::Vibration { .. }
            | ObjectFilter::Blur { .. } => {}
            ObjectFilter::AutoBlur { .. } => {}
        }
    }
    (effects, wipes, fade)
}

fn filter_enabled(filter: &ObjectFilter) -> bool {
    match filter {
        ObjectFilter::ColorCorrection { enabled, .. }
        | ObjectFilter::ColourAberration { enabled, .. }
        | ObjectFilter::Outline { enabled, .. }
        | ObjectFilter::Clipping { enabled, .. }
        | ObjectFilter::Vibration { enabled, .. }
        | ObjectFilter::Shadow { enabled, .. }
        | ObjectFilter::Gradient { enabled, .. }
        | ObjectFilter::Blur { enabled, .. }
        | ObjectFilter::Fade { enabled, .. }
        | ObjectFilter::Wipe { enabled, .. }
        | ObjectFilter::SpotLight { enabled, .. }
        | ObjectFilter::DisplacementMap { enabled, .. }
        | ObjectFilter::FakeDof { enabled, .. }
        | ObjectFilter::AutoBlur { enabled, .. }
        | ObjectFilter::Stretch { enabled, .. }
        | ObjectFilter::MultiSlicer { enabled, .. }
        | ObjectFilter::OctTransform { enabled, .. }
        | ObjectFilter::AreaExpand { enabled, .. }
        | ObjectFilter::SmartClipping { enabled, .. } => *enabled,
    }
}

/// 42 kind を明示的に走査し、未移植 kind は診断として返す。誤った media を黙って
/// 出力しないため、diagnostic がある場合でも安全に構築できた部分だけを返す。
pub fn build_evaluation_scene(graph: &EditableSceneGraph) -> BuiltEvaluationScene {
    let purpose = graph
        .media_context
        .as_ref()
        .map(|c| c.purpose)
        .unwrap_or(EditableSceneMediaPurpose::PreviewProxy);
    let mut diagnostics: Vec<EditableSceneDiagnostic> = graph
        .objects
        .iter()
        .filter(|object| {
            let b = base(object);
            graph
                .layers
                .get(b.layer.max(0.) as usize)
                .map(|l| l.visible)
                .unwrap_or(true)
        })
        .filter_map(|object| resident_diagnostic(object, &graph.objects))
        .collect();
    let mut visual: Vec<(usize, &TimelineObject)> = graph
        .objects
        .iter()
        .enumerate()
        .filter(|(_, o)| {
            let b = base(o);
            graph
                .layers
                .get(b.layer.max(0.) as usize)
                .map(|l| l.visible)
                .unwrap_or(true)
        })
        .collect();
    visual.sort_by(|a, b| {
        base(a.1)
            .layer
            .total_cmp(&base(b.1).layer)
            .then(a.0.cmp(&b.0))
    });
    let mut media = Vec::new();
    let mut tracks: Vec<(f32, Vec<Clip>)> = Vec::new();
    for (_, object) in &visual {
        let b = base(object);
        if matches!(
            object,
            TimelineObject::Audio { .. } | TimelineObject::GroupControl { .. }
        ) {
            continue;
        }
        let Some(mut reference) = media_for(object, &graph.objects, purpose) else {
            diagnostics.push(EditableSceneDiagnostic {
                object_id: b.id.clone(),
                code: "unsupportedObjectType".into(),
                detail: "canonical media serializer が未移植です".into(),
            });
            continue;
        };
        if matches!(object, TimelineObject::Video { .. }) {
            reference.source_rate = Some(Fps {
                numerator: graph.settings.fps.round() as u32,
                denominator: 1,
            });
        }
        // media は direct 経路のため常に保持するが、resident に不適格な
        // object は TS builder と同じく clip には投影しない。
        if diagnostics.iter().any(|diagnostic| diagnostic.object_id == b.id) {
            media.push(reference);
            continue;
        }
        let kind = match reference.kind {
            MediaKind::Video => ClipKind::VideoPlane,
            MediaKind::Text => ClipKind::TextPlane,
            MediaKind::SolidColour => ClipKind::SolidColourPlane,
            MediaKind::Image => ClipKind::ImagePlane,
            MediaKind::Psd => ClipKind::ImagePlane,
            MediaKind::GeneratedAudioWaveform => ClipKind::GeneratedAudioWaveformPlane,
            MediaKind::GeneratedAudioSphere => ClipKind::GeneratedAudioSpherePlane,
            MediaKind::GeneratedParticle => ClipKind::GeneratedParticlePlane,
            MediaKind::GeneratedBarcode => ClipKind::GeneratedBarcodePlane,
            MediaKind::GeneratedPuzzlePiece => ClipKind::GeneratedPuzzlePiecePlane,
            MediaKind::GeneratedColourWheel => ClipKind::GeneratedColourWheelPlane,
            MediaKind::GeneratedGourd => ClipKind::GeneratedGourdPlane,
            MediaKind::GeneratedGear => ClipKind::GeneratedGearPlane,
            MediaKind::GeneratedTrackBar => ClipKind::GeneratedTrackBarPlane,
            MediaKind::GeneratedPieChart => ClipKind::GeneratedPieChartPlane,
            MediaKind::GeneratedHistogram => ClipKind::GeneratedHistogramPlane,
            MediaKind::GeneratedToneCurve => ClipKind::GeneratedToneCurvePlane,
            MediaKind::GeneratedGetColorDots => ClipKind::GeneratedGetColorDotsPlane,
            MediaKind::GeneratedHksyCheckerGrid => ClipKind::GeneratedHksyCheckerGridPlane,
            MediaKind::GeneratedRegionFrame => ClipKind::GeneratedRegionFramePlane,
            MediaKind::GeneratedSimpleTube => ClipKind::GeneratedSimpleTubePlane,
            MediaKind::GeneratedSphereDots => ClipKind::GeneratedSphereDotsPlane,
            MediaKind::GeneratedSphericalField => ClipKind::GeneratedSphericalFieldPlane,
            MediaKind::GeneratedSunburst => ClipKind::GeneratedSunburstPlane,
            MediaKind::GeneratedCircularArrow => ClipKind::GeneratedCircularArrowPlane,
            MediaKind::GeneratedTriangleBracket => ClipKind::GeneratedTriangleBracketPlane,
            MediaKind::GeneratedTartanCheck => ClipKind::GeneratedTartanCheckPlane,
            MediaKind::GeneratedHoundstooth => ClipKind::GeneratedHoundstoothPlane,
            MediaKind::GeneratedYagasuri => ClipKind::GeneratedYagasuriPlane,
            MediaKind::GeneratedPaperAirplane => ClipKind::GeneratedPaperAirplanePlane,
            MediaKind::GeneratedAsanohaPattern => ClipKind::GeneratedAsanohaPatternPlane,
            MediaKind::GeneratedFocusLinesPlus => ClipKind::GeneratedFocusLinesPlusPlane,
            MediaKind::GeneratedRandomLineEx => ClipKind::GeneratedRandomLineExPlane,
            MediaKind::GeneratedContourTrace => ClipKind::GeneratedContourTracePlane,
            MediaKind::GeneratedDisplacementPoly => ClipKind::GeneratedDisplacementPolyPlane,
            MediaKind::GeneratedPlainEffectorLine => ClipKind::GeneratedPlainEffectorLinePlane,
            MediaKind::GeneratedHologram => ClipKind::GeneratedHologramPlane,
            MediaKind::GeneratedProtractor => ClipKind::GeneratedProtractorPlane,
            MediaKind::GeneratedShakingPolygon => ClipKind::GeneratedShakingPolygonPlane,
            MediaKind::GeneratedShatteredSphere => ClipKind::GeneratedShatteredSpherePlane,
            MediaKind::GeneratedShape | MediaKind::GeneratedGradient => {
                ClipKind::GeneratedShapePlane
            }
        };
        let (effects, wipes, fade) = static_effects(object);
        let clip = Clip {
            id: b.id.clone(),
            media_id: b.id.clone(),
            kind,
            start_frame: frame(b.start_time, graph.settings.fps),
            duration_frames: frame(b.duration, graph.settings.fps).max(1),
            source_frame_offset: if matches!(object, TimelineObject::Video { .. }) {
                frame(b.offset.unwrap_or(0.), graph.settings.fps)
            } else {
                0
            },
            transform: Transform {
                translation_x: b
                    .keyframes
                    .as_ref()
                    .filter(|k| k.len() >= 2)
                    .and_then(|k| k.first())
                    .map_or(b.x, |k| k.x),
                translation_y: b
                    .keyframes
                    .as_ref()
                    .filter(|k| k.len() >= 2)
                    .and_then(|k| k.first())
                    .map_or(b.y, |k| k.y),
                scale_x: b.scale_x
                    * if let TimelineObject::Psd { fields, .. } = object {
                        fields.scale
                    } else {
                        1.0
                    },
                scale_y: b.scale_y
                    * if let TimelineObject::Psd { fields, .. } = object {
                        fields.scale
                    } else {
                        1.0
                    },
                rotation_degrees: b.rotation,
                sampling: if matches!(object,TimelineObject::Shape{fields,..} if fields.gradient.as_ref().is_none_or(|gradient| !gradient.enabled))
                {
                    SamplingMode::Nearest
                } else {
                    SamplingMode::Bilinear
                },
            },
            opacity: b.opacity * fade,
            opacity_keyframes: vec![],
            position_keyframes: position_keyframes(b, graph.settings.fps),
            subject_crop: subject_crop(object, graph.settings.fps),
            wipe_animations: wipes,
            effects,
        };
        if let Some((_, clips)) = tracks.iter_mut().find(|(layer, _)| *layer == b.layer) {
            clips.push(clip)
        } else {
            tracks.push((b.layer, vec![clip]));
        }
        media.push(reference);
    }
    tracks.sort_by(|a, b| a.0.total_cmp(&b.0));
    let group_controls = graph
        .objects
        .iter()
        .filter_map(|object| {
            if let TimelineObject::GroupControl { base: b, fields } = object {
                let mut target = Vec::new();
                for (_, candidate) in &visual {
                    let c = base(candidate);
                    if c.layer > b.layer
                        && (fields.target_layer_count == 0
                            || c.layer <= b.layer + fields.target_layer_count as f32)
                    {
                        let id = format!("layer-{}", c.layer as i32);
                        if !target.contains(&id) {
                            target.push(id)
                        }
                    }
                }
                Some(GroupControl {
                    id: b.id.clone(),
                    start_frame: frame(b.start_time, graph.settings.fps),
                    duration_frames: frame(b.duration, graph.settings.fps).max(1),
                    transform: Transform {
                        translation_x: b.x,
                        translation_y: b.y,
                        scale_x: b.scale_x,
                        scale_y: b.scale_y,
                        rotation_degrees: b.rotation,
                        sampling: SamplingMode::Bilinear,
                    },
                    opacity: b.opacity,
                    position_keyframes: vec![],
                    target_track_ids: target,
                })
            } else {
                None
            }
        })
        .collect();
    let project = Project {
        id: graph
            .media_context
            .as_ref()
            .and_then(|c| c.scene_id.clone())
            .unwrap_or_else(|| "editable-scene".into()),
        version: 1,
        size: ProjectSize {
            width: dimension(graph.settings.width),
            height: dimension(graph.settings.height),
        },
        fps: Fps {
            numerator: graph.settings.fps.round() as u32,
            denominator: 1,
        },
        colour: ColourPipeline::rec709_sdr_linear(),
        media: media
            .iter()
            .map(|m| MediaReference {
                id: m.id.clone(),
                kind: m.kind.clone(),
                source: m.source.clone(),
            })
            .collect(),
        tracks: tracks
            .into_iter()
            .map(|(layer, clips)| crate::schema::Track {
                id: format!("layer-{}", layer as i32),
                clips,
            })
            .collect(),
        group_controls,
    };
    BuiltEvaluationScene {
        resident_eligible: diagnostics.is_empty(),
        project,
        media,
        diagnostics,
    }
}
