//! `rust-core::agent_project` の TDD フィクスチャテスト（R4-4）。
//!
//! `src/agentProject/agentProject.test.ts` が押さえているケース
//! （バリデーションエラーの日本語メッセージ・レイアウト展開）を
//! Rust 側でも同じ意味論でピン留めする。

use uxfd_rust_core::agent_project::{build_agent_project_file, parse_agent_project_spec};
use uxfd_rust_core::project_file::project_file_from_json;
use uxfd_rust_core::project_file::project_file_to_json_string;

const AI_DEMO: &str = include_str!("fixtures/agent_project/ai-demo.json");
const EXPLAINER: &str = include_str!("fixtures/agent_project/explainer.json");
const FOCUS_TIPS: &str = include_str!("fixtures/agent_project/focus-tips.json");

fn minimal_recipe() -> serde_json::Value {
    serde_json::json!({
        "version": 1,
        "project": { "width": 1280, "height": 720, "fps": 60, "sampleRate": 48000, "duration": 6 },
        "layers": [
            { "id": "background", "name": "Background" },
            { "id": "title", "name": "Title" }
        ],
        "objects": [
            {
                "id": "bg", "kind": "shape", "layer": "background",
                "start": 0, "duration": 6, "x": 0, "y": 0, "width": 1280, "height": 720,
                "shape": "rect", "fill": "#08111f"
            },
            {
                "id": "headline", "kind": "text", "layer": "title",
                "start": 0.5, "duration": 5, "x": 100, "y": 200,
                "text": "Agent-ready motion", "fontSize": 72.0, "fill": "#ffffff",
                "to": { "x": 140, "y": 200 }, "easing": "easeOutCubic"
            }
        ]
    })
}

#[test]
fn parses_representative_fixtures() {
    for fixture in [AI_DEMO, EXPLAINER, FOCUS_TIPS] {
        let spec = parse_agent_project_spec(fixture).expect("実フィクスチャは解析できるはず");
        assert_eq!(spec.version, 1);
        assert!(!spec.layers.is_empty());
    }
}

#[test]
fn builds_representative_fixtures_and_round_trips_through_project_file() {
    for fixture in [AI_DEMO, EXPLAINER, FOCUS_TIPS] {
        let project = build_agent_project_file(fixture).expect("実フィクスチャは展開できるはず");
        assert_eq!(project.format, "uxfd-project");
        assert_eq!(project.version, 2);
        assert_eq!(project.active_scene_id, "agent-scene-1");
        assert_eq!(project.scenes.len(), 1);

        // ProjectFile::project_file_from_json 経由で往復できることを確認
        // （build_agent_project_file の出力が R4-1b の ProjectFile ワイヤーとして
        // 正当であることの検証）。
        let json = project_file_to_json_string(&project);
        let round_tripped = project_file_from_json(&json).expect("ラウンドトリップできるはず");
        assert_eq!(round_tripped.scenes[0].objects.len(), project.scenes[0].objects.len());
    }
}

#[test]
fn compact_recipe_expands_expected_shape() {
    let recipe = minimal_recipe();
    let json = serde_json::to_string(&recipe).unwrap();
    let project = build_agent_project_file(&json).unwrap();
    assert_eq!(project.project_settings.width, 1280.0);
    assert_eq!(project.project_settings.height, 720.0);
    assert_eq!(project.project_settings.fps, 60.0);

    let scene = &project.scenes[0];
    assert_eq!(scene.layers[0].name, "Background");
    assert_eq!(scene.layers[1].name, "Title");

    let headline_json = serde_json::to_value(
        scene.objects.iter().find(|o| matches!(o, uxfd_rust_core::schema::TimelineObject::Text { base, .. } if base.id == "headline")).unwrap()
    ).unwrap();
    assert_eq!(headline_json["type"], "text");
    assert_eq!(headline_json["layer"], 1.0);
    assert_eq!(headline_json["startTime"], 0.5);
    assert_eq!(headline_json["duration"], 5.0);
    assert_eq!(headline_json["endX"], 140.0);
    assert_eq!(headline_json["endY"], 200.0);
    assert_eq!(headline_json["enableAnimation"], true);
    assert_eq!(headline_json["easing"], "easeOutCubic");
}

#[test]
fn rejects_unknown_layer_with_japanese_message() {
    let mut recipe = minimal_recipe();
    recipe["objects"][0]["layer"] = serde_json::json!("missing-layer");
    let json = serde_json::to_string(&recipe).unwrap();
    let error = build_agent_project_file(&json).unwrap_err();
    assert!(
        error.contains("オブジェクト「bg」のレイヤー「missing-layer」が見つかりません"),
        "got: {error}"
    );
}

#[test]
fn rejects_wrong_version() {
    let mut recipe = minimal_recipe();
    recipe["version"] = serde_json::json!(2);
    let json = serde_json::to_string(&recipe).unwrap();
    let error = parse_agent_project_spec(&json).unwrap_err();
    assert!(error.contains("version は 1"), "got: {error}");
}

#[test]
fn accepts_empty_objects_array() {
    let mut recipe = minimal_recipe();
    recipe["objects"] = serde_json::json!([]);
    let json = serde_json::to_string(&recipe).unwrap();
    let spec = parse_agent_project_spec(&json).unwrap();
    assert!(spec.objects.is_empty());
}

