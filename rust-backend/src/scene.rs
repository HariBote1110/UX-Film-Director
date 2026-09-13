use crate::rpc::{response_error, RpcResponse};
use crate::state::{BackendState, SceneSession};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;
use std::time::Instant;
use uxfd_rust_core::{
    build_evaluation_scene, evaluate_frame, EditableSceneGraph, EditableSceneDiagnostic, Project,
    SceneMediaReference,
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
            if (left.as_f64().unwrap_or(f64::NAN) - right.as_f64().unwrap_or(f64::NAN)).abs() <= 1e-5 => {}
        (Value::Object(left), Value::Object(right)) => {
            let mut keys: Vec<&String> = left.keys().collect();
            keys.extend(right.keys().filter(|key| !left.contains_key(*key)));
            for key in keys {
                if left.contains_key(key) && right.contains_key(key) {
                    collect_structural_diffs(&format!("{path}.{key}"), &left[key], &right[key], diffs);
                } else {
                    diffs.push(format!("{path}.{key}"));
                    if diffs.len() >= DUAL_RUN_DIFF_LIMIT { return; }
                }
            }
        }
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                diffs.push(format!("{path}.length"));
            }
            for (index, (left, right)) in left.iter().zip(right).enumerate() {
                collect_structural_diffs(&format!("{path}[{index}]"), left, right, diffs);
                if diffs.len() >= DUAL_RUN_DIFF_LIMIT { return; }
            }
        }
        _ if expected != actual => diffs.push(path.to_string()),
        _ => {}
    }
}

fn dual_run_diagnostics(
    editable_scene: &EditableSceneGraph,
    ts_project: &Project,
    ts_media: &[SceneMediaReference],
) -> SceneDualRunDiagnostics {
    let payload_bytes = serde_json::to_vec(editable_scene).map(|bytes| bytes.len()).unwrap_or(0);
    let started = Instant::now();
    let built = build_evaluation_scene(editable_scene);
    let build_micros = started.elapsed().as_micros().min(u64::MAX as u128) as u64;
    let mut diff_paths = Vec::new();
    let ts_project_value = serde_json::to_value(ts_project).unwrap_or(Value::Null);
    let rust_project_value = serde_json::to_value(&built.project).unwrap_or(Value::Null);
    collect_structural_diffs("project", &ts_project_value, &rust_project_value, &mut diff_paths);
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
        rust_diagnostics: built.diagnostics,
        build_micros,
        payload_bytes,
    }
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
    handle_scene_replace_with_dual_run(id, params, state, dual_run_enabled())
}

pub(crate) fn handle_scene_replace_with_dual_run(
    id: u64,
    params: Value,
    state: &mut BackendState,
    dual_run: bool,
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

    let dual_run_result = parsed.editable_scene.as_ref().filter(|_| dual_run).map(|editable_scene| {
        dual_run_diagnostics(editable_scene, &parsed.project, &parsed.media)
    });
    let scene_id = parsed.scene_id.clone();
    let revision = parsed.revision;
    state.scene_sessions.insert(
        scene_id.clone(),
        SceneSession {
            scene_id: scene_id.clone(),
            revision,
            project: parsed.project,
            media: parsed.media,
        },
    );

    let mut result = json!({ "sceneId": scene_id, "revision": revision });
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
