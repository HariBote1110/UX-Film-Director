use std::fs;
use std::path::Path;
use std::collections::HashSet;

use serde_json::Value;
use uxfd_rust_core::project_file::project_file_from_json;
use uxfd_rust_core::schema::{ObjectFilter, ProjectFile, SceneData, TimelineObject};
use uxfd_rust_core::{apply_command, invert, Command};

const FIXTURE: &str = "tests/fixtures/uxfd/realistic-heavy-edit-v2.uxfd.json";
const OBJECT_ID: &str = "realistic-main-video-a";

fn fixture_scene() -> SceneData {
    let json = fs::read_to_string(Path::new(FIXTURE)).expect("fixture should be readable");
    let project: ProjectFile = project_file_from_json(&json).expect("fixture should be valid");
    project
        .scenes
        .into_iter()
        .next()
        .expect("fixture should have a scene")
}

fn object_as_value(scene: &SceneData) -> Value {
    serde_json::to_value(
        scene
            .objects
            .iter()
            .find(|object| serde_json::to_value(object).unwrap()["id"] == OBJECT_ID)
            .expect("target object should exist"),
    )
    .unwrap()
}

fn filter_ids(scene: &SceneData) -> Vec<String> {
    object_as_value(scene)["filters"]
        .as_array()
        .expect("target object should have filters")
        .iter()
        .map(|filter| filter["id"].as_str().unwrap().to_string())
        .collect()
}

fn assert_filter_invariants(scene: &SceneData) {
    let object = object_as_value(scene);
    let filters = object["filters"].as_array().expect("filters should be an array");
    let ids: HashSet<&str> = filters.iter().map(|filter| filter["id"].as_str().unwrap()).collect();
    assert_eq!(ids.len(), filters.len(), "filter ids should be unique");

    let last_colour = filters
        .iter()
        .rev()
        .find(|filter| filter["type"] == "color_correction");
    match last_colour {
        Some(filter) => {
            assert_eq!(object["colorCorrection"]["enabled"], filter["enabled"]);
            assert_eq!(object["colorCorrection"]["brightness"], filter["params"]["brightness"]);
            assert_eq!(object["colorCorrection"]["contrast"], filter["params"]["contrast"]);
            assert_eq!(object["colorCorrection"]["saturation"], filter["params"]["saturation"]);
            assert_eq!(object["colorCorrection"]["hue"], filter["params"]["hue"]);
        }
        None => assert!(object.get("colorCorrection").is_none()),
    }
}

fn apply_with_round_trip(scene: &SceneData, command: &Command) -> SceneData {
    let applied = apply_command(scene, command).expect("filter command should apply");
    assert_filter_invariants(&applied);
    let restored = apply_command(&applied, &invert(command)).expect("inverse should apply");
    assert_eq!(&restored, scene, "apply followed by invert should round-trip");
    applied
}

fn blur_filter(id: &str, strength: f64) -> ObjectFilter {
    serde_json::from_value(serde_json::json!({
        "id": id,
        "type": "blur",
        "enabled": true,
        "params": { "strength": strength, "quality": 3.0 }
    }))
    .unwrap()
}

#[test]
fn add_filter_migrates_legacy_effects_before_appending() {
    let mut scene = fixture_scene();
    let index = scene
        .objects
        .iter()
        .position(|object| serde_json::to_value(object).unwrap()["id"] == OBJECT_ID)
        .unwrap();
    let mut object = object_as_value(&scene);
    object.as_object_mut().unwrap().remove("filters");
    scene.objects[index] = serde_json::from_value::<TimelineObject>(object).unwrap();

    let filter: ObjectFilter = serde_json::from_value(serde_json::json!({
        "id": "new-blur",
        "type": "blur",
        "enabled": true,
        "params": { "strength": 4.0, "quality": 3.0 }
    }))
    .unwrap();
    let command = Command::AddFilter {
        object_id: OBJECT_ID.to_string(),
        filter,
        index: 1,
    };

    let applied = apply_command(&scene, &command).expect("legacy filters should be migrated");
    let object = object_as_value(&applied);
    assert_eq!(object["filters"].as_array().unwrap().len(), 2);
    assert_eq!(object["filters"][0]["type"], "color_correction");
    assert_eq!(object["filters"][1]["id"], "new-blur");
    let brightness = object["colorCorrection"]["brightness"].as_f64().unwrap();
    assert!((brightness - 1.03).abs() < 0.000001);
}

