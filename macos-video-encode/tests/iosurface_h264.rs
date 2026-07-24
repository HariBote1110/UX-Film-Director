#![cfg(target_os = "macos")]

use std::collections::HashMap;
use std::process::Command;
use uxfd_golden_harness::RgbaFrame;
use uxfd_macos_video_encode::VideoEncodeSession;
use uxfd_native_wgpu_renderer::{
    BgraIoSurfaceTarget, NativeWgpuRenderError, NativeWgpuRenderer,
};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};

#[test]
fn encodes_gpu_rendered_iosurface_frames_as_h264_without_rgba_readback() {
    let width = 64;
    let height = 64;
    let fps = 30;
    let renderer = match pollster::block_on(NativeWgpuRenderer::new(width, height)) {
        Ok(renderer) => renderer,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping IOSurface H.264 test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native renderer setup failed: {error:?}"),
    };
    let directory = tempfile::tempdir().expect("temporary output directory");
    let output_path = directory.path().join("iosurface-h264.mp4");
    let mut encoder =
        VideoEncodeSession::start(&output_path, width, height, fps).expect("writer starts");

    for (frame_index, rgba) in [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]]
        .into_iter()
        .enumerate()
    {
        let snapshot = SceneSnapshot {
            frame_index: frame_index as u64,
            colour: ColourPipeline::rec709_sdr_linear(),
            clips: vec![EvaluatedClip {
                clip_id: "clip".to_string(),
                track_id: "track".to_string(),
                media_id: "solid".to_string(),
                source_frame: frame_index as u64,
                z_index: 0,
                transform: Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let sources = HashMap::from([(
            "solid".to_string(),
            RgbaFrame::from_rgba8(
                width,
                height,
                rgba.repeat((width * height) as usize),
            )
            .expect("valid solid source"),
        )]);
        let frame = encoder.acquire_frame().expect("pool supplies a frame");
        let timings = pollster::block_on(renderer.render_frame_to_bgra_iosurface(
            &snapshot,
            &sources,
            &HashMap::new(),
            &HashMap::new(),
            BgraIoSurfaceTarget {
                surface_id: frame.surface_id(),
                width: frame.width(),
                height: frame.height(),
            },
        ))
        .expect("GPU renders into encoder frame");
        assert_eq!(timings.readback_encode, std::time::Duration::ZERO);
        encoder
            .append_frame(frame, frame_index as u64)
            .expect("frame append succeeds");
    }
    encoder.finish().expect("writer finishes");

    let probe = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-count_frames",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,nb_read_frames",
            "-of",
            "json",
        ])
        .arg(&output_path)
        .output()
        .expect("ffprobe must be available");
    assert!(probe.status.success(), "{:?}", probe);
    let json: serde_json::Value =
        serde_json::from_slice(&probe.stdout).expect("valid ffprobe JSON");
    let stream = &json["streams"][0];
    assert_eq!(stream["codec_name"], "h264");
    assert_eq!(stream["width"], width);
    assert_eq!(stream["height"], height);
    assert_eq!(stream["nb_read_frames"], "3");
}
