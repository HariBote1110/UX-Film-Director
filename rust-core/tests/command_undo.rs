//! R4-6: コマンド層（`SceneData` を対象とする二層構成 `Command`）の固定。
//!
//! - `SetObjectField` の適用・undo（`invert` 適用）が状態を復元すること。
//! - 未知 object_id / 未知フィールド / 型不一致は `apply_command` が
//!   `Err` を返し、`SceneData` を書き換えないこと。
//! - `apply(invert(apply(scene, cmd)))== scene` を実フィクスチャ由来の
//!   `SceneData` と、実在する (object, field) ペアの網羅で proptest 検証する。

use std::fs;
use std::path::Path;

use proptest::prelude::*;
use serde_json::Value;
use uxfd_rust_core::project_file::project_file_from_json;
use uxfd_rust_core::schema::{ProjectFile, SceneData};
use uxfd_rust_core::{apply_command, invert, Command, CommandError};

const FIXTURES_DIR: &str = "tests/fixtures/uxfd";

fn read_fixture(name: &str) -> String {
    let path = Path::new(FIXTURES_DIR).join(name);
    fs::read_to_string(&path).unwrap_or_else(|err| panic!("フィクスチャの読込に失敗: {path:?}: {err}"))
}

/// 実フィクスチャ（R2/R3 で使ってきた `realistic-heavy-edit-v2.uxfd.json`）の
/// 最初のシーンを `SceneData` として読み込む。
fn fixture_scene() -> SceneData {
    let json = read_fixture("realistic-heavy-edit-v2.uxfd.json");
    let project: ProjectFile =
        project_file_from_json(&json).expect("realistic-heavy-edit-v2.uxfd.json の解析に失敗");
    project
        .scenes
        .into_iter()
        .next()
        .expect("フィクスチャには最低 1 シーン含まれる")
}

#[test]
fn set_object_field_changes_target_object_only() {
    let scene = fixture_scene();
    let object_id = "realistic-main-video-a".to_string();

    let command = Command::SetObjectField {
        object_id: object_id.clone(),
        field: "opacity".to_string(),
        next: Value::from(0.25),
        previous: Value::from(1.0),
    };

    let next_scene = apply_command(&scene, &command).expect("apply_command は成功するはず");

    let patched_value = serde_json::to_value(
        next_scene
            .objects
            .iter()
            .find(|object| object_id_of(object) == object_id)
            .expect("対象オブジェクトが残っている"),
    )
    .unwrap();
    assert_eq!(patched_value["opacity"], Value::from(0.25));

    // 他のオブジェクトやシーンの他フィールドは変化しない。
    assert_eq!(next_scene.objects.len(), scene.objects.len());
    assert_eq!(next_scene.layers, scene.layers);
    assert_eq!(next_scene.camera, scene.camera);
    assert_eq!(next_scene.stage_camera_3d, scene.stage_camera_3d);
}

#[test]
fn undo_via_invert_restores_original_scene() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "opacity".to_string(),
        next: Value::from(0.25),
        previous: Value::from(1.0),
    };

    let applied = apply_command(&scene, &command).expect("apply_command は成功するはず");
    assert_ne!(applied, scene);

    let undo_command = invert(&command);
    let undone = apply_command(&applied, &undo_command).expect("undo の apply も成功するはず");

    assert_eq!(undone, scene);
}

#[test]
fn redo_after_undo_matches_first_applied_state() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "opacity".to_string(),
        next: Value::from(0.25),
        previous: Value::from(1.0),
    };

    let applied = apply_command(&scene, &command).expect("apply_command は成功するはず");
    let undone = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");
    let redone = apply_command(&undone, &command).expect("redo(再 apply) も成功するはず");

    assert_eq!(redone, applied);
}

#[test]
fn command_rejects_unknown_object_id() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "no-such-object".to_string(),
        field: "opacity".to_string(),
        next: Value::from(0.25),
        previous: Value::from(1.0),
    };

    let error = apply_command(&scene, &command).expect_err("未知 object_id は失敗するはず");

    assert_eq!(
        error,
        CommandError::ObjectNotFound {
            object_id: "no-such-object".to_string(),
        }
    );
}

