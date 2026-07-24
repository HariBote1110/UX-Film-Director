use serde_json::json;
use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Effect, Fps, MediaKind, MediaReference,
    Project, ProjectSize, SamplingMode, SceneSnapshot, Track, Transform, WipeEdge,
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
                source_frame_offset: 0,
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
                position_keyframes: Vec::new(),
                subject_crop: None,
                wipe_animations: Vec::new(),
                effects: vec![
                    Effect::LinearGain { gain: 1.25 },
                    Effect::ColourAberration {
                        offset_x: 3.0,
                        offset_y: 1.0,
                    },
                    Effect::Outline {
                        colour: [0.0, 0.0, 0.0],
                        thickness: 2.0,
                        opacity: 0.75,
                    },
                    Effect::Wipe {
                        edge: WipeEdge::Left,
                        progress: 0.5,
                    },
                    Effect::Clipping {
                        top: 1.0,
                        bottom: 2.0,
                        left: 3.0,
                        right: 4.0,
                        angle_degrees: 45.0,
                    },
                    Effect::SpotLight {
                        centre_x: 0.5,
                        centre_y: 0.25,
                        radius: 0.6,
                        intensity: 0.8,
                        colour: [1.0, 0.95686275, 0.7607843],
                    },
                    Effect::DisplacementMap {
                        amount_x: 24.0,
                        amount_y: 12.0,
                        size: 128.0,
                        strength: 0.75,
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
                source_frame_offset: 0,
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
                position_keyframes: Vec::new(),
                subject_crop: None,
                wipe_animations: Vec::new(),
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
fn project_schema_accepts_generated_audio_waveform_media() {
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
            id: "waveform-1".to_string(),
            kind: MediaKind::GeneratedAudioWaveform,
            source: r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":0.05,"colour":"#00ff00","thickness":2,"amplitude":1}"##.to_string(),
        }],
        tracks: vec![Track {
            id: "track-1".to_string(),
            clips: vec![Clip {
                id: "waveform-clip-1".to_string(),
                media_id: "waveform-1".to_string(),
                kind: ClipKind::GeneratedAudioWaveformPlane,
                start_frame: 0,
                duration_frames: 60,
                source_frame_offset: 0,
                transform: Transform::identity(),
                opacity: 1.0,
                opacity_keyframes: Vec::new(),
                position_keyframes: Vec::new(),
                subject_crop: None,
                wipe_animations: Vec::new(),
                effects: Vec::new(),
            }],
        }],
    };

    let encoded = serde_json::to_value(&project).expect("serialise project");
    assert_eq!(encoded["media"][0]["kind"], "GeneratedAudioWaveform");
    assert_eq!(
        encoded["tracks"][0]["clips"][0]["kind"],
        "GeneratedAudioWaveformPlane"
    );

    let snapshot = evaluate_frame(&project, 0);
    assert_eq!(snapshot.clips[0].media_id, "waveform-1");
    assert_eq!(snapshot.clips[0].source_frame, 0);
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
                }, {
                    "Outline": {
                        "colour": [0.0, 0.0, 0.0],
                        "thickness": 2.0,
                        "opacity": 0.75
                    }
                }, {
                    "Wipe": {
                        "edge": "left",
                        "progress": 0.5
                    }
                }, {
                    "Clipping": {
                        "top": 1.0,
                        "bottom": 2.0,
                        "left": 3.0,
                        "right": 4.0,
                        "angle_degrees": 45.0
                    }
                }, {
                    "SpotLight": {
                        "centre_x": 0.5,
                        "centre_y": 0.25,
                        "radius": 0.6000000238418579,
                        "intensity": 0.800000011920929,
                        "colour": [1.0, 0.95686274766922, 0.7607843279838562]
                    }
                }, {
                    "DisplacementMap": {
                        "amount_x": 24.0,
                        "amount_y": 12.0,
                        "size": 128.0,
                        "strength": 0.75
                    }
                }]
            }]
        })
    );

    let decoded: SceneSnapshot =
        serde_json::from_value(encoded).expect("deserialise scene snapshot");

    assert_eq!(decoded, snapshot);
}
