use std::collections::HashMap;

use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame};
use uxfd_native_wgpu_renderer::{
    render_native_wgpu_frame, render_native_wgpu_overlay_surface_frame, NativeWgpuRenderError,
};
use uxfd_reference_renderer::render_reference_frame;
use uxfd_rust_core::{ColourPipeline, Effect, EvaluatedClip, SceneSnapshot, Transform};

#[test]
fn overlay_surface_matches_export_readback_for_phase3a_reference_scenes() {
    for case in phase3a_reference_cases() {
        let reference = render_reference_frame(&case.snapshot, &case.sources, case.width, case.height)
            .expect("render CPU reference");
        assert_eq!(reference, case.anchor, "case '{}' anchor drifted", case.name);

        let export = match pollster::block_on(render_native_wgpu_frame(
            &case.snapshot,
            &case.sources,
            case.width,
            case.height,
        )) {
            Ok(frame) => frame,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping overlay surface parity test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("native wgpu export render failed for '{}': {error:?}", case.name),
        };
        let overlay = match pollster::block_on(render_native_wgpu_overlay_surface_frame(
            &case.snapshot,
            &case.sources,
            case.width,
            case.height,
        )) {
            Ok(frame) => frame,
            Err(NativeWgpuRenderError::AdapterUnavailable) => {
                eprintln!("skipping overlay surface parity test: no GPU adapter available");
                return;
            }
            Err(error) => panic!("native wgpu overlay present failed for '{}': {error:?}", case.name),
        };

        let comparison = compare_rgba_frames(&export, &overlay, ComparisonThresholds::exact());
        assert!(
            comparison.passed,
            "overlay surface differed from export readback for '{}': {comparison:?}, export={:?}, overlay={:?}",
            case.name, export.pixels, overlay.pixels
        );
    }
}

struct ReferenceCase {
    name: &'static str,
    snapshot: SceneSnapshot,
    sources: HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    anchor: RgbaFrame,
}

fn phase3a_reference_cases() -> Vec<ReferenceCase> {
    vec![
        ReferenceCase {
            name: "white_half_opacity_over_black",
            snapshot: scene_snapshot(vec![
                evaluated_clip("background", 0, 1.0, Vec::new()),
                evaluated_clip("foreground", 1, 0.5, Vec::new()),
            ]),
            sources: HashMap::from([
                ("background".to_string(), rgba_frame(1, 1, vec![0, 0, 0, 255])),
                (
                    "foreground".to_string(),
                    rgba_frame(1, 1, vec![255, 255, 255, 255]),
                ),
            ]),
            width: 1,
            height: 1,
            anchor: rgba_frame(1, 1, vec![188, 188, 188, 255]),
        },
        ReferenceCase {
            name: "white_quarter_opacity_over_black",
            snapshot: scene_snapshot(vec![
                evaluated_clip("background", 0, 1.0, Vec::new()),
                evaluated_clip("foreground", 1, 0.25, Vec::new()),
            ]),
            sources: HashMap::from([
                ("background".to_string(), rgba_frame(1, 1, vec![0, 0, 0, 255])),
                (
                    "foreground".to_string(),
                    rgba_frame(1, 1, vec![255, 255, 255, 255]),
                ),
            ]),
            width: 1,
            height: 1,
            anchor: rgba_frame(1, 1, vec![137, 137, 137, 255]),
        },
        ReferenceCase {
            name: "source_alpha_times_clip_opacity",
            snapshot: scene_snapshot(vec![
                evaluated_clip("background", 0, 1.0, Vec::new()),
                evaluated_clip("foreground", 1, 0.5, Vec::new()),
            ]),
            sources: HashMap::from([
                ("background".to_string(), rgba_frame(1, 1, vec![0, 0, 0, 255])),
                (
                    "foreground".to_string(),
                    rgba_frame(1, 1, vec![255, 255, 255, 128]),
                ),
            ]),
            width: 1,
            height: 1,
            anchor: rgba_frame(1, 1, vec![137, 137, 137, 255]),
        },
        ReferenceCase {
            name: "gain_above_one_clamp",
            snapshot: scene_snapshot(vec![evaluated_clip(
                "foreground",
                0,
                1.0,
                vec![Effect::LinearGain { gain: 2.0 }],
            )]),
            sources: HashMap::from([(
                "foreground".to_string(),
                rgba_frame(1, 1, vec![203, 203, 203, 255]),
            )]),
            width: 1,
            height: 1,
            anchor: rgba_frame(1, 1, vec![255, 255, 255, 255]),
        },
        ReferenceCase {
            name: "two_pixel_coordinates",
            snapshot: scene_snapshot(vec![
                evaluated_clip("background", 0, 1.0, Vec::new()),
                evaluated_clip("foreground", 1, 0.5, Vec::new()),
            ]),
            sources: HashMap::from([
                (
                    "background".to_string(),
                    rgba_frame(2, 1, vec![0, 0, 0, 255, 0, 0, 0, 255]),
                ),
                (
                    "foreground".to_string(),
                    rgba_frame(2, 1, vec![255, 0, 0, 255, 0, 0, 255, 255]),
                ),
            ]),
            width: 2,
            height: 1,
            anchor: rgba_frame(2, 1, vec![188, 0, 0, 255, 0, 0, 188, 255]),
        },
    ]
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
    EvaluatedClip {
        clip_id: media_id.to_string(),
        track_id: format!("track-{z_index}"),
        media_id: media_id.to_string(),
        source_frame: 0,
        z_index,
        transform: Transform::identity(),
        opacity,
        effects,
    }
}

fn rgba_frame(width: u32, height: u32, pixels: Vec<u8>) -> RgbaFrame {
    RgbaFrame::from_rgba8(width, height, pixels).expect("valid RGBA frame")
}
