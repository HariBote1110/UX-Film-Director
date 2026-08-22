//! `command.apply` RPC ハンドラ。
//!
//! `SceneData` に対する編集コマンド（`Command`）の適用を rust-core
//! （`uxfd_rust_core::command::apply_command`）に委譲する薄いラッパー。
//! IPC の境界（`electron/main.ts` の `rust-backend-command-apply`）が
//! 実際に呼び出す先はこの RPC メソッド。renderer 側の消費（undo/redo の
//! command stack 化）は R4-8 の historySlice 書き換えの範囲。

use crate::rpc::{response_error, RpcResponse};
use serde::Deserialize;
use serde_json::{json, Value};
use uxfd_rust_core::command::{apply_command, Command};
use uxfd_rust_core::schema::SceneData;

/// `Command` の適用が拒否された（不正なフィールド名・範囲外 index・
/// id 不一致等）場合のドメイン固有エラーコード。`-326xx` 帯は
/// `PROJECT_FILE_INVALID_CODE`（32610）/`AGENT_PROJECT_INVALID_CODE`
/// （32620）と同じ帯で、このバックエンド内で独自定義したアプリケーション
/// エラーコードの一つ。
const COMMAND_APPLY_INVALID_CODE: i64 = 32630;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandApplyParams {
    scene: SceneData,
    command: Command,
}

/// `SceneData` に `Command` を適用し、新しい `SceneData` を返す。
/// 適用に失敗した場合（不正なフィールドパッチ・範囲外 index 等）は
/// `COMMAND_APPLY_INVALID_CODE` の構造化エラーを返す — 呼び出し側
/// （`historySlice.ts`）は失敗時に一切 store state を変更してはならない。
pub(crate) fn handle_command_apply(id: u64, params: Value) -> RpcResponse {
    let parsed = match serde_json::from_value::<CommandApplyParams>(params) {
        Ok(value) => value,
        Err(error) => {
            return response_error(
                id,
                -32602,
                &format!("Invalid command.apply params: {error}"),
            );
        }
    };

    match apply_command(&parsed.scene, &parsed.command) {
        Ok(next_scene) => RpcResponse {
            id,
            ok: true,
            result: Some(json!({ "scene": next_scene })),
            error: None,
        },
        Err(command_error) => response_error(
            id,
            COMMAND_APPLY_INVALID_CODE,
            &format!("{command_error:?}"),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const V2_SAMPLE: &str =
        include_str!("../../rust-core/tests/fixtures/uxfd/realistic-heavy-edit-v2.uxfd.json");

    fn first_scene() -> Value {
        let project: Value = serde_json::from_str(V2_SAMPLE).expect("valid fixture json");
        project["scenes"][0].clone()
    }

    #[test]
    fn command_apply_sets_object_field_and_returns_new_scene() {
        let scene = first_scene();
        let object_id = scene["objects"][0]["id"]
            .as_str()
            .expect("first object id")
            .to_string();
        let previous_opacity = scene["objects"][0]["opacity"].clone();

        let response = handle_command_apply(
            1,
            json!({
                "scene": scene,
                "command": {
                    "kind": "setObjectField",
                    "objectId": object_id,
                    "field": "opacity",
                    "next": 0.25,
                    "previous": previous_opacity,
                }
            }),
        );

        assert!(response.ok, "{:?}", response.error);
        let result = response.result.expect("result should be present");
        assert_eq!(result["scene"]["objects"][0]["opacity"], 0.25);
    }

    #[test]
    fn command_apply_returns_structured_error_for_unknown_field() {
        let scene = first_scene();
        let object_id = scene["objects"][0]["id"]
            .as_str()
            .expect("first object id")
            .to_string();

        let response = handle_command_apply(
            1,
            json!({
                "scene": scene,
                "command": {
                    "kind": "setObjectField",
                    "objectId": object_id,
                    "field": "notARealField",
                    "next": 1,
                    "previous": 0,
                }
            }),
        );

        assert!(!response.ok);
        let error = response.error.expect("error should be present");
        assert_eq!(error.code, COMMAND_APPLY_INVALID_CODE);
    }

    #[test]
    fn command_apply_returns_invalid_params_error_for_missing_scene_field() {
        let response = handle_command_apply(1, json!({}));
        assert!(!response.ok);
        let error = response.error.expect("error should be present");
        assert_eq!(error.code, -32602);
    }
}
