use std::collections::VecDeque;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout};
use uxfd_sidecar_protocol::{ColourMetadata, DecodeStartResponse, FrameFormat, SharedFrameRing};

use crate::decode::DecodeDataPlaneRing;

pub(crate) struct DecodeSession {
    pub(crate) start_response: DecodeStartResponse,
    pub(crate) source: String,
    pub(crate) ffmpeg_path: String,
    pub(crate) ffprobe_path: String,
    pub(crate) ring: SharedFrameRing,
    pub(crate) data_plane_ring: Option<DecodeDataPlaneRing>,
    pub(crate) streaming_decoder: Option<StreamingDecodeProcess>,
    pub(crate) decoded_frame_cache: VecDeque<CachedDecodedRgbaFrame>,
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
    pub(crate) child: Child,
    pub(crate) stdin: ChildStdin,
    pub(crate) stderr: ChildStderr,
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

pub(crate) struct EncodeAbortSummary {
    pub(crate) session_id: String,
    pub(crate) file_path: String,
    pub(crate) frame_count: u64,
    pub(crate) ffmpeg_status: String,
    pub(crate) stderr: String,
}
