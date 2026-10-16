use uxfd_rust_core::{query_editable_scene_positions, EditableSceneGraph, ScenePositionQuery};

fn graph_with_fractional_keyframes() -> EditableSceneGraph {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "fixtures/editable-scene-builder/cross-object-resolution.json"
    ))
    .expect("builder fixture must parse");
    let mut graph = fixture["cases"][0]["graph"].clone();
    let object = graph["objects"]
        .as_array_mut()
        .expect("fixture objects")
        .iter_mut()
        .find(|object| object["id"] == "waveform-direct")
        .expect("fixture waveform object");
    object["startTime"] = serde_json::json!(0.0);
    object["duration"] = serde_json::json!(1.0);
    object["x"] = serde_json::json!(0.0);
    object["y"] = serde_json::json!(4.0);
    object["endX"] = serde_json::json!(100.0);
    object["endY"] = serde_json::json!(24.0);
    object["enableAnimation"] = serde_json::json!(true);
    object["keyframes"] = serde_json::json!([
        {"id":"a", "time":0.125, "x":10.0, "y":20.0, "easing":"linear"},
        {"id":"b", "time":0.875, "x":70.0, "y":80.0, "easing":"linear"}
    ]);
    serde_json::from_value(graph).expect("fixture graph must deserialize")
}

#[test]
fn query_evaluates_unquantised_keyframe_time_and_preserves_request_identity() {
    let graph = graph_with_fractional_keyframes();
    let query = ScenePositionQuery {
        request_id: "property-keyframe-1".into(),
        object_id: "waveform-direct".into(),
        time_seconds: 0.5,
    };
    let result = query_editable_scene_positions(&graph, &[query.clone()])
        .expect("position query should evaluate supported object");
    assert_eq!(result[0].request_id, query.request_id);
    assert_eq!(result[0].object_id, query.object_id);
    assert_eq!(result[0].time_seconds, query.time_seconds);
    assert!((result[0].local_position.x - 40.0).abs() < 1e-5);
    assert!((result[0].local_position.y - 50.0).abs() < 1e-5);
}

#[test]
fn duplicate_internal_keyframe_time_uses_the_rightmost_keyframe_like_typescript() {
    let mut graph = graph_with_fractional_keyframes();
    let object = graph
        .objects
        .iter_mut()
        .find(|object| matches!(object, uxfd_rust_core::TimelineObject::AudioVisualization { base, .. } if base.id == "waveform-direct"))
        .expect("fixture waveform object");
    if let uxfd_rust_core::TimelineObject::AudioVisualization { base, .. } = object {
        base.keyframes = Some(vec![
            uxfd_rust_core::TimelinePositionKeyframe {
                id: "a".into(),
                time: 0.0,
                x: 0.0,
                y: 0.0,
                easing: Some(uxfd_rust_core::Easing::Linear),
            },
            uxfd_rust_core::TimelinePositionKeyframe {
                id: "a-mid".into(),
                time: 0.5,
                x: 10.0,
                y: 20.0,
                easing: Some(uxfd_rust_core::Easing::Linear),
            },
            uxfd_rust_core::TimelinePositionKeyframe {
                id: "b-mid".into(),
                time: 0.5,
                x: 30.0,
                y: 40.0,
                easing: Some(uxfd_rust_core::Easing::Linear),
            },
            uxfd_rust_core::TimelinePositionKeyframe {
                id: "z".into(),
                time: 1.0,
                x: 50.0,
                y: 60.0,
                easing: Some(uxfd_rust_core::Easing::Linear),
            },
        ]);
    }
    let result = query_editable_scene_positions(
        &graph,
        &[ScenePositionQuery {
            request_id: "duplicate-time".into(),
            object_id: "waveform-direct".into(),
            time_seconds: 0.5,
        }],
    )
    .expect("position query should evaluate duplicate timestamps");
    assert_eq!(
        (result[0].local_position.x, result[0].local_position.y),
        (30.0, 40.0)
    );
}
