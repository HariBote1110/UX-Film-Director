//! `agent.buildProjectFile` RPC ハンドラ。
//!
//! エージェント用プロジェクトレシピ（`public/agent-projects/*.json` の
//! JSON 文字列）を rust-core（`uxfd_rust_core::agent_project`）で解析・
//! 展開する薄いラッパー。IPC の境界（`electron/main.ts` の
//! `rust-backend-agent-build-project-file`）が実際に呼び出す先はこの
//! RPC メソッド。バリデーション/展開ロジック自体はここには一切無い
//! （`parse_agent_project_spec`/`build_agent_project_file` が唯一の正）。

use crate::rpc::{response_error, RpcResponse};
use serde::Deserialize;
use serde_json::{json, Value};
use uxfd_rust_core::agent_project::build_agent_project_file;

/// レシピの内容として不正（version/kind 不一致・未知レイヤー参照・壊れた
/// JSON 等）だった場合のドメイン固有エラーコード。`project.deserialize` の
/// `PROJECT_FILE_INVALID_CODE`(32610) と同じ帯の独自定義コード。
const AGENT_PROJECT_INVALID_CODE: i64 = 32620;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentBuildProjectFileParams {
    json: String,
}

/// レシピ JSON 文字列を解析・展開し、`ProjectFile` を JSON として返す。
pub(crate) fn handle_agent_build_project_file(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<AgentBuildProjectFileParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid agent.buildProjectFile params: {error}"),
            );
        }
    };

    match build_agent_project_file(&parsed.json) {
        Ok(project) => RpcResponse {
            id,
            ok: true,
            result: Some(json!({ "project": project })),
            error: None,
        },
        Err(message) => response_error(id, AGENT_PROJECT_INVALID_CODE, &message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AI_DEMO: &str =
        include_str!("../../rust-core/tests/fixtures/agent_project/ai-demo.json");

    #[test]
    fn builds_project_file_for_valid_recipe() {
        let response = handle_agent_build_project_file(1, json!({ "json": AI_DEMO }));
        assert!(response.ok, "{:?}", response.error);
        let result = response.result.expect("result should be present");
        assert_eq!(result["project"]["format"], "uxfd-project");
        assert_eq!(result["project"]["version"], 2);
        assert_eq!(result["project"]["activeSceneId"], "agent-scene-1");
    }

    #[test]
    fn returns_structured_error_for_unknown_layer() {
        let bad = r##"{
            "version": 1,
            "project": { "width": 100, "height": 100, "fps": 30, "sampleRate": 48000, "duration": 1 },
            "layers": [{ "id": "a", "name": "A" }],
            "objects": [{
                "id": "x", "kind": "shape", "layer": "missing", "start": 0, "duration": 1,
                "shape": "rect", "fill": "#ffffff"
            }]
        }"##;
        let response = handle_agent_build_project_file(1, json!({ "json": bad }));
        assert!(!response.ok);
        let error = response.error.expect("error should be present");
        assert_eq!(error.code, AGENT_PROJECT_INVALID_CODE);
        assert!(error.message.contains("見つかりません"));
    }

    #[test]
    fn returns_invalid_params_error_for_missing_json_field() {
        let response = handle_agent_build_project_file(1, json!({}));
        assert!(!response.ok);
        let error = response.error.expect("error should be present");
        assert_eq!(error.code, -32602);
    }
}