#[test]
fn update_filter_params_applies_filter_normalisation() {
    let scene = fixture_scene();
    let filter_id = "realistic-main-video-a-fade";
    let command = Command::UpdateFilterParams {
        object_id: OBJECT_ID.to_string(),
        filter_id: filter_id.to_string(),
        next: serde_json::json!({ "opacity": -1.0 }),
        previous: serde_json::json!({ "opacity": 0.96 }),
    };

    let applied = apply_command(&scene, &command).expect("valid filter patch should apply");
    let object = object_as_value(&applied);
    assert_eq!(object["filters"][2]["params"]["opacity"], 0.0);
}

#[test]
fn toggle_filter_uses_client_filter_id_when_migrating_legacy_effects() {
    let mut scene = fixture_scene();
    let index = scene
        .objects
        .iter()
        .position(|object| serde_json::to_value(object).unwrap()["id"] == OBJECT_ID)
        .unwrap();
    let mut object = object_as_value(&scene);
    object.as_object_mut().unwrap().remove("filters");
    scene.objects[index] = serde_json::from_value::<TimelineObject>(object).unwrap();

    let command = Command::ToggleFilterEnabled {
        object_id: OBJECT_ID.to_string(),
        filter_id: "color_correction-client-id".to_string(),
    };
    let applied = apply_command(&scene, &command).expect("legacy filter should be addressable");
    let object = object_as_value(&applied);
    assert_eq!(object["filters"][0]["id"], "color_correction-client-id");
    assert_eq!(object["filters"][0]["enabled"], false);
}

#[test]
fn add_filter_appends_to_end_and_inverse_restores_stack() {
    let scene = fixture_scene();
    let index = filter_ids(&scene).len();
    let command = Command::AddFilter {
        object_id: OBJECT_ID.to_string(),
        filter: blur_filter("end-blur", 8.0),
        index,
    };
    let applied = apply_with_round_trip(&scene, &command);
    let ids = filter_ids(&applied);
    assert_eq!(ids.last().map(String::as_str), Some("end-blur"));
}

#[test]
fn toggle_filter_by_id_updates_enabled_and_legacy_mirror() {
    let scene = fixture_scene();
    let command = Command::ToggleFilterEnabled {
        object_id: OBJECT_ID.to_string(),
        filter_id: "realistic-main-video-a-colour".to_string(),
    };
    let applied = apply_with_round_trip(&scene, &command);
    let object = object_as_value(&applied);
    let filter = object["filters"]
        .as_array()
        .unwrap()
        .iter()
        .find(|filter| filter["id"] == "realistic-main-video-a-colour")
        .unwrap();
    assert_eq!(filter["enabled"], false);
    assert_eq!(object["colorCorrection"]["enabled"], false);
}

#[test]
fn remove_filter_by_id_removes_only_that_filter() {
    let scene = fixture_scene();
    let filter_id = "realistic-main-video-a-fade".to_string();
    let command = Command::RemoveFilter {
        object_id: OBJECT_ID.to_string(),
        filter_id: filter_id.clone(),
        index: 2,
        removed: serde_json::from_value(serde_json::json!({
            "id": "realistic-main-video-a-fade",
            "type": "fade",
            "enabled": true,
            "params": { "opacity": 0.96 }
        }))
        .unwrap(),
    };
    let applied = apply_with_round_trip(&scene, &command);
    assert_eq!(filter_ids(&applied).len(), filter_ids(&scene).len() - 1);
    assert!(!filter_ids(&applied).contains(&filter_id));
}

#[test]
fn move_filter_up_and_down_preserves_order_and_round_trips() {
    let scene = fixture_scene();
    let up = Command::MoveFilter {
        object_id: OBJECT_ID.to_string(),
        filter_id: "realistic-main-video-a-fade".to_string(),
        from_index: 2,
        to_index: 1,
    };
    let moved_up = apply_with_round_trip(&scene, &up);
    assert_eq!(filter_ids(&moved_up)[1], "realistic-main-video-a-fade");

    let down = Command::MoveFilter {
        object_id: OBJECT_ID.to_string(),
        filter_id: "realistic-main-video-a-fade".to_string(),
        from_index: 1,
        to_index: 2,
    };
    let moved_down = apply_with_round_trip(&moved_up, &down);
    assert_eq!(filter_ids(&moved_down), filter_ids(&scene));
}

#[test]
fn move_filter_at_boundary_is_a_no_op() {
    let scene = fixture_scene();
    let command = Command::MoveFilter {
        object_id: OBJECT_ID.to_string(),
        filter_id: "realistic-main-video-a-colour".to_string(),
        from_index: 0,
        to_index: 0,
    };
    let applied = apply_with_round_trip(&scene, &command);
    assert_eq!(filter_ids(&applied), filter_ids(&scene));
}

