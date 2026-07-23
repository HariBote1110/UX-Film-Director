use uxfd_rust_core::{
    evaluate_frame, Clip, ClipKind, ColourPipeline, Fps, MediaKind, MediaReference, Project,
    ProjectSize, Track, Transform,
};

fn project_from_clip_json(source_frame_offset: Option<u64>) -> Project {
    let mut clip = serde_json::json!({
        "id": "clip-1",
        "media_id": "media-1",
        "kind": "VideoPlane",
        "start_frame": 10,
        "duration_frames": 20,
        "transform": {
            "translation_x": 0.0,
            "translation_y": 0.0,
            "scale_x": 1.0,
            "scale_y": 1.0,
            "rotation_degrees": 0.0,
            "sampling": "nearest"
        },
        "opacity": 1.0,
        "effects": []
    });
    if let Some(offset) = source_frame_offset {
        clip["source_frame_offset"] = serde_json::json!(offset);
    }

    serde_json::from_value(serde_json::json!({
        "id": "project-1",
        "version": 1,
        "size": { "width": 1920, "height": 1080 },
        "fps": { "numerator": 60, "denominator": 1 },
        "colour": {
            "profile": "rec709-sdr",
            "working_space": "linear-light",
            "alpha": "premultiplied"
        },
        "media": [{
            "id": "media-1",
            "kind": "Video",
            "source": "fixtures/clip-001.mp4"
        }],
        "tracks": [{ "id": "track-1", "clips": [clip] }]
    }))
    .expect("clip JSON must deserialise")
}

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
                source_frame_offset: 0,
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

#[test]
fn trimmed_video_source_frame_starts_at_source_frame_offset_and_advances_with_playhead() {
    let project = project_from_clip_json(Some(240));

    assert_eq!(evaluate_frame(&project, 10).clips[0].source_frame, 240);
    assert_eq!(evaluate_frame(&project, 17).clips[0].source_frame, 247);
}

#[test]
fn existing_clip_json_defaults_source_frame_offset_to_zero() {
    let project = project_from_clip_json(None);

    assert_eq!(evaluate_frame(&project, 10).clips[0].source_frame, 0);
    assert_eq!(evaluate_frame(&project, 17).clips[0].source_frame, 7);
}
