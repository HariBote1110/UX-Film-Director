use std::collections::{HashMap, VecDeque};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout};
use uxfd_sidecar_protocol::{ColourMetadata, DecodeStartResponse, FrameFormat, SharedFrameRing};

use crate::decode::DecodeDataPlaneRing;
use crate::inprocess_decode::InProcessDecodeSession;

pub(crate) struct DecodeSession {
    pub(crate) start_response: DecodeStartResponse,
    pub(crate) source: String,
    pub(crate) ffmpeg_path: String,
    pub(crate) ffprobe_path: String,
    pub(crate) ring: SharedFrameRing,
    pub(crate) data_plane_ring: Option<DecodeDataPlaneRing>,
    /// Phase 4c Stage 1: when `Some`, this session decodes via the in-process
    /// `macos-video-decode` worker thread instead of the ffmpeg pipeline
    /// below. Set once at `decode.start` time (see
    /// `crate::decode::handle_decode_start`); `None` means either the
    /// platform/opt-out disabled it or `VideoDecodeSession::open` failed for
    /// this source, and every `decode.requestFrame` for this session falls
    /// back to `streaming_decoder`/`decoded_frame_cache` below.
    pub(crate) inprocess: Option<InProcessDecodeSession>,
    pub(crate) streaming_decoder: Option<StreamingDecodeProcess>,
    pub(crate) decoded_frame_cache: VecDeque<CachedDecodedRgbaFrame>,
    /// Outstanding decoded-frame leases, keyed by the renderer-visible
    /// generation (a session-wide monotonically increasing counter that is
    /// unique per lease). The renderer echoes descriptor.slotIndex and
    /// descriptor.generation back in decode.releaseFrame; the generation is
    /// the lease identity, because the data-plane slot number alone is
    /// ambiguous — a slot freed early by the in-backend native render source
    /// read can be reused by the next requestFrame while the first lease is
    /// still outstanding, leaving two in-flight leases on the same slot.
    pub(crate) decoded_frame_leases: HashMap<u64, DecodeFrameLease>,
    /// Next renderer-visible lease generation (starts at 1, +1 per
    /// requestFrame). Overrides the control-plane descriptor generation in
    /// the response so every lease a renderer can hold is distinct.
    pub(crate) next_renderer_lease_generation: u64,
}

/// Everything needed to release one decoded-frame lease on both rings: the
/// data-plane slot + sequence the frame was written as, and the
/// control-plane slot + generation the `SharedFrameRing` tracks it under.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DecodeFrameLease {
    pub(crate) data_plane_slot_index: u32,
    pub(crate) sequence: u64,
    pub(crate) control_plane_slot_index: u32,
    pub(crate) control_plane_generation: u64,
}

pub(crate) struct StreamingDecodeProcess {
    pub(crate) child: Child,
    pub(crate) stdout: ChildStdout,
    pub(crate) next_frame_index: u64,
    pub(crate) frame_byte_len: usize,
}

impl Drop for StreamingDecodeProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub(crate) struct DecodedRgbaFrame {
    pub(crate) bytes: Vec<u8>,
    pub(crate) decode_path: &'static str,
    pub(crate) stream_restarted: bool,
    pub(crate) stream_skipped_frame_count: u64,
    pub(crate) decode_invocation_count: u64,
    /// Why (or why not) the streaming ffmpeg process was restarted for this
    /// frame. Diagnostic signal for measuring restart-driven preview jank.
    /// One of: "sequential" | "cacheHit" | "firstFrame" |
    /// "backwardSeek" | "forwardGapExceeded" | "byteLenMismatch".
    pub(crate) stream_restart_reason: &'static str,
}

pub(crate) struct CachedDecodedRgbaFrame {
    pub(crate) frame_index: u64,
    pub(crate) bytes: Vec<u8>,
}

pub(crate) struct EncodeSession {
    pub(crate) transport: EncodeTransport,
    pub(crate) session_id: String,
    pub(crate) file_path: String,
    pub(crate) audio_path: Option<String>,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) fps: u32,
    pub(crate) pixel_format: FrameFormat,
    pub(crate) colour: ColourMetadata,
    pub(crate) frame_count: u64,
}

pub(crate) enum EncodeTransport {
    Ffmpeg {
        child: Child,
        stdin: ChildStdin,
        stderr: ChildStderr,
    },
    #[cfg(target_os = "macos")]
    VideoToolbox {
        encoder: uxfd_macos_video_encode::VideoEncodeSession,
        /// Set when the caller supplied an audioPath: the encoder writes video
        /// only to `temp_video_path`, and `finish_encode_transport` muxes the
        /// audio track in via ffmpeg afterwards to produce `final_path`.
        pending_audio_mux: Option<PendingAudioMux>,
    },
}

/// Deferred ffmpeg audio mux job for the IOSurface VideoToolbox path, which
/// cannot write audio itself.
#[cfg(target_os = "macos")]
pub(crate) struct PendingAudioMux {
    pub(crate) temp_video_path: String,
    pub(crate) audio_path: String,
    pub(crate) final_path: String,
}

pub(crate) struct EncodeAbortSummary {
    pub(crate) session_id: String,
    pub(crate) file_path: String,
    pub(crate) frame_count: u64,
    pub(crate) ffmpeg_status: String,
    pub(crate) stderr: String,
}