#[test]
fn command_rejects_unknown_field_name() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "thisFieldDoesNotExist".to_string(),
        next: Value::from(1.0),
        previous: Value::from(0.0),
    };

    let error = apply_command(&scene, &command).expect_err("未知フィールドは失敗するはず");

    match error {
        CommandError::InvalidFieldPatch { field, .. } => {
            assert_eq!(field, "thisFieldDoesNotExist");
        }
        unexpected => panic!("InvalidFieldPatch を期待したが {unexpected:?} だった"),
    }
}

#[test]
fn command_rejects_type_field_mutation() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "type".to_string(),
        next: Value::from("image"),
        previous: Value::from("video"),
    };

    let error = apply_command(&scene, &command).expect_err("type フィールドの変更は失敗するはず");

    assert!(matches!(error, CommandError::InvalidFieldPatch { .. }));
}

#[test]
fn command_rejects_wrong_type_value_and_leaves_scene_untouched() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        // opacity は f32 なので、文字列を渡すと deserialize が失敗するはず。
        field: "opacity".to_string(),
        next: Value::from("not-a-number"),
        previous: Value::from(1.0),
    };

    let error = apply_command(&scene, &command).expect_err("型不一致の patch は失敗するはず");

    assert!(matches!(error, CommandError::InvalidFieldPatch { .. }));
}

#[test]
fn apply_command_is_deterministic() {
    let scene = fixture_scene();
    let command = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "x".to_string(),
        next: Value::from(42.5),
        previous: Value::from(18.0),
    };

    let first = apply_command(&scene, &command).expect("1回目の apply");
    let second = apply_command(&scene, &command).expect("2回目の apply");

    assert_eq!(first, second);
}

fn object_id_of(object: &uxfd_rust_core::schema::TimelineObject) -> String {
    serde_json::to_value(object).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string()
}

fn filters_of(object: &uxfd_rust_core::schema::TimelineObject) -> Value {
    serde_json::to_value(object).unwrap()["filters"].clone()
}

// ---------------------------------------------------------------------
// R4-7: 構造コマンド (AddObject/RemoveObject)
// ---------------------------------------------------------------------

#[test]
fn add_object_inserts_at_index_and_remove_restores_exact_position() {
    let scene = fixture_scene();
    let new_object = scene.objects[0].clone(); // 型を借りて id だけ差し替える
    let new_object_json = {
        let mut value = serde_json::to_value(&new_object).unwrap();
        value["id"] = Value::from("brand-new-object");
        value
    };
    let new_object: uxfd_rust_core::schema::TimelineObject =
        serde_json::from_value(new_object_json).unwrap();

    let insert_index = 3usize;
    let add = Command::AddObject {
        object: new_object.clone(),
        index: insert_index,
    };
    let after_add = apply_command(&scene, &add).expect("AddObject は成功するはず");
    assert_eq!(after_add.objects.len(), scene.objects.len() + 1);
    assert_eq!(object_id_of(&after_add.objects[insert_index]), "brand-new-object");

    let undo_add = invert(&add);
    let after_undo = apply_command(&after_add, &undo_add).expect("undo(AddObject) は成功するはず");
    assert_eq!(after_undo, scene);

    // 末尾ではない位置からの remove-then-undo が厳密に元の位置へ戻ること。
    let remove_index = 10usize;
    let removed_object = scene.objects[remove_index].clone();
    let remove = Command::RemoveObject {
        object_id: object_id_of(&removed_object),
        removed: removed_object.clone(),
        index: remove_index,
    };
    let after_remove = apply_command(&scene, &remove).expect("RemoveObject は成功するはず");
    assert_eq!(after_remove.objects.len(), scene.objects.len() - 1);

    let undo_remove = invert(&remove);
    let restored = apply_command(&after_remove, &undo_remove).expect("undo(RemoveObject) は成功するはず");
    assert_eq!(restored, scene);
    assert_eq!(object_id_of(&restored.objects[remove_index]), object_id_of(&removed_object));
}

#[test]
fn add_object_rejects_duplicate_id() {
    let scene = fixture_scene();
    let duplicate = scene.objects[0].clone();
    let command = Command::AddObject { object: duplicate, index: 0 };

    let error = apply_command(&scene, &command).expect_err("重複 id は拒否されるはず");
    assert!(matches!(error, CommandError::DuplicateObjectId { .. }));
}

