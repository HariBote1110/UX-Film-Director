use std::collections::HashMap;
use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{
    render_native_wgpu_frame, render_native_wgpu_frame_with_audio_waveforms,
    NativeAudioWaveformInput, NativeWgpuRenderError,
};
use uxfd_reference_renderer::render_reference_frame;
use uxfd_rust_core::{
    AudioWaveformSource, ColourPipeline, Effect, EvaluatedClip, SamplingMode, SceneSnapshot,
    Transform, WipeEdge,
};

#[test]
fn native_wgpu_matches_cpu_reference_for_half_opacity_red_over_blue() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("foreground", 1, 0.5, vec![Effect::LinearGain { gain: 1.0 }]),
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
    let reference =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render CPU reference");

    let native_result = pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, 1, 1));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping native wgpu parity test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    let comparison = compare_rgba_frames(
        &reference,
        &native,
        ComparisonThresholds {
            max_channel_delta: 1,
            max_mean_absolute_error: 1.0,
            min_psnr: 48.0,
            min_ssim: 0.99,
        },
    );

    assert!(
        comparison.passed,
        "native wgpu frame differed from CPU reference: {comparison:?}, native={:?}, reference={:?}",
        native.pixels,
        reference.pixels
    );
}

#[test]
fn native_wgpu_matches_hand_anchored_white_half_opacity_over_black() {
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
    let hand_anchored =
        RgbaFrame::from_rgba8(1, 1, vec![188, 188, 188, 255]).expect("valid anchor");
    let reference =
        render_reference_frame(&snapshot, &sources, 1, 1).expect("render CPU reference");

    assert_eq!(reference, hand_anchored);

    let native_result = pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, 1, 1));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping native wgpu parity test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    let comparison = compare_rgba_frames(
        &hand_anchored,
        &native,
        ComparisonThresholds {
            max_channel_delta: 1,
            max_mean_absolute_error: 1.0,
            min_psnr: 48.0,
            min_ssim: 0.99,
        },
    );

    assert!(
        comparison.passed,
        "native wgpu frame differed from hand anchor: {comparison:?}, native={:?}, anchor={:?}",
        native.pixels, hand_anchored.pixels
    );
}

#[test]
fn native_wgpu_matches_hand_anchored_white_quarter_opacity_over_black() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![
            evaluated_clip("background", 0, 1.0, Vec::new()),
            evaluated_clip("foreground", 1, 0.25, Vec::new()),
        ]),
        HashMap::from([
            (
                "background".to_string(),
                RgbaFrame::from_rgba8(1, 1, vec![0, 0, 0, 255]).expect("valid background"),
            ),
            (
                "foreground".to_string(),
                RgbaFrame::from_rgba8(1, 1, vec![255, 255, 255, 255]).expect("valid foreground"),
            ),
        ]),
        1,
        1,
        vec![137, 137, 137, 255],
    );
}

#[test]
fn native_wgpu_matches_hand_anchored_source_alpha_times_clip_opacity() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![
            evaluated_clip("background", 0, 1.0, Vec::new()),
            evaluated_clip("foreground", 1, 0.5, Vec::new()),
        ]),
        HashMap::from([
            (
                "background".to_string(),
                RgbaFrame::from_rgba8(1, 1, vec![0, 0, 0, 255]).expect("valid background"),
            ),
            (
                "foreground".to_string(),
                RgbaFrame::from_rgba8(1, 1, vec![255, 255, 255, 128]).expect("valid foreground"),
            ),
        ]),
        1,
        1,
        vec![137, 137, 137, 255],
    );
}

#[test]
fn native_wgpu_matches_hand_anchored_gain_above_one_clamp() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::LinearGain { gain: 2.0 }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![203, 203, 203, 255]).expect("valid foreground"),
        )]),
        1,
        1,
        vec![255, 255, 255, 255],
    );
}

#[test]
fn native_wgpu_applies_colour_aberration_channel_offsets() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::ColourAberration {
                offset_x: 1.0,
                offset_y: 0.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(3, 1, vec![0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255])
                .expect("valid foreground"),
        )]),
        3,
        1,
        vec![0, 0, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255],
    );
}

