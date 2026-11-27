//! エージェント用プロジェクトレシピ（`public/agent-projects/*.json`）の
//! 解析・展開。`src/agentProject/agentProject.ts` の `parseAgentProjectSpec` /
//! `buildAgentProjectFile` に対応する Rust 側の純粋関数群（R4-4）。
//!
//! IPC・ファイル I/O は含まない。`schema/agent-project.schema.json` は
//! ここで定義する `AgentProjectSpec` から `schemars` で生成する
//! （`codegen_types` バイナリ）。
//!
//! **エラーメッセージ**: 実行時の検証エラーはすべて `src/agentProject/agentProject.ts`
//! の `parseAgentProjectSpec`/`validateAgentObject` と同じ日本語メッセージを
//! そのまま移植している（AI エージェントがレシピ作者としてこのメッセージを
//! 直接読むため、文言を変えていない）。

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::schema::{
    default_layers, AudioObjectFields, BaseObject, CameraState, Easing, EditorMode,
    GetColorDotFieldObjectFields, ImageObjectFields, LayerState, ParticleObjectFields, ProjectFile,
    ProjectSettings, ShapeGradientFill, ShapeGradientKind, ShapeGradientScope, ShapeObjectFields, ShapeType,
    ShatteredSphereObjectFields, StageCamera3D, TextAlignment, TextObjectFields, TextShadow, TextStroke,
    TimelineObject, VideoObjectFields, PROJECT_FILE_FORMAT,
};

