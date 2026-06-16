use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use uxfd_golden_harness::{compare_rgba_frames, ComparisonThresholds, RgbaFrame, RgbaFrameError};
use uxfd_sidecar_protocol::{
    ChecksumAlgorithm, ColourMetadata, FrameChecksum, FrameDescriptor, FrameFormat,
    FrameVerificationReport, FrameVerificationStatus, PixelDiffSummary, SharedFrame,
};

#[derive(Debug, Clone)]
pub struct KnownCfrH264Fixture {
    pub path: PathBuf,
    pub expected_frame: RgbaFrame,
    pub probe: ProbeSummary,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProbeSummary {
    pub codec_name: String,
    pub avg_frame_rate: String,
    pub frame_count: Option<u64>,
    pub pixel_format: Option<String>,
    pub colour_range: Option<String>,
    pub colour_space: Option<String>,
    pub colour_transfer: Option<String>,
    pub colour_primaries: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DecodedSharedRgba {
    pub rgba_frame: RgbaFrame,
    pub descriptor: FrameDescriptor,
    pub shared_frame: SharedFrame,
    pub decode_invocation_count: u32,
    pub verification: FrameVerificationReport,
}

#[derive(Debug, Clone)]
pub struct ExportedH264Frame {
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub probe: ProbeSummary,
    pub encode_filter: &'static str,
    pub decode_filter: &'static str,
}

#[derive(Debug)]
pub enum DecodeSpikeError {
    Io(std::io::Error),
    InvalidFrame(RgbaFrameError),
    CommandFailed {
        program: String,
        status: Option<i32>,
        stderr: String,
    },
    ProbeJson(serde_json::Error),
    MissingProbeField(&'static str),
}

pub fn explicit_rgba_to_h264_444_filter() -> &'static str {
    "zscale=primariesin=bt709:transferin=iec61966-2-1:matrixin=gbr:rangein=full:primaries=bt709:transfer=iec61966-2-1:matrix=bt709:range=full,format=yuv444p"
}

pub fn explicit_h264_444_to_rgba_filter() -> &'static str {
    "zscale=primariesin=bt709:transferin=iec61966-2-1:matrixin=bt709:rangein=full:primaries=bt709:transfer=iec61966-2-1:matrix=bt709:range=full,format=rgba"
}

pub fn explicit_rgba_to_h264_444_bt709_filter() -> &'static str {
    "zscale=primariesin=bt709:transferin=iec61966-2-1:matrixin=gbr:rangein=full:primaries=bt709:transfer=bt709:matrix=bt709:range=full,format=yuv444p"
}

pub fn explicit_h264_444_bt709_to_rgba_filter() -> &'static str {
    "zscale=primariesin=bt709:transferin=bt709:matrixin=bt709:rangein=full:primaries=bt709:transfer=iec61966-2-1:matrix=bt709:range=full,format=rgba"
}

pub fn explicit_rgba_to_h264_420_bt709_filter() -> &'static str {
    "zscale=primariesin=bt709:transferin=iec61966-2-1:matrixin=gbr:rangein=full:primaries=bt709:transfer=bt709:matrix=bt709:range=full,format=yuv420p"
}

pub fn build_known_cfr_h264_fixture(
    directory: &Path,
) -> Result<KnownCfrH264Fixture, DecodeSpikeError> {
    fs::create_dir_all(directory).map_err(DecodeSpikeError::Io)?;

    let expected_frame = known_colour_swatch_frame(32, 16)?;
    let raw_path = directory.join("known-frame.rgba");
    let video_path = directory.join("known-cfr-h264.mp4");

    fs::write(&raw_path, &expected_frame.pixels).map_err(DecodeSpikeError::Io)?;

    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgba")
        .arg("-video_size")
        .arg(format!(
            "{}x{}",
            expected_frame.width, expected_frame.height
        ))
        .arg("-framerate")
        .arg("30")
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg("1")
        .arg("-pix_fmt")
        .arg("yuv444p")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("0")
        .arg("-x264-params")
        .arg("keyint=1:min-keyint=1:scenecut=0:range=pc:colorprim=bt709:transfer=iec61966-2-1:colormatrix=bt709")
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg("iec61966-2-1")
        .arg("-colorspace")
        .arg("bt709")
        .arg("-color_range")
        .arg("pc")
        .arg("-video_track_timescale")
        .arg("30")
        .arg(&video_path);
    run_command("ffmpeg", &mut command)?;

    let probe = probe_video_stream(&video_path)?;

    Ok(KnownCfrH264Fixture {
        path: video_path,
        expected_frame,
        probe,
    })
}

pub fn export_rgba_frame_to_h264_444(
    directory: &Path,
    frame: &RgbaFrame,
) -> Result<ExportedH264Frame, DecodeSpikeError> {
    export_rgba_frame_to_h264_with_transfer(
        directory,
        frame,
        "explicit-export-h264-444.mp4",
        explicit_rgba_to_h264_444_filter(),
        explicit_h264_444_to_rgba_filter(),
        "iec61966-2-1",
        "yuv444p",
    )
}

