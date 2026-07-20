//! `AVAssetReader`-based decode session: a resident demuxer + hardware
//! (VideoToolbox) decoder for a single video track.

use std::path::Path;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_av_foundation::{
    AVAssetReader, AVAssetReaderStatus, AVAssetReaderTrackOutput, AVAssetTrack, AVMediaTypeVideo,
    AVURLAsset,
};
use objc2_core_foundation::{CFDictionary, CFNumber, CFRetained, CFString, CFType};
use objc2_core_media::{
    kCMFormatDescriptionExtension_FullRangeVideo, kCMTimePositiveInfinity,
    kCMVideoCodecType_H264, kCMVideoCodecType_HEVC, CMFormatDescription, CMSampleBuffer, CMTime,
    CMTimeRange,
};
use objc2_core_video::{
    kCVPixelBufferIOSurfacePropertiesKey, kCVPixelBufferPixelFormatTypeKey,
    kCVPixelFormatType_420YpCbCr8BiPlanarFullRange, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
};
use objc2_foundation::{NSArray, NSDictionary, NSString, NSURL};

use crate::error::DecodeError;
use crate::frame::DecodedVideoFrame;

/// Time values are expressed in this timescale when talking to AVFoundation,
/// giving microsecond precision (ample for anything we need to seek to).
const SEEK_TIMESCALE: i32 = 1_000_000;

/// The compressed codec of the opened video track, read from its format
/// description's media subtype FourCC.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoCodec {
    H264,
    Hevc,
    /// Any other FourCC, preserved verbatim (e.g. `ProRes`, `ap4h`, ...).
    Other(u32),
}

/// Static information about an opened [`VideoDecodeSession`], available
/// without decoding a single frame.
#[derive(Debug, Clone)]
pub struct VideoDecodeSessionInfo {
    pub duration_seconds: f64,
    pub nominal_fps: f64,
    pub width: u32,
    pub height: u32,
    pub codec: VideoCodec,
}

/// A resident `AVAssetReader`-backed decode session for a single video file.
///
/// `open` performs a one-time, in-process demux (no `ffprobe`/`ffmpeg`
/// subprocess). `next_frame` decodes sequentially via VideoToolbox
/// (hardware-accelerated whenever the platform/codec combination supports
/// it). `seek` is forward-only under the hood: it recreates the
/// `AVAssetReader`/`AVAssetReaderTrackOutput` pair with a new `timeRange`,
/// which is cheap (no subprocess, the underlying `AVURLAsset`/`AVAssetTrack`
/// are reused) but does mean repeatedly seeking backwards re-demuxes from
/// the nearest preceding sync sample each time.
pub struct VideoDecodeSession {
    // Retained even though `reader.asset()` could reconstruct it, so that
    // the asset/track are unambiguously kept alive for the lifetime of the
    // session regardless of what AVAssetReader internally does.
    _asset: Retained<AVURLAsset>,
    track: Retained<AVAssetTrack>,
    reader: Retained<AVAssetReader>,
    output: Retained<AVAssetReaderTrackOutput>,
    // Kept as a `CFDictionary` (rather than converting once to `NSDictionary`
    // and storing that) so that re-borrowing it as an `&NSDictionary` at each
    // `create_reader_and_output` call site (see `as_ns_dictionary` below) is
    // just a reference cast, with no extra retain/release traffic.
    output_settings: CFRetained<CFDictionary<CFString, CFType>>,
    info: VideoDecodeSessionInfo,
}

// SAFETY: every AVFoundation/CoreMedia/CoreVideo object reachable from this
// struct uses Cocoa's or CoreFoundation's atomic reference counting, so
// dropping/retaining them on a different thread than the one that created
// them is sound. Apple's own guidance for AVAssetReader is that it must not
// be used *concurrently* from multiple threads, not that it must stay
// pinned to one thread; every method here takes `&mut self`, so the Rust
// borrow checker already guarantees exclusive access, and moving the
// session to a dedicated decoder thread (as Phase 4c will do) then only
// ever calling it from that thread trivially satisfies "not concurrent".
// We deliberately do not implement `Sync` for the same reason `DecodedVideoFrame`
// does not (see `frame.rs`).
unsafe impl Send for VideoDecodeSession {}

