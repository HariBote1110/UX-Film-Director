use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Fps, MediaKind, MediaReference, Project,
    ProjectSize, ScalarKeyframe, Track, Transform,
};

fn project_with_opacity_keyframes() -> Project {
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
                start_frame: 100,
                duration_frames: 40,
                source_frame_offset: 0,
                transform: Transform::identity(),
                opacity: 0.25,
                opacity_keyframes: vec![
                    ScalarKeyframe {
                        frame_offset: 10,
                        value: 0.0,
                    },
                    ScalarKeyframe {
                        frame_offset: 20,
                        value: 1.0,
                    },
                ],
                position_keyframes: Vec::new(),
                effects: Vec::new(),
            }],
        }],
    }
}

#[test]
fn opacity_keyframes_use_clip_local_frame_offsets() {
    let project = project_with_opacity_keyframes();

    assert_eq!(evaluate_frame(&project, 100).clips[0].opacity, 0.0);
    assert_eq!(evaluate_frame(&project, 110).clips[0].opacity, 0.0);
    assert_eq!(evaluate_frame(&project, 115).clips[0].opacity, 0.5);
    assert_eq!(evaluate_frame(&project, 120).clips[0].opacity, 1.0);
    assert_eq!(evaluate_frame(&project, 130).clips[0].opacity, 1.0);
}

#[test]
fn base_opacity_is_used_when_no_keyframes_exist() {
    let mut project = project_with_opacity_keyframes();
    project.tracks[0].clips[0].opacity_keyframes.clear();

    assert_eq!(evaluate_frame(&project, 115).clips[0].opacity, 0.25);
}