#[test]
fn native_wgpu_applies_outline_to_transparent_neighbours() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::Outline {
                colour: [0.0, 0.0, 0.0],
                thickness: 1.0,
                opacity: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(3, 1, vec![0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0])
                .expect("valid foreground"),
        )]),
        3,
        1,
        vec![0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255],
    );
}

#[test]
fn native_wgpu_applies_spot_light_to_centre_pixels() {
    let native_result = pollster::block_on(render_native_wgpu_frame(
        &scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::SpotLight {
                centre_x: 1.0 / 3.0,
                centre_y: 0.0,
                radius: 0.45,
                intensity: 1.0,
                colour: [1.0, 1.0, 1.0],
            }],
        )]),
        &HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(3, 1, vec![0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])
                .expect("valid foreground"),
        )]),
        3,
        1,
    ));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping native wgpu spotlight test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    let left_red = native.pixels[0];
    let centre_red = native.pixels[4];
    let right_red = native.pixels[8];
    assert!(
        centre_red > left_red && centre_red > right_red,
        "spotlight should brighten the centre more than the edges: {:?}",
        native.pixels
    );
}

#[test]
fn native_wgpu_applies_left_wipe_progress() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::Wipe {
                edge: WipeEdge::Left,
                progress: 0.5,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                4,
                1,
                vec![
                    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
                ],
            )
            .expect("valid foreground"),
        )]),
        4,
        1,
        vec![255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0],
    );
}

#[test]
fn native_wgpu_applies_axis_aligned_clipping() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::Clipping {
                top: 0.0,
                bottom: 0.0,
                left: 1.0,
                right: 0.0,
                angle_degrees: 0.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                4,
                1,
                vec![
                    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
                ],
            )
            .expect("valid foreground"),
        )]),
        4,
        1,
        vec![
            0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        ],
    );
}

#[test]
fn native_wgpu_renders_generated_audio_waveform_frame() {
    let snapshot = scene_snapshot(vec![evaluated_clip("waveform-1", 0, 1.0, Vec::new())]);
    let waveform = NativeAudioWaveformInput {
        media_id: "waveform-1".to_string(),
        source: AudioWaveformSource::from_json(
            r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}"##,
        )
        .expect("valid waveform source"),
        samples: vec![0.0, 0.0, 0.0, 0.0],
        sample_rate: 4,
        width: 4,
        height: 2,
    };
    let native_result = pollster::block_on(render_native_wgpu_frame_with_audio_waveforms(
        &snapshot,
        &HashMap::new(),
        &[waveform],
        4,
        2,
    ));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping generated waveform native wgpu test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    assert_eq!(
        native.pixels,
        vec![
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
            0, 255, 0, 255, 0, 255,
        ]
    );
}

#[test]
fn native_wgpu_renders_generated_audio_sphere_frame_from_audio_samples() {
    let snapshot = scene_snapshot(vec![evaluated_clip("audio-sphere-1", 0, 1.0, Vec::new())]);
    let quiet = NativeAudioWaveformInput {
        media_id: "audio-sphere-1".to_string(),
        source: AudioWaveformSource::from_json(
            r##"{"generator":"audio-sphere-93","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":0.1,"colour":"#36c2ff","columns":8,"rows":6,"base_radius":22,"audio_influence":0.6,"point_size":2,"polygon_size":0.35,"random_amount":0.05,"seed":93}"##,
        )
        .expect("valid audio sphere source"),
        samples: vec![0.0; 64],
        sample_rate: 64,
        width: 64,
        height: 64,
    };
    let loud = NativeAudioWaveformInput {
        samples: vec![0.8; 64],
        ..quiet.clone()
    };

    let quiet_result = pollster::block_on(render_native_wgpu_frame_with_audio_waveforms(
        &snapshot,
        &HashMap::new(),
        &[quiet],
        64,
        64,
    ));
    let loud_result = pollster::block_on(render_native_wgpu_frame_with_audio_waveforms(
        &snapshot,
        &HashMap::new(),
        &[loud],
        64,
        64,
    ));
    let (quiet_frame, loud_frame) = match (quiet_result, loud_result) {
        (Ok(quiet_frame), Ok(loud_frame)) => (quiet_frame, loud_frame),
        (Err(NativeWgpuRenderError::AdapterUnavailable), _)
        | (_, Err(NativeWgpuRenderError::AdapterUnavailable)) => {
            eprintln!("skipping generated audio sphere native wgpu test: no GPU adapter available");
            return;
        }
        (Err(error), _) | (_, Err(error)) => panic!("native wgpu render failed: {error:?}"),
    };

    let quiet_opaque = quiet_frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] > 0)
        .count();
    let loud_opaque = loud_frame
        .pixels
        .chunks_exact(4)
        .filter(|rgba| rgba[3] > 0)
        .count();
    let changed_bytes = quiet_frame
        .pixels
        .iter()
        .zip(loud_frame.pixels.iter())
        .filter(|(left, right)| left != right)
        .count();

    assert!(quiet_opaque > 100);
    assert!(loud_opaque > quiet_opaque);
    assert!(changed_bytes > 200);
}

