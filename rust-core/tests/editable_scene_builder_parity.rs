//! P0 editable scene builder contract fixture.
//!
//! Until P1 adds the builder, this test validates fixture inputs and expected
//! outputs structurally. JSON object key order is insignificant, while array
//! order is significant (TS already sorts PSD active layer IDs canonically).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use uxfd_rust_core::{build_evaluation_scene, EditableSceneGraph, EditableSceneMediaContext, EditableSceneMediaPurpose};

fn fixture_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/editable-scene-builder/cross-object-resolution.json")
}

fn load_fixture() -> Value {
    let path = fixture_path();
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{} を読めない: {error}", path.display()));
    serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("{} を JSON として読めない: {error}", path.display()))
}

/// Structural JSON comparator for P1 builder output comparison.
///
/// serde_json objects do not retain key order, so objects compare by key.
/// `media`, `Project`, and generator source arrays compare in wire order.
fn assert_structural_json_eq(path: &str, expected: &Value, actual: &Value) {
    match (expected, actual) {
        (Value::Null, Value::Null) => {}
        (Value::Bool(left), Value::Bool(right)) if left == right => {}
        (Value::Number(left), Value::Number(right))
            if (left.as_f64().unwrap_or(f64::NAN) - right.as_f64().unwrap_or(f64::NAN)).abs() <= 1e-5 => {}
        (Value::String(left), Value::String(right)) if left == right => {}
        (Value::Array(left), Value::Array(right)) => {
            assert_eq!(left.len(), right.len(), "{path}: array length が異なる");
            for (index, (expected, actual)) in left.iter().zip(right).enumerate() {
                assert_structural_json_eq(&format!("{path}[{index}]"), expected, actual);
            }
        }
        (Value::Object(left), Value::Object(right)) => {
            assert_eq!(left.len(), right.len(), "{path}: object key 数が異なる");
            for (key, expected) in left {
                let actual = right
                    .get(key)
                    .unwrap_or_else(|| panic!("{path}.{key}: actual に key が無い"));
                assert_structural_json_eq(&format!("{path}.{key}"), expected, actual);
            }
        }
        _ => panic!("{path}: expected {expected}, actual {actual}"),
    }
}

fn required<'a>(value: &'a Value, key: &str, path: &str) -> &'a Value {
    value
        .get(key)
        .unwrap_or_else(|| panic!("{path}.{key} が無い"))
}

#[test]
fn p0_fixture_is_well_formed_and_generator_sources_match_media() {
    let fixture = load_fixture();
    assert_eq!(required(&fixture, "version", "fixture"), &Value::from(1));
    let cases = required(&fixture, "cases", "fixture")
        .as_array()
        .expect("fixture.cases は array である必要がある");
    assert!(!cases.is_empty(), "P0 fixture に case が 1 件も無い");

    for case in cases {
        let id = required(case, "id", "case")
            .as_str()
            .expect("case.id は string である必要がある");
        let graph = required(case, "graph", id);
        assert!(required(graph, "settings", id).is_object(), "{id}.graph.settings は object");
        assert!(required(graph, "layers", id).is_array(), "{id}.graph.layers は array");
        assert!(required(graph, "objects", id).is_array(), "{id}.graph.objects は array");
        assert!(required(case, "time", id).is_number(), "{id}.time は number");
        assert!(matches!(required(case, "purpose", id).as_str(), Some("previewProxy" | "exportOriginal")));

        let expected = required(case, "expected", id);
        let media = required(expected, "media", id)
            .as_array()
            .expect("expected.media は array である必要がある");
        let sources = required(expected, "generator_sources", id)
            .as_object()
            .expect("expected.generator_sources は object である必要がある");

        // Fix the SceneMediaReference shape in the fixture. P1 compares this
        // expected value with media returned by the Rust builder here.
        assert_structural_json_eq(&format!("{id}.expected.media"), required(expected, "media", id), &Value::Array(media.clone()));
        if let Some(project) = expected.get("project") {
            assert!(project.is_object(), "{id}.expected.project は object");
            assert_structural_json_eq(&format!("{id}.expected.project"), project, project);
        }

        for reference in media {
            let kind = required(reference, "kind", id).as_str().expect("media.kind は string");
            if !kind.starts_with("Generated") {
                continue;
            }
            let media_id = required(reference, "id", id).as_str().expect("media.id は string");
            let source = required(reference, "source", id).as_str().expect("media.source は string");
            let parsed: Value = serde_json::from_str(source)
                .unwrap_or_else(|error| panic!("{id}.media[{media_id}].source は JSON でない: {error}"));
            let expected_source = sources
                .get(media_id)
                .unwrap_or_else(|| panic!("{id}.generator_sources.{media_id} が無い"));
            assert_structural_json_eq(
                &format!("{id}.generator_sources.{media_id}"),
                expected_source,
                &parsed,
            );
        }
    }
}

