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
}