impl VideoDecodeSession {
    /// Opens `path` for sequential decoding. Performs a one-time,
    /// in-process demux via `AVURLAsset`/`AVAssetReader` -- no `ffprobe` or
    /// `ffmpeg` subprocess is spawned.
    pub fn open(path: &Path) -> Result<Self, DecodeError> {
        let path_string = path.to_string_lossy().into_owned();
        let ns_path = NSString::from_str(&path_string);
        let url = NSURL::fileURLWithPath(&ns_path);
        let asset = unsafe { AVURLAsset::URLAssetWithURL_options(&url, None) };

        let media_type_video = unsafe { AVMediaTypeVideo }.ok_or_else(|| {
            DecodeError::AssetUnreadable {
                path: path_string.clone(),
            }
        })?;
        #[allow(deprecated)]
        let tracks: Retained<NSArray<AVAssetTrack>> =
            unsafe { asset.tracksWithMediaType(media_type_video) };
        let track = tracks.firstObject().ok_or_else(|| DecodeError::NoVideoTrack {
            path: path_string.clone(),
        })?;

        let duration_seconds = unsafe { asset.duration().seconds() };
        let nominal_fps = unsafe { track.nominalFrameRate() } as f64;
        let natural_size = unsafe { track.naturalSize() };
        let width = natural_size.width.round() as u32;
        let height = natural_size.height.round() as u32;

        let format_description = first_format_description(&track);
        let codec = format_description
            .as_deref()
            .map(video_codec_from_format_description)
            .unwrap_or(VideoCodec::Other(0));
        let source_is_full_range = format_description
            .as_deref()
            .map(source_tagged_full_range)
            .unwrap_or(false);

        let info = VideoDecodeSessionInfo {
            duration_seconds,
            nominal_fps,
            width,
            height,
            codec,
        };

        let pixel_format = if source_is_full_range {
            kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        } else {
            kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        };
        let output_settings = build_output_settings(pixel_format);

        let (reader, output) = create_reader_and_output(&asset, &track, &output_settings, None)?;

        Ok(Self {
            _asset: asset,
            track,
            reader,
            output,
            output_settings,
            info,
        })
    }

    /// Static information about the opened video (duration, nominal fps,
    /// dimensions, codec). Available without decoding any frames.
    pub fn info(&self) -> &VideoDecodeSessionInfo {
        &self.info
    }

    /// Decodes and returns the next frame in presentation order, or `Ok(None)`
    /// once the reader has exhausted its time range.
    pub fn next_frame(&mut self) -> Result<Option<DecodedVideoFrame>, DecodeError> {
        let sample: Option<Retained<CMSampleBuffer>> =
            unsafe { self.output.copyNextSampleBuffer() };

        let Some(sample) = sample else {
            return match unsafe { self.reader.status() } {
                AVAssetReaderStatus::Completed | AVAssetReaderStatus::Cancelled => Ok(None),
                AVAssetReaderStatus::Failed => Err(DecodeError::ReaderFailed {
                    reason: reader_error_description(&self.reader),
                }),
                // `Unknown`/`Reading` with no sample and no failure means
                // end-of-stream too (e.g. a marker-only sample buffer was
                // skipped internally, or the time range is simply exhausted).
                _ => Ok(None),
            };
        };

        let pixel_buffer: CFRetained<objc2_core_video::CVImageBuffer> =
            unsafe { sample.image_buffer() }.ok_or(DecodeError::MissingImageBuffer)?;
        let pts_seconds = unsafe { sample.presentation_time_stamp().seconds() };

        Ok(Some(DecodedVideoFrame::new(
            pixel_buffer,
            pts_seconds,
            (self.info.width, self.info.height),
        )))
    }

    /// Seeks so that the next call to [`Self::next_frame`] returns the first
    /// frame with presentation timestamp `>= target_seconds`.
    ///
    /// Contract: this is an "at-or-after" seek, not "nearest". Internally it
    /// recreates the `AVAssetReader`/`AVAssetReaderTrackOutput` pair with
    /// `timeRange.start = target_seconds`; AVFoundation resumes decoding
    /// from the nearest preceding sync sample and hides pre-roll frames
    /// before `target_seconds` from the output, so the first vended sample
    /// always has `pts >= target_seconds` (never a frame strictly before
    /// it). No subprocess is spawned and the `AVURLAsset`/`AVAssetTrack` are
    /// reused, so this is cheap relative to a cold restart.
    pub fn seek(&mut self, target_seconds: f64) -> Result<(), DecodeError> {
        let target_seconds = target_seconds.max(0.0);
        let start = unsafe { CMTime::with_seconds(target_seconds, SEEK_TIMESCALE) };
        let (reader, output) = create_reader_and_output(
            &self._asset,
            &self.track,
            &self.output_settings,
            Some(start),
        )?;
        self.reader = reader;
        self.output = output;
        Ok(())
    }
}

fn create_reader_and_output(
    asset: &AVURLAsset,
    track: &AVAssetTrack,
    output_settings: &CFDictionary<CFString, CFType>,
    start: Option<CMTime>,
) -> Result<
    (
        Retained<AVAssetReader>,
        Retained<AVAssetReaderTrackOutput>,
    ),
    DecodeError,
