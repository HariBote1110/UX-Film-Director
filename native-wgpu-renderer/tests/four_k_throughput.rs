use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use uxfd_golden_harness::RgbaFrame;
use uxfd_native_wgpu_renderer::{measure_native_wgpu_frame_stages, NativeWgpuRenderError};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};
use uxfd_sidecar_protocol::{frame_buffer_footprint, FrameFormat};

#[test]
#[ignore = "4K throughput probe allocates large buffers and is run explicitly during performance spikes"]
fn records_four_k_upload_render_and_readback_encode_timings() {
    let width = 3840;
    let height = 2160;
    let source = deterministic_4k_frame(width, height).expect("valid 4K source frame");
    let source_footprint =
        frame_buffer_footprint(width, height, FrameFormat::Rgba8Srgb).expect("source footprint");
    let readback_footprint = frame_buffer_footprint(width, height, FrameFormat::Rgba16FloatLinear)
        .expect("readback footprint");
    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-4k".to_string(),
            track_id: "track-1".to_string(),
            media_id: "source-4k".to_string(),
            source_frame: 0,
            z_index: 0,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };
    let sources = HashMap::from([("source-4k".to_string(), Arc::new(source))]);

    let measured = match pollster::block_on(measure_native_wgpu_frame_stages(
        &snapshot, &sources, width, height,
    )) {
        Ok(report) => report,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping 4K throughput probe: no GPU adapter available");
            return;
        }
        Err(error) => panic!("4K native wgpu stage measurement failed: {error:?}"),
    };

    assert_eq!(measured.frame.width, width);
    assert_eq!(measured.frame.height, height);
    assert_eq!(
        measured.frame.pixels.len() as u64,
        source_footprint.unpadded_bytes_per_row as u64 * u64::from(height)
    );
    assert_duration_recorded(measured.timings.source_upload);
    assert_duration_recorded(measured.timings.render);
    assert_duration_recorded(measured.timings.readback_encode);
    assert_eq!(
        measured.timings.steady_state,
        measured.timings.source_upload + measured.timings.render + measured.timings.readback_encode
    );

    eprintln!(
        "4K native wgpu timings: setup={:?}, sourceUpload={:?}, render={:?}, readbackEncode={:?}, steadyState={:?}, total={:?}, sourceSlotBytes={}, rgba16floatReadbackBytes={}",
        measured.timings.setup,
        measured.timings.source_upload,
        measured.timings.render,
        measured.timings.readback_encode,
        measured.timings.steady_state,
        measured.timings.total,
        source_footprint.slot_byte_len,
        readback_footprint.slot_byte_len,
    );
}

fn deterministic_4k_frame(
    width: u32,
    height: u32,
) -> Result<RgbaFrame, uxfd_golden_harness::RgbaFrameError> {
    let mut pixels = Vec::with_capacity(width as usize * height as usize * 4);
    for y in 0..height {
        for x in 0..width {
            pixels.extend([
                (x & 0xff) as u8,
                (y & 0xff) as u8,
                ((x ^ y) & 0xff) as u8,
                255,
            ]);
        }
    }

    RgbaFrame::from_rgba8(width, height, pixels)
}

fn assert_duration_recorded(duration: Duration) {
    assert!(
        duration > Duration::ZERO,
        "expected non-zero timing, got {duration:?}"
    );
}
