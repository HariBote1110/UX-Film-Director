use std::collections::HashMap;
use std::sync::Arc;
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

    let native_result =
        pollster::block_on(render_native_wgpu_frame(&snapshot, &arc_sources(&sources), 1, 1));
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

    let native_result =
        pollster::block_on(render_native_wgpu_frame(&snapshot, &arc_sources(&sources), 1, 1));
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
fn native_wgpu_applies_displacement_map_b_horizontal_sampling_offset() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::DisplacementMap {
                amount_x: 1.0,
                amount_y: 0.0,
                size: 1.0,
                strength: 1.0,
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
            255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_fake_dof_blur_outside_focus() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::FakeDof {
                focus_x: 0.5,
                focus_y: 0.0,
                focus_radius: 0.05,
                blur: 1.0,
                strength: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            188, 188, 0, 255,
            0, 255, 0, 255,
            0, 188, 188, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_colour_correction_hue_rotation() {
    // PIXI.ColorMatrixFilter.hue(120) は sRGB 空間の luma 保存回転で
    // R→G→B→R とチャネルが循環する。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::ColourCorrection {
                brightness: 1.0,
                contrast: 0.0,
                saturation: 0.0,
                hue_degrees: 120.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            0, 255, 0, 255,
            0, 0, 255, 255,
            255, 0, 0, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_colour_correction_full_desaturation() {
    // saturate(-1) は係数が全て 1/3 になり sRGB 空間の単純平均へ潰れる。
    // 赤 (255,0,0) は encoded 1/3 = 85 のグレーになる。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::ColourCorrection {
                brightness: 1.0,
                contrast: 0.0,
                saturation: -1.0,
                hue_degrees: 0.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 0, 0, 255]).expect("valid foreground"),
        )]),
        1,
        1,
        vec![85, 85, 85, 255],
    );
}

#[test]
fn native_wgpu_applies_colour_correction_brightness_and_contrast() {
    // brightness(0.6)→contrast(0.5): encoded 1.0*0.6*1.5 - 0.5*0.5/255
    // = 0.89902 → 229。offset の /255 正規化（PIXI _colorMatrix の実挙動）
    // を含めて再現する。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::ColourCorrection {
                brightness: 0.6,
                contrast: 0.5,
                saturation: 0.0,
                hue_degrees: 0.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 0, 0, 255]).expect("valid foreground"),
        )]),
        1,
        1,
        vec![229, 0, 0, 255],
    );
}

#[test]
fn native_wgpu_applies_uniform_blur_gaussian_kernel() {
    // 3x1 の R/G/B ソースへ radius=1, strength=1 の 3x3 ガウシアン
    // （重み 1-2-1 外積 /16、高さ 1 なので縦タップは同一行へ clamp）。
    // 中央: (0.25, 0.5, 0.25) linear → (137, 188, 137)。
    // 端: (0.75, 0.25, 0) linear → (225, 137, 0)（対称に右端も同様）。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::Blur {
                radius: 1.0,
                strength: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            225, 137, 0, 255,
            137, 188, 137, 255,
            0, 137, 225, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_drop_shadow_silhouette_behind_body() {
    // 3x1 の [不透明赤, 透明, 透明] へ offset_x=1 の黒シャドウ:
    // 本体はそのまま、その右隣に alpha 形状のシルエット、さらに右は透明。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::DropShadow {
                colour: [0.0, 0.0, 0.0],
                offset_x: 1.0,
                offset_y: 0.0,
                opacity: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            255, 0, 0, 255,
            0, 0, 0, 255,
            0, 0, 0, 0,
        ],
    );
}

#[test]
fn native_wgpu_applies_gradient_overlay_alpha_across_group_bounds() {
    // 旧 PIXI GroupGradientFilter 相当。2x1 の不透明白へ、bounds 全域
    // (0,0)-(2,1) の横方向グラデーション（白 alpha=1 → 白 alpha=0）を適用する。
    // output_pixel は整数ピクセル座標（0, 1）のため uv.x は 0.0 / 0.5 になり、
    // alpha は mix(1,0,0.0)=1.0 / mix(1,0,0.5)=0.5 になる。native wgpu の出力
    // テクスチャは premultiplied RGBA のため、pixel1 は premultiplied_rgb
    // (0.5,0.5,0.5) がそのまま sRGB エンコードされる（0.5 linear -> 188）。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::GradientOverlay {
                direction_degrees: 0.0,
                stop_a: 0.0,
                stop_b: 1.0,
                is_radial: false,
                colour_a: [1.0, 1.0, 1.0, 1.0],
                colour_b: [1.0, 1.0, 1.0, 0.0],
                bounds_x: 0.0,
                bounds_y: 0.0,
                bounds_width: 2.0,
                bounds_height: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![255, 255, 255, 255, 255, 255, 255, 255])
                .expect("valid foreground"),
        )]),
        2,
        1,
        vec![255, 255, 255, 255, 188, 188, 188, 128],
    );
}

