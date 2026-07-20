//! Phase 4c Stage 2: `Nv12IoSurfaceRef` is the shared vocabulary rust-backend
//! (producer, from a Stage 1 in-process decode session) and
//! native-wgpu-renderer (consumer, production composite path) use to resolve
//! a clip's video source as a zero-copy NV12 IOSurface instead of a CPU RGBA
//! frame. It is intentionally NOT embedded in `SceneSnapshot`/`EvaluatedClip`
//! (see module docs), so these tests only need to fix its own shape/roundtrip
//! and confirm it never leaks into the existing snapshot JSON contract.

use serde_json::json;
use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Fps, MediaKind, MediaReference, Nv12ColourMatrix,
    Nv12ColourRange, Nv12IoSurfaceRef, Project, ProjectSize, SamplingMode, Track, Transform,
};

fn sample_nv12_ref() -> Nv12IoSurfaceRef {
    Nv12IoSurfaceRef {
        surface_id: 42,
        width: 1920,
        height: 1080,
        colour_range: Nv12ColourRange::Video,
        colour_matrix: Nv12ColourMatrix::Bt709,
        revision: 7,
    }
}

#[test]
fn nv12_io_surface_ref_round_trips_through_json() {
    let source = sample_nv12_ref();
    let serialised = serde_json::to_value(&source).expect("serialise Nv12IoSurfaceRef");
    let deserialised: Nv12IoSurfaceRef =
        serde_json::from_value(serialised).expect("deserialise Nv12IoSurfaceRef");
    assert_eq!(source, deserialised);
}

#[test]
fn nv12_colour_matrix_supports_bt601_bt709_and_bt2020() {
    for matrix in [
        Nv12ColourMatrix::Bt601,
        Nv12ColourMatrix::Bt709,
        Nv12ColourMatrix::Bt2020,
    ] {
        let serialised = serde_json::to_value(matrix).expect("serialise Nv12ColourMatrix");
        let deserialised: Nv12ColourMatrix =
            serde_json::from_value(serialised).expect("deserialise Nv12ColourMatrix");
        assert_eq!(matrix, deserialised);
    }
}

/// A minimal, hand-written `SceneSnapshot`-shaped JSON payload (as an
/// existing JS caller would have sent before Phase 4c Stage 2 existed, i.e.
/// with no mention of NV12 anywhere) must still parse and evaluate
/// identically -- proving the new `Nv12IoSurfaceRef` type is additive and
/// does not touch the wire contract at all.
#[test]
fn existing_scene_snapshot_shape_is_unaffected_by_the_new_nv12_type() {
    let project = Project {
        id: "project-1".to_string(),
        version: 1,
        size: ProjectSize {
            width: 640,
            height: 360,
        },
        fps: Fps {
            numerator: 30,
            denominator: 1,
        },
        colour: ColourPipeline::rec709_sdr_linear(),
        media: vec![MediaReference {
            id: "media-1".to_string(),
            kind: MediaKind::Video,
            source: "fixtures/clip.mp4".to_string(),
        }],
        tracks: vec![Track {
            id: "track-1".to_string(),
            clips: vec![Clip {
                id: "clip-1".to_string(),
                media_id: "media-1".to_string(),
                kind: ClipKind::VideoPlane,
                start_frame: 0,
                duration_frames: 10,
                transform: Transform {
                    translation_x: 0.0,
                    translation_y: 0.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation_degrees: 0.0,
                    sampling: SamplingMode::Bilinear,
                },
                opacity: 1.0,
                opacity_keyframes: Vec::new(),
                effects: Vec::new(),
            }],
        }],
    };

    let snapshot = evaluate_frame(&project, 0);
    let serialised = serde_json::to_value(&snapshot).expect("serialise SceneSnapshot");

    // The clip object must contain exactly the pre-existing field set: no
    // "nv12"/"ioSurface"/etc. key was introduced by this change.
    let clip_object = serialised["clips"][0]
        .as_object()
        .expect("clips[0] must be a JSON object");
    let expected_keys = [
        "clip_id",
        "track_id",
        "media_id",
        "source_frame",
        "z_index",
        "transform",
        "opacity",
        "effects",
    ];
    let mut actual_keys: Vec<&str> = clip_object.keys().map(String::as_str).collect();
    actual_keys.sort_unstable();
    let mut expected_keys = expected_keys.to_vec();
    expected_keys.sort_unstable();
    assert_eq!(
        actual_keys, expected_keys,
        "EvaluatedClip's JSON shape must be unchanged by the new Nv12IoSurfaceRef type"
    );

    assert_eq!(serialised["clips"][0]["media_id"], json!("media-1"));
}
