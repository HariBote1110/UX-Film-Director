use uxfd_rust_core::{
    apply_command, Clip, ClipKind, ColourPipeline, Command, CommandError, Fps, MediaKind,
    MediaReference, Project, ProjectSize, Track, Transform,
};

fn valid_project() -> Project {
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
                start_frame: 10,
                duration_frames: 90,
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
fn set_clip_opacity_returns_undo_that_restores_original_project() {
    let original = valid_project();
    let command = Command::SetClipOpacity {
        clip_id: "clip-1".to_string(),
        opacity: 0.4,
    };

    let applied = apply_command(&original, &command).expect("apply opacity command");
    let undone = apply_command(&applied.project, &applied.undo).expect("apply undo command");

    assert_eq!(applied.project.tracks[0].clips[0].opacity, 0.4);
    assert_eq!(undone.project, original);
}

#[test]
fn redo_after_undo_matches_first_applied_state() {
    let original = valid_project();
    let command = Command::SetClipOpacity {
        clip_id: "clip-1".to_string(),
        opacity: 0.4,
    };

    let applied = apply_command(&original, &command).expect("apply opacity command");
    let undone = apply_command(&applied.project, &applied.undo).expect("apply undo command");
    let redone = apply_command(&undone.project, &command).expect("reapply opacity command");

    assert_eq!(redone.project, applied.project);
}

#[test]
fn command_rejects_unknown_clip() {
    let original = valid_project();
    let command = Command::SetClipOpacity {
        clip_id: "missing-clip".to_string(),
        opacity: 0.4,
    };

    let error = apply_command(&original, &command).expect_err("unknown clip must fail");

    assert_eq!(
        error,
        CommandError::ClipNotFound {
            clip_id: "missing-clip".to_string(),
        }
    );
    assert_eq!(original, valid_project());
}

#[test]
fn command_rejects_invalid_result() {
    let original = valid_project();
    let command = Command::SetClipOpacity {
        clip_id: "clip-1".to_string(),
        opacity: f32::NAN,
    };

    let error = apply_command(&original, &command).expect_err("invalid result must fail");

    match error {
        CommandError::ValidationFailed(issues) => {
            assert!(issues.iter().any(|issue| issue.path == "clip.opacity"));
        }
        unexpected => panic!("expected validation failure, got {unexpected:?}"),
    }
    assert_eq!(original, valid_project());
}