#[test]
fn native_wgpu_matches_hand_anchored_two_pixel_coordinates() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![
            evaluated_clip("background", 0, 1.0, Vec::new()),
            evaluated_clip("foreground", 1, 0.5, Vec::new()),
        ]),
        HashMap::from([
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
        ]),
        2,
        1,
        vec![188, 0, 0, 255, 0, 0, 188, 255],
    );
}

#[test]
fn native_wgpu_matches_reference_for_identity_transform_partial_source_at_origin() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![evaluated_clip("foreground", 0, 1.0, Vec::new())]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                2,
                2,
                vec![
                    255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
                ],
            )
            .expect("valid foreground"),
        )]),
        4,
        4,
        vec![
            255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
    );
}

#[test]
fn native_wgpu_matches_reference_for_integer_translation_and_nearest_scale() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![evaluated_clip_with_transform(
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
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                2,
                2,
                vec![
                    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
                ],
            )
            .expect("valid foreground"),
        )]),
        5,
        5,
        transformed_nearest_anchor(),
    );
}

#[test]
fn native_wgpu_matches_reference_for_linear_light_bilinear_sampling() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![evaluated_clip_with_transform(
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
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![0, 0, 0, 255, 255, 255, 255, 255])
                .expect("valid foreground"),
        )]),
        1,
        1,
        vec![188, 188, 188, 255],
    );
}

#[test]
fn native_wgpu_matches_reference_for_top_left_pivot_rotation() {
    assert_native_matches_hand_anchor(
        scene_snapshot(vec![evaluated_clip_with_transform(
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
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 255])
                .expect("valid foreground"),
        )]),
        2,
        2,
        vec![0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0],
    );
}

fn assert_native_matches_direct_hand_anchor(
    snapshot: SceneSnapshot,
    sources: HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    anchor_pixels: Vec<u8>,
) {
    let hand_anchored = RgbaFrame::from_rgba8(width, height, anchor_pixels).expect("valid anchor");
    let native_result =
        pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, width, height));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping native wgpu direct test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    let comparison = compare_rgba_frames(
        &hand_anchored,
        &native,
        ComparisonThresholds {
            max_channel_delta: 1,
            max_mean_absolute_error: 1.0,
            min_psnr: 48.0,
            min_ssim: 0.99,
        },
    );

    assert!(
        comparison.passed,
        "native wgpu frame differed from direct hand anchor: {comparison:?}, native={:?}, anchor={:?}",
        native.pixels, hand_anchored.pixels
    );
}

fn assert_native_matches_hand_anchor(
    snapshot: SceneSnapshot,
    sources: HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    anchor_pixels: Vec<u8>,
) {
    let hand_anchored = RgbaFrame::from_rgba8(width, height, anchor_pixels).expect("valid anchor");
    let reference =
        render_reference_frame(&snapshot, &sources, width, height).expect("render CPU reference");

    assert_eq!(reference, hand_anchored);

    let native_result =
        pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, width, height));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping native wgpu parity test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    let comparison = compare_rgba_frames(
        &hand_anchored,
        &native,
        ComparisonThresholds {
            max_channel_delta: 1,
            max_mean_absolute_error: 1.0,
            min_psnr: 48.0,
            min_ssim: 0.99,
        },
    );

    assert!(
        comparison.passed,
        "native wgpu frame differed from hand anchor: {comparison:?}, native={:?}, anchor={:?}",
        native.pixels, hand_anchored.pixels
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