#[test]
fn add_object_rejects_out_of_range_index() {
    let scene = fixture_scene();
    let mut object_json = serde_json::to_value(&scene.objects[0]).unwrap();
    object_json["id"] = Value::from("another-new-object");
    let object: uxfd_rust_core::schema::TimelineObject = serde_json::from_value(object_json).unwrap();

    let command = Command::AddObject {
        object,
        index: scene.objects.len() + 1,
    };
    let error = apply_command(&scene, &command).expect_err("範囲外 index は拒否されるはず");
    assert!(matches!(error, CommandError::IndexOutOfRange { .. }));
}

#[test]
fn remove_object_rejects_index_mismatch() {
    let scene = fixture_scene();
    let command = Command::RemoveObject {
        object_id: "no-such-id-at-index-0".to_string(),
        removed: scene.objects[0].clone(),
        index: 0,
    };
    let error = apply_command(&scene, &command).expect_err("id 不一致は拒否されるはず");
    assert!(matches!(error, CommandError::IndexMismatch { .. }));
}

// ---------------------------------------------------------------------
// R4-7: レイヤーコマンド (SetLayerState/ReorderLayers)
// ---------------------------------------------------------------------

#[test]
fn set_layer_state_replaces_single_layer_and_inverts() {
    let scene = fixture_scene();
    let previous = scene.layers[2].clone();
    let mut next = previous.clone();
    next.visible = !next.visible;
    next.name = "Renamed".to_string();

    let command = Command::SetLayerState { index: 2, next: next.clone(), previous: previous.clone() };
    let applied = apply_command(&scene, &command).expect("SetLayerState は成功するはず");
    assert_eq!(applied.layers[2], next);
    assert_eq!(applied.layers.len(), scene.layers.len());

    let restored = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");
    assert_eq!(restored, scene);
}

#[test]
fn set_layer_state_rejects_out_of_range_index() {
    let scene = fixture_scene();
    let layer = scene.layers[0].clone();
    let command = Command::SetLayerState {
        index: scene.layers.len(),
        next: layer.clone(),
        previous: layer,
    };
    let error = apply_command(&scene, &command).expect_err("範囲外 index は拒否されるはず");
    assert!(matches!(error, CommandError::IndexOutOfRange { .. }));
}

#[test]
fn reorder_layers_swaps_whole_layers_and_objects_and_inverts() {
    let scene = fixture_scene();
    let mut next_layers = scene.layers.clone();
    next_layers.swap(0, 1);
    let mut next_objects = scene.objects.clone();
    next_objects.reverse();

    let command = Command::ReorderLayers {
        previous_layers: scene.layers.clone(),
        next_layers: next_layers.clone(),
        previous_objects: scene.objects.clone(),
        next_objects: next_objects.clone(),
    };
    let applied = apply_command(&scene, &command).expect("ReorderLayers は成功するはず");
    assert_eq!(applied.layers, next_layers);
    assert_eq!(applied.objects, next_objects);

    let restored = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");
    assert_eq!(restored, scene);
}

// ---------------------------------------------------------------------
// R4-7: フィルタコマンド (AddFilter/RemoveFilter/ToggleFilterEnabled/
// MoveFilter/UpdateFilterParams)
// ---------------------------------------------------------------------

const FILTER_OBJECT_ID: &str = "realistic-main-video-a";

#[test]
fn add_filter_then_remove_filter_round_trips() {
    let scene = fixture_scene();
    let new_filter: uxfd_rust_core::schema::ObjectFilter = serde_json::from_value(serde_json::json!({
        "type": "blur",
        "id": "new-blur-filter",
        "enabled": true,
        "params": { "strength": 4.0, "quality": 3.0 }
    }))
    .unwrap();

    let add = Command::AddFilter {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter: new_filter,
        index: 1,
    };
    let applied = apply_command(&scene, &add).expect("AddFilter は成功するはず");
    let object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    assert_eq!(filters_of(object).as_array().unwrap().len(), 4);
    assert_eq!(filters_of(object)[1]["id"], Value::from("new-blur-filter"));

    let restored = apply_command(&applied, &invert(&add)).expect("undo(AddFilter) は成功するはず");
    assert_eq!(restored, scene);
}

