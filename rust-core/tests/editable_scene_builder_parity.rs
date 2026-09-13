//! P0 editable scene builder contract fixture.
//!
//! Until P1 adds the builder, this test validates fixture inputs and expected
//! outputs structurally. JSON object key order is insignificant, while array
//! order is significant (TS already sorts PSD active layer IDs canonically).

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

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
        (Value::Number(left), Value::Number(right)) if left == right => {}
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
#[ignore = "P1: build_evaluation_scene を実装して fixture の expected.project / media と比較する"]
fn p1_rust_builder_matches_p0_contract_fixture() {
    let _fixture = load_fixture();
    // TODO(P1): deserialize the editable graph and call build_evaluation_scene.
    // TODO(P1): compare Project, SceneMediaReference, and generator source JSON
    // with expected values via assert_structural_json_eq. P0 does not fake a builder.
    panic!("P1 の Rust editable-scene builder は未実装");
}
