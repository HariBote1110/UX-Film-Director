//! macOS-only, in-process hardware video decode core.
//!
//! Built directly on `AVAssetReader` + `AVAssetReaderTrackOutput` (which
//! decodes via VideoToolbox automatically whenever the codec/pixel-format
//! combination supports it), this crate is the foundation for replacing the
//! ffmpeg-CLI-subprocess decode pipeline in `rust-backend/src/decode.rs`.
//! See `progress/phase4a-macos-video-decode-core.md` for the design
//! decisions behind it (AVAssetReader vs a raw `VTDecompressionSession`, the
//! forward-only seek contract, and the `Send`/threading rationale).

#[cfg(target_os = "macos")]
mod colour;
#[cfg(target_os = "macos")]
mod error;
#[cfg(target_os = "macos")]
mod frame;
#[cfg(target_os = "macos")]
mod session;

#[cfg(target_os = "macos")]
pub use colour::{ColourMatrix, ColourMetadata, ColourRange};
#[cfg(target_os = "macos")]
pub use error::DecodeError;
#[cfg(target_os = "macos")]
pub use frame::{DecodedVideoFrame, PlaneReadback, YCbCrReadback};
#[cfg(target_os = "macos")]
pub use session::{VideoCodec, VideoDecodeSession, VideoDecodeSessionInfo};
