use uxfd_rust_core::{
    build_evaluation_scene, evaluate_frame, query_editable_scene_positions, EditableSceneGraph,
    ScenePoint, ScenePositionQuery,
};

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

fn graph_with_group_controls() -> EditableSceneGraph {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "fixtures/editable-scene-builder/cross-object-resolution.json"
    ))
    .expect("builder fixture must parse");
    let graph = fixture["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["id"] == "group-control-visible-layers-and-counts")
        .expect("group target fixture")["graph"]
        .clone();
    serde_json::from_value(graph).expect("group fixture graph must deserialize")
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
fn world_position_uses_enabled_vibration_filter_order_without_changing_local_position() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!(
        "fixtures/editable-scene-builder/cross-object-resolution.json"
    ))
    .expect("builder fixture must parse");
    let mut graph_value = fixture["cases"][0]["graph"].clone();
    let object = graph_value["objects"]
        .as_array_mut()
        .expect("fixture objects")
        .iter_mut()
        .find(|object| object["id"] == "waveform-direct")
        .expect("fixture waveform object");
    object["filters"] = serde_json::json!([
        {"type":"vibration", "id":"enabled-a", "enabled":true, "params":{"strength":2.0,"speed":1.3}},
        {"type":"vibration", "id":"disabled", "enabled":false, "params":{"strength":50.0,"speed":2.0}},
        {"type":"vibration", "id":"enabled-zero", "enabled":true, "params":{"strength":0.0,"speed":3.0}},
        {"type":"vibration", "id":"enabled-b", "enabled":true, "params":{"strength":-1.5,"speed":0.7}}
    ]);
    let graph: EditableSceneGraph = serde_json::from_value(graph_value).expect("graph must parse");
    let query = ScenePositionQuery {
        request_id: "vibration-query".into(),
        object_id: "waveform-direct".into(),
        time_seconds: 0.37,
    };

    let result = query_editable_scene_positions(&graph, &[query]).expect("query must succeed");
    let position = &result[0];
    let (offset_x, offset_y) = uxfd_rust_core::evaluate_vibration_offset(
        &[(2.0, 1.3), (0.0, 3.0), (-1.5, 0.7)],
        0.37,
    );

    assert_eq!(position.local_position.x, 10.0);
    assert_eq!(position.local_position.y, 20.0);
    assert_eq!(position.group_translation, ScenePoint { x: 0.0, y: 0.0 });
    assert!((position.world_position.x as f64 - (10.0 + offset_x)).abs() < 1e-5);
    assert!((position.world_position.y as f64 - (20.0 + offset_y)).abs() < 1e-5);
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

#[test]
fn group_position_matches_rust_frame_evaluation_with_visible_layer_targeting() {
    let mut graph = graph_with_group_controls();
    // Rust builder keeps group-control objects in the project even if their own layer
    // is hidden; target tracks still follow the visible-layer projection.
    graph.layers[2].visible = false;
    let query = ScenePositionQuery {
        request_id: "group-world".into(),
        object_id: "layer-three-a".into(),
        time_seconds: 10.0,
    };
    let queried = query_editable_scene_positions(&graph, &[query])
        .expect("visible target query should evaluate");
    let built = build_evaluation_scene(&graph);
    let snapshot = evaluate_frame(&built.project, 600);
    let clip = snapshot
        .clips
        .iter()
        .find(|clip| clip.clip_id == "layer-three-a")
        .expect("visible target clip");
    assert_eq!(
        (queried[0].world_position.x, queried[0].world_position.y),
        (clip.transform.translation_x, clip.transform.translation_y)
    );
    assert_eq!(
        (
            queried[0].group_translation.x,
            queried[0].group_translation.y,
        ),
        (
            clip.transform.translation_x - queried[0].local_position.x,
            clip.transform.translation_y - queried[0].local_position.y,
        )
    );
}

#[test]
fn hidden_target_layer_does_not_receive_a_group_transform() {
    let mut graph = graph_with_group_controls();
    graph.layers[3].visible = false;
    let queried = query_editable_scene_positions(
        &graph,
        &[ScenePositionQuery {
            request_id: "hidden-target".into(),
            object_id: "layer-three-a".into(),
            time_seconds: 10.0,
        }],
    )
    .expect("position query returns logical position for hidden objects");
    assert_eq!(
        (queried[0].local_position.x, queried[0].local_position.y),
        (10.0, 20.0)
    );
    assert_eq!(queried[0].world_position, queried[0].local_position);
}
