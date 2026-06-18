use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;

const RGBA_CHANNELS: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RgbaFrame {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

impl RgbaFrame {
    pub fn from_rgba8(width: u32, height: u32, pixels: Vec<u8>) -> Result<Self, RgbaFrameError> {
        let expected_len = expected_rgba_len(width, height)?;
        if pixels.len() != expected_len {
            return Err(RgbaFrameError::InvalidByteLength {
                expected: expected_len,
                actual: pixels.len(),
            });
        }

        Ok(Self {
            width,
            height,
            pixels,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RgbaFrameError {
    InvalidByteLength { expected: usize, actual: usize },
    DimensionOverflow,
}

#[derive(Debug)]
pub enum FixtureIoError {
    Io(std::io::Error),
    Decode(png::DecodingError),
    JpegDecode(jpeg_decoder::Error),
    Encode(png::EncodingError),
    InvalidFrame(RgbaFrameError),
    MissingJpegInfo,
    UnsupportedJpegPixelFormat(String),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ComparisonThresholds {
    pub max_channel_delta: u8,
    pub max_mean_absolute_error: f64,
    pub min_psnr: f64,
    pub min_ssim: f64,
}

impl ComparisonThresholds {
    pub fn exact() -> Self {
        Self {
            max_channel_delta: 0,
            max_mean_absolute_error: 0.0,
            min_psnr: f64::INFINITY,
            min_ssim: 1.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct FrameComparison {
    pub passed: bool,
    pub metrics: FrameMetrics,
    pub cause: Option<DifferenceCause>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FrameMetrics {
    pub max_channel_delta: u8,
    pub mean_absolute_error: f64,
    pub psnr: f64,
    pub ssim: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DifferenceCause {
    DimensionMismatch,
    PixelValueDelta,
    MeanAbsoluteError,
    PsnrBelowThreshold,
    StructuralSimilarity,
}

pub fn compare_rgba_frames(
    reference: &RgbaFrame,
    candidate: &RgbaFrame,
    thresholds: ComparisonThresholds,
) -> FrameComparison {
    if reference.width != candidate.width || reference.height != candidate.height {
        return FrameComparison {
            passed: false,
            metrics: FrameMetrics::zero(),
            cause: Some(DifferenceCause::DimensionMismatch),
        };
    }

    let metrics = calculate_metrics(&reference.pixels, &candidate.pixels);
    let cause = first_threshold_failure(metrics, thresholds);

    FrameComparison {
        passed: cause.is_none(),
        metrics,
        cause,
    }
}

pub fn load_rgba_png(path: impl AsRef<Path>) -> Result<RgbaFrame, FixtureIoError> {
    let file = File::open(path).map_err(FixtureIoError::Io)?;
    let mut decoder = png::Decoder::new(BufReader::new(file));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().map_err(FixtureIoError::Decode)?;
    let mut buffer = vec![0; reader.output_buffer_size()];
    let output = reader
        .next_frame(&mut buffer)
        .map_err(FixtureIoError::Decode)?;

    let bytes = &buffer[..output.buffer_size()];
    let pixels = match output.color_type {
        png::ColorType::Rgba => bytes.to_vec(),
        png::ColorType::Rgb => rgb_to_rgba(bytes),
        png::ColorType::Grayscale => grey_to_rgba(bytes),
        png::ColorType::GrayscaleAlpha => grey_alpha_to_rgba(bytes),
        png::ColorType::Indexed => bytes.to_vec(),
    };

    RgbaFrame::from_rgba8(output.width, output.height, pixels).map_err(FixtureIoError::InvalidFrame)
}

pub fn load_rgba_jpeg(path: impl AsRef<Path>) -> Result<RgbaFrame, FixtureIoError> {
    let file = File::open(path).map_err(FixtureIoError::Io)?;
    let mut decoder = jpeg_decoder::Decoder::new(BufReader::new(file));
    let bytes = decoder.decode().map_err(FixtureIoError::JpegDecode)?;
    let info = decoder.info().ok_or(FixtureIoError::MissingJpegInfo)?;
    let pixels = match info.pixel_format {
        jpeg_decoder::PixelFormat::RGB24 => rgb_to_rgba(&bytes),
        jpeg_decoder::PixelFormat::L8 => grey_to_rgba(&bytes),
        jpeg_decoder::PixelFormat::CMYK32 => cmyk_to_rgba(&bytes),
        other => {
            return Err(FixtureIoError::UnsupportedJpegPixelFormat(format!(
                "{other:?}"
            )))
        }
    };

    RgbaFrame::from_rgba8(u32::from(info.width), u32::from(info.height), pixels)
        .map_err(FixtureIoError::InvalidFrame)
}

pub fn save_rgba_png(path: impl AsRef<Path>, frame: &RgbaFrame) -> Result<(), FixtureIoError> {
    let file = File::create(path).map_err(FixtureIoError::Io)?;
    let writer = BufWriter::new(file);
    let mut encoder = png::Encoder::new(writer, frame.width, frame.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);

    let mut writer = encoder.write_header().map_err(FixtureIoError::Encode)?;
    writer
        .write_image_data(&frame.pixels)
        .map_err(FixtureIoError::Encode)
}

fn calculate_metrics(reference: &[u8], candidate: &[u8]) -> FrameMetrics {
    let mut max_channel_delta = 0u8;
    let mut absolute_sum = 0u64;
    let mut squared_sum = 0u64;

    for (reference_channel, candidate_channel) in reference.iter().zip(candidate) {
        let delta = reference_channel.abs_diff(*candidate_channel);
        max_channel_delta = max_channel_delta.max(delta);
        absolute_sum += u64::from(delta);
        squared_sum += u64::from(delta) * u64::from(delta);
    }

    let channel_count = reference.len() as f64;
    let mean_absolute_error = absolute_sum as f64 / channel_count;
    let mean_squared_error = squared_sum as f64 / channel_count;
    let psnr = if mean_squared_error == 0.0 {
        f64::INFINITY
    } else {
        10.0 * ((255.0 * 255.0) / mean_squared_error).log10()
    };
    let ssim = calculate_global_ssim(reference, candidate);

    FrameMetrics {
        max_channel_delta,
        mean_absolute_error,
        psnr,
        ssim,
    }
}

fn rgb_to_rgba(bytes: &[u8]) -> Vec<u8> {
    bytes
        .chunks_exact(3)
        .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
        .collect()
}

fn grey_to_rgba(bytes: &[u8]) -> Vec<u8> {
    bytes
        .iter()
        .flat_map(|grey| [*grey, *grey, *grey, 255])
        .collect()
}

fn grey_alpha_to_rgba(bytes: &[u8]) -> Vec<u8> {
    bytes
        .chunks_exact(2)
        .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
        .collect()
}

fn cmyk_to_rgba(bytes: &[u8]) -> Vec<u8> {
    bytes
        .chunks_exact(4)
        .flat_map(|pixel| {
            let cyan = u16::from(pixel[0]);
            let magenta = u16::from(pixel[1]);
            let yellow = u16::from(pixel[2]);
            let black = u16::from(pixel[3]);
            let red = 255 - ((cyan * (255 - black) + 127) / 255 + black).min(255) as u8;
            let green = 255 - ((magenta * (255 - black) + 127) / 255 + black).min(255) as u8;
            let blue = 255 - ((yellow * (255 - black) + 127) / 255 + black).min(255) as u8;
            [red, green, blue, 255]
        })
        .collect()
}

fn calculate_global_ssim(reference: &[u8], candidate: &[u8]) -> f64 {
    if reference.is_empty() {
        return 1.0;
    }

    let sample_count = reference.len() as f64;
    let reference_mean = reference
        .iter()
        .map(|channel| f64::from(*channel))
        .sum::<f64>()
        / sample_count;
    let candidate_mean = candidate
        .iter()
        .map(|channel| f64::from(*channel))
        .sum::<f64>()
        / sample_count;

    let mut reference_variance = 0.0;
    let mut candidate_variance = 0.0;
    let mut covariance = 0.0;

    for (reference_channel, candidate_channel) in reference.iter().zip(candidate) {
        let reference_delta = f64::from(*reference_channel) - reference_mean;
        let candidate_delta = f64::from(*candidate_channel) - candidate_mean;

        reference_variance += reference_delta * reference_delta;
        candidate_variance += candidate_delta * candidate_delta;
        covariance += reference_delta * candidate_delta;
    }

    reference_variance /= sample_count;
    candidate_variance /= sample_count;
    covariance /= sample_count;

    let c1 = (0.01_f64 * 255.0).powi(2);
    let c2 = (0.03_f64 * 255.0).powi(2);
    let numerator = (2.0 * reference_mean * candidate_mean + c1) * (2.0 * covariance + c2);
    let denominator = (reference_mean.powi(2) + candidate_mean.powi(2) + c1)
        * (reference_variance + candidate_variance + c2);

    if denominator == 0.0 {
        1.0
    } else {
        numerator / denominator
    }
}

fn first_threshold_failure(
    metrics: FrameMetrics,
    thresholds: ComparisonThresholds,
) -> Option<DifferenceCause> {
    if metrics.max_channel_delta > thresholds.max_channel_delta {
        return Some(DifferenceCause::PixelValueDelta);
    }
    if metrics.mean_absolute_error > thresholds.max_mean_absolute_error {
        return Some(DifferenceCause::MeanAbsoluteError);
    }
    if metrics.psnr < thresholds.min_psnr {
        return Some(DifferenceCause::PsnrBelowThreshold);
    }
    if metrics.ssim < thresholds.min_ssim {
        return Some(DifferenceCause::StructuralSimilarity);
    }
    None
}

fn expected_rgba_len(width: u32, height: u32) -> Result<usize, RgbaFrameError> {
    let pixels = (width as usize)
        .checked_mul(height as usize)
        .ok_or(RgbaFrameError::DimensionOverflow)?;

    pixels
        .checked_mul(RGBA_CHANNELS)
        .ok_or(RgbaFrameError::DimensionOverflow)
}

impl FrameMetrics {
    fn zero() -> Self {
        Self {
            max_channel_delta: 0,
            mean_absolute_error: 0.0,
            psnr: 0.0,
            ssim: 0.0,
        }
    }
}
