use std::collections::HashMap;

use crate::frames::pad_rgba_rows;
use uxfd_golden_harness::RgbaFrame;
use uxfd_rust_core::{EvaluatedClip, MediaKind, SamplingMode, SceneMediaReference, SceneSnapshot};
#[cfg(unix)]
use uxfd_shared_memory_spike::PosixSharedRing;
use uxfd_sidecar_protocol::{rgba8_srgb_ring_layout, ColourMetadata, SharedFrame};

#[cfg(unix)]
pub(crate) struct CpuSimpleVideoRenderReport {
    pub(crate) ring: PosixSharedRing,
    pub(crate) slot_count: u32,
    pub(crate) slot_byte_len: u64,
    pub(crate) shared_frame: SharedFrame,
}

#[cfg(unix)]
pub(crate) fn try_render_simple_video_frame_to_shared_ring(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
    memory_id: &str,
    slot_count: u32,
    pts_frame: u64,
) -> Result<Option<CpuSimpleVideoRenderReport>, String> {
    let Some(frame) = try_render_simple_video_frame(snapshot, media_items, sources, width, height)?
    else {
        return Ok(None);
    };

    let colour = ColourMetadata::rec709_srgb();
    let layout = rgba8_srgb_ring_layout(memory_id, slot_count, width, height, colour)
        .map_err(|error| format!("CPU simple video output layout failed: {error:?}"))?;
    let descriptor = layout
        .descriptor_for_slot(0)
        .map_err(|error| format!("CPU simple video output descriptor failed: {error:?}"))?;
    let padded = pad_rgba_rows(&frame.pixels, width, height, descriptor.stride_bytes)?;
    let slot_byte_len = usize::try_from(descriptor.byte_len).map_err(|_| {
        format!(
            "CPU simple video output byteLen overflows usize: {}",
            descriptor.byte_len
        )
    })?;
    let ring = PosixSharedRing::create_with_slot_count(memory_id, slot_count, slot_byte_len)
        .map_err(|error| format!("CPU simple video output shared memory failed: {error:?}"))?;
    ring.write_frame(pts_frame, &padded)
        .map_err(|error| format!("CPU simple video output write failed: {error:?}"))?;

    Ok(Some(CpuSimpleVideoRenderReport {
        ring,
        slot_count,
        slot_byte_len: descriptor.byte_len,
        shared_frame: SharedFrame {
            descriptor,
            pts_frame,
        },
    }))
}

#[cfg(unix)]
pub(crate) fn try_render_simple_video_frame(
    snapshot: &SceneSnapshot,
    media_items: &[SceneMediaReference],
    sources: &HashMap<String, RgbaFrame>,
    width: u32,
    height: u32,
) -> Result<Option<RgbaFrame>, String> {
    if snapshot.clips.len() != 1 || sources.len() != 1 {
        return Ok(None);
    }
    let clip = &snapshot.clips[0];
    let Some(media) = media_items.iter().find(|item| item.id == clip.media_id) else {
        return Ok(None);
    };
    if media.kind != MediaKind::Video || !is_simple_video_composite_clip(clip) {
        return Ok(None);
    }
    let Some(source) = sources.get(&clip.media_id) else {
        return Ok(None);
    };
    if source.width != media.width || source.height != media.height {
        return Ok(None);
    }
    let Some(translation_x) = finite_integer_i64(clip.transform.translation_x) else {
        return Ok(None);
    };
    let Some(translation_y) = finite_integer_i64(clip.transform.translation_y) else {
        return Ok(None);
    };

    let output_len = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|value| value.checked_mul(4))
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| "CPU simple video output byte length overflows".to_string())?;
    let mut output = vec![0; output_len];
    blit_simple_video_source(
        source,
        &mut output,
        width,
        height,
        translation_x,
        translation_y,
        clip.transform.scale_x,
        clip.transform.scale_y,
        clip.transform.sampling,
    )?;

    RgbaFrame::from_rgba8(width, height, output)
        .map(Some)
        .map_err(|error| format!("CPU simple video output frame is invalid: {error:?}"))
}

