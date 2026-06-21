use uxfd_rust_core::{
    validate_project, Clip, ClipKind, ColourPipeline, Effect, Fps, MediaKind, MediaReference,
    Project, ProjectSize, Track, Transform, ValidationCode,
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
                transform: Transform::identity(),
                opacity: 0.75,
                opacity_keyframes: Vec::new(),
                effects: Vec::new(),
            }],
        }],
    }
}

fn validation_codes(project: &Project) -> Vec<ValidationCode> {
    validate_project(project)
        .expect_err("project must fail validation")
        .into_iter()
        .map(|issue| issue.code)
        .collect()
}

#[test]
fn valid_project_passes_validation() {
    assert!(validate_project(&valid_project()).is_ok());
}

#[test]
fn rejects_zero_fps_components() {
    let mut project = valid_project();
    project.fps.denominator = 0;

    assert!(validation_codes(&project).contains(&ValidationCode::InvalidFps));
}

#[test]
fn rejects_missing_clip_media_reference() {
    let mut project = valid_project();
    project.tracks[0].clips[0].media_id = "missing-media".to_string();

    assert!(validation_codes(&project).contains(&ValidationCode::MissingMediaReference));
}

#[test]
fn rejects_duplicate_ids() {
    let mut project = valid_project();
    project.media.push(project.media[0].clone());
    let duplicated_clip = project.tracks[0].clips[0].clone();
    project.tracks[0].clips.push(duplicated_clip);

    let codes = validation_codes(&project);

    assert!(codes.contains(&ValidationCode::DuplicateMediaId));
    assert!(codes.contains(&ValidationCode::DuplicateClipId));
}

#[test]
fn rejects_non_finite_opacity() {
    let mut project = valid_project();
    project.tracks[0].clips[0].opacity = f32::NAN;

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn rejects_non_finite_transform_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].transform.rotation_degrees = f32::INFINITY;

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn rejects_non_finite_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::LinearGain { gain: f32::NAN });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn rejects_negative_colour_aberration_effect_offsets() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::ColourAberration {
            offset_x: -1.0,
            offset_y: 0.0,
        });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}