#[test]
fn remove_filter_rejects_index_mismatch() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let removed = filters_of(object)[0].clone();
    let removed: uxfd_rust_core::schema::ObjectFilter = serde_json::from_value(removed).unwrap();

    let command = Command::RemoveFilter {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id: "wrong-id".to_string(),
        removed,
        index: 0,
    };
    let error = apply_command(&scene, &command).expect_err("id 不一致は拒否されるはず");
    assert!(matches!(error, CommandError::IndexMismatch { .. }));
}

#[test]
fn toggle_filter_enabled_is_self_inverse() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let filter_id = filters_of(object)[0]["id"].as_str().unwrap().to_string();
    let original_enabled = filters_of(object)[0]["enabled"].as_bool().unwrap();

    let command = Command::ToggleFilterEnabled {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id: filter_id.clone(),
    };
    let applied = apply_command(&scene, &command).expect("ToggleFilterEnabled は成功するはず");
    let toggled_object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    assert_eq!(filters_of(toggled_object)[0]["enabled"], Value::from(!original_enabled));

    // invert() は同一コマンドを返し、もう一度 apply すれば元に戻る。
    let inverted = invert(&command);
    assert_eq!(inverted, command);
    let restored = apply_command(&applied, &inverted).expect("再 apply で復元するはず");
    assert_eq!(restored, scene);
}

#[test]
fn toggle_filter_enabled_rejects_unknown_filter() {
    let scene = fixture_scene();
    let command = Command::ToggleFilterEnabled {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id: "no-such-filter".to_string(),
    };
    let error = apply_command(&scene, &command).expect_err("未知フィルタは拒否されるはず");
    assert!(matches!(error, CommandError::FilterNotFound { .. }));
}

#[test]
fn move_filter_reorders_and_inverts() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let filter_id = filters_of(object)[0]["id"].as_str().unwrap().to_string();

    let command = Command::MoveFilter {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id: filter_id.clone(),
        from_index: 0,
        to_index: 2,
    };
    let applied = apply_command(&scene, &command).expect("MoveFilter は成功するはず");
    let moved_object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    assert_eq!(filters_of(moved_object)[2]["id"], Value::from(filter_id.as_str()));

    let restored = apply_command(&applied, &invert(&command)).expect("undo(MoveFilter) は成功するはず");
    assert_eq!(restored, scene);
}

#[test]
fn move_filter_clamped_no_op_at_boundary_is_ok_and_leaves_scene_unchanged() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let filter_id = filters_of(object)[0]["id"].as_str().unwrap().to_string();

    // 既に先頭にあるフィルタを「上へ」動かそうとする無操作 (from == to)。
    let command = Command::MoveFilter {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id,
        from_index: 0,
        to_index: 0,
    };
    let applied = apply_command(&scene, &command).expect("クランプされた無操作は Ok を返すはず");
    assert_eq!(applied, scene);
}

#[test]
fn update_filter_params_patches_and_inverts() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let filter_id = filters_of(object)[0]["id"].as_str().unwrap().to_string();
    let previous_brightness = filters_of(object)[0]["params"]["brightness"].clone();

    let command = Command::UpdateFilterParams {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id: filter_id.clone(),
        next: serde_json::json!({ "brightness": 0.5 }),
        previous: serde_json::json!({ "brightness": previous_brightness }),
    };
    let applied = apply_command(&scene, &command).expect("UpdateFilterParams は成功するはず");
    let patched_object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    assert_eq!(filters_of(patched_object)[0]["params"]["brightness"], Value::from(0.5));
    // 他パラメータは維持される。
    assert_eq!(filters_of(patched_object)[0]["params"]["contrast"], filters_of(object)[0]["params"]["contrast"]);

    let restored = apply_command(&applied, &invert(&command)).expect("undo(UpdateFilterParams) は成功するはず");
    assert_eq!(restored, scene);
}

// ---------------------------------------------------------------------
// R4-9: フィルタコマンドの legacy ミラーフィールド同期
// (`src/utils/filterStack.ts` の `materialiseSyncedObject` 相当を
// `apply_command` 側にも実装し、undo/redo 経由でも忠実に同期させる)
// ---------------------------------------------------------------------