#[cfg(unix)]
fn is_simple_video_composite_clip(clip: &EvaluatedClip) -> bool {
    clip.effects.is_empty()
        && nearly_equal_f32(clip.opacity, 1.0)
        && clip.transform.scale_x.is_finite()
        && clip.transform.scale_y.is_finite()
        && clip.transform.scale_x > 0.0
        && clip.transform.scale_y > 0.0
        && nearly_equal_f32(clip.transform.rotation_degrees, 0.0)
}

#[cfg(unix)]
fn blit_simple_video_source(
    source: &RgbaFrame,
    output: &mut [u8],
    output_width: u32,
    output_height: u32,
    translation_x: i64,
    translation_y: i64,
    scale_x: f32,
    scale_y: f32,
    sampling: SamplingMode,
) -> Result<(), String> {
    if nearly_equal_f32(scale_x, 1.0) && nearly_equal_f32(scale_y, 1.0) {
        return blit_unscaled_simple_video_source(
            source,
            output,
            output_width,
            output_height,
            translation_x,
            translation_y,
        );
    }

    blit_scaled_simple_video_source(
        source,
        output,
        output_width,
        output_height,
        translation_x as f32,
        translation_y as f32,
        scale_x,
        scale_y,
        sampling,
    )
}

#[cfg(unix)]
fn blit_unscaled_simple_video_source(
    source: &RgbaFrame,
    output: &mut [u8],
    output_width: u32,
    output_height: u32,
    translation_x: i64,
    translation_y: i64,
) -> Result<(), String> {
    let source_width = i64::from(source.width);
    let source_height = i64::from(source.height);
    let output_width_i64 = i64::from(output_width);
    let output_height_i64 = i64::from(output_height);
    let source_x_start = 0_i64.max(-translation_x);
    let source_y_start = 0_i64.max(-translation_y);
    let destination_x_start = 0_i64.max(translation_x);
    let destination_y_start = 0_i64.max(translation_y);
    let copy_width = (source_width - source_x_start)
        .min(output_width_i64 - destination_x_start)
        .max(0);
    let copy_height = (source_height - source_y_start)
        .min(output_height_i64 - destination_y_start)
        .max(0);
    if copy_width == 0 || copy_height == 0 {
        return Ok(());
    }

    let copy_bytes = usize::try_from(copy_width)
        .ok()
        .and_then(|value| value.checked_mul(4))
        .ok_or_else(|| "CPU simple video row byte length overflows".to_string())?;
    let source_width = usize::try_from(source.width)
        .map_err(|_| format!("source width overflows usize: {}", source.width))?;
    let output_width = usize::try_from(output_width)
        .map_err(|_| format!("output width overflows usize: {output_width}"))?;
    let source_x_start = usize::try_from(source_x_start)
        .map_err(|_| "source x start overflows usize".to_string())?;
    let source_y_start = usize::try_from(source_y_start)
        .map_err(|_| "source y start overflows usize".to_string())?;
    let destination_x_start = usize::try_from(destination_x_start)
        .map_err(|_| "destination x start overflows usize".to_string())?;
    let destination_y_start = usize::try_from(destination_y_start)
        .map_err(|_| "destination y start overflows usize".to_string())?;
    let copy_height =
        usize::try_from(copy_height).map_err(|_| "copy height overflows usize".to_string())?;

    for row in 0..copy_height {
        let source_start = ((source_y_start + row) * source_width + source_x_start)
            .checked_mul(4)
            .ok_or_else(|| "CPU simple video source row offset overflows".to_string())?;
        let destination_start = ((destination_y_start + row) * output_width + destination_x_start)
            .checked_mul(4)
            .ok_or_else(|| "CPU simple video destination row offset overflows".to_string())?;
        output[destination_start..destination_start + copy_bytes]
            .copy_from_slice(&source.pixels[source_start..source_start + copy_bytes]);
    }

    Ok(())
}

