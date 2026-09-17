use crate::rpc::{response_error, RpcResponse};
use crate::state::{BackendState, SceneSession};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::OnceLock;
use std::time::Instant;
use uxfd_rust_core::{
    build_evaluation_scene, evaluate_frame, EditableSceneDiagnostic, EditableSceneGraph, MediaKind,
    Project, SceneMediaReference,
};

const DUAL_RUN_DIFF_LIMIT: usize = 16;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SceneDualRunDiagnostics {
    matched: bool,
    eligibility_matched: bool,
    diff_paths: Vec<String>,
    rust_diagnostics: Vec<EditableSceneDiagnostic>,
    build_micros: u64,
    payload_bytes: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneReplaceParams {
    scene_id: String,
    revision: u64,
    project: Project,
    #[serde(default)]
    media: Vec<SceneMediaReference>,
    #[serde(default)]
    editable_scene: Option<EditableSceneGraph>,
}

fn dual_run_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var("UXFD_SCENE_BUILDER_DUAL_RUN").as_deref() == Ok("1"))
}

/// Scene builder の MediaKind group 切替。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct SceneBuilderCutover {
    basic: bool,
    generated: bool,
    audio: bool,
    getcolor: bool,
    group_control: bool,
}

impl SceneBuilderCutover {
    fn any_group_enabled(&self) -> bool {
        self.basic || self.generated || self.audio || self.getcolor || self.group_control
    }

