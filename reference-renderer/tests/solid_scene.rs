use std::collections::HashMap;
use uxfd_golden_harness::RgbaFrame;
use uxfd_reference_renderer::{render_reference_frame, ReferenceRenderError};
use uxfd_rust_core::{
    ColourPipeline, Effect, EvaluatedClip, SamplingMode, SceneSnapshot, Transform,
};

#[test]
fn composites_opaque_background_and_half_opacity_foreground_in_linear_light() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("foreground", 1, 0.5, Vec::new()),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![0, 0, 255, 255]).expect("valid background"),
        ),
        (
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 0, 0, 255]).expect("valid foreground"),
        ),
    ]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![188, 0, 188, 255]);
}

#[test]
fn white_half_opacity_over_black_anchors_linear_light_blending() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("foreground", 1, 0.5, Vec::new()),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![0, 0, 0, 255]).expect("valid background"),
        ),
        (
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 255, 255, 255]).expect("valid foreground"),
        ),
    ]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![188, 188, 188, 255]);
}

#[test]
fn white_quarter_opacity_over_black_anchors_non_half_opacity() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("foreground", 1, 0.25, Vec::new()),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![0, 0, 0, 255]).expect("valid background"),
        ),
        (
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 255, 255, 255]).expect("valid foreground"),
        ),
    ]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![137, 137, 137, 255]);
}

#[test]
fn source_alpha_and_clip_opacity_multiply_before_compositing() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("foreground", 1, 0.5, Vec::new()),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![0, 0, 0, 255]).expect("valid background"),
        ),
        (
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 255, 255, 128]).expect("valid foreground"),
        ),
    ]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![137, 137, 137, 255]);
}

#[test]
fn decodes_srgb_then_applies_linear_gain_before_compositing() {
    let snapshot = scene_snapshot(vec![evaluated_clip(
        "foreground",
        0,
        1.0,
        vec![Effect::LinearGain { gain: 0.5 }],
    )]);
    let sources = HashMap::from([(
        "foreground".to_string(),
        RgbaFrame::from_rgba8(1, 1, vec![255, 128, 0, 255]).expect("valid foreground"),
    )]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![188, 92, 0, 255]);
}

#[test]
fn gain_above_one_clamps_during_srgb_output_quantisation() {
    let snapshot = scene_snapshot(vec![evaluated_clip(
        "foreground",
        0,
        1.0,
        vec![Effect::LinearGain { gain: 2.0 }],
    )]);
    let sources = HashMap::from([(
        "foreground".to_string(),
        RgbaFrame::from_rgba8(1, 1, vec![203, 203, 203, 255]).expect("valid foreground"),
    )]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![255, 255, 255, 255]);
}

#[test]
fn two_pixel_scene_preserves_pixel_coordinates() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("foreground", 1, 0.5, Vec::new()),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![0, 0, 0, 255, 0, 0, 0, 255])
                .expect("valid background"),
        ),
        (
            "foreground".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 255])
                .expect("valid foreground"),
        ),
    ]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 2, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![188, 0, 0, 255, 0, 0, 188, 255]);
}

#[test]
fn transformed_clip_uses_integer_translation_and_nearest_scale() {
    let snapshot = scene_snapshot(vec![evaluated_clip_with_transform(
        "foreground",
        0,
        1.0,
        Vec::new(),
        Transform {
            translation_x: 1.0,
            translation_y: 1.0,
            scale_x: 2.0,
            scale_y: 2.0,
            rotation_degrees: 0.0,
            sampling: SamplingMode::Nearest,
        },
    )]);
    let sources = HashMap::from([(
        "foreground".to_string(),
        RgbaFrame::from_rgba8(
            2,
            2,
            vec![
                255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
            ],
        )
        .expect("valid source"),
    )]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 5, 5).expect("render reference frame");

    assert_eq!(rendered.pixels, transformed_nearest_anchor());
}

#[test]
fn bilinear_sampling_interpolates_in_linear_light() {
    let snapshot = scene_snapshot(vec![evaluated_clip_with_transform(
        "foreground",
        0,
        1.0,
        Vec::new(),
        Transform {
            translation_x: -0.5,
            translation_y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation_degrees: 0.0,
            sampling: SamplingMode::Bilinear,
        },
    )]);
    let sources = HashMap::from([(
        "foreground".to_string(),
        RgbaFrame::from_rgba8(2, 1, vec![0, 0, 0, 255, 255, 255, 255, 255]).expect("valid source"),
    )]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render reference frame");

    assert_eq!(rendered.pixels, vec![188, 188, 188, 255]);
}

#[test]
fn rotated_clip_uses_top_left_pivot_inverse_sampling() {
    let snapshot = scene_snapshot(vec![evaluated_clip_with_transform(
        "foreground",
        0,
        1.0,
        Vec::new(),
        Transform {
            translation_x: 1.0,
            translation_y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation_degrees: 90.0,
            sampling: SamplingMode::Nearest,
        },
    )]);
    let sources = HashMap::from([(
        "foreground".to_string(),
        RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 255])
            .expect("valid source"),
    )]);

    let rendered =
        render_reference_frame(&snapshot, &sources, 2, 2).expect("render rotated reference frame");

    assert_eq!(
        rendered.pixels,
        vec![
            0, 0, 0, 0, 255, 0, 0, 255,
            0, 0, 0, 0, 0, 0, 255, 255,
        ]
    );
}

#[test]
fn missing_media_source_is_reported() {
    let snapshot = scene_snapshot(vec![evaluated_clip("missing", 0, 1.0, Vec::new())]);
    let sources = HashMap::new();

    let error =
        render_reference_frame(&snapshot, &sources, 1, 1).expect_err("missing source must fail");

    assert_eq!(
        error,
        ReferenceRenderError::MissingSource {
            media_id: "missing".to_string(),
        }
    );
}

#[test]
fn source_size_must_match_canvas_for_initial_identity_gate() {
    let snapshot = scene_snapshot(vec![evaluated_clip("foreground", 0, 1.0, Vec::new())]);
    let sources = HashMap::from([(
        "foreground".to_string(),
        RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 255, 0, 0, 255])
            .expect("valid foreground"),
    )]);

    let error =
        render_reference_frame(&snapshot, &sources, 1, 1).expect_err("size mismatch must fail");

    assert_eq!(
        error,
        ReferenceRenderError::SourceSizeMismatch {
            media_id: "foreground".to_string(),
            expected_width: 1,
            expected_height: 1,
            actual_width: 2,
            actual_height: 1,
        }
    );
}

fn scene_snapshot(clips: Vec<EvaluatedClip>) -> SceneSnapshot {
    SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips,
    }
}

fn evaluated_clip(
    media_id: &str,
    z_index: u32,
    opacity: f32,
    effects: Vec<Effect>,
) -> EvaluatedClip {
    evaluated_clip_with_transform(media_id, z_index, opacity, effects, Transform::identity())
}

fn evaluated_clip_with_transform(
    media_id: &str,
    z_index: u32,
    opacity: f32,
    effects: Vec<Effect>,
    transform: Transform,
) -> EvaluatedClip {
    EvaluatedClip {
        clip_id: format!("clip-{media_id}"),
        track_id: "track-1".to_string(),
        media_id: media_id.to_string(),
        source_frame: 0,
        z_index,
        transform,
        opacity,
        effects,
    }
}

fn transformed_nearest_anchor() -> Vec<u8> {
    vec![
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255,
        255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255,
        0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255,
    ]
}