#[test]
fn structural_comparator_ignores_object_key_order_but_not_array_order() {
    let expected: Value = serde_json::json!({ "a": 1, "nested": { "x": true }, "items": ["first", "second"] });
    let reordered: Value = serde_json::json!({ "items": ["first", "second"], "nested": { "x": true }, "a": 1 });
    assert_structural_json_eq("comparator", &expected, &reordered);
}

#[test]
fn p1_rust_builder_matches_p0_contract_fixture() {
    let fixture = load_fixture();
    for case in required(&fixture, "cases", "fixture").as_array().unwrap() {
        let id = required(case, "id", "case").as_str().unwrap();
        let mut graph: EditableSceneGraph = serde_json::from_value(required(case, "graph", id).clone())
            .unwrap_or_else(|error| panic!("{id}.graph を deserialize できない: {error}"));
        graph.media_context = Some(EditableSceneMediaContext {
            purpose: match required(case, "purpose", id).as_str().unwrap() {
                "previewProxy" => EditableSceneMediaPurpose::PreviewProxy,
                "exportOriginal" => EditableSceneMediaPurpose::ExportOriginal,
                purpose => panic!("{id}: 未知の purpose {purpose}"),
            },
            scene_id: Some(id.to_string()),
            evaluation_time_seconds: Some(required(case, "time", id).as_f64().unwrap() as f32),
        });
        let built = build_evaluation_scene(&graph);
        assert!(built.diagnostics.is_empty(), "{id}: diagnostics がある: {:?}", built.diagnostics);
        let mut actual = serde_json::to_value(&built.media).unwrap();
        let mut expected = required(required(case, "expected", id), "media", id).clone();
        // `source` は canonical な JSON document。文字列としての key order / 1 と
        // 1.0 の表現ではなく、P0 で固定した構造で比較する。
        for media in expected.as_array_mut().unwrap().iter_mut().chain(actual.as_array_mut().unwrap()) {
            if let Some(source) = media.get("source").and_then(Value::as_str) {
                if let Ok(parsed) = serde_json::from_str::<Value>(source) {
                    media["source"] = parsed;
                }
            }
        }
        assert_structural_json_eq(
            &format!("{id}.media"),
            &expected,
            &actual,
        );
        if let Some(expected_project) = required(case, "expected", id).get("project") {
            let mut expected_project = expected_project.clone();
            if let Some(entries) = expected_project.get_mut("media").and_then(Value::as_array_mut) {
                for entry in entries { entry.as_object_mut().unwrap().remove("width"); entry.as_object_mut().unwrap().remove("height"); entry.as_object_mut().unwrap().remove("source_rate"); entry.as_object_mut().unwrap().remove("active_layer_ids"); }
            }
            assert_structural_json_eq(&format!("{id}.project"), &expected_project, &serde_json::to_value(built.project).unwrap());
        }
    }
}