#[test]
fn update_filter_params_resyncs_legacy_color_correction_mirror() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let filter_id = filters_of(object)[0]["id"].as_str().unwrap().to_string();
    assert_eq!(filter_id, "realistic-main-video-a-colour");
    // フィクスチャの前提: legacy colorCorrection は filters[0] とすでに一致している。
    let object_value = serde_json::to_value(object).unwrap();
    let original_brightness = object_value["colorCorrection"]["brightness"].clone();
    assert_eq!(object_value["filters"][0]["params"]["brightness"], original_brightness);

    let command = Command::UpdateFilterParams {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id,
        next: serde_json::json!({ "brightness": 0.5 }),
        previous: serde_json::json!({ "brightness": original_brightness }),
    };
    let applied = apply_command(&scene, &command).expect("UpdateFilterParams は成功するはず");
    let patched_object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let patched_value = serde_json::to_value(patched_object).unwrap();
    // filters 配列だけでなく legacy ミラーフィールドも同期しているはず。
    assert_eq!(patched_value["colorCorrection"]["brightness"], Value::from(0.5));

    let restored = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");
    let restored_object = restored.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let restored_value = serde_json::to_value(restored_object).unwrap();
    assert_eq!(restored_value["colorCorrection"]["brightness"], original_brightness);
    assert_eq!(restored, scene);
}

#[test]
fn remove_filter_clears_legacy_mirror_when_last_matching_filter_removed() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let original_value = serde_json::to_value(object).unwrap();
    let original_brightness = original_value["colorCorrection"]["brightness"].clone();
    let removed_value = filters_of(object)[0].clone();
    let removed: uxfd_rust_core::schema::ObjectFilter = serde_json::from_value(removed_value).unwrap();

    let command = Command::RemoveFilter {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter_id: "realistic-main-video-a-colour".to_string(),
        removed,
        index: 0,
    };
    let applied = apply_command(&scene, &command).expect("RemoveFilter は成功するはず");
    let patched_object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let patched_value = serde_json::to_value(patched_object).unwrap();
    // 対応する filter が無くなったので legacy ミラーフィールドは undefined (キー自体が省略) になるはず。
    assert!(patched_value.get("colorCorrection").is_none());

    // undo (invert(RemoveFilter) == AddFilter) で legacy ミラーも復元される。
    let restored = apply_command(&applied, &invert(&command)).expect("undo(RemoveFilter) は成功するはず");
    let restored_object = restored.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let restored_value = serde_json::to_value(restored_object).unwrap();
    assert_eq!(restored_value["colorCorrection"]["brightness"], original_brightness);
    assert_eq!(restored, scene);
}

#[test]
fn add_filter_populates_legacy_mirror_for_new_filter_type() {
    let scene = fixture_scene();
    let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let object_value = serde_json::to_value(object).unwrap();
    assert!(object_value.get("customClipping").is_none());

    let new_filter: uxfd_rust_core::schema::ObjectFilter = serde_json::from_value(serde_json::json!({
        "type": "clipping",
        "id": "new-clipping-filter",
        "enabled": true,
        "params": { "top": 1.0, "bottom": 2.0, "left": 3.0, "right": 4.0, "angle": 0.0, "radius": 0.0 }
    }))
    .unwrap();
    let command = Command::AddFilter {
        object_id: FILTER_OBJECT_ID.to_string(),
        filter: new_filter,
        index: 3,
    };
    let applied = apply_command(&scene, &command).expect("AddFilter は成功するはず");
    let patched_object = applied.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
    let patched_value = serde_json::to_value(patched_object).unwrap();
    assert_eq!(patched_value["customClipping"]["top"], Value::from(1.0));
    assert_eq!(patched_value["customClipping"]["enabled"], Value::from(true));

    let restored = apply_command(&applied, &invert(&command)).expect("undo(AddFilter) は成功するはず");
    assert_eq!(restored, scene);
}

// ---------------------------------------------------------------------
// R4-7: カメラコマンド (SetCamera/SetStageCamera3D)
// ---------------------------------------------------------------------