#[cfg(unix)]
fn blit_scaled_simple_video_source(
    source: &RgbaFrame,
    output: &mut [u8],
    output_width: u32,
    output_height: u32,
    translation_x: f32,
    translation_y: f32,
    scale_x: f32,
    scale_y: f32,
    sampling: SamplingMode,
) -> Result<(), String> {
    let output_width_usize = usize::try_from(output_width)
        .map_err(|_| format!("output width overflows usize: {output_width}"))?;
    let source_width = source.width as f32;
    let source_height = source.height as f32;
    let destination_x_start = translation_x.ceil().max(0.0) as i64;
    let destination_y_start = translation_y.ceil().max(0.0) as i64;
    let destination_x_end = (translation_x + source_width * scale_x)
        .ceil()
        .min(output_width as f32)
        .max(0.0) as i64;
    let destination_y_end = (translation_y + source_height * scale_y)
        .ceil()
        .min(output_height as f32)
        .max(0.0) as i64;
    if destination_x_start >= destination_x_end || destination_y_start >= destination_y_end {
        return Ok(());
    }

    for destination_y in destination_y_start..destination_y_end {
        let source_y = (destination_y as f32 - translation_y) / scale_y;
        if source_y < 0.0 || source_y >= source_height {
            continue;
        }
        let destination_y = usize::try_from(destination_y)
            .map_err(|_| "destination y overflows usize".to_string())?;
        for destination_x in destination_x_start..destination_x_end {
            let source_x = (destination_x as f32 - translation_x) / scale_x;
            if source_x < 0.0 || source_x >= source_width {
                continue;
            }
            let destination_x = usize::try_from(destination_x)
                .map_err(|_| "destination x overflows usize".to_string())?;
            let destination_offset = (destination_y * output_width_usize + destination_x)
                .checked_mul(4)
                .ok_or_else(|| "CPU scaled video destination offset overflows".to_string())?;
            let pixel = sample_simple_video_source(source, source_x, source_y, sampling)?;
            output[destination_offset..destination_offset + 4].copy_from_slice(&pixel);
        }
    }

    Ok(())
}

#[cfg(unix)]
fn sample_simple_video_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
    sampling: SamplingMode,
) -> Result<[u8; 4], String> {
    match sampling {
        SamplingMode::Nearest => sample_nearest_simple_video_source(source, source_x, source_y),
        SamplingMode::Bilinear => sample_bilinear_simple_video_source(source, source_x, source_y),
    }
}

#[cfg(unix)]
fn sample_nearest_simple_video_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
) -> Result<[u8; 4], String> {
    let x = source_x.floor().clamp(0.0, (source.width - 1) as f32) as usize;
    let y = source_y.floor().clamp(0.0, (source.height - 1) as f32) as usize;
    read_simple_video_source_pixel(source, x, y)
}

#[cfg(unix)]
fn sample_bilinear_simple_video_source(
    source: &RgbaFrame,
    source_x: f32,
    source_y: f32,
) -> Result<[u8; 4], String> {
    let floor_x = source_x.floor();
    let floor_y = source_y.floor();
    let x0 = floor_x.clamp(0.0, (source.width - 1) as f32) as usize;
    let y0 = floor_y.clamp(0.0, (source.height - 1) as f32) as usize;
    let x1 = (floor_x + 1.0).clamp(0.0, (source.width - 1) as f32) as usize;
    let y1 = (floor_y + 1.0).clamp(0.0, (source.height - 1) as f32) as usize;
    let tx = source_x - floor_x;
    let ty = source_y - floor_y;
    let top_left = read_simple_video_source_pixel(source, x0, y0)?;
    let top_right = read_simple_video_source_pixel(source, x1, y0)?;
    let bottom_left = read_simple_video_source_pixel(source, x0, y1)?;
    let bottom_right = read_simple_video_source_pixel(source, x1, y1)?;
    let mut output = [0_u8; 4];
    for channel in 0..4 {
        let top = lerp(top_left[channel] as f32, top_right[channel] as f32, tx);
        let bottom = lerp(
            bottom_left[channel] as f32,
            bottom_right[channel] as f32,
            tx,
        );
        output[channel] = lerp(top, bottom, ty).round().clamp(0.0, 255.0) as u8;
    }
    Ok(output)
}