#[test]
fn native_wgpu_applies_gradient_overlay_colour_mix_across_group_bounds() {
    // 旧 PIXI GroupGradientFilter 相当。2x1 の不透明白へ、bounds 全域
    // (0,0)-(2,1) の横方向グラデーション（不透明赤 → 不透明青、リニア空間で
    // 補間）を適用する。RGB は完全に上書きされ、alpha は本体のシルエット
    // （不透明）のまま。output_pixel は整数ピクセル座標（0, 1）のため
    // ratio は 0.0 / 0.5 になる（pixel0=赤そのまま、pixel1=mix(赤,青,0.5)
    // をリニア空間で計算し、出力は Rgba8UnormSrgb のため GPU が sRGB
    // エンコードする: 0.5 linear -> 188）。
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::GradientOverlay {
                direction_degrees: 0.0,
                stop_a: 0.0,
                stop_b: 1.0,
                is_radial: false,
                colour_a: [1.0, 0.0, 0.0, 1.0],
                colour_b: [0.0, 0.0, 1.0, 1.0],
                bounds_x: 0.0,
                bounds_y: 0.0,
                bounds_width: 2.0,
                bounds_height: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![255, 255, 255, 255, 255, 255, 255, 255])
                .expect("valid foreground"),
        )]),
        2,
        1,
        vec![255, 0, 0, 255, 188, 0, 188, 255],
    );
}

#[test]
fn native_wgpu_applies_auto_blur_plus_along_motion_angle() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::AutoBlur {
                angle_degrees: 0.0,
                radius: 1.0,
                strength: 1.0,
                colour_shift: 0.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            188, 188, 0, 255,
            188, 0, 188, 255,
            0, 188, 188, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_stretch_along_horizontal_axis() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::Stretch {
                angle_degrees: 0.0,
                amount: 1.0,
                strength: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 255, 0, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_multi_slicer_offsets_alternate_slices() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::MultiSlicer {
                angle_degrees: 0.0,
                offset: 1.0,
                slices: 3,
                expansion: 0.0,
                strength: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                3,
                vec![
                    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
                    255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255,
                    255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255,
                ],
            )
            .expect("valid foreground"),
        )]),
        3,
        3,
        vec![
            0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
            255, 255, 0, 255, 255, 255, 0, 255, 0, 255, 255, 255,
            128, 128, 128, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_oct_transform_scale() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::OctTransform {
                scale: 2.0,
                rotation_degrees: 0.0,
                vertex_count: 4,
                warp: 0.0,
                strength: 1.0,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(
                3,
                1,
                vec![
                    255, 0, 0, 255,
                    0, 255, 0, 255,
                    0, 0, 255, 255,
                ],
            )
            .expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            255, 0, 0, 255,
            0, 255, 0, 255,
            0, 255, 0, 255,
        ],
    );
}

#[test]
fn native_wgpu_applies_area_expand_fill_to_right_edge() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::AreaExpand {
                top: 0.0,
                bottom: 0.0,
                left: 0.0,
                right: 2.0,
                fill: true,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 0, 0, 255]).expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            255, 0, 0, 255,
            255, 0, 0, 255,
            255, 0, 0, 255,
        ],
    );
}

