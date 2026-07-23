use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Fps, MediaKind, MediaReference, Project,
    ProjectSize, Track, Transform,
};

fn project_with_single_clip(start_frame: u64, duration_frames: u64) -> Project {
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
            kind: MediaKind::Video,
            source: "fixtures/clip-001.mp4".to_string(),
        }],
        tracks: vec![Track {
            id: "track-1".to_string(),
            clips: vec![Clip {
                id: "clip-1".to_string(),
                media_id: "media-1".to_string(),
                kind: ClipKind::VideoPlane,
                start_frame,
                duration_frames,
                transform: Transform::identity(),
                opacity: 0.75,
                opacity_keyframes: Vec::new(),
                position_keyframes: Vec::new(),
                effects: Vec::new(),
            }],
        }],
    }
}

#[test]
fn clip_is_active_on_start_frame() {
    let project = project_with_single_clip(10, 5);

    let snapshot = evaluate_frame(&project, 10);

    assert_eq!(snapshot.clips.len(), 1);
    assert_eq!(snapshot.clips[0].clip_id, "clip-1");
    assert_eq!(snapshot.clips[0].media_id, "media-1");
    assert_eq!(snapshot.clips[0].track_id, "track-1");
    assert_eq!(snapshot.clips[0].source_frame, 0);
    assert_eq!(snapshot.clips[0].z_index, 0);
    assert_eq!(snapshot.clips[0].opacity, 0.75);
}

#[test]
fn clip_is_active_on_last_frame_before_end() {
    let project = project_with_single_clip(10, 5);

    let snapshot = evaluate_frame(&project, 14);

    assert_eq!(snapshot.clips.len(), 1);
    assert_eq!(snapshot.clips[0].source_frame, 4);
}

#[test]
fn clip_is_inactive_before_start_and_at_end_frame() {
    let project = project_with_single_clip(10, 5);

    assert!(evaluate_frame(&project, 9).clips.is_empty());
    assert!(evaluate_frame(&project, 15).clips.is_empty());
}

#[test]
fn zero_duration_clip_is_never_active() {
    let project = project_with_single_clip(10, 0);

    assert!(evaluate_frame(&project, 10).clips.is_empty());
}