#[test]
fn update_filter_params_normalises_values_and_restores_absent_optional_key() {
    let scene = fixture_scene();
    let command = Command::UpdateFilterParams {
        object_id: OBJECT_ID.to_string(),
        filter_id: "realistic-main-video-a-fade".to_string(),
        next: serde_json::json!({ "opacity": -1.0 }),
        previous: serde_json::json!({ "opacity": 0.96 }),
    };
    let applied = apply_with_round_trip(&scene, &command);
    let object = object_as_value(&applied);
    assert_eq!(object["filters"][2]["params"]["opacity"], 0.0);

    let mut gradient_scene = scene.clone();
    let target_index = gradient_scene
        .objects
        .iter()
        .position(|object| serde_json::to_value(object).unwrap()["id"] == OBJECT_ID)
        .unwrap();
    let mut target = object_as_value(&gradient_scene);
    target["filters"] = serde_json::json!([{
        "id": "optional-gradient",
        "type": "gradient",
        "enabled": true,
        "params": {
            "type": "linear",
            "colours": ["#ffffff", "#000000"],
            "stops": [0.0, 1.0],
            "direction": 0.0
        }
    }]);
    gradient_scene.objects[target_index] = serde_json::from_value(target).unwrap();
    let gradient_command = Command::UpdateFilterParams {
        object_id: OBJECT_ID.to_string(),
        filter_id: "optional-gradient".to_string(),
        next: serde_json::json!({ "scope": "group" }),
        previous: serde_json::json!({ "scope": null }),
    };
    let updated = apply_command(&gradient_scene, &gradient_command).unwrap();
    assert_eq!(object_as_value(&updated)["filters"][0]["params"]["scope"], "group");
    let restored = apply_command(&updated, &invert(&gradient_command)).unwrap();
    let restored_params = &object_as_value(&restored)["filters"][0]["params"];
    assert!(restored_params.get("scope").is_none(), "absent must not become null");
}

#[test]
fn stress_filter_stack_commands_keep_invariants_and_round_trip_on_64_filters() {
    let mut scene = fixture_scene();
    for index in 0..61 {
        let filter_id = format!("stress-blur-{index}");
        let command = Command::AddFilter {
            object_id: OBJECT_ID.to_string(),
            filter: blur_filter(&filter_id, index as f64),
            index: filter_ids(&scene).len(),
        };
        scene = apply_with_round_trip(&scene, &command);
    }
    assert_eq!(filter_ids(&scene).len(), 64);

    let ids = filter_ids(&scene);
    for filter_id in ids.iter().step_by(2) {
        let command = Command::ToggleFilterEnabled {
            object_id: OBJECT_ID.to_string(),
            filter_id: filter_id.clone(),
        };
        scene = apply_with_round_trip(&scene, &command);
    }

    for index in 0..40 {
        let ids = filter_ids(&scene);
        let from_index = 1 + (index % (ids.len() - 1));
        let command = Command::MoveFilter {
            object_id: OBJECT_ID.to_string(),
            filter_id: ids[from_index].clone(),
            from_index,
            to_index: from_index - 1,
        };
        scene = apply_with_round_trip(&scene, &command);
    }

    for index in 0..40 {
        let ids = filter_ids(&scene);
        let filter_id = ids.iter().find(|id| id.starts_with("stress-blur-")).unwrap().clone();
        let object = object_as_value(&scene);
        let current_strength = object["filters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|filter| filter["id"] == filter_id)
            .unwrap()["params"]["strength"]
            .as_f64()
            .unwrap();
        let command = Command::UpdateFilterParams {
            object_id: OBJECT_ID.to_string(),
            filter_id,
            next: serde_json::json!({ "strength": current_strength + index as f64 + 1.0 }),
            previous: serde_json::json!({ "strength": current_strength }),
        };
        scene = apply_with_round_trip(&scene, &command);
    }

    for _ in 0..24 {
        let ids = filter_ids(&scene);
        let index = ids.len() - 1;
        let filter_id = ids[index].clone();
        let filter = object_as_value(&scene)["filters"].as_array().unwrap()[index].clone();
        let command = Command::RemoveFilter {
            object_id: OBJECT_ID.to_string(),
            filter_id,
            index,
            removed: serde_json::from_value(filter).unwrap(),
        };
        scene = apply_with_round_trip(&scene, &command);
    }
    assert_eq!(filter_ids(&scene).len(), 40);
}