    pub(crate) fn allows(&self, kind: &MediaKind) -> bool {
        match kind_group(kind) {
            SceneKindGroup::Basic => self.basic,
            SceneKindGroup::Generated => self.generated,
            SceneKindGroup::Audio => self.audio,
            SceneKindGroup::GetColor => self.getcolor,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SceneKindGroup {
    Basic,
    Generated,
    Audio,
    GetColor,
}

pub(crate) fn parse_scene_builder_cutover(
    value: Option<&str>,
) -> Result<SceneBuilderCutover, String> {
    let mut cutover = SceneBuilderCutover::default();
    let Some(value) = value.filter(|value| !value.trim().is_empty()) else {
        return Ok(cutover);
    };
    for group in value.split(',').map(str::trim) {
        match group {
            "basic" => cutover.basic = true,
            "generated" => cutover.generated = true,
            "audio" => cutover.audio = true,
            "getcolor" => cutover.getcolor = true,
            "group_control" => cutover.group_control = true,
            unknown => {
                return Err(format!(
                    "unknown scene builder cut-over kind group '{unknown}'"
                ))
            }
        }
    }
    Ok(cutover)
}

fn scene_builder_cutover() -> SceneBuilderCutover {
    static CUTOVER: OnceLock<SceneBuilderCutover> = OnceLock::new();
    CUTOVER
        .get_or_init(|| {
            match parse_scene_builder_cutover(
                std::env::var("UXFD_SCENE_BUILDER_CUTOVER").ok().as_deref(),
            ) {
                Ok(cutover) => cutover,
                Err(error) => {
                    eprintln!("[scene.replace] {error}; scene builder cut-over is disabled");
                    SceneBuilderCutover::default()
                }
            }
        })
        .clone()
}

fn comparable_value(value: &Value, path: &str) -> Value {
    if path.ends_with(".source") {
        if let Value::String(source) = value {
            if let Ok(parsed) = serde_json::from_str(source) {
                return parsed;
            }
        }
    }
    value.clone()
}

fn collect_structural_diffs(path: &str, expected: &Value, actual: &Value, diffs: &mut Vec<String>) {
    if diffs.len() >= DUAL_RUN_DIFF_LIMIT {
        return;
    }
    let expected = comparable_value(expected, path);
    let actual = comparable_value(actual, path);
    match (&expected, &actual) {
        (Value::Number(left), Value::Number(right))
            if (left.as_f64().unwrap_or(f64::NAN) - right.as_f64().unwrap_or(f64::NAN)).abs()
                <= 1e-5 => {}
        (Value::Object(left), Value::Object(right)) => {
            let mut keys: Vec<&String> = left.keys().collect();
            keys.extend(right.keys().filter(|key| !left.contains_key(*key)));
            for key in keys {
                if left.contains_key(key) && right.contains_key(key) {
                    collect_structural_diffs(
                        &format!("{path}.{key}"),
                        &left[key],
                        &right[key],
                        diffs,
                    );
                } else {
                    diffs.push(format!("{path}.{key}"));
                    if diffs.len() >= DUAL_RUN_DIFF_LIMIT {
                        return;
                    }
                }
            }
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                diffs.push(format!("{path}.length"));
            }
            for (index, (left, right)) in left.iter().zip(right).enumerate() {
                collect_structural_diffs(&format!("{path}[{index}]"), left, right, diffs);
                if diffs.len() >= DUAL_RUN_DIFF_LIMIT {
                    return;
                }
            }
        }
        _ if expected != actual => diffs.push(path.to_string()),
        _ => {}
    }
}

fn dual_run_diagnostics(
    editable_scene: &EditableSceneGraph,
    built: &uxfd_rust_core::BuiltEvaluationScene,
    build_micros: u64,
    ts_project: &Project,
    ts_media: &[SceneMediaReference],
) -> SceneDualRunDiagnostics {
    let payload_bytes = serde_json::to_vec(editable_scene)
        .map(|bytes| bytes.len())
        .unwrap_or(0);
    let mut diff_paths = Vec::new();
    let ts_project_value = serde_json::to_value(ts_project).unwrap_or(Value::Null);
    let rust_project_value = serde_json::to_value(&built.project).unwrap_or(Value::Null);
    collect_structural_diffs(
        "project",
        &ts_project_value,
        &rust_project_value,
        &mut diff_paths,
    );
    let ts_media_value = serde_json::to_value(ts_media).unwrap_or(Value::Null);
    let rust_media_value = serde_json::to_value(&built.media).unwrap_or(Value::Null);
    collect_structural_diffs("media", &ts_media_value, &rust_media_value, &mut diff_paths);
    let eligibility_matched = built.resident_eligible;
    let matched = diff_paths.is_empty() && eligibility_matched;
    if !matched {
        eprintln!(
            "[scene.replace] editable-scene dual-run mismatch paths={:?} eligibilityMatched={eligibility_matched}",
            diff_paths
        );
    }
    SceneDualRunDiagnostics {
        matched,
        eligibility_matched,
        diff_paths,
        rust_diagnostics: built.diagnostics.clone(),
        build_micros,
        payload_bytes,
    }
}

fn kind_group(kind: &MediaKind) -> SceneKindGroup {
    match kind {
        MediaKind::SolidColour
        | MediaKind::GeneratedGradient
        | MediaKind::GeneratedShape
        | MediaKind::Text
        | MediaKind::Image
        | MediaKind::Video
        | MediaKind::Psd => SceneKindGroup::Basic,
        MediaKind::GeneratedAudioWaveform | MediaKind::GeneratedAudioSphere => {
            SceneKindGroup::Audio
        }
        MediaKind::GeneratedGetColorDots => SceneKindGroup::GetColor,
        MediaKind::GeneratedParticle
        | MediaKind::GeneratedBarcode
        | MediaKind::GeneratedPuzzlePiece
        | MediaKind::GeneratedColourWheel
        | MediaKind::GeneratedGourd
        | MediaKind::GeneratedGear
        | MediaKind::GeneratedTrackBar
        | MediaKind::GeneratedPieChart
        | MediaKind::GeneratedHistogram
        | MediaKind::GeneratedToneCurve
        | MediaKind::GeneratedHksyCheckerGrid
        | MediaKind::GeneratedRegionFrame
        | MediaKind::GeneratedSimpleTube
        | MediaKind::GeneratedSphereDots
        | MediaKind::GeneratedSphericalField
        | MediaKind::GeneratedSunburst
        | MediaKind::GeneratedCircularArrow
        | MediaKind::GeneratedTriangleBracket
        | MediaKind::GeneratedTartanCheck
        | MediaKind::GeneratedHoundstooth
        | MediaKind::GeneratedYagasuri
        | MediaKind::GeneratedPaperAirplane
        | MediaKind::GeneratedAsanohaPattern
        | MediaKind::GeneratedFocusLinesPlus
        | MediaKind::GeneratedRandomLineEx
        | MediaKind::GeneratedContourTrace
        | MediaKind::GeneratedDisplacementPoly
        | MediaKind::GeneratedPlainEffectorLine
        | MediaKind::GeneratedHologram
        | MediaKind::GeneratedProtractor
        | MediaKind::GeneratedShakingPolygon
        | MediaKind::GeneratedShatteredSphere => SceneKindGroup::Generated,
    }
}

fn disabled_kind_names(
    built: &uxfd_rust_core::BuiltEvaluationScene,
    cutover: &SceneBuilderCutover,
) -> Vec<String> {
    let mut kinds = BTreeSet::new();
    let mut media_by_id: HashMap<&str, &MediaKind> = HashMap::new();
    for media in &built.project.media {
        media_by_id.insert(media.id.as_str(), &media.kind);
        if !cutover.allows(&media.kind) {
            kinds.insert(format!("{:?}", media.kind));
        }
    }
    for media in &built.media {
        media_by_id.insert(media.id.as_str(), &media.kind);
        if !cutover.allows(&media.kind) {
            kinds.insert(format!("{:?}", media.kind));
        }
    }
    for clip in built.project.tracks.iter().flat_map(|track| &track.clips) {
        match media_by_id.get(clip.media_id.as_str()) {
            Some(kind) if cutover.allows(kind) => {}
            Some(kind) => {
                kinds.insert(format!("{:?}", kind));
            }
            None => {
                kinds.insert(format!("missingClipMedia:{}", clip.media_id));
            }
        }
    }
    if !built.project.group_controls.is_empty() && !cutover.group_control {
        kinds.insert("groupControl".to_string());
    }
    kinds.into_iter().collect()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneEvaluateParams {
    scene_id: String,
    revision: u64,
    frame_index: u64,
}

pub(crate) fn handle_scene_replace(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    handle_scene_replace_with_scene_builder(
        id,
        params,
        state,
        dual_run_enabled(),
        scene_builder_cutover(),
    )
}

pub(crate) fn handle_scene_replace_with_scene_builder(
    id: u64,
    params: Value,
    state: &mut BackendState,
    dual_run: bool,
    cutover: SceneBuilderCutover,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<SceneReplaceParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid scene.replace params: {error}"),
            );
        }
    };
    if parsed.scene_id.trim().is_empty() {
        return response_error(id, -32602, "sceneId must not be empty");
    }

