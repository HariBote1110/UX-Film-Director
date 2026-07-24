use crate::rpc::{response_error, RpcResponse};
use crate::state::{BackendState, SceneSession};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use uxfd_rust_core::{evaluate_frame, Project, SceneMediaReference};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneReplaceParams {
    scene_id: String,
    revision: u64,
    project: Project,
    #[serde(default)]
    media: Vec<SceneMediaReference>,
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

    RpcResponse {
        id,
        ok: true,
        result: Some(json!({ "sceneId": scene_id, "revision": revision })),
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
