use uxfd_rust_core::{
    Clip, ClipKind, ColourPipeline, Fps, MediaKind, MediaReference, Project, ProjectSize, Track,
    Transform,
};

#[test]
fn project_model_round_trip_preserves_identity() {
    let project = Project {
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
            kind: MediaKind::Video,
            source: "fixtures/clip-001.mp4".to_string(),
        }],
        tracks: vec![Track {
            id: "track-1".to_string(),
            clips: vec![Clip {
                id: "clip-1".to_string(),
                media_id: "media-1".to_string(),
                kind: ClipKind::VideoPlane,
                start_frame: 10,
                duration_frames: 90,
                source_frame_offset: 0,
                transform: Transform::identity(),
                opacity: 0.75,
                opacity_keyframes: Vec::new(),
                position_keyframes: Vec::new(),
                subject_crop: None,
                wipe_animations: Vec::new(),
                effects: Vec::new(),
            }],
        }],
        group_controls: Vec::new(),
    };

    let encoded = serde_json::to_string_pretty(&project).expect("serialise project");
    let decoded: Project = serde_json::from_str(&encoded).expect("deserialise project");

    assert_eq!(decoded, project);
}

#[test]
fn fps_uses_rational_fields_in_serialised_form() {
    let fps = Fps {
        numerator: 30000,
        denominator: 1001,
    };

    let encoded = serde_json::to_value(fps).expect("serialise fps");

    assert_eq!(encoded["numerator"], 30000);
    assert_eq!(encoded["denominator"], 1001);
    assert!(encoded.get("seconds").is_none());
}
