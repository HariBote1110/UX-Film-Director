use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Effect, Fps, MediaKind, MediaReference,
    Project, ProjectSize, SamplingMode, Track, Transform,
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
                effects: vec![Effect::LinearGain { gain: 1.25 }],
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