#[test]
fn native_wgpu_keeps_area_expand_transparent_when_fill_is_disabled() {
    assert_native_matches_direct_hand_anchor(
        scene_snapshot(vec![evaluated_clip(
            "foreground",
            0,
            1.0,
            vec![Effect::AreaExpand {
                top: 0.0,
                bottom: 0.0,
                left: 0.0,
                right: 2.0,
                fill: false,
            }],
        )]),
        HashMap::from([(
            "foreground".to_string(),
            RgbaFrame::from_rgba8(1, 1, vec![255, 0, 0, 255]).expect("valid foreground"),
        )]),
        3,
        1,
        vec![
            255, 0, 0, 255,
            0, 0, 0, 0,
            0, 0, 0, 0,
        ],
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
            Arc::new(
                RgbaFrame::from_rgba8(3, 1, vec![0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255])
                    .expect("valid foreground"),
            ),
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

// Image / Psd media are decoded on the rust-backend side (PNG/JPEG via
// uxfd-golden-harness, PSD via psd_fast) into a plain RgbaFrame before this
// renderer ever sees them — the same RgbaFrame shape SolidColour and Video
// sources already use in the parity tests above. This renderer has no
// MediaKind awareness (uxfd_native_wgpu_renderer::prepare_scene_clips keys
// purely off clip_id -> RgbaFrame), so these two tests document that an
// Image-shaped source (opaque bitmap with a partially transparent edge, as a
// decoded PNG would have) and a Psd-shaped source (pre-composited layer
// stack placed with a non-identity transform, as a decoded PSD would have)
// go through the exact same composite path already covered for SolidColour
// and get identical CPU-reference parity guarantees.
#[test]
fn native_wgpu_matches_reference_for_image_media_shaped_source_with_alpha_edge() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip("image-1", 1, 1.0, Vec::new()),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![0, 0, 255, 255, 0, 0, 255, 255])
                .expect("valid background"),
        ),
        (
            "image-1".to_string(),
            // Decoded PNG-shaped source: fully opaque red pixel next to a
            // half-transparent red pixel, as a real Image media source with
            // an alpha channel would decode to.
            RgbaFrame::from_rgba8(2, 1, vec![255, 0, 0, 255, 255, 0, 0, 128])
                .expect("valid image media source"),
        ),
    ]);
    let reference =
        render_reference_frame(&snapshot, &sources, 2, 1).expect("render CPU reference");

    let native_result = pollster::block_on(render_native_wgpu_frame(&snapshot, &arc_sources(&sources), 2, 1));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping image media parity test: no GPU adapter available");
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
        "native wgpu frame differed from CPU reference for image-shaped source: {comparison:?}, native={:?}, reference={:?}",
        native.pixels, reference.pixels
    );
}