> {
    let reader = unsafe { AVAssetReader::assetReaderWithAsset_error(asset) }.map_err(|error| {
        DecodeError::ReaderCreationFailed {
            reason: error.to_string(),
        }
    })?;

    if let Some(start) = start {
        let time_range: CMTimeRange =
            unsafe { CMTimeRange::new(start, kCMTimePositiveInfinity) };
        unsafe { reader.setTimeRange(time_range) };
    }

    let output = unsafe {
        AVAssetReaderTrackOutput::assetReaderTrackOutputWithTrack_outputSettings(
            track,
            Some(as_ns_dictionary(output_settings)),
        )
    };
    // We read out the whole plane ourselves and never mutate it, so avoid
    // AVFoundation's extra defensive copy.
    unsafe { output.setAlwaysCopiesSampleData(false) };

    if !unsafe { reader.canAddOutput(&output) } {
        return Err(DecodeError::OutputNotAddable);
    }
    unsafe { reader.addOutput(&output) };

    if !unsafe { reader.startReading() } {
        return Err(DecodeError::ReaderStartFailed {
            reason: reader_error_description(&reader),
        });
    }

    Ok((reader, output))
}

fn reader_error_description(reader: &AVAssetReader) -> String {
    unsafe { reader.error() }
        .map(|error| {
            let failure_reason = error
                .localizedFailureReason()
                .map(|s| s.to_string())
                .unwrap_or_default();
            let underlying: Vec<String> = error
                .underlyingErrors()
                .iter()
                .map(|e| e.to_string())
                .collect();
            format!(
                "{} (domain={}, code={}, failureReason={:?}, underlying={:?})",
                error,
                error.domain(),
                error.code(),
                failure_reason,
                underlying
            )
        })
        .unwrap_or_else(|| "unknown error".to_string())
}

fn first_format_description(track: &AVAssetTrack) -> Option<Retained<CMFormatDescription>> {
    let descriptions = unsafe { track.formatDescriptions() };
    let first = descriptions.firstObject()?;
    // SAFETY: `-[AVAssetTrack formatDescriptions]` returns an array of
    // `CMFormatDescriptionRef` values (toll-free bridged, like every other
    // CoreFoundation type, to a bridgeable `id`); reinterpreting the
    // retrieved element as `CMFormatDescription` is exactly what Swift's
    // `as! CMFormatDescription` does for this same API.
    Some(unsafe { Retained::cast_unchecked::<CMFormatDescription>(first) })
}

fn video_codec_from_format_description(description: &CMFormatDescription) -> VideoCodec {
    let subtype: u32 = unsafe { description.media_sub_type() };
    if subtype == kCMVideoCodecType_H264 {
        VideoCodec::H264
    } else if subtype == kCMVideoCodecType_HEVC {
        VideoCodec::Hevc
    } else {
        VideoCodec::Other(subtype)
    }
}

/// Reads the `FullRangeVideo` format description extension (when present) to
/// decide which NV12 pixel format variant to request from VideoToolbox.
/// Falls back to `false` (limited/video range) when untagged, matching the
/// same "unknown defaults to tv range" convention already used by
/// `rust-backend/src/decode.rs`.
fn source_tagged_full_range(description: &CMFormatDescription) -> bool {
    let key: &CFString = unsafe { kCMFormatDescriptionExtension_FullRangeVideo };
    let Some(value) = (unsafe { description.extension(key) }) else {
        return false;
    };
    value
        .downcast::<objc2_core_foundation::CFBoolean>()
        .map(|boolean| boolean.value())
        .unwrap_or(false)
}

fn build_output_settings(pixel_format: u32) -> CFRetained<CFDictionary<CFString, CFType>> {
    let format_key: &CFString = unsafe { kCVPixelBufferPixelFormatTypeKey };
    let iosurface_key: &CFString = unsafe { kCVPixelBufferIOSurfacePropertiesKey };

    let format_number = CFNumber::new_i32(pixel_format as i32);
    let iosurface_properties: CFRetained<CFDictionary<CFString, CFType>> = CFDictionary::empty();

    let keys: [&CFString; 2] = [format_key, iosurface_key];
    let values: [&CFType; 2] = [format_number.as_ref(), iosurface_properties.as_ref()];
    CFDictionary::from_slices(&keys, &values)
}

/// Reinterprets a `CFDictionary<CFString, CFType>` as an
/// `&NSDictionary<NSString, AnyObject>` for passing to AVFoundation APIs.
///
/// SAFETY: `CFDictionary`/`NSDictionary` and `CFString`/`NSString` and
/// `CFType`/`AnyObject` are toll-free bridged pairs (identical ABI, just
/// different static typing on either side of the CF/Foundation boundary);
/// this is the same `cast_unchecked` escape hatch the objc2 crates
/// themselves document for crossing that boundary.
fn as_ns_dictionary(dict: &CFDictionary<CFString, CFType>) -> &NSDictionary<NSString, AnyObject> {
    let ns: &NSDictionary<CFString, CFType> = dict.as_ref();
    unsafe { ns.cast_unchecked() }
}