#[test]
fn set_camera_swaps_whole_value_and_inverts() {
    let scene = fixture_scene();
    let previous = scene.camera;
    let mut next = previous;
    next.zoom += 0.5;
    next.rotation_deg += 15.0;

    let command = Command::SetCamera { next, previous };
    let applied = apply_command(&scene, &command).expect("SetCamera は成功するはず");
    assert_eq!(applied.camera, next);

    let restored = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");
    assert_eq!(restored, scene);
}

#[test]
fn set_stage_camera_3d_swaps_whole_value_and_inverts() {
    let scene = fixture_scene();
    let previous = scene.stage_camera_3d;
    let mut next = previous;
    next.position.x += 10.0;

    let command = Command::SetStageCamera3D { next, previous };
    let applied = apply_command(&scene, &command).expect("SetStageCamera3D は成功するはず");
    assert_eq!(applied.stage_camera_3d, next);

    let restored = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");
    assert_eq!(restored, scene);
}

/// 実フィクスチャから (object_id, kind, field, sample_value) の実在ペアを
/// 列挙する。ランダムに(object, field) を捏造するのではなく、実データに
/// 実在するフィールドだけを対象にすることで「常に既知フィールド」を
/// 保証しつつ、型に応じた妥当な変異のみを proptest に許可する。
#[derive(Debug, Clone)]
struct FieldSample {
    object_id: String,
    field: String,
    original: Value,
}

fn numeric_field_samples() -> Vec<FieldSample> {
    let scene = fixture_scene();
    let mut samples = Vec::new();
    for object in &scene.objects {
        let value = serde_json::to_value(object).unwrap();
        let object_id = value["id"].as_str().unwrap().to_string();
        let Value::Object(map) = &value else {
            continue;
        };
        for (field, field_value) in map {
            // 数値フィールドのみを対象にする: 変異させても型は保たれるため、
            // 「妥当な patch は必ず成功する」という不変条件を安全に検証できる。
            if field == "type" {
                continue;
            }
            if field_value.is_number() {
                samples.push(FieldSample {
                    object_id: object_id.clone(),
                    field: field.clone(),
                    original: field_value.clone(),
                });
            }
        }
    }
    samples
}