#[test]
fn rejects_non_positive_project_width() {
    let mut recipe = minimal_recipe();
    recipe["project"]["width"] = serde_json::json!(0);
    let json = serde_json::to_string(&recipe).unwrap();
    let error = parse_agent_project_spec(&json).unwrap_err();
    assert!(error.contains("project.width"), "got: {error}");
}

#[test]
fn rejects_missing_src_for_image_kind() {
    let recipe = serde_json::json!({
        "version": 1,
        "project": { "width": 1280, "height": 720, "fps": 60, "sampleRate": 48000, "duration": 6 },
        "layers": [{ "id": "background", "name": "Background" }],
        "objects": [{ "id": "x", "kind": "image", "layer": "background", "start": 0, "duration": 1 }]
    });
    let json = serde_json::to_string(&recipe).unwrap();
    let error = parse_agent_project_spec(&json).unwrap_err();
    assert!(error.contains("objects[0].src"), "got: {error}");
}

#[test]
fn rejects_malformed_json() {
    let error = parse_agent_project_spec("{ not json").unwrap_err();
    assert!(error.contains("JSON 解析に失敗しました"), "got: {error}");
}

#[test]
fn resolves_align_center_padding_and_relative_to() {
    let recipe = serde_json::json!({
        "version": 1,
        "project": { "width": 1280, "height": 720, "fps": 60, "sampleRate": 48000, "duration": 6 },
        "layers": [
            { "id": "background", "name": "Background" },
            { "id": "title", "name": "Title" }
        ],
        "objects": [
            {
                "id": "card", "kind": "shape", "layer": "background",
                "start": 0, "duration": 6, "x": 100, "y": 100, "width": 800, "height": 400,
                "shape": "rounded_rect", "fill": "#0c2033"
            },
            {
                "id": "label", "kind": "shape", "layer": "title",
                "start": 0, "duration": 6, "width": 200, "height": 40,
                "shape": "rect", "fill": "#ffffff",
                "align": { "x": "end", "y": "end" },
                "relativeTo": "card",
                "padding": 20
            }
        ]
    });
    let json = serde_json::to_string(&recipe).unwrap();
    let project = build_agent_project_file(&json).unwrap();
    let label = serde_json::to_value(
        project.scenes[0]
            .objects
            .iter()
            .find(|o| matches!(o, uxfd_rust_core::schema::TimelineObject::Shape { base, .. } if base.id == "label"))
            .unwrap(),
    )
    .unwrap();
    assert_eq!(label["x"], 680.0);
    assert_eq!(label["y"], 440.0);
}

#[test]
fn explainer_recipe_expands_expected_scene() {
    // `src/agentProject/explainerProject.test.ts`（削除済み、R4-4でRustへ移送）の
    // 等価カバレッジ。
    let project = build_agent_project_file(EXPLAINER).unwrap();
    assert_eq!(project.project_settings.width, 1280.0);
    assert_eq!(project.project_settings.height, 720.0);
    assert_eq!(project.project_settings.fps, 60.0);

    let scene = &project.scenes[0];
    assert_eq!(scene.duration, 10.0);

    let object_ids: std::collections::HashSet<&str> = scene
        .objects
        .iter()
        .map(|object| match object {
            uxfd_rust_core::schema::TimelineObject::Text { base, .. }
            | uxfd_rust_core::schema::TimelineObject::Shape { base, .. }
            | uxfd_rust_core::schema::TimelineObject::Image { base, .. }
            | uxfd_rust_core::schema::TimelineObject::Video { base, .. }
            | uxfd_rust_core::schema::TimelineObject::Audio { base, .. }
            | uxfd_rust_core::schema::TimelineObject::Particle { base, .. }
            | uxfd_rust_core::schema::TimelineObject::GetColorDotField { base, .. }
            | uxfd_rust_core::schema::TimelineObject::ShatteredSphere { base, .. } => base.id.as_str(),
            _ => "",
        })
        .collect();
    for expected in [
        "intro-title",
        "step-1",
        "step-2",
        "step-3",
        "step-4",
        "closing-title",
    ] {
        assert!(object_ids.contains(expected), "missing object id: {expected}");
    }

    let text_contents: Vec<&str> = scene
        .objects
        .iter()
        .filter_map(|object| match object {
            uxfd_rust_core::schema::TimelineObject::Text { fields, .. } => Some(fields.text.as_str()),
            _ => None,
        })
        .collect();
    for expected in [
        "AIエージェントで動画を作る流れ",
        "1  意図をJSONにする",
        "2  シーンを組み立てる",
        "3  プレビューで確認",
        "4  MP4へ出力",
    ] {
        assert!(text_contents.contains(&expected), "missing text: {expected}");
    }
}

#[test]
fn rejects_unresolved_relative_to() {
    let mut recipe = minimal_recipe();
    recipe["objects"] = serde_json::json!([{
        "id": "orphan", "kind": "shape", "layer": "background",
        "start": 0, "duration": 6, "width": 100, "height": 100,
        "shape": "rect", "fill": "#ffffff",
        "align": { "x": "center" },
        "relativeTo": "missing-card"
    }]);
    let json = serde_json::to_string(&recipe).unwrap();
    let error = build_agent_project_file(&json).unwrap_err();
    assert!(error.contains("relativeTo「missing-card」が見つかりません"), "got: {error}");
}