pub fn export_rgba_frame_to_h264_444_bt709(
    directory: &Path,
    frame: &RgbaFrame,
) -> Result<ExportedH264Frame, DecodeSpikeError> {
    export_rgba_frame_to_h264_with_transfer(
        directory,
        frame,
        "bt709-transfer-export-h264-444.mp4",
        explicit_rgba_to_h264_444_bt709_filter(),
        explicit_h264_444_bt709_to_rgba_filter(),
        "bt709",
        "yuv444p",
    )
}

pub fn export_rgba_frame_to_h264_420_bt709(
    directory: &Path,
    frame: &RgbaFrame,
) -> Result<ExportedH264Frame, DecodeSpikeError> {
    export_rgba_frame_to_h264_with_transfer(
        directory,
        frame,
        "bt709-transfer-export-h264-420.mp4",
        explicit_rgba_to_h264_420_bt709_filter(),
        explicit_h264_444_bt709_to_rgba_filter(),
        "bt709",
        "yuv420p",
    )
}

fn export_rgba_frame_to_h264_with_transfer(
    directory: &Path,
    frame: &RgbaFrame,
    file_name: &str,
    encode_filter: &'static str,
    decode_filter: &'static str,
    output_transfer: &'static str,
    pixel_format: &'static str,
) -> Result<ExportedH264Frame, DecodeSpikeError> {
    fs::create_dir_all(directory).map_err(DecodeSpikeError::Io)?;

    let raw_path = directory.join("explicit-export-source.rgba");
    let video_path = directory.join(file_name);
    fs::write(&raw_path, &frame.pixels).map_err(DecodeSpikeError::Io)?;

    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-f")
        .arg("rawvideo")
        .arg("-pixel_format")
        .arg("rgba")
        .arg("-video_size")
        .arg(format!("{}x{}", frame.width, frame.height))
        .arg("-framerate")
        .arg("30")
        .arg("-i")
        .arg(&raw_path)
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg(encode_filter)
        .arg("-pix_fmt")
        .arg(pixel_format)
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("0")
        .arg("-x264-params")
        .arg(format!(
            "keyint=1:min-keyint=1:scenecut=0:range=pc:colorprim=bt709:transfer={output_transfer}:colormatrix=bt709"
        ))
        .arg("-color_primaries")
        .arg("bt709")
        .arg("-color_trc")
        .arg(output_transfer)
        .arg("-colorspace")
        .arg("bt709")
        .arg("-color_range")
        .arg("pc")
        .arg("-video_track_timescale")
        .arg("30")
        .arg(&video_path);
    run_command("ffmpeg", &mut command)?;

    let probe = probe_video_stream(&video_path)?;

    Ok(ExportedH264Frame {
        path: video_path,
        width: frame.width,
        height: frame.height,
        probe,
        encode_filter,
        decode_filter,
    })
}

pub fn decode_exported_h264_to_rgba(
    exported: &ExportedH264Frame,
) -> Result<RgbaFrame, DecodeSpikeError> {
    let decoded_path = exported.path.with_extension("decoded.rgba");

    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-i")
        .arg(&exported.path)
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg(exported.decode_filter)
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-f")
        .arg("rawvideo")
        .arg(&decoded_path);
    run_command("ffmpeg", &mut command)?;

    let bytes = fs::read(&decoded_path).map_err(DecodeSpikeError::Io)?;
    RgbaFrame::from_rgba8(exported.width, exported.height, bytes)
        .map_err(DecodeSpikeError::InvalidFrame)
}

pub fn decode_fixture_to_shared_rgba(
    fixture: &KnownCfrH264Fixture,
) -> Result<DecodedSharedRgba, DecodeSpikeError> {
    let decoded_path = fixture.path.with_extension("decoded.rgba");

    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-i")
        .arg(&fixture.path)
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg("scale=in_range=pc:out_range=pc:in_color_matrix=bt709:out_color_matrix=bt709,format=rgba")
        .arg("-pix_fmt")
        .arg("rgba")
        .arg("-f")
        .arg("rawvideo")
        .arg(&decoded_path);
    run_command("ffmpeg", &mut command)?;

    let bytes = fs::read(&decoded_path).map_err(DecodeSpikeError::Io)?;
    let rgba_frame = RgbaFrame::from_rgba8(
        fixture.expected_frame.width,
        fixture.expected_frame.height,
        bytes,
    )
    .map_err(DecodeSpikeError::InvalidFrame)?;

    let byte_len = rgba_frame.pixels.len() as u64;
    let descriptor = FrameDescriptor {
        memory_id: "decode-spike-memory".to_string(),
        slot_index: 0,
        generation: 0,
        byte_offset: 0,
        byte_len,
        width: rgba_frame.width,
        height: rgba_frame.height,
        stride_bytes: rgba_frame.width * 4,
        format: FrameFormat::Rgba8Srgb,
        colour: ColourMetadata::rec709_srgb(),
    };
    let shared_frame = SharedFrame {
        descriptor: descriptor.clone(),
        pts_frame: 0,
    };

    let comparison = compare_rgba_frames(&fixture.expected_frame, &rgba_frame, decode_thresholds());
    let metrics = comparison.metrics;
    let verification = FrameVerificationReport {
        frame_index: 0,
        checksum: checksum_for_frame(&rgba_frame),
        diff: Some(PixelDiffSummary {
            max_channel_delta: metrics.max_channel_delta,
            mean_absolute_error: metrics.mean_absolute_error,
            differing_channels: differing_channels(&fixture.expected_frame, &rgba_frame),
        }),
        status: if comparison.passed {
            FrameVerificationStatus::WithinTolerance
        } else {
            FrameVerificationStatus::Mismatch
        },
    };

    Ok(DecodedSharedRgba {
        rgba_frame,
        descriptor,
        shared_frame,
        decode_invocation_count: 1,
        verification,
    })
}

