use serde_json::json;
use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Effect, Fps, MediaKind, MediaReference,
    Project, ProjectSize, SamplingMode, SceneSnapshot, Track, Transform,
};

fn project_with_transform() -> Project {
    Project {
        id: "project-1".to_string(),
        version: 1,
        size: ProjectSize {
            width: 1920,
            height: 1080,
        },
        fps: Fps {
            numerator: 30000,
            denominator: 1001,
        },
        colour: ColourPipeline::rec709_sdr_linear(),
        media: vec![MediaReference {
            id: "media-1".to_string(),
            kind: MediaKind::Image,
            source: "fixtures/layer-001.png".to_string(),
        }],
        tracks: vec![Track {
            id: "track-1".to_string(),
            clips: vec![Clip {
                id: "clip-1".to_string(),
                media_id: "media-1".to_string(),
                kind: ClipKind::ImagePlane,
                start_frame: 10,
                duration_frames: 20,
                transform: Transform {
                    translation_x: 32.0,
                    translation_y: -8.0,
                    scale_x: 1.5,
                    scale_y: 0.5,
                    rotation_degrees: 15.0,
                    sampling: SamplingMode::Nearest,
                },
                opacity: 0.75,
                opacity_keyframes: Vec::new(),
                effects: vec![
                    Effect::LinearGain { gain: 1.25 },
                    Effect::ColourAberration {
                        offset_x: 3.0,
                        offset_y: 1.0,
                    },
                ],
            }],
        }],
    }
}

#[test]
fn scene_snapshot_carries_colour_pipeline_metadata() {
    let project = project_with_transform();

    let snapshot = evaluate_frame(&project, 10);

    assert_eq!(snapshot.colour, project.colour);
}

#[test]
fn evaluated_clip_carries_transform_for_renderer_contract() {
    let project = project_with_transform();

    let snapshot = evaluate_frame(&project, 10);

    assert_eq!(
        snapshot.clips[0].transform,
        project.tracks[0].clips[0].transform
    );
}

#[test]
fn evaluated_clip_carries_effects_for_renderer_contract() {
    let project = project_with_transform();

    let snapshot = evaluate_frame(&project, 10);

    assert_eq!(
        snapshot.clips[0].effects,
        project.tracks[0].clips[0].effects
    );
}

#[test]
fn project_schema_accepts_solid_colour_media_for_rectangle_shapes() {
    let project = Project {
        id: "project-1".to_string(),
        version: 1,
        size: ProjectSize {
            width: 1920,
            height: 1080,
        },
        fps: Fps {
            numerator: 60,
            denominator: 1,
        },
        colour: ColourPipeline::rec709_sdr_linear(),
        media: vec![MediaReference {
            id: "shape-1".to_string(),
            kind: MediaKind::SolidColour,
            source: "#ff0000".to_string(),
        }],
        tracks: vec![Track {
            id: "track-1".to_string(),
            clips: vec![Clip {
                id: "shape-clip-1".to_string(),
                media_id: "shape-1".to_string(),
                kind: ClipKind::SolidColourPlane,
                start_frame: 0,
                duration_frames: 60,
                transform: Transform {
                    translation_x: 300.0,
                    translation_y: 120.0,
                    scale_x: 1.0,
                    scale_y: 1.0,
                    rotation_degrees: 0.0,
                    sampling: SamplingMode::Nearest,
                },
                opacity: 0.5,
                opacity_keyframes: Vec::new(),
                effects: Vec::new(),
            }],
        }],
    };

    let encoded = serde_json::to_value(&project).expect("serialise project");
    assert_eq!(encoded["media"][0]["kind"], "SolidColour");
    assert_eq!(encoded["tracks"][0]["clips"][0]["kind"], "SolidColourPlane");

    let snapshot = evaluate_frame(&project, 0);
    assert_eq!(snapshot.clips[0].media_id, "shape-1");
    assert_eq!(snapshot.clips[0].opacity, 0.5);
}

#[test]
fn scene_snapshot_serialises_with_renderer_boundary_field_names() {
    let project = project_with_transform();
    let snapshot = evaluate_frame(&project, 10);

    let encoded = serde_json::to_value(&snapshot).expect("serialise scene snapshot");

    assert_eq!(
        encoded,
        json!({
            "frame_index": 10,
            "colour": {
                "profile": "rec709-sdr",
                "working_space": "linear-light",
                "alpha": "premultiplied"
            },
            "clips": [{
                "clip_id": "clip-1",
                "track_id": "track-1",
                "media_id": "media-1",
                "source_frame": 0,
                "z_index": 0,
                "transform": {
                    "translation_x": 32.0,
                    "translation_y": -8.0,
                    "scale_x": 1.5,
                    "scale_y": 0.5,
                    "rotation_degrees": 15.0,
                    "sampling": "nearest"
                },
                "opacity": 0.75,
                "effects": [{
                    "LinearGain": {
                        "gain": 1.25
                    }
                }, {
                    "ColourAberration": {
                        "offset_x": 3.0,
                        "offset_y": 1.0
                    }
                }]
            }]
        })
    );

    let decoded: SceneSnapshot =
        serde_json::from_value(encoded).expect("deserialise scene snapshot");

    assert_eq!(decoded, snapshot);
}
