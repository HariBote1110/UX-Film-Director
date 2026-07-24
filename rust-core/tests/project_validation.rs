use uxfd_rust_core::{
    validate_project, Clip, ClipKind, ColourPipeline, Effect, Fps, MediaKind, MediaReference,
    Project, ProjectSize, Track, Transform, ValidationCode, WipeEdge,
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
                subject_crop: None,
                wipe_animations: Vec::new(),
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

#[test]
fn rejects_invalid_outline_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::Outline {
        colour: [0.0, 1.2, 0.0],
        thickness: -1.0,
        opacity: 2.0,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_displacement_map_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::DisplacementMap {
            amount_x: 24.0,
            amount_y: 12.0,
            size: 128.0,
            strength: 0.75,
        });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_displacement_map_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::DisplacementMap {
            amount_x: f32::NAN,
            amount_y: 12.0,
            size: 0.0,
            strength: 2.0,
        });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_fake_dof_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::FakeDof {
        focus_x: 0.5,
        focus_y: 0.5,
        focus_radius: 0.25,
        blur: 8.0,
        strength: 0.75,
    });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_fake_dof_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::FakeDof {
        focus_x: f32::NAN,
        focus_y: 0.5,
        focus_radius: 0.0,
        blur: -1.0,
        strength: 2.0,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_auto_blur_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::AutoBlur {
        angle_degrees: 0.0,
        radius: 10.0,
        strength: 0.8,
        colour_shift: 0.25,
    });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_auto_blur_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::AutoBlur {
        angle_degrees: f32::NAN,
        radius: -1.0,
        strength: 2.0,
        colour_shift: -0.1,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_stretch_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::Stretch {
        angle_degrees: 45.0,
        amount: 1.25,
        strength: 0.8,
    });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_stretch_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::Stretch {
        angle_degrees: f32::NAN,
        amount: -1.0,
        strength: 2.0,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_multi_slicer_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::MultiSlicer {
            angle_degrees: 45.0,
            offset: 16.0,
            slices: 18,
            expansion: 0.0,
            strength: 0.75,
        });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_multi_slicer_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::MultiSlicer {
            angle_degrees: f32::NAN,
            offset: -1.0,
            slices: 1,
            expansion: -1.0,
            strength: 2.0,
        });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_oct_transform_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::OctTransform {
            scale: 1.1,
            rotation_degrees: 30.0,
            vertex_count: 8,
            warp: 0.2,
            strength: 0.75,
        });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_oct_transform_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0]
        .effects
        .push(Effect::OctTransform {
            scale: 0.0,
            rotation_degrees: f32::NAN,
            vertex_count: 2,
            warp: -1.0,
            strength: 2.0,
        });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn accepts_finite_area_expand_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::AreaExpand {
        top: 1.0,
        bottom: 2.0,
        left: 3.0,
        right: 4.0,
        fill: true,
    });

    assert!(validate_project(&project).is_ok());
}

#[test]
fn rejects_invalid_area_expand_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::AreaExpand {
        top: -1.0,
        bottom: f32::NAN,
        left: -2.0,
        right: 4.0,
        fill: true,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn rejects_invalid_wipe_effect_progress() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::Wipe {
        edge: WipeEdge::Left,
        progress: 1.2,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}

#[test]
fn rejects_invalid_clipping_effect_values() {
    let mut project = valid_project();
    project.tracks[0].clips[0].effects.push(Effect::Clipping {
        top: -1.0,
        bottom: 0.0,
        left: 0.0,
        right: 0.0,
        angle_degrees: f32::INFINITY,
    });

    assert!(validation_codes(&project).contains(&ValidationCode::NonFiniteNumber));
}