proptest! {
    /// `apply(invert(apply(scene, cmd))) == scene`
    /// 実フィクスチャに実在する数値フィールドを、有界な値域でランダムに
    /// 変異させても、undo で必ず元の `SceneData` に戻ることを検証する。
    ///
    /// フィールドの元値が整数表現（`rows`/`targetLayer` 等の u32/i32）か
    /// 小数表現（`opacity`/`x` 等の f32）かで perturbation の型を変える。
    /// serde_json は整数由来のフィールドを常に整数バリアントの `Number` に
    /// 直列化するため、`is_u64()`/`is_i64()` で判定できる（小数フィールドは
    /// 常に浮動小数バリアントで直列化されるため誤判定しない）。
    #[test]
    fn undo_of_do_restores_scene_for_any_real_numeric_field(
        sample_index in 0usize..numeric_field_samples().len().max(1),
        delta in -1000.0f64..1000.0f64,
        int_delta in -100i64..100i64,
    ) {
        let samples = numeric_field_samples();
        prop_assume!(!samples.is_empty());
        let sample = &samples[sample_index % samples.len()];

        let scene = fixture_scene();
        let next_value = if sample.original.is_u64() || sample.original.is_i64() {
            // u32/i32 フィールド: 非負整数へ丸め、型を保つ。
            let base = sample.original.as_i64().unwrap_or(0);
            Value::from((base + int_delta).max(0) as u64)
        } else {
            Value::from(delta)
        };

        let command = Command::SetObjectField {
            object_id: sample.object_id.clone(),
            field: sample.field.clone(),
            next: next_value,
            previous: sample.original.clone(),
        };

        let applied = apply_command(&scene, &command);
        // 数値フィールドへ別の数値を書き込む patch は必ず成功するはず
        // （既知フィールドかつ型も一致するため）。
        let applied = applied.expect("既知の数値フィールドへの数値 patch は成功するはず");

        let undone = apply_command(&applied, &invert(&command))
            .expect("undo の apply も成功するはず");

        prop_assert_eq!(undone, scene);
    }

    /// `AddObject`/`RemoveObject` の index shift 非対称性バグを潰す:
    /// 任意の挿入位置 (0..=len) へ追加し、その場で取り除いた undo が
    /// 必ず元の `SceneData` に一致すること（末尾以外の位置でも成立する
    /// ことを保証する）。
    #[test]
    fn add_object_undo_restores_scene_for_any_insert_index(
        insert_index in 0usize..=45usize,
    ) {
        let scene = fixture_scene();
        let index = insert_index.min(scene.objects.len());

        let mut object_json = serde_json::to_value(&scene.objects[0]).unwrap();
        object_json["id"] = Value::from("proptest-inserted-object");
        let object: uxfd_rust_core::schema::TimelineObject =
            serde_json::from_value(object_json).unwrap();

        let add = Command::AddObject { object, index };
        let applied = apply_command(&scene, &add).expect("任意位置への AddObject は成功するはず");
        let undone = apply_command(&applied, &invert(&add)).expect("undo は成功するはず");

        prop_assert_eq!(undone, scene);
    }

    /// `RemoveObject` を任意の実在インデックスに対して行い、undo で
    /// 厳密に元の位置・内容へ復元されること。
    #[test]
    fn remove_object_undo_restores_scene_for_any_real_index(
        remove_index in 0usize..45usize,
    ) {
        let scene = fixture_scene();
        prop_assume!(remove_index < scene.objects.len());

        let removed = scene.objects[remove_index].clone();
        let remove = Command::RemoveObject {
            object_id: object_id_of(&removed),
            removed,
            index: remove_index,
        };
        let applied = apply_command(&scene, &remove).expect("実在インデックスの RemoveObject は成功するはず");
        let undone = apply_command(&applied, &invert(&remove)).expect("undo は成功するはず");

        prop_assert_eq!(undone, scene);
    }

    /// `MoveFilter` を対象オブジェクトの実在フィルタ範囲内の任意
    /// (from, to) に対して行い、undo で必ず元の `SceneData` に戻ること
    /// (from == to のクランプ無操作も含む)。
    #[test]
    fn move_filter_undo_restores_scene_for_any_valid_indices(
        from_index in 0usize..3usize,
        to_index in 0usize..3usize,
    ) {
        let scene = fixture_scene();
        let object = scene.objects.iter().find(|o| object_id_of(o) == FILTER_OBJECT_ID).unwrap();
        let filter_id = filters_of(object)[from_index]["id"].as_str().unwrap().to_string();

        let command = Command::MoveFilter {
            object_id: FILTER_OBJECT_ID.to_string(),
            filter_id,
            from_index,
            to_index,
        };
        let applied = apply_command(&scene, &command).expect("実在範囲内の MoveFilter は成功するはず");
        let undone = apply_command(&applied, &invert(&command)).expect("undo は成功するはず");

        prop_assert_eq!(undone, scene);
    }

    /// `Batch` に任意本数（1..=10）の妥当な `RemoveObject` を積んだ場合、
    /// 降順 index で構築すれば apply が必ず成功し、`invert(Batch)` を
    /// apply した undo が必ず元の `SceneData` に戻ること。
    #[test]
    fn batch_of_remove_objects_undo_restores_scene_for_any_sequence(
        remove_count in 1usize..=10usize,
    ) {
        let scene = fixture_scene();
        // 降順 index で RemoveObject を積む: 高い index から取り除けば、
        // まだ処理していない低い index のオブジェクトの位置はずれない。
        let mut indices: Vec<usize> = (0..scene.objects.len()).collect();
        indices.sort_unstable_by(|a, b| b.cmp(a));
        let indices = &indices[..remove_count.min(indices.len())];

        let commands: Vec<Command> = indices
            .iter()
            .map(|&index| Command::RemoveObject {
                object_id: object_id_of(&scene.objects[index]),
                removed: scene.objects[index].clone(),
                index,
            })
            .collect();
        let batch = Command::Batch { commands };

        let applied = apply_command(&scene, &batch).expect("降順 RemoveObject の Batch は成功するはず");
        prop_assert_eq!(applied.objects.len(), scene.objects.len() - indices.len());

        let undone = apply_command(&applied, &invert(&batch)).expect("undo(Batch) は成功するはず");
        prop_assert_eq!(undone, scene);
    }
}

