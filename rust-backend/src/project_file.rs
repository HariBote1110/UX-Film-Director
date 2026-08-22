//! `project.deserialize` / `project.serialize` RPC ハンドラ。
//!
//! `.uxfd.json` の解析・整形を rust-core（`uxfd_rust_core::project_file`）
//! に委譲する薄いラッパー。IPC の境界（`electron/main.ts` の
//! `rust-backend-project-deserialize`/`rust-backend-project-serialize`）が
//! 実際に呼び出す先はこの RPC メソッド。

use crate::rpc::{response_error, RpcResponse};
use serde::Deserialize;
use serde_json::{json, Value};
use uxfd_rust_core::project_file::{project_file_from_json, project_file_to_json_pretty};
use uxfd_rust_core::schema::ProjectFile;

/// `.uxfd.json` の内容として不正（format/version 不一致・壊れた JSON・
/// スキーマ不一致）だった場合のドメイン固有エラーコード。
/// `-326xx` 帯は JSON-RPC 標準の予約範囲外で、`scene.replace` の
/// `-32061`（stale revision）と同様にこのバックエンド内で独自定義した
/// アプリケーションエラーコードの一つ。
const PROJECT_FILE_INVALID_CODE: i64 = 32610;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectDeserializeParams {
    json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSerializeParams {
    project: ProjectFile,
}

/// JSON 文字列を解析し、V1 なら V2 へ移行した `ProjectFile` を JSON として返す。
pub(crate) fn handle_project_deserialize(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<ProjectDeserializeParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid project.deserialize params: {error}"),
            );
        }
    };

    match project_file_from_json(&parsed.json) {
        Ok(project) => RpcResponse {
            id,
            ok: true,
            result: Some(json!({ "project": project })),
            error: None,
        },
        Err(message) => response_error(id, PROJECT_FILE_INVALID_CODE, &message),
    }
}

/// `ProjectFile` を pretty-print JSON 文字列に整形する。
/// `serde_json::Value` を経由しない直接文字列化パスを使うため、`f32`
/// の最短表現（ryu）が保たれ、`1.03` のようなリテラルが
/// `1.0299999713897705` に劣化しない。
pub(crate) fn handle_project_serialize(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<ProjectSerializeParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid project.serialize params: {error}"),
            );
        }
    };

    let json = project_file_to_json_pretty(&parsed.project);
    RpcResponse {
        id,
        ok: true,
        result: Some(json!({ "json": json })),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // rust-core 側の実プロジェクトフィクスチャをそのまま使う（手書き JSON
    // だと `CameraState`/`StageCamera3D` 等の必須フィールドを網羅しづらく、
    // スキーマ変更のたびに追随が必要になるため）。
    const V2_SAMPLE: &str =
        include_str!("../../rust-core/tests/fixtures/uxfd/realistic-heavy-edit-v2.uxfd.json");

    #[test]
    fn deserialize_returns_project_for_valid_v2_json() {
        let response =
            handle_project_deserialize(1, json!({ "json": V2_SAMPLE }));
        assert!(response.ok, "{:?}", response.error);
        let result = response.result.expect("result should be present");
        assert_eq!(result["project"]["format"], "uxfd-project");
        assert_eq!(result["project"]["version"], 2);
    }

    #[test]
    fn deserialize_returns_structured_error_for_wrong_format() {
        let bad = r#"{"format": "not-uxfd-project", "version": 2}"#;
        let response = handle_project_deserialize(1, json!({ "json": bad }));
        assert!(!response.ok);
        let error = response.error.expect("error should be present");
        assert_eq!(error.code, PROJECT_FILE_INVALID_CODE);
        assert_eq!(error.message, "対応していないプロジェクトファイル形式です。");
    }

    #[test]
    fn deserialize_returns_invalid_params_error_for_missing_json_field() {
        let response = handle_project_deserialize(1, json!({}));
        assert!(!response.ok);
        let error = response.error.expect("error should be present");
        assert_eq!(error.code, -32602);
    }

    #[test]
    fn serialize_round_trips_through_deserialize_and_preserves_precision() {
        let deserialize_response =
            handle_project_deserialize(1, json!({ "json": V2_SAMPLE }));
        let project = deserialize_response
            .result
            .expect("deserialize should succeed")["project"]
            .clone();

        let serialize_response =
            handle_project_serialize(2, json!({ "project": project }));
        assert!(serialize_response.ok, "{:?}", serialize_response.error);
        let result = serialize_response.result.expect("result should be present");
        let json_string = result["json"].as_str().expect("json should be a string");
        assert!(json_string.contains("\n  \""), "2-space indented pretty JSON expected");

        // 直列化した文字列を再度 deserialize すると同じ内容に戻ること。
        let reparsed = handle_project_deserialize(3, json!({ "json": json_string }));
        assert!(reparsed.ok, "{:?}", reparsed.error);
        assert_eq!(
            reparsed.result.expect("result should be present")["project"],
            project
        );
    }
}