    if let Some(existing) = state.scene_sessions.get(&parsed.scene_id) {
        if parsed.revision <= existing.revision {
            return response_error(
                id,
                -32061,
                &format!(
                    "scene.replace rejected stale revision {} for sceneId '{}'; resident revision is {}",
                    parsed.revision, parsed.scene_id, existing.revision
                ),
            );
        }
    }

    let build_started = Instant::now();
    let built = parsed
        .editable_scene
        .as_ref()
        .filter(|_| dual_run || cutover.any_group_enabled())
        .map(build_evaluation_scene);
    let build_micros = build_started.elapsed().as_micros().min(u64::MAX as u128) as u64;
    let dual_run_result = match (parsed.editable_scene.as_ref(), built.as_ref()) {
        (Some(editable_scene), Some(built)) if dual_run => Some(dual_run_diagnostics(
            editable_scene,
            built,
            build_micros,
            &parsed.project,
            &parsed.media,
        )),
        _ => None,
    };
    let (project, media, scene_source, scene_fallback_reason) = match built.as_ref() {
        None if !cutover.any_group_enabled() => (
            parsed.project,
            parsed.media,
            "typescript",
            Some("flagOff".to_string()),
        ),
        None => (
            parsed.project,
            parsed.media,
            "typescript",
            Some("noEditableScene".to_string()),
        ),
        Some(built) if !built.resident_eligible => (
            parsed.project,
            parsed.media,
            "typescript",
            Some("notEligible".to_string()),
        ),
        Some(built) => {
            let disabled_kinds = disabled_kind_names(built, &cutover);
            if disabled_kinds.is_empty() {
                (built.project.clone(), built.media.clone(), "rust", None)
            } else {
                (
                    parsed.project,
                    parsed.media,
                    "typescript",
                    Some(format!("kindGroupDisabled:{}", disabled_kinds.join(","))),
                )
            }
        }
    };
    let scene_id = parsed.scene_id.clone();
    let revision = parsed.revision;
    state.scene_sessions.insert(
        scene_id.clone(),
        SceneSession {
            scene_id: scene_id.clone(),
            revision,
            project,
            media,
        },
    );

    let mut result =
        json!({ "sceneId": scene_id, "revision": revision, "sceneSource": scene_source });
    if let Some(reason) = scene_fallback_reason {
        result["sceneFallbackReason"] = Value::String(reason);
    }
    if let Some(diagnostics) = dual_run_result {
        result["dualRun"] = serde_json::to_value(diagnostics).unwrap_or(Value::Null);
    }
    RpcResponse {
        id,
        ok: true,
        result: Some(result),
        error: None,
    }
}

pub(crate) fn handle_scene_evaluate(
    id: u64,
    params: Value,
    state: &mut BackendState,
) -> RpcResponse {
    let parsed = match serde_json::from_value::<SceneEvaluateParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid scene.evaluate params: {error}"),
            );
        }
    };
    let Some(session) = state.scene_sessions.get(&parsed.scene_id) else {
        return response_error(
            id,
            -32060,
            &format!(
                "No resident scene session for sceneId '{}'",
                parsed.scene_id
            ),
        );
    };
    if parsed.revision != session.revision {
        return response_error(
            id,
            -32062,
            &format!(
                "scene.evaluate revision {} does not match resident revision {} for sceneId '{}'",
                parsed.revision, session.revision, parsed.scene_id
            ),
        );
    }

    let snapshot = evaluate_frame(&session.project, parsed.frame_index);
    let referenced_media_ids: HashSet<&str> = snapshot
        .clips
        .iter()
        .map(|clip| clip.media_id.as_str())
        .collect();
    let media: Vec<&SceneMediaReference> = session
        .media
        .iter()
        .filter(|reference| referenced_media_ids.contains(reference.id.as_str()))
        .collect();
    RpcResponse {
        id,
        ok: true,
        result: Some(json!({
            "sceneId": session.scene_id,
            "revision": session.revision,
            "frameIndex": parsed.frame_index,
            "snapshot": snapshot,
            "canvas": {
                "width": session.project.size.width,
                "height": session.project.size.height,
            },
            "media": media,
        })),
        error: None,
    }
}