#[test]
fn unported_feature_never_produces_a_valid_looking_clip() {
    let fixture = load_fixture();
    let first = &required(&fixture, "cases", "fixture").as_array().expect("cases")[0];
    let mut graph: EditableSceneGraph = serde_json::from_value(required(first, "graph", "case").clone()).unwrap();
    let object_id = {
        let object = graph.objects.iter_mut().find(|object| !matches!(object, uxfd_rust_core::TimelineObject::Audio { .. } | uxfd_rust_core::TimelineObject::GroupControl { .. })).expect("visual fixture object");
        let object_id = object_id(object).to_string();
        let mut value = serde_json::to_value(&*object).unwrap();
        value["filters"] = serde_json::json!([{"type":"vibration","id":"unsupported","enabled":true,"params":{"strength":1.0,"speed":1.0}}]);
        *object = serde_json::from_value(value).unwrap();
        object_id
    };
    let built = build_evaluation_scene(&graph);
    assert!(built.project.tracks.iter().all(|track| track.clips.iter().all(|clip| clip.id != object_id)));
    assert!(built.diagnostics.iter().any(|diagnostic| diagnostic.object_id == object_id && diagnostic.code == "unsupportedFeature"));
}

fn object_id(object: &uxfd_rust_core::TimelineObject) -> &str {
    match object {
        uxfd_rust_core::TimelineObject::Text { base, .. } | uxfd_rust_core::TimelineObject::Shape { base, .. } |
        uxfd_rust_core::TimelineObject::Image { base, .. } | uxfd_rust_core::TimelineObject::Video { base, .. } |
        uxfd_rust_core::TimelineObject::Audio { base, .. } | uxfd_rust_core::TimelineObject::Psd { base, .. } |
        uxfd_rust_core::TimelineObject::GroupControl { base, .. } | uxfd_rust_core::TimelineObject::AudioVisualization { base, .. } |
        uxfd_rust_core::TimelineObject::AudioSphere { base, .. } | uxfd_rust_core::TimelineObject::Particle { base, .. } |
        uxfd_rust_core::TimelineObject::Barcode { base, .. } | uxfd_rust_core::TimelineObject::PuzzlePiece { base, .. } |
        uxfd_rust_core::TimelineObject::ColourWheel { base, .. } | uxfd_rust_core::TimelineObject::Gourd { base, .. } |
        uxfd_rust_core::TimelineObject::Gear { base, .. } | uxfd_rust_core::TimelineObject::TrackBar { base, .. } |
        uxfd_rust_core::TimelineObject::PieChart { base, .. } | uxfd_rust_core::TimelineObject::Histogram { base, .. } |
        uxfd_rust_core::TimelineObject::ToneCurve { base, .. } | uxfd_rust_core::TimelineObject::HksyCheckerGrid { base, .. } |
        uxfd_rust_core::TimelineObject::GetColorDotField { base, .. } | uxfd_rust_core::TimelineObject::RegionFrame { base, .. } |
        uxfd_rust_core::TimelineObject::SimpleTube { base, .. } | uxfd_rust_core::TimelineObject::SphereDots { base, .. } |
        uxfd_rust_core::TimelineObject::SphericalField { base, .. } | uxfd_rust_core::TimelineObject::Sunburst { base, .. } |
        uxfd_rust_core::TimelineObject::CircularArrow { base, .. } | uxfd_rust_core::TimelineObject::TriangleBracket { base, .. } |
        uxfd_rust_core::TimelineObject::TartanCheck { base, .. } | uxfd_rust_core::TimelineObject::Houndstooth { base, .. } |
        uxfd_rust_core::TimelineObject::Yagasuri { base, .. } | uxfd_rust_core::TimelineObject::PaperAirplane { base, .. } |
        uxfd_rust_core::TimelineObject::AsanohaPattern { base, .. } | uxfd_rust_core::TimelineObject::FocusLinesPlus { base, .. } |
        uxfd_rust_core::TimelineObject::RandomLineEx { base, .. } | uxfd_rust_core::TimelineObject::ContourTrace { base, .. } |
        uxfd_rust_core::TimelineObject::DisplacementPoly { base, .. } | uxfd_rust_core::TimelineObject::PlainEffectorLine { base, .. } |
        uxfd_rust_core::TimelineObject::Hologram { base, .. } | uxfd_rust_core::TimelineObject::Protractor { base, .. } |
        uxfd_rust_core::TimelineObject::ShakingPolygon { base, .. } | uxfd_rust_core::TimelineObject::ShatteredSphere { base, .. } => &base.id,
    }
}

