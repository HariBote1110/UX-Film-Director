mod common;

use common::{compare_fixtures, load_fixtures};
use uxfd_rust_core::build_evaluation_scene;

#[test]
fn editable_scene_builder_evaluates_the_same_frames_as_ts_recordings() {
    let fixtures = load_fixtures();
    assert!(!fixtures.is_empty(), "fixture が 1 件も無い");

    let summary = compare_fixtures(&fixtures, |fixture| {
        let editable_scene = fixture
            .editable_scene
            .as_ref()
            .unwrap_or_else(|| panic!("{}: editable_scene が無い", fixture.name));
        let built = build_evaluation_scene(&editable_scene.graph);
        assert!(
            built.diagnostics.is_empty(),
            "{}: builder diagnostics = {:?}",
            fixture.name,
            built.diagnostics
        );
        built.project
    });

    summary.assert_non_zero_frames();
    summary.print();
    summary.assert_matches_known_differences("Rust editable-scene builder 評価と TS 記録");
}