// ---------------------------------------------------------------------
// R4-7b: Batch コマンド
// ---------------------------------------------------------------------

#[test]
fn batch_apply_and_undo_round_trip_removes_multiple_objects() {
    let scene = fixture_scene();
    // 降順 index (44, 10, 2) で RemoveObject を積む: 高い index から
    // 取り除けば、まだ処理していない低い index のオブジェクトの位置は
    // ずれないため、各 RemoveObject の index はコマンド発行時点の実位置と
    // 一致し続ける。
    let indices = [44usize, 10usize, 2usize];
    let commands: Vec<Command> = indices
        .iter()
        .map(|&index| Command::RemoveObject {
            object_id: object_id_of(&scene.objects[index]),
            removed: scene.objects[index].clone(),
            index,
        })
        .collect();
    let batch = Command::Batch {
        commands: commands.clone(),
    };

    let applied = apply_command(&scene, &batch).expect("Batch(RemoveObject x3) は成功するはず");
    assert_eq!(applied.objects.len(), scene.objects.len() - 3);
    for &index in &indices {
        assert!(
            !applied
                .objects
                .iter()
                .any(|object| object_id_of(object) == object_id_of(&scene.objects[index])),
            "index {index} のオブジェクトは削除されているはず"
        );
    }

    let undo_batch = invert(&batch);
    let Command::Batch {
        commands: undo_commands,
    } = &undo_batch
    else {
        panic!("invert(Batch) は Batch を返すはず");
    };
    // invert は sub-invert を逆順に積む: [remove44, remove10, remove2] ->
    // [invert(remove2), invert(remove10), invert(remove44)]
    // = [add(idx2), add(idx10), add(idx44)]。
    assert_eq!(undo_commands.len(), 3);

    let restored = apply_command(&applied, &undo_batch).expect("undo(Batch) は成功するはず");
    assert_eq!(restored, scene, "元の SceneData に厳密に一致するはず（順序・位置含む）");
}

#[test]
fn batch_apply_is_all_or_nothing_on_mid_batch_failure() {
    let scene = fixture_scene();
    let valid = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "opacity".to_string(),
        next: Value::from(0.25),
        previous: Value::from(1.0),
    };
    let invalid = Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "thisFieldDoesNotExist".to_string(),
        next: Value::from(1.0),
        previous: Value::from(0.0),
    };
    let batch = Command::Batch {
        commands: vec![valid, invalid],
    };

    let error = apply_command(&scene, &batch).expect_err("2番目の失敗で Batch 全体が失敗するはず");
    assert!(matches!(error, CommandError::InvalidFieldPatch { .. }));

    // apply_command は失敗時に scene を一切書き換えない
    // （呼び出し側は元の `scene` をそのまま使い続けられる）。
    let unrelated_probe = apply_command(&scene, &Command::SetObjectField {
        object_id: "realistic-main-video-a".to_string(),
        field: "opacity".to_string(),
        next: Value::from(1.0),
        previous: Value::from(1.0),
    })
    .expect("scene は Batch 失敗の影響を受けていないはず");
    let probed_opacity = serde_json::to_value(
        unrelated_probe
            .objects
            .iter()
            .find(|object| object_id_of(object) == "realistic-main-video-a")
            .unwrap(),
    )
    .unwrap()["opacity"]
        .clone();
    assert_eq!(probed_opacity, Value::from(1.0), "Batch の1番目の SetObjectField(opacity=0.25) は適用されていないはず");
}

#[test]
fn batch_rejects_nested_batch() {
    let scene = fixture_scene();
    let inner = Command::Batch { commands: vec![] };
    let outer = Command::Batch {
        commands: vec![inner],
    };

    let error = apply_command(&scene, &outer).expect_err("入れ子の Batch は拒否されるはず");
    assert!(matches!(error, CommandError::NestedBatch));
}

#[test]
fn batch_rejects_empty_commands() {
    let scene = fixture_scene();
    let batch = Command::Batch { commands: vec![] };

    let error = apply_command(&scene, &batch).expect_err("空の Batch は拒否されるはず");
    assert!(matches!(error, CommandError::EmptyBatch));
}
