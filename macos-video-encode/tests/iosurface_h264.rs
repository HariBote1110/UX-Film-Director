#![cfg(target_os = "macos")]

use std::collections::HashMap;
use std::process::Command;
use std::sync::Arc;
use uxfd_golden_harness::RgbaFrame;
use uxfd_macos_video_encode::{VideoCodec, VideoEncodeSession};
use uxfd_native_wgpu_renderer::{
    BgraIoSurfaceTarget, NativeWgpuRenderError, NativeWgpuRenderer,
};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};

#[test]
fn encodes_gpu_rendered_iosurface_frames_as_h264_without_rgba_readback() {
    let width = 64;
    let height = 64;
    let fps = 60;
    let frame_count = 135;
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

    for frame_index in 0..frame_count {
        let rgba = match frame_index % 3 {
            0 => [255, 0, 0, 255],
            1 => [0, 255, 0, 255],
            _ => [0, 0, 255, 255],
        };
        let snapshot = SceneSnapshot {
            frame_index,
            colour: ColourPipeline::rec709_sdr_linear(),
            clips: vec![EvaluatedClip {
                clip_id: "clip".to_string(),
                track_id: "track".to_string(),
                media_id: "solid".to_string(),
                source_frame: frame_index,
                z_index: 0,
                transform: Transform::identity(),
                opacity: 1.0,
                effects: Vec::new(),
            }],
        };
        let sources = HashMap::from([(
            "solid".to_string(),
            Arc::new(RgbaFrame::from_rgba8(
                width,
                height,
                rgba.repeat((width * height) as usize),
            )
            .expect("valid solid source")),
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
            .append_frame(frame, frame_index)
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
            "stream=codec_name,width,height,nb_read_frames,duration",
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
    assert_eq!(stream["nb_read_frames"], frame_count.to_string());
    assert_eq!(stream["duration"], "2.250000");
}

#[test]
#[ignore = "実機 VideoToolbox/ffprobe 検証用。UXFD_RUN_HEVC_ENCODER_TEST=1 で親環境から実行する"]
fn encodes_hevc_with_avassetwriter_when_explicitly_enabled() {
    if std::env::var("UXFD_RUN_HEVC_ENCODER_TEST").as_deref() != Ok("1") {
        return;
    }
    let directory = tempfile::tempdir().expect("temporary output directory");
    let output_path = directory.path().join("iosurface-hevc.mp4");
    let mut encoder = VideoEncodeSession::start_with_codec(&output_path, 64, 64, 30, VideoCodec::Hevc)
        .expect("HEVC writer starts");
    for frame_index in 0..3 {
        let frame = encoder.acquire_frame().expect("pool supplies a frame");
        encoder.append_frame(frame, frame_index).expect("frame append succeeds");
    }
    encoder.finish().expect("writer finishes");
    let probe = Command::new("ffprobe")
        .args(["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,nb_read_frames", "-of", "json"])
        .arg(&output_path)
        .output().expect("ffprobe must be available");
    assert!(probe.status.success(), "{probe:?}");
    let json: serde_json::Value = serde_json::from_slice(&probe.stdout).expect("valid ffprobe JSON");
    assert_eq!(json["streams"][0]["codec_name"], "hevc");
    assert_eq!(json["streams"][0]["nb_read_frames"], "3");
}