#[test]
fn generated_evaluation_scenes_match_ts_editable_builder_without_diagnostics() {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/ts-evaluation-parity");
    let mut scene_count = 0;
    let mut kinds = std::collections::BTreeSet::new();
    for entry in fs::read_dir(&directory).expect("parity fixture directory") {
        let path = entry.expect("fixture entry").path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") { continue; }
        if path.file_name().and_then(|name| name.to_str()) == Some("KNOWN_DIFFERENCES.json") { continue; }
        let fixture: Value = serde_json::from_str(&fs::read_to_string(&path).expect("fixture")).expect("fixture JSON");
        let editable = required(&fixture, "editable_scene", path.to_str().unwrap());
        let mut graph: EditableSceneGraph = serde_json::from_value(required(editable, "graph", "editable_scene").clone()).expect("editable graph");
        let scene_name = required(&fixture, "name", "fixture").as_str().unwrap();
        graph.media_context = Some(EditableSceneMediaContext { purpose: EditableSceneMediaPurpose::PreviewProxy, scene_id: Some(scene_name.to_string()), evaluation_time_seconds: None });
        let built = build_evaluation_scene(&graph);
        assert!(built.diagnostics.is_empty(), "{scene_name}: {:?}", built.diagnostics);
        let expected_result = required(editable, "result", "editable_scene");
        assert_eq!(required(expected_result, "ok", "editable_scene.result"), &Value::Bool(true));
        let mut expected_media = required(expected_result, "media", "editable_scene.result").clone();
        let mut actual_media = serde_json::to_value(&built.media).unwrap();
        for media in expected_media.as_array_mut().unwrap().iter_mut().chain(actual_media.as_array_mut().unwrap()) {
            if let Some(source) = media.get("source").and_then(Value::as_str) { if let Ok(parsed) = serde_json::from_str::<Value>(source) { media["source"] = parsed; } }
        }
        assert_structural_json_eq(&format!("{scene_name}.editable.media"), &expected_media, &actual_media);
        let mut expected_project = required(expected_result, "project", "editable_scene.result").clone();
        if let Some(entries) = expected_project.get_mut("media").and_then(Value::as_array_mut) {
            for entry in entries {
                if let Some(object) = entry.as_object_mut() {
                    object.remove("width"); object.remove("height"); object.remove("sourceRate"); object.remove("activeLayerIds"); object.remove("source_rate"); object.remove("active_layer_ids");
                    if let Some(source) = object.get("source").and_then(Value::as_str).and_then(|source| serde_json::from_str::<Value>(source).ok()) { object.insert("source".to_string(), source); }
                }
            }
        }
        let mut actual_project = serde_json::to_value(built.project).unwrap();
        if let Some(entries) = actual_project.get_mut("media").and_then(Value::as_array_mut) {
            for entry in entries { if let Some(object) = entry.as_object_mut() { if let Some(source) = object.get("source").and_then(Value::as_str).and_then(|source| serde_json::from_str::<Value>(source).ok()) { object.insert("source".to_string(), source); } } }
        }
        assert_structural_json_eq(&format!("{scene_name}.editable.project"), &expected_project, &actual_project);
        if let Some(media) = expected_media.as_array() { for item in media { kinds.insert(required(item, "kind", scene_name).as_str().unwrap().to_string()); } }
        scene_count += 1;
    }
    assert_eq!(scene_count, 3, "fixture scene count");
    assert!(kinds.len() >= 10, "fixture kinds coverage is unexpectedly small: {kinds:?}");
}
