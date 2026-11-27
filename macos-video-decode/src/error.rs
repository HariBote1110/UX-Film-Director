//! Error type returned by [`crate::VideoDecodeSession`].

use std::fmt;

/// Errors produced while opening or decoding a video with
/// [`crate::VideoDecodeSession`].
#[derive(Debug)]
pub enum DecodeError {
    /// `AVURLAsset` could not be constructed, or has no readable tracks
    /// (missing file, unsupported container, ...).
    AssetUnreadable { path: String },
    /// The asset has no video track.
    NoVideoTrack { path: String },
    /// `AVAssetReader` could not be constructed for the asset.
    ReaderCreationFailed { reason: String },
    /// `AVAssetReaderTrackOutput` could not be added to the reader.
    OutputNotAddable,
    /// `-[AVAssetReader startReading]` returned `NO`.
    ReaderStartFailed { reason: String },
    /// `AVAssetReader.status` became `Failed` while decoding.
    ReaderFailed { reason: String },
    /// A decoded sample buffer had no attached `CVImageBuffer`.
    MissingImageBuffer,
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DecodeError::AssetUnreadable { path } => {
                write!(f, "asset at '{path}' could not be read")
            }
            DecodeError::NoVideoTrack { path } => {
                write!(f, "asset at '{path}' has no video track")
            }
            DecodeError::ReaderCreationFailed { reason } => {
                write!(f, "failed to create AVAssetReader: {reason}")
            }
            DecodeError::OutputNotAddable => {
                write!(f, "AVAssetReaderTrackOutput could not be added to reader")
            }
            DecodeError::ReaderStartFailed { reason } => {
                write!(f, "AVAssetReader failed to start reading: {reason}")
            }
            DecodeError::ReaderFailed { reason } => {
                write!(f, "AVAssetReader failed while decoding: {reason}")
            }
            DecodeError::MissingImageBuffer => {
                write!(f, "decoded sample buffer had no image buffer")
            }
        }
    }
}

impl std::error::Error for DecodeError {}