#[test]
fn native_wgpu_matches_reference_for_psd_media_shaped_source_with_scale_transform() {
    let snapshot = scene_snapshot(vec![
        evaluated_clip("background", 0, 1.0, Vec::new()),
        evaluated_clip_with_transform(
            "psd-1",
            1,
            1.0,
            Vec::new(),
            Transform {
                translation_x: 0.0,
                translation_y: 0.0,
                scale_x: 2.0,
                scale_y: 1.0,
                rotation_degrees: 0.0,
                sampling: SamplingMode::Nearest,
            },
        ),
    ]);
    let sources = HashMap::from([
        (
            "background".to_string(),
            RgbaFrame::from_rgba8(2, 1, vec![0, 0, 0, 255, 0, 0, 0, 255])
                .expect("valid background"),
        ),
        (
            "psd-1".to_string(),
            // Pre-composited PSD-shaped source: psd_fast flattens the
            // visible layer stack into a single opaque RgbaFrame before
            // handing it to the renderer, so a single 1x1 opaque pixel
            // stands in for "already-flattened PSD content".
            RgbaFrame::from_rgba8(1, 1, vec![0, 255, 0, 255]).expect("valid psd media source"),
        ),
    ]);
    let reference =
        render_reference_frame(&snapshot, &sources, 2, 1).expect("render CPU reference");

    let native_result = pollster::block_on(render_native_wgpu_frame(&snapshot, &arc_sources(&sources), 2, 1));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping psd media parity test: no GPU adapter available");
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
        "native wgpu frame differed from CPU reference for psd-shaped source: {comparison:?}, native={:?}, reference={:?}",
        native.pixels, reference.pixels
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
fn native_wgpu_renders_windowed_audio_waveform_after_its_source_frame_advances() {
    // Chromium 側は source_frame の再生位置から切り出した短い PCM window を
    // 渡す。この window を音声先頭からの全 PCM と誤認して source_frame 分を
    // もう一度足すと、再生が進んだフレームで全サンプルが範囲外になる。
    let mut clip = evaluated_clip("waveform-1", 0, 1.0, Vec::new());
    clip.source_frame = 60;
    let snapshot = scene_snapshot(vec![clip]);
    let waveform = NativeAudioWaveformInput {
        media_id: "waveform-1".to_string(),
        source: AudioWaveformSource::from_json(
            r##"{"generator":"audio-waveform-r","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":1,"colour":"#00ff00","thickness":1,"amplitude":1}"##,
        )
        .expect("valid waveform source"),
        samples: vec![-1.0, 1.0, -1.0, 1.0],
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
            eprintln!(
                "skipping windowed waveform source-frame regression test: no GPU adapter available"
            );
            return;
        }
        Err(error) => panic!("native wgpu render failed: {error:?}"),
    };

    assert_eq!(
        &native.pixels[0..4],
        &[0, 255, 0, 255],
        "a non-zero source frame must still render the supplied PCM window"
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
fn native_wgpu_audio_sphere_treats_pcm_as_a_window_after_source_frame_advances() {
    let source = AudioWaveformSource::from_json(
        r##"{"generator":"audio-sphere-93","target_audio_id":"audio-1","target_source":"/tmp/music.wav","sample_window_seconds":0.1,"colour":"#36c2ff","columns":2,"rows":6,"base_radius":22,"audio_influence":0.6,"point_size":2,"polygon_size":0.35,"random_amount":0,"seed":93}"##,
    )
    .expect("valid audio sphere source");
    let input = NativeAudioWaveformInput {
        media_id: "audio-sphere-1".to_string(),
        source,
        // A short window. The two columns intentionally differ at indexes
        // 1 and 3 so an accidental source-frame offset changes the image.
        samples: vec![0.2, 0.9, 0.1, 0.2, 0.0, 0.0, 0.0],
        sample_rate: 64,
        width: 64,
        height: 64,
    };
    let initial_snapshot =
        scene_snapshot(vec![evaluated_clip("audio-sphere-1", 0, 1.0, Vec::new())]);
    let mut advanced_clip = evaluated_clip("audio-sphere-1", 0, 1.0, Vec::new());
    advanced_clip.source_frame = 60;
    let advanced_snapshot = scene_snapshot(vec![advanced_clip]);

    let initial_result = pollster::block_on(render_native_wgpu_frame_with_audio_waveforms(
        &initial_snapshot,
        &HashMap::new(),
        &[input.clone()],
        64,
        64,
    ));
    let advanced_result = pollster::block_on(render_native_wgpu_frame_with_audio_waveforms(
        &advanced_snapshot,
        &HashMap::new(),
        &[input],
        64,
        64,
    ));
    let (initial, advanced) = match (initial_result, advanced_result) {
        (Ok(initial), Ok(advanced)) => (initial, advanced),
        (Err(NativeWgpuRenderError::AdapterUnavailable), _)
        | (_, Err(NativeWgpuRenderError::AdapterUnavailable)) => {
            eprintln!(
                "skipping windowed audio sphere source-frame regression test: no GPU adapter available"
            );
            return;
        }
        (Err(error), _) | (_, Err(error)) => panic!("native wgpu render failed: {error:?}"),
    };

    assert_eq!(
        advanced.pixels, initial.pixels,
        "the supplied PCM window must be independent of the timeline source frame"
    );
    assert!(
        advanced.pixels.chunks_exact(4).any(|pixel| pixel[3] > 0),
        "the advanced audio sphere frame should remain visible"
    );
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
    let native_result = pollster::block_on(render_native_wgpu_frame(
        &snapshot,
        &arc_sources(&sources),
        width,
        height,
    ));
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

    let native_result = pollster::block_on(render_native_wgpu_frame(
        &snapshot,
        &arc_sources(&sources),
        width,
        height,
    ));
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

/// `render_reference_frame` (CPU parity reference) still takes owned
/// `RgbaFrame` values, while `render_native_wgpu_frame` now takes
/// `Arc<RgbaFrame>` sources (see rust-backend generated source frame cache
/// work). Adapt the same fixtures for both call shapes instead of
/// duplicating them.
fn arc_sources(sources: &HashMap<String, RgbaFrame>) -> HashMap<String, Arc<RgbaFrame>> {
    sources
        .iter()
        .map(|(media_id, frame)| (media_id.clone(), Arc::new(frame.clone())))
        .collect()
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

#[test]
fn native_wgpu_renders_source_exceeding_downlevel_texture_limit_without_panicking() {
    // 実機バグの再現: PSD等の巨大ソース（downlevel既定値2048を超える2200px幅）を
    // 小さな出力フレームへ描画すると、以前は device の max_texture_dimension_2d が
    // 出力フレームサイズ基準で2048に制限され、create_texture が wgpu Validation
    // Error で panic して sidecar プロセスごと落ちていた。
    // 修正後は adapter の実上限をそのまま device へ要求するため panic せず、
    // 万一 adapter 自体の上限より大きい場合も CPU 側で縮小して描画継続する。
    let oversized_width = 2200_u32;
    let oversized_height = 1600_u32;
    let pixel_count = (oversized_width as usize) * (oversized_height as usize);
    let mut pixels = Vec::with_capacity(pixel_count * 4);
    for _ in 0..pixel_count {
        pixels.extend_from_slice(&[200, 100, 50, 255]);
    }
    let source = RgbaFrame::from_rgba8(oversized_width, oversized_height, pixels)
        .expect("valid oversized source frame");

    let snapshot = scene_snapshot(vec![evaluated_clip("oversized", 0, 1.0, Vec::new())]);
    let sources = HashMap::from([("oversized".to_string(), Arc::new(source))]);

    let native_result = pollster::block_on(render_native_wgpu_frame(&snapshot, &sources, 64, 48));
    let native = match native_result {
        Ok(frame) => frame,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!(
                "skipping oversized source regression test: no GPU adapter available"
            );
            return;
        }
        Err(error) => panic!("native wgpu render of oversized source failed: {error:?}"),
    };

    assert_eq!(native.width, 64);
    assert_eq!(native.height, 48);
}