pub const AGENT_PROJECT_SPEC_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentProjectSettings {
    pub width: f32,
    pub height: f32,
    pub fps: f32,
    #[serde(rename = "sampleRate")]
    #[ts(rename = "sampleRate")]
    pub sample_rate: f32,
    pub duration: f32,
    #[serde(rename = "editorMode", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "editorMode")]
    pub editor_mode: Option<EditorMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentLayerSpec {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum AgentAlignValue {
    Start,
    Center,
    End,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentAlignSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<AgentAlignValue>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<AgentAlignValue>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum AgentGradientKind {
    Linear,
    Radial,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentGradientSpec {
    #[serde(rename = "type")]
    #[ts(rename = "type")]
    pub kind: AgentGradientKind,
    pub colours: Vec<String>,
    pub stops: Vec<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentToSpec {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentBlurFilterSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strength: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quality: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "type")]
pub enum AgentFilterSpec {
    #[serde(rename = "blur")]
    Blur(AgentBlurFilterSpec),
}

/// `AgentObjectBase`（`src/agentProject/agentProject.ts`）と同形。
/// `kind` 判別自体は `AgentObjectSpec`（下）の `#[serde(tag = "kind")]` が
/// 担うため、ここには含めない（`BaseObject`/`TimelineObject` の関係と同じ
/// パターン）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentObjectBase {
    pub id: String,
    pub layer: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub start: f32,
    pub duration: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f32>,
    #[serde(rename = "scaleX", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "scaleX")]
    pub scale_x: Option<f32>,
    #[serde(rename = "scaleY", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "scaleY")]
    pub scale_y: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<AgentToSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub easing: Option<Easing>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filters: Option<Vec<AgentFilterSpec>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<AgentAlignSpec>,
    #[serde(rename = "relativeTo", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "relativeTo")]
    pub relative_to: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentShapeExtra {
    pub shape: ShapeType,
    pub fill: String,
    #[serde(rename = "cornerRadius", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "cornerRadius")]
    pub corner_radius: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gradient: Option<AgentGradientSpec>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentTextExtra {
    pub text: String,
    #[serde(rename = "fontSize", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "fontSize")]
    pub font_size: Option<f32>,
    #[serde(rename = "fontFamily", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "fontFamily")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(rename = "textAlignment", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "textAlignment")]
    pub text_alignment: Option<TextAlignment>,
    #[serde(rename = "letterSpacing", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "letterSpacing")]
    pub letter_spacing: Option<f32>,
    #[serde(rename = "textStroke", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "textStroke")]
    pub text_stroke: Option<TextStroke>,
    #[serde(rename = "textShadow", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "textShadow")]
    pub text_shadow: Option<TextShadow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentParticleExtra {
    #[serde(rename = "particleCount", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "particleCount")]
    pub particle_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spread: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speed: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colour: Option<String>,
    #[serde(rename = "lifetimeSeconds", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "lifetimeSeconds")]
    pub lifetime_seconds: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentDotFieldExtra {
    #[serde(rename = "dotSize", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "dotSize")]
    pub dot_size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub columns: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rows: Option<u32>,
    #[serde(rename = "foregroundColour", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "foregroundColour")]
    pub foreground_colour: Option<String>,
    #[serde(rename = "secondaryColour", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "secondaryColour")]
    pub secondary_colour: Option<String>,
    #[serde(rename = "backgroundColour", default, skip_serializing_if = "Option::is_none")]
    #[ts(rename = "backgroundColour")]
    pub background_colour: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentShatteredSphereExtra {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colour: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentImageExtra {
    pub src: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentVideoExtra {
    pub src: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentAudioExtra {
    pub src: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub muted: Option<bool>,
}

/// `src/agentProject/agentProject.ts` の `AgentObjectSpec` 判別共用体と同形。
/// TS 側は `AgentObjectBase & { kind: 'xxx', ... }` の交差型だが、Rust では
/// `TimelineObject` と同じ内部タグ付き enum + flatten パターンで表現する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind")]
pub enum AgentObjectSpec {
    #[serde(rename = "shape")]
    Shape {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentShapeExtra,
    },
    #[serde(rename = "text")]
    Text {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentTextExtra,
    },
    #[serde(rename = "particle")]
    Particle {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentParticleExtra,
    },
    #[serde(rename = "dotField")]
    DotField {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentDotFieldExtra,
    },
    #[serde(rename = "shatteredSphere")]
    ShatteredSphere {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentShatteredSphereExtra,
    },
    #[serde(rename = "image")]
    Image {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentImageExtra,
    },
    #[serde(rename = "video")]
    Video {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentVideoExtra,
    },
    #[serde(rename = "audio")]
    Audio {
        #[serde(flatten)]
        base: AgentObjectBase,
        #[serde(flatten)]
        extra: AgentAudioExtra,
    },
}

impl AgentObjectSpec {
    fn base(&self) -> &AgentObjectBase {
        match self {
            AgentObjectSpec::Shape { base, .. }
            | AgentObjectSpec::Text { base, .. }
            | AgentObjectSpec::Particle { base, .. }
            | AgentObjectSpec::DotField { base, .. }
            | AgentObjectSpec::ShatteredSphere { base, .. }
            | AgentObjectSpec::Image { base, .. }
            | AgentObjectSpec::Video { base, .. }
            | AgentObjectSpec::Audio { base, .. } => base,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema, TS)]
pub struct AgentProjectSpec {
    pub version: u32,
    pub project: AgentProjectSettings,
    pub layers: Vec<AgentLayerSpec>,
    pub objects: Vec<AgentObjectSpec>,
}

// ---------------------------------------------------------------------------
// バリデーション（`src/agentProject/agentProject.ts` の手書きバリデータを移植）
// ---------------------------------------------------------------------------

fn is_object(value: &Value) -> bool {
    value.is_object()
}

fn require_finite_number(value: Option<&Value>, path: &str, positive: bool) -> Result<f64, String> {
    let n = value.and_then(Value::as_f64).filter(|v| v.is_finite());
    match n {
        Some(v) if !positive || v > 0.0 => Ok(v),
        _ => Err(format!(
            "{path} は{}数値で指定してください。",
            if positive { "正の" } else { "" }
        )),
    }
}

fn require_string<'a>(value: Option<&'a Value>, path: &str) -> Result<&'a str, String> {
    match value.and_then(Value::as_str) {
        Some(s) if !s.trim().is_empty() => Ok(s),
        _ => Err(format!("{path} は空でない文字列で指定してください。")),
    }
}

const AGENT_OBJECT_KINDS: &[&str] = &[
    "shape",
    "text",
    "particle",
    "dotField",
    "shatteredSphere",
    "image",
    "video",
    "audio",
];

const AGENT_OBJECT_KINDS_REQUIRING_SRC: &[&str] = &["image", "video", "audio"];

fn validate_agent_object(value: &Value, index: usize) -> Result<(), String> {
    let path = format!("objects[{index}]");
    if !is_object(value) {
        return Err(format!("{path} はオブジェクトで指定してください。"));
    }
    require_string(value.get("id"), &format!("{path}.id"))?;
    let kind = require_string(value.get("kind"), &format!("{path}.kind"))?;
    if !AGENT_OBJECT_KINDS.contains(&kind) {
        return Err(format!("{path}.kind「{kind}」は未対応です。"));
    }
    let kind = kind.to_string();
    require_string(value.get("layer"), &format!("{path}.layer"))?;
    require_finite_number(value.get("start"), &format!("{path}.start"), false)?;
    require_finite_number(value.get("duration"), &format!("{path}.duration"), true)?;

    if let Some(to) = value.get("to") {
        if !is_object(to) {
            return Err(format!("{path}.to は座標オブジェクトで指定してください。"));
        }
        require_finite_number(to.get("x"), &format!("{path}.to.x"), false)?;
        require_finite_number(to.get("y"), &format!("{path}.to.y"), false)?;
    }

    if AGENT_OBJECT_KINDS_REQUIRING_SRC.contains(&kind.as_str()) {
        require_string(value.get("src"), &format!("{path}.src"))?;
    }

    if let Some(gradient) = value.get("gradient") {
        if !is_object(gradient) {
            return Err(format!("{path}.gradient はオブジェクトで指定してください。"));
        }
        let gradient_type = require_string(gradient.get("type"), &format!("{path}.gradient.type"))?;
        if gradient_type != "linear" && gradient_type != "radial" {
            return Err(format!("{path}.gradient.type は linear か radial で指定してください。"));
        }
        let colours = gradient.get("colours").and_then(Value::as_array);
        let colours_len = colours.map(|c| c.len()).unwrap_or(0);
        if colours.is_none() || colours_len < 2 {
            return Err(format!("{path}.gradient.colours は2件以上の配列で指定してください。"));
        }
        let stops = gradient.get("stops").and_then(Value::as_array);
        let stops_len = stops.map(|s| s.len());
        if stops.is_none() || stops_len != Some(colours_len) {
            return Err(format!(
                "{path}.gradient.stops は colours と同じ件数の配列で指定してください。"
            ));
        }
    }

    if let Some(filters) = value.get("filters") {
        let filters_array = filters
            .as_array()
            .ok_or_else(|| format!("{path}.filters は配列で指定してください。"))?;
        for (filter_index, filter) in filters_array.iter().enumerate() {
            let filter_path = format!("{path}.filters[{filter_index}]");
            if !is_object(filter) {
                return Err(format!("{filter_path} はオブジェクトで指定してください。"));
            }
            let filter_type = require_string(filter.get("type"), &format!("{filter_path}.type"))?;
            if filter_type != "blur" {
                return Err(format!("{filter_path}.type「{filter_type}」は未対応です。"));
            }
        }
    }

    if let Some(align) = value.get("align") {
        if !is_object(align) {
            return Err(format!("{path}.align はオブジェクトで指定してください。"));
        }
        let valid = ["start", "center", "end"];
        if let Some(x) = align.get("x") {
            if !x.is_null() && !x.as_str().map(|v| valid.contains(&v)).unwrap_or(false) {
                return Err(format!(
                    "{path}.align.x は start/center/end のいずれかで指定してください。"
                ));
            }
        }
        if let Some(y) = align.get("y") {
            if !y.is_null() && !y.as_str().map(|v| valid.contains(&v)).unwrap_or(false) {
                return Err(format!(
                    "{path}.align.y は start/center/end のいずれかで指定してください。"
                ));
            }
        }
    }

    if let Some(relative_to) = value.get("relativeTo") {
        if !relative_to.is_null() {
            require_string(Some(relative_to), &format!("{path}.relativeTo"))?;
        }
    }

    if let Some(padding) = value.get("padding") {
        if !padding.is_null() {
            require_finite_number(Some(padding), &format!("{path}.padding"), false)?;
        }
    }

    Ok(())
}

/// `src/agentProject/agentProject.ts` の `parseAgentProjectSpec` に対応する
/// 純粋関数。JSON 文字列を受け取り、検証済みの `AgentProjectSpec` を返す。
///
/// エラーメッセージは TS 版と同じ文言（日本語）。JSON 自体の構文エラーのみ
/// TS 版に対応が無い（TS 版は `unknown` を受け取る設計で `JSON.parse` は
/// 呼び出し側の責務のため）ので、ここで新規に追加した。
pub fn parse_agent_project_spec(json: &str) -> Result<AgentProjectSpec, String> {
    let value: Value = serde_json::from_str(json)
        .map_err(|err| format!("エージェント用プロジェクトの JSON 解析に失敗しました: {err}"))?;

    if !is_object(&value) {
        return Err("エージェント用プロジェクトはJSONオブジェクトで指定してください。".to_string());
    }

    let version = value.get("version").and_then(Value::as_u64);
    if version != Some(AGENT_PROJECT_SPEC_VERSION as u64) {
        return Err(format!(
            "version は {AGENT_PROJECT_SPEC_VERSION} を指定してください。"
        ));
    }

    let project = value
        .get("project")
        .filter(|p| is_object(p))
        .ok_or_else(|| "project はオブジェクトで指定してください。".to_string())?;
    require_finite_number(project.get("width"), "project.width", true)?;
    require_finite_number(project.get("height"), "project.height", true)?;
    require_finite_number(project.get("fps"), "project.fps", true)?;
    require_finite_number(project.get("sampleRate"), "project.sampleRate", true)?;
    require_finite_number(project.get("duration"), "project.duration", true)?;

    let layers = value
        .get("layers")
        .and_then(Value::as_array)
        .filter(|l| !l.is_empty())
        .ok_or_else(|| "layers は1件以上指定してください。".to_string())?;
    let mut layer_ids = std::collections::HashSet::new();
    for (index, layer) in layers.iter().enumerate() {
        if !is_object(layer) {
            return Err(format!("layers[{index}] はオブジェクトで指定してください。"));
        }
        let id = require_string(layer.get("id"), &format!("layers[{index}].id"))?;
        require_string(layer.get("name"), &format!("layers[{index}].name"))?;
        if !layer_ids.insert(id.to_string()) {
            return Err(format!("レイヤーID「{id}」が重複しています。"));
        }
    }

    let objects = value
        .get("objects")
        .and_then(Value::as_array)
        .ok_or_else(|| "objects は配列で指定してください。".to_string())?;
    for (index, object) in objects.iter().enumerate() {
        validate_agent_object(object, index)?;
    }

    serde_json::from_value(value.clone())
        .map_err(|err| format!("エージェント用プロジェクトの解析に失敗しました: {err}"))
}

// ---------------------------------------------------------------------------
// 展開（`buildAgentProjectFile`）
// ---------------------------------------------------------------------------

fn build_layers(spec: &AgentProjectSpec) -> Vec<LayerState> {
    let mut layers = default_layers();
    for (index, layer) in spec.layers.iter().enumerate() {
        if let Some(slot) = layers.get_mut(index) {
            *slot = LayerState {
                name: layer.name.clone(),
                visible: layer.visible.unwrap_or(true),
                locked: layer.locked.unwrap_or(false),
            };
        }
    }
    layers
}

fn build_filters(id: &str, filters: &Option<Vec<AgentFilterSpec>>) -> Option<Vec<crate::schema::ObjectFilter>> {
    filters.as_ref().map(|filters| {
        filters
            .iter()
            .enumerate()
            .map(|(index, filter)| match filter {
                AgentFilterSpec::Blur(blur) => crate::schema::ObjectFilter::Blur {
                    id: format!("{id}-filter-{index}"),
                    enabled: true,
                    params: crate::schema::BlurFilterParams {
                        strength: blur.strength.unwrap_or(20.0),
                        quality: blur.quality.unwrap_or(2.0),
                    },
                },
            })
            .collect()
    })
}

fn build_gradient(gradient: &Option<AgentGradientSpec>) -> Option<ShapeGradientFill> {
    gradient.as_ref().map(|gradient| ShapeGradientFill {
        enabled: true,
        kind: match gradient.kind {
            AgentGradientKind::Linear => ShapeGradientKind::Linear,
            AgentGradientKind::Radial => ShapeGradientKind::Radial,
        },
        scope: None as Option<ShapeGradientScope>,
        colours: gradient.colours.clone(),
        stops: gradient.stops.clone(),
        direction: gradient.direction.unwrap_or(0.0),
    })
}

#[derive(Clone, Copy)]
struct LayoutBox {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

const LAYOUT_DEFAULT_WIDTH: f32 = 320.0;
const LAYOUT_DEFAULT_HEIGHT: f32 = 180.0;

fn resolve_aligned_axis(
    alignment: Option<AgentAlignValue>,
    frame_start: f32,
    frame_size: f32,
    own_size: f32,
    padding: f32,
    explicit: Option<f32>,
    project_centre: f32,
) -> f32 {
    match alignment {
        Some(AgentAlignValue::Start) => frame_start + padding,
        Some(AgentAlignValue::End) => frame_start + frame_size - own_size - padding,
        Some(AgentAlignValue::Center) => (frame_start + frame_size / 2.0 - own_size / 2.0).round(),
        None => explicit.unwrap_or(project_centre),
    }
}

fn resolve_object_position(
    base: &AgentObjectBase,
    layout_by_id: &std::collections::HashMap<String, LayoutBox>,
    project: &AgentProjectSettings,
) -> Result<(f32, f32), String> {
    let project_centre_x = (project.width / 2.0).round();
    let project_centre_y = (project.height / 2.0).round();
    let Some(align) = &base.align else {
        return Ok((
            base.x.unwrap_or(project_centre_x),
            base.y.unwrap_or(project_centre_y),
        ));
    };
    let width = base.width.unwrap_or(LAYOUT_DEFAULT_WIDTH);
    let height = base.height.unwrap_or(LAYOUT_DEFAULT_HEIGHT);
    let padding = base.padding.unwrap_or(0.0);
    let mut frame = LayoutBox {
        x: 0.0,
        y: 0.0,
        width: project.width,
        height: project.height,
    };
    if let Some(relative_to) = &base.relative_to {
        let reference = layout_by_id.get(relative_to).ok_or_else(|| {
            format!(
                "オブジェクト「{}」のrelativeTo「{relative_to}」が見つかりません。relativeToはobjects配列内で先に定義したIDのみ参照できます。",
                base.id
            )
        })?;
        frame = *reference;
    }
    Ok((
        resolve_aligned_axis(align.x, frame.x, frame.width, width, padding, base.x, project_centre_x),
        resolve_aligned_axis(align.y, frame.y, frame.height, height, padding, base.y, project_centre_y),
    ))
}

fn build_common_object(base: &AgentObjectBase, layer: f32, x: f32, y: f32) -> BaseObject {
    BaseObject {
        id: base.id.clone(),
        group_id: None,
        name: base.name.clone().unwrap_or_else(|| base.id.clone()),
        layer,
        start_time: base.start,
        duration: base.duration,
        offset: None,
        x,
        y,
        rotation: base.rotation.unwrap_or(0.0),
        scale_x: base.scale_x.unwrap_or(1.0),
        scale_y: base.scale_y.unwrap_or(1.0),
        opacity: base.opacity.unwrap_or(1.0),
        enable_animation: base.to.is_some(),
        end_x: base.to.as_ref().map(|to| to.x).unwrap_or(x),
        end_y: base.to.as_ref().map(|to| to.y).unwrap_or(y),
        easing: base.easing.unwrap_or_default(),
        motion_path: None,
        keyframes: None,
        shadow: None,
        filters: build_filters(&base.id, &base.filters),
        group_gradient: None,
        clipping: None,
        custom_clipping: None,
        color_correction: None,
        vibration: None,
    }
}

fn build_agent_object(
    object: &AgentObjectSpec,
    layer: f32,
    x: f32,
    y: f32,
) -> TimelineObject {
    let base_spec = object.base();
    let common = build_common_object(base_spec, layer, x, y);

    match object {
        AgentObjectSpec::Shape { extra, .. } => TimelineObject::Shape {
            base: common,
            fields: ShapeObjectFields {
                shape_type: extra.shape,
                width: base_spec.width.unwrap_or(320.0),
                height: base_spec.height.unwrap_or(180.0),
                fill: extra.fill.clone(),
                gradient: build_gradient(&extra.gradient),
                corner_radius: extra.corner_radius,
            },
        },
        AgentObjectSpec::Image { extra, .. } => TimelineObject::Image {
            base: common,
            fields: ImageObjectFields {
                src: extra.src.clone(),
                file_path: None,
                width: base_spec.width.unwrap_or(320.0),
                height: base_spec.height.unwrap_or(180.0),
            },
        },
        AgentObjectSpec::Video { extra, .. } => TimelineObject::Video {
            base: common,
            fields: VideoObjectFields {
                src: extra.src.clone(),
                file_path: None,
                proxy_file_path: None,
                source_width: None,
                source_height: None,
                width: base_spec.width.unwrap_or(320.0),
                height: base_spec.height.unwrap_or(180.0),
                volume: extra.volume.unwrap_or(1.0),
                muted: extra.muted.unwrap_or(false),
                subject_crop_enabled: None,
                subject_crop_keyframes: None,
                reversed: None,
            },
        },
        AgentObjectSpec::Audio { extra, .. } => TimelineObject::Audio {
            base: common,
            fields: AudioObjectFields {
                src: extra.src.clone(),
                file_path: None,
                volume: extra.volume.unwrap_or(1.0),
                muted: extra.muted.unwrap_or(false),
                lab_data: None,
            },
        },
        AgentObjectSpec::Text { extra, .. } => TimelineObject::Text {
            base: common,
            fields: TextObjectFields {
                text: extra.text.clone(),
                font_size: extra.font_size.unwrap_or(64.0),
                font_family: extra.font_family.clone().unwrap_or_else(|| "Arial".to_string()),
                fill: extra.fill.clone().unwrap_or_else(|| "#ffffff".to_string()),
                measured_width: None,
                measured_height: None,
                text_alignment: Some(extra.text_alignment.unwrap_or(TextAlignment::Left)),
                letter_spacing: Some(extra.letter_spacing.unwrap_or(0.0)),
                text_stroke: extra.text_stroke.clone(),
                text_shadow: extra.text_shadow.clone(),
            },
        },
        AgentObjectSpec::Particle { extra, .. } => {
            let base_fields = ParticleObjectFields::default();
            TimelineObject::Particle {
                base: common,
                fields: ParticleObjectFields {
                    width: base_spec.width.unwrap_or(base_fields.width),
                    height: base_spec.height.unwrap_or(base_fields.height),
                    particle_count: extra.particle_count.unwrap_or(base_fields.particle_count),
                    seed: extra.seed.unwrap_or(base_fields.seed),
                    spread: extra.spread.unwrap_or(base_fields.spread),
                    speed: extra.speed.unwrap_or(base_fields.speed),
                    size: extra.size.unwrap_or(base_fields.size),
                    colour: extra.colour.clone().unwrap_or(base_fields.colour),
                    lifetime_seconds: extra.lifetime_seconds.unwrap_or(base_fields.lifetime_seconds),
                },
            }
        }
        AgentObjectSpec::DotField { extra, .. } => {
            let base_fields = GetColorDotFieldObjectFields::default();
            TimelineObject::GetColorDotField {
                base: common,
                fields: GetColorDotFieldObjectFields {
                    width: base_spec.width.unwrap_or(base_fields.width),
                    height: base_spec.height.unwrap_or(base_fields.height),
                    columns: extra.columns.unwrap_or(base_fields.columns),
                    rows: extra.rows.unwrap_or(base_fields.rows),
                    dot_size: extra.dot_size.unwrap_or(base_fields.dot_size),
                    foreground_colour: extra
                        .foreground_colour
                        .clone()
                        .unwrap_or(base_fields.foreground_colour),
                    secondary_colour: extra
                        .secondary_colour
                        .clone()
                        .unwrap_or(base_fields.secondary_colour),
                    background_colour: extra
                        .background_colour
                        .clone()
                        .unwrap_or(base_fields.background_colour),
                    ..base_fields
                },
            }
        }
        AgentObjectSpec::ShatteredSphere { extra, .. } => {
            let base_fields = ShatteredSphereObjectFields::default();
            TimelineObject::ShatteredSphere {
                base: common,
                fields: ShatteredSphereObjectFields {
                    width: base_spec.width.unwrap_or(base_fields.width),
                    height: base_spec.height.unwrap_or(base_fields.height),
                    colour: extra.colour.clone().unwrap_or(base_fields.colour),
                    seed: extra.seed.unwrap_or(base_fields.seed),
                    ..base_fields
                },
            }
        }
    }
}

/// `new Date().toISOString()`（TS の `buildProjectFileData`）と同じ形式
/// （`YYYY-MM-DDTHH:mm:ss.sssZ`）の UTC 現在時刻文字列を、外部クレート
/// （chrono 等）を追加せず `std::time::SystemTime` だけで組み立てる。
/// 日付計算は Howard Hinnant の `civil_from_days` アルゴリズムを使用。
fn iso8601_utc_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_millis = now.as_millis() as i64;
    let millis = total_millis.rem_euclid(1000);
    let total_secs = total_millis.div_euclid(1000);
    let secs_of_day = total_secs.rem_euclid(86_400);
    let days = total_secs.div_euclid(86_400);

    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Howard Hinnant, "civil_from_days": days since 1970-01-01 -> (y, m, d).
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as i64;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as i64;
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

/// `src/agentProject/agentProject.ts` の `buildAgentProjectFile` に対応する
/// 純粋関数。JSON 文字列を受け取り、`parse_agent_project_spec` を内部で呼んだ
/// うえで `ProjectFile`（R4-1b の型・単一シーン）を構築する。
pub fn build_agent_project_file(json: &str) -> Result<ProjectFile, String> {
    let spec = parse_agent_project_spec(json)?;

    let layer_index_by_id: std::collections::HashMap<&str, usize> = spec
        .layers
        .iter()
        .enumerate()
        .map(|(index, layer)| (layer.id.as_str(), index))
        .collect();

    let mut layout_by_id: std::collections::HashMap<String, LayoutBox> = std::collections::HashMap::new();
    let mut objects = Vec::with_capacity(spec.objects.len());
    for object in &spec.objects {
        let base_spec = object.base();
        let layer_index = *layer_index_by_id.get(base_spec.layer.as_str()).ok_or_else(|| {
            format!(
                "オブジェクト「{}」のレイヤー「{}」が見つかりません。",
                base_spec.id, base_spec.layer
            )
        })?;
        let (x, y) = resolve_object_position(base_spec, &layout_by_id, &spec.project)?;
        layout_by_id.insert(
            base_spec.id.clone(),
            LayoutBox {
                x,
                y,
                width: base_spec.width.unwrap_or(LAYOUT_DEFAULT_WIDTH),
                height: base_spec.height.unwrap_or(LAYOUT_DEFAULT_HEIGHT),
            },
        );
        objects.push(build_agent_object(object, layer_index as f32, x, y));
    }

    let settings = ProjectSettings {
        width: spec.project.width,
        height: spec.project.height,
        fps: spec.project.fps,
        sample_rate: spec.project.sample_rate,
        editor_mode: Some(spec.project.editor_mode.unwrap_or(EditorMode::Mode2d)),
    };
    let layers = build_layers(&spec);
    let camera = CameraState::default_camera();
    let stage_camera_3d = StageCamera3D::default_stage_camera_3d();

    let scene = crate::schema::SceneData {
        id: "agent-scene-1".to_string(),
        name: spec.project.name.clone().unwrap_or_else(|| "Agent Scene".to_string()),
        duration: spec.project.duration,
        layers,
        objects,
        camera,
        stage_camera_3d,
    };

    Ok(ProjectFile {
        format: PROJECT_FILE_FORMAT.to_string(),
        version: 2,
        saved_at: iso8601_utc_now(),
        project_settings: settings,
        active_scene_id: "agent-scene-1".to_string(),
        scenes: vec![scene],
    })
}