#[cfg(unix)]
fn read_simple_video_source_pixel(
    source: &RgbaFrame,
    x: usize,
    y: usize,
) -> Result<[u8; 4], String> {
    let source_width = usize::try_from(source.width)
        .map_err(|_| format!("source width overflows usize: {}", source.width))?;
    let offset = (y * source_width + x)
        .checked_mul(4)
        .ok_or_else(|| "CPU scaled video source offset overflows".to_string())?;
    Ok([
        source.pixels[offset],
        source.pixels[offset + 1],
        source.pixels[offset + 2],
        source.pixels[offset + 3],
    ])
}

#[cfg(unix)]
fn lerp(left: f32, right: f32, amount: f32) -> f32 {
    left + (right - left) * amount
}

#[cfg(unix)]
fn finite_integer_i64(value: f32) -> Option<i64> {
    if !value.is_finite() {
        return None;
    }
    let rounded = value.round();
    if (value - rounded).abs() > 1e-6 {
        return None;
    }
    Some(rounded as i64)
}

#[cfg(unix)]
fn nearly_equal_f32(left: f32, right: f32) -> bool {
    (left - right).abs() <= 1e-6
}

#[cfg(all(test, unix))]
mod proxy_scale_tests {
    use super::try_render_simple_video_frame;
    use std::collections::HashMap;
    use uxfd_golden_harness::RgbaFrame;
    use uxfd_rust_core::{
        ColourPipeline, EvaluatedClip, MediaKind, SamplingMode, SceneMediaReference, SceneSnapshot,
        Transform,
    };

    fn red() -> [u8; 4] {
        [255, 0, 0, 255]
    }
    fn blue() -> [u8; 4] {
        [0, 0, 255, 255]
    }

    #[test]
    fn downscaled_proxy_source_fills_the_full_media_display_rect() {
        // Media is 4x2 but the preview decode produced a half-resolution 2x1 proxy
        // (left=red, right=blue). The composite must scale the proxy up to fill the
        // 4x2 output, not blit it 1:1 into the top-left corner leaving black.
        let mut proxy = Vec::new();
        proxy.extend_from_slice(&red());
        proxy.extend_from_slice(&blue());
        let source = RgbaFrame::from_rgba8(2, 1, proxy).expect("proxy frame");

        let media = SceneMediaReference {
            id: "video-1".to_string(),
            kind: MediaKind::Video,
            source: "file:///video.mp4".to_string(),
            width: 4,
            height: 2,
            source_rate: None,
            active_layer_ids: Vec::new(),
        };
        let clip = EvaluatedClip {
            clip_id: "clip-1".to_string(),
            track_id: "track-1".to_string(),
            media_id: "video-1".to_string(),
            source_frame: 0,
            z_index: 0,
            transform: Transform {
                translation_x: 0.0,
                translation_y: 0.0,
                scale_x: 1.0,
                scale_y: 1.0,
                rotation_degrees: 0.0,
                sampling: SamplingMode::nearest(),
            },
            opacity: 1.0,
            effects: Vec::new(),
        };
        let snapshot = SceneSnapshot {
            frame_index: 0,
            colour: ColourPipeline::rec709_sdr_linear(),
            clips: vec![clip],
        };
        let mut sources = HashMap::new();
        sources.insert("video-1".to_string(), source);

        let frame = try_render_simple_video_frame(&snapshot, &[media], &sources, 4, 2)
            .expect("render ok")
            .expect("proxy source must still composite (scaled to fill)");

        let pixel = |x: usize, y: usize| {
            let offset = (y * 4 + x) * 4;
            [
                frame.pixels[offset],
                frame.pixels[offset + 1],
                frame.pixels[offset + 2],
                frame.pixels[offset + 3],
            ]
        };
        // Left half stays red, right half blue, every row filled (no black corner).
        assert_eq!(pixel(0, 0), red());
        assert_eq!(pixel(3, 0), blue());
        assert_eq!(pixel(0, 1), red());
        assert_eq!(pixel(3, 1), blue());
    }
}