pub fn known_colour_swatch_frame(width: u32, height: u32) -> Result<RgbaFrame, DecodeSpikeError> {
    let swatches = [
        [220, 32, 32],
        [32, 220, 32],
        [32, 32, 220],
        [220, 128, 32],
        [32, 200, 200],
        [200, 32, 200],
        [200, 200, 32],
        [64, 128, 192],
        [48, 48, 48],
        [96, 96, 96],
        [144, 144, 144],
        [208, 208, 208],
        [180, 72, 120],
        [72, 180, 120],
        [120, 72, 180],
        [24, 160, 216],
    ];
    let mut pixels = Vec::with_capacity((width as usize) * (height as usize) * 4);
    let columns = 4;
    let rows = 4;
    let cell_width = width / columns;
    let cell_height = height / rows;

    for y in 0..height {
        for x in 0..width {
            let column = (x / cell_width.max(1)).min(columns - 1);
            let row = (y / cell_height.max(1)).min(rows - 1);
            let [red, green, blue] = swatches[(row * columns + column) as usize];
            pixels.extend([red, green, blue, 255]);
        }
    }

    RgbaFrame::from_rgba8(width, height, pixels).map_err(DecodeSpikeError::InvalidFrame)
}

fn probe_video_stream(path: &Path) -> Result<ProbeSummary, DecodeSpikeError> {
    let mut command = Command::new("ffprobe");
    command
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("v:0")
        .arg("-show_entries")
        .arg("stream=codec_name,avg_frame_rate,nb_frames,pix_fmt,color_range,color_space,color_transfer,color_primaries")
        .arg("-of")
        .arg("json")
        .arg(path);

    let output = command.output().map_err(DecodeSpikeError::Io)?;
    if !output.status.success() {
        return Err(DecodeSpikeError::CommandFailed {
            program: "ffprobe".to_string(),
            status: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }

    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(DecodeSpikeError::ProbeJson)?;
    let stream = value["streams"]
        .as_array()
        .and_then(|streams| streams.first())
        .ok_or(DecodeSpikeError::MissingProbeField("streams[0]"))?;
    let codec_name = stream["codec_name"]
        .as_str()
        .ok_or(DecodeSpikeError::MissingProbeField("codec_name"))?
        .to_string();
    let avg_frame_rate = stream["avg_frame_rate"]
        .as_str()
        .ok_or(DecodeSpikeError::MissingProbeField("avg_frame_rate"))?
        .to_string();
    let frame_count = stream["nb_frames"]
        .as_str()
        .and_then(|value| value.parse::<u64>().ok());

    Ok(ProbeSummary {
        codec_name,
        avg_frame_rate,
        frame_count,
        pixel_format: optional_string_field(stream, "pix_fmt"),
        colour_range: optional_string_field(stream, "color_range"),
        colour_space: optional_string_field(stream, "color_space"),
        colour_transfer: optional_string_field(stream, "color_transfer"),
        colour_primaries: optional_string_field(stream, "color_primaries"),
    })
}

fn optional_string_field(value: &serde_json::Value, field: &'static str) -> Option<String> {
    value[field].as_str().map(ToString::to_string)
}

fn checksum_for_frame(frame: &RgbaFrame) -> FrameChecksum {
    let mut hasher = crc32fast::Hasher::new();
    hasher.update(&frame.pixels);
    FrameChecksum {
        algorithm: ChecksumAlgorithm::Crc32,
        value_hex: format!("{:08x}", hasher.finalize()),
        byte_len: frame.pixels.len() as u64,
    }
}

fn differing_channels(reference: &RgbaFrame, candidate: &RgbaFrame) -> u64 {
    reference
        .pixels
        .iter()
        .zip(&candidate.pixels)
        .filter(|(reference, candidate)| reference != candidate)
        .count() as u64
}

fn decode_thresholds() -> ComparisonThresholds {
    ComparisonThresholds {
        max_channel_delta: 3,
        max_mean_absolute_error: 1.0,
        min_psnr: 40.0,
        min_ssim: 0.99,
    }
}

fn run_command(program: &str, command: &mut Command) -> Result<(), DecodeSpikeError> {
    let output = command.output().map_err(DecodeSpikeError::Io)?;
    if output.status.success() {
        return Ok(());
    }

    Err(DecodeSpikeError::CommandFailed {
        program: program.to_string(),
        status: output.status.code(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}
