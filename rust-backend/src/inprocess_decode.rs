//! Phase 4c Stage 1: in-process decode sessions layered behind the existing
//! `decode.*` RPC surface (`crate::decode`).
//!
//! Each session owns a dedicated decoder worker thread with a resident
//! `uxfd_macos_video_decode::VideoDecodeSession` (no ffmpeg/ffprobe
//! subprocess) and a pts-ordered prefetch ring the worker keeps filled ahead
//! of the last-requested pts. `decode.requestFrame` looks the nearest frame
//! up in the ring (never runs a decode on the RPC thread) and holds the last
//! decoded frame when the exact requested pts is not ready yet.
//!
//! Automatic fallback: [`InProcessDecodeSession::open`] returns `Err` when
//! `VideoDecodeSession::open` fails (unsupported codec/container, e.g. the
//! sandboxed-HEVC pixel-decode constraint documented in
//! `progress/phase4a-macos-video-decode-core.md`), when the platform is not
//! macOS, or when disabled via `UXFD_DISABLE_INPROCESS_DECODE=1`; callers
//! (`crate::decode`) fall back to the existing ffmpeg pipeline transparently.

/// Env kill-switch: forces every session onto the ffmpeg fallback path.
pub(crate) fn inprocess_decode_enabled() -> bool {
    std::env::var("UXFD_DISABLE_INPROCESS_DECODE")
        .map(|value| value != "1")
        .unwrap_or(true)
}

#[cfg(target_os = "macos")]
pub(crate) use platform::InProcessDecodeSession;

#[cfg(not(target_os = "macos"))]
pub(crate) use stub::InProcessDecodeSession;

#[cfg(not(target_os = "macos"))]
mod stub {
    pub(crate) struct InProcessFrame {
        pub(crate) pts_seconds: f64,
        pub(crate) rgba: Vec<u8>,
    }

    pub(crate) struct InProcessDecodeSession;

    impl InProcessDecodeSession {
        pub(crate) fn open(
            _source_path: &std::path::Path,
            _output_width: u32,
            _output_height: u32,
        ) -> Result<Self, String> {
            Err("in-process decode is only available on macOS".to_string())
        }

        pub(crate) fn request_frame(&self, _target_pts_seconds: f64) -> Result<InProcessFrame, String> {
            unreachable!("open() always returns Err on this platform, so no instance can exist")
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::collections::VecDeque;
    use std::path::Path;
    use std::sync::{Arc, Condvar, Mutex};
    use std::thread::JoinHandle;
    use std::time::{Duration, Instant};

    use uxfd_macos_video_decode::{
        ColourMatrix, ColourMetadata, ColourRange, DecodedVideoFrame, VideoDecodeSession,
    };

    /// Target prefetch depth: ~12 decoded frames ahead of the last-requested
    /// pts (~400ms at 30fps), per the Phase 4c brief.
    const PREFETCH_RING_DEPTH: usize = 12;
    /// How long `open()` waits for the worker's first frame (or a fatal
    /// decode error) before giving up. Session construction already paid for
    /// the in-process demux synchronously; this bounds only the first
    /// hardware-decode call.
    const FIRST_FRAME_TIMEOUT: Duration = Duration::from_millis(1_500);
    /// How long a `request_frame` call will wait for the ring to produce
    /// *any* frame before giving up. This is not "wait for the decode of the
    /// requested frame" (that would defeat the whole point of prefetching) --
    /// it only covers the brief window right after `open()`/a seek before the
    /// worker has produced its first frame in the new position.
    const RING_WAIT_TIMEOUT: Duration = Duration::from_millis(200);
    /// A forward gap larger than this triggers a `seek()` (cheap: an
    /// AVAssetReader restart, no subprocess) instead of discard-decoding
    /// every frame in between. Generous relative to the ~400ms ring so a
    /// transient stall does not thrash between seeking and sequential decode.
    const FORWARD_SEEK_GAP_SECONDS: f64 = 2.0;
    /// Tolerance so a repeated/tiny-backward request for a pts already inside
    /// the ring does not spuriously trigger a seek.
    const BACKWARD_SEEK_EPSILON_SECONDS: f64 = 1e-6;

    pub(crate) struct InProcessFrame {
        pub(crate) pts_seconds: f64,
        pub(crate) rgba: Vec<u8>,
    }

    struct RingFrame {
        pts_seconds: f64,
        rgba: Vec<u8>,
    }

    struct RingState {
        frames: VecDeque<RingFrame>,
        /// pts of the most recently decoded frame, kept even after the frame
        /// itself has been trimmed from `frames`, so seek-vs-sequential
        /// decisions do not depend on how much of the ring is still buffered.
        last_decoded_pts: Option<f64>,
        /// pts of the most recently *requested* frame (the playhead), set by
        /// every `request_frame` call. Consumed frames strictly behind this
        /// (see `trim_consumed_frames`) are dropped, and the worker's "ring
        /// is full enough, pause" check is relative to this rather than a
        /// fixed frame count -- otherwise, once the ring reaches
        /// `PREFETCH_RING_DEPTH` frames starting from pts=0, it would never
        /// shrink again as playback advances (nothing else removes frames),
        /// and the worker would permanently stop decoding new ones.
        target_pts_seconds: f64,
        seek_request: Option<f64>,
        eof: bool,
        fatal_error: Option<String>,
        shutdown: bool,
    }

    struct Shared {
        ring: Mutex<RingState>,
        condvar: Condvar,
    }

    /// A resident in-process decode session: one dedicated worker thread
    /// owning a `VideoDecodeSession`, feeding a pts-ordered prefetch ring.
    pub(crate) struct InProcessDecodeSession {
        shared: Arc<Shared>,
        worker: Option<JoinHandle<()>>,
    }

    impl Drop for InProcessDecodeSession {
        fn drop(&mut self) {
            {
                let mut ring = self.shared.ring.lock().expect("ring mutex poisoned");
                ring.shutdown = true;
            }
            self.shared.condvar.notify_all();
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
        }
    }

    impl InProcessDecodeSession {
        /// Opens `source_path` for in-process decoding. The demux
        /// (`VideoDecodeSession::open`) runs synchronously on the calling
        /// thread -- it is in-process and cheap (no subprocess) -- so a
        /// codec/container this crate cannot decode is reported back
        /// immediately as `Err`, letting the caller fall back to the ffmpeg
        /// pipeline for this session without ever starting a worker thread.
        /// `output_width`/`output_height` is the shared-ring's requested
        /// decode resolution (matching the existing ffmpeg `-vf scale=w:h`
        /// contract); the worker resizes every decoded frame to it.
        pub(crate) fn open(
            source_path: &Path,
            output_width: u32,
            output_height: u32,
        ) -> Result<Self, String> {
            let mut session =
                VideoDecodeSession::open(source_path).map_err(|error| error.to_string())?;

            let shared = Arc::new(Shared {
                ring: Mutex::new(RingState {
                    frames: VecDeque::new(),
                    last_decoded_pts: None,
                    target_pts_seconds: 0.0,
                    seek_request: None,
                    eof: false,
                    fatal_error: None,
                    shutdown: false,
                }),
                condvar: Condvar::new(),
            });

            let worker_shared = Arc::clone(&shared);
            let worker = std::thread::Builder::new()
                .name("uxfd-inprocess-decode".to_string())
                .spawn(move || worker_loop(&mut session, output_width, output_height, &worker_shared))
                .map_err(|error| format!("failed to spawn decoder worker thread: {error}"))?;

            let instance = Self {
                shared,
                worker: Some(worker),
            };
            instance.wait_for_first_progress(FIRST_FRAME_TIMEOUT)?;
            Ok(instance)
        }

        fn wait_for_first_progress(&self, timeout: Duration) -> Result<(), String> {
            let deadline = Instant::now() + timeout;
            let mut ring = self.shared.ring.lock().expect("ring mutex poisoned");
            loop {
                if let Some(error) = &ring.fatal_error {
                    return Err(error.clone());
                }
                if !ring.frames.is_empty() || ring.eof {
                    return Ok(());
                }
                let now = Instant::now();
                if now >= deadline {
                    return Err(
                        "in-process decoder did not produce a first frame in time".to_string()
                    );
                }
                let (guard, _) = self
                    .shared
                    .condvar
                    .wait_timeout(ring, deadline - now)
                    .expect("ring mutex poisoned");
                ring = guard;
            }
        }

        /// Bounded, non-decoding lookup: returns the nearest ring frame with
        /// `pts_seconds <= target_pts_seconds` (or the earliest buffered
        /// frame if none qualify yet -- the ring is still warming up).
        /// Never runs a decode on the calling thread; the only wait is a
        /// short, bounded one for the ring to have *a* frame at all (see
        /// [`RING_WAIT_TIMEOUT`]), which only matters right after `open()`
        /// or a seek.
        pub(crate) fn request_frame(
            &self,
            target_pts_seconds: f64,
        ) -> Result<InProcessFrame, String> {
            {
                let mut ring = self.shared.ring.lock().expect("ring mutex poisoned");
                if should_seek(&ring, target_pts_seconds) {
                    ring.seek_request = Some(target_pts_seconds);
                    ring.frames.clear();
                    ring.eof = false;
                }
                ring.target_pts_seconds = target_pts_seconds;
                trim_consumed_frames(&mut ring, target_pts_seconds);
            }
            self.shared.condvar.notify_all();

            let deadline = Instant::now() + RING_WAIT_TIMEOUT;
            let mut ring = self.shared.ring.lock().expect("ring mutex poisoned");
            loop {
                if let Some(error) = &ring.fatal_error {
                    return Err(error.clone());
                }
                if let Some(frame) = nearest_frame(&ring.frames, target_pts_seconds) {
                    return Ok(InProcessFrame {
                        pts_seconds: frame.pts_seconds,
                        rgba: frame.rgba.clone(),
                    });
                }
                if ring.eof {
                    return Err(
                        "in-process decoder reached end of stream with no frame available"
                            .to_string(),
                    );
                }
                let now = Instant::now();
                if now >= deadline {
                    return Err("in-process decoder ring has no frame available yet".to_string());
                }
                let (guard, _) = self
                    .shared
                    .condvar
                    .wait_timeout(ring, deadline - now)
                    .expect("ring mutex poisoned");
                ring = guard;
            }
        }
    }

    fn should_seek(ring: &RingState, target_pts_seconds: f64) -> bool {
        if let Some(front) = ring.frames.front() {
            let earliest = front.pts_seconds;
            let latest = ring
                .frames
                .back()
                .map(|frame| frame.pts_seconds)
                .unwrap_or(earliest);
            return target_pts_seconds + BACKWARD_SEEK_EPSILON_SECONDS < earliest
                || target_pts_seconds > latest + FORWARD_SEEK_GAP_SECONDS;
        }
        if let Some(last_decoded) = ring.last_decoded_pts {
            return target_pts_seconds + BACKWARD_SEEK_EPSILON_SECONDS < last_decoded
                || target_pts_seconds > last_decoded + FORWARD_SEEK_GAP_SECONDS;
        }
        false
    }

    fn nearest_frame(frames: &VecDeque<RingFrame>, target_pts_seconds: f64) -> Option<&RingFrame> {
        frames
            .iter()
            .rev()
            .find(|frame| frame.pts_seconds <= target_pts_seconds)
            .or_else(|| frames.front())
    }

    /// Drops frames that playback has already moved past, keeping exactly
    /// one (the frame `nearest_frame` would currently serve) as the
    /// hold-last-frame fallback. Without this, once the ring fills to
    /// `PREFETCH_RING_DEPTH` starting from pts=0 it never shrinks again (the
    /// worker only ever appends), so the worker's "is the ring full"
    /// check permanently answers "yes" and it stops decoding forward --
    /// exactly the ffmpeg-restart-storm-shaped bug this design set out to
    /// avoid, just moved into the new path. Trimming here, driven by every
    /// `request_frame` call (i.e. the playhead), is what lets the ring
    /// actually behave as a window that tracks playback instead of a
    /// snapshot of the first `PREFETCH_RING_DEPTH` frames ever decoded.
    fn trim_consumed_frames(ring: &mut RingState, target_pts_seconds: f64) {
        while ring.frames.len() > 1 && ring.frames[1].pts_seconds <= target_pts_seconds {
            ring.frames.pop_front();
        }
    }

    fn worker_loop(
        session: &mut VideoDecodeSession,
        output_width: u32,
        output_height: u32,
        shared: &Arc<Shared>,
    ) {
        loop {
            let (shutdown, seek_request, ring_len) = {
                let ring = shared.ring.lock().expect("ring mutex poisoned");
                (ring.shutdown, ring.seek_request, ring.frames.len())
            };
            if shutdown {
                return;
            }

            if let Some(target) = seek_request {
                let seek_result = session.seek(target);
                let mut ring = shared.ring.lock().expect("ring mutex poisoned");
                ring.seek_request = None;
                if let Err(error) = seek_result {
                    ring.fatal_error = Some(error.to_string());
                    drop(ring);
                    shared.condvar.notify_all();
                    return;
                }
                ring.eof = false;
                continue;
            }

            if ring_len >= PREFETCH_RING_DEPTH {
                let ring = shared.ring.lock().expect("ring mutex poisoned");
                let _ = shared
                    .condvar
                    .wait_timeout(ring, Duration::from_millis(50))
                    .expect("ring mutex poisoned");
                continue;
            }

            match session.next_frame() {
                Ok(Some(frame)) => {
                    let pts_seconds = frame.pts_seconds;
                    let rgba = convert_and_resize(&frame, output_width, output_height);
                    let mut ring = shared.ring.lock().expect("ring mutex poisoned");
                    ring.last_decoded_pts = Some(pts_seconds);
                    ring.frames.push_back(RingFrame { pts_seconds, rgba });
                    while ring.frames.len() > PREFETCH_RING_DEPTH {
                        ring.frames.pop_front();
                    }
                    drop(ring);
                    shared.condvar.notify_all();
                }
                Ok(None) => {
                    let mut ring = shared.ring.lock().expect("ring mutex poisoned");
                    ring.eof = true;
                    drop(ring);
                    shared.condvar.notify_all();
                    let ring = shared.ring.lock().expect("ring mutex poisoned");
                    let _ = shared
                        .condvar
                        .wait_timeout(ring, Duration::from_millis(100))
                        .expect("ring mutex poisoned");
                }
                Err(error) => {
                    let mut ring = shared.ring.lock().expect("ring mutex poisoned");
                    ring.fatal_error = Some(error.to_string());
                    drop(ring);
                    shared.condvar.notify_all();
                    return;
                }
            }
        }
    }

    fn convert_and_resize(
        frame: &DecodedVideoFrame,
        output_width: u32,
        output_height: u32,
    ) -> Vec<u8> {
        let native_rgba = nv12_to_rgba(frame);
        if frame.width == output_width && frame.height == output_height {
            return native_rgba;
        }
        resize_rgba_nearest(
            &native_rgba,
            frame.width,
            frame.height,
            output_width,
            output_height,
        )
    }

    /// CPU compatibility bridge (Phase 4c Stage 1 only -- Stage 2 replaces
    /// this with GPU zero-copy NV12 import). Converts the frame's NV12
    /// planes to full-range RGBA8, matching the colour-conversion formulae
    /// already used by `shared-renderer/shaders/nv12_composite.wgsl`
    /// (Phase 4b) so CPU and GPU paths agree. BT.2020 has no distinct
    /// coefficient set here (nor in the Phase 4b shader): it is treated as
    /// BT.709, a documented approximation.
    fn nv12_to_rgba(frame: &DecodedVideoFrame) -> Vec<u8> {
        let readback = frame.read_nv12();
        let width = frame.width as usize;
        let height = frame.height as usize;
        let mut rgba = vec![0u8; width * height * 4];

        let y_plane = &readback.y;
        let cbcr_plane = &readback.cb_cr;

        for row in 0..height {
            let y_row_start = row * y_plane.bytes_per_row;
            let chroma_row = row / 2;
            let chroma_row_start = chroma_row * cbcr_plane.bytes_per_row;
            for col in 0..width {
                let y_sample = y_plane.data[y_row_start + col];
                let chroma_col = col / 2;
                let cb_sample = cbcr_plane.data[chroma_row_start + chroma_col * 2];
                let cr_sample = cbcr_plane.data[chroma_row_start + chroma_col * 2 + 1];

                let (r, g, b) = ycbcr_to_rgb(y_sample, cb_sample, cr_sample, frame.colour);
                let out = (row * width + col) * 4;
                rgba[out] = r;
                rgba[out + 1] = g;
                rgba[out + 2] = b;
                rgba[out + 3] = 255;
            }
        }

        rgba
    }

    /// Converts one YCbCr 4:2:0 sample triple to full-range RGB8, using the
    /// same range/matrix formulae as `nv12_composite.wgsl`'s
    /// `load_source_linear`.
    pub(crate) fn ycbcr_to_rgb(
        y: u8,
        cb: u8,
        cr: u8,
        colour: ColourMetadata,
    ) -> (u8, u8, u8) {
        let y = f32::from(y);
        let cb = f32::from(cb);
        let cr = f32::from(cr);

        let (y1, cb1, cr1) = match colour.range {
            ColourRange::Video => (
                ((y - 16.0) / 219.0).clamp(0.0, 1.0),
                ((cb - 128.0) / 224.0).clamp(-0.5, 0.5),
                ((cr - 128.0) / 224.0).clamp(-0.5, 0.5),
            ),
            ColourRange::Full => (
                (y / 255.0).clamp(0.0, 1.0),
                cb / 255.0 - 0.5,
                cr / 255.0 - 0.5,
            ),
        };

        let (r, g, b) = match colour.matrix {
            ColourMatrix::Bt601 => (
                y1 + 1.402 * cr1,
                y1 - 0.344_136 * cb1 - 0.714_136 * cr1,
                y1 + 1.772 * cb1,
            ),
            // BT.2020 is treated as BT.709: neither this bridge nor the
            // Phase 4b GPU shader has distinct BT.2020 coefficients yet.
            ColourMatrix::Bt709 | ColourMatrix::Bt2020 => (
                y1 + 1.5748 * cr1,
                y1 - 0.187_324 * cb1 - 0.468_124 * cr1,
                y1 + 1.8556 * cb1,
            ),
        };

        (
            (r.clamp(0.0, 1.0) * 255.0).round() as u8,
            (g.clamp(0.0, 1.0) * 255.0).round() as u8,
            (b.clamp(0.0, 1.0) * 255.0).round() as u8,
        )
    }

    /// Nearest-neighbour RGBA resize: simple and deterministic, matching the
    /// shared-ring's fixed byte-length contract. Pixel parity with ffmpeg's
    /// bilinear `scale` filter is not a goal here (the two decode backends
    /// already differ in decode itself); only producing exactly
    /// `dst_width * dst_height * 4` bytes matters.
    pub(crate) fn resize_rgba_nearest(
        src: &[u8],
        src_width: u32,
        src_height: u32,
        dst_width: u32,
        dst_height: u32,
    ) -> Vec<u8> {
        let src_width = src_width as usize;
        let src_height = src_height as usize;
        let dst_width_usize = dst_width as usize;
        let dst_height_usize = dst_height as usize;
        let mut dst = vec![0u8; dst_width_usize * dst_height_usize * 4];

        if src_width == 0 || src_height == 0 || dst_width_usize == 0 || dst_height_usize == 0 {
            return dst;
        }

        for dst_row in 0..dst_height_usize {
            let src_row = (dst_row * src_height / dst_height_usize).min(src_height - 1);
            for dst_col in 0..dst_width_usize {
                let src_col = (dst_col * src_width / dst_width_usize).min(src_width - 1);
                let src_index = (src_row * src_width + src_col) * 4;
                let dst_index = (dst_row * dst_width_usize + dst_col) * 4;
                dst[dst_index..dst_index + 4].copy_from_slice(&src[src_index..src_index + 4]);
            }
        }

        dst
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn colour(range: ColourRange, matrix: ColourMatrix) -> ColourMetadata {
            ColourMetadata { range, matrix }
        }

        #[test]
        fn ycbcr_to_rgb_full_range_bt709_white_and_black_are_exact() {
            let white = ycbcr_to_rgb(255, 128, 128, colour(ColourRange::Full, ColourMatrix::Bt709));
            // 128/255 is not exactly the neutral 0.5 chroma midpoint, so allow
            // the one-ULP-of-u8 rounding slack that introduces.
            assert!(white.0 >= 254 && white.1 >= 254 && white.2 >= 254, "{white:?}");

            let black = ycbcr_to_rgb(0, 128, 128, colour(ColourRange::Full, ColourMatrix::Bt709));
            assert!(black.0 <= 1 && black.1 <= 1 && black.2 <= 1, "{black:?}");
        }

        #[test]
        fn ycbcr_to_rgb_video_range_bt601_black_and_white_levels_are_exact() {
            // Y=16 is the "tv" black floor, Y=235 the "tv" white ceiling.
            let black = ycbcr_to_rgb(16, 128, 128, colour(ColourRange::Video, ColourMatrix::Bt601));
            assert!(black.0 <= 1 && black.1 <= 1 && black.2 <= 1, "{black:?}");

            let white = ycbcr_to_rgb(235, 128, 128, colour(ColourRange::Video, ColourMatrix::Bt601));
            assert!(white.0 >= 254 && white.1 >= 254 && white.2 >= 254, "{white:?}");
        }

        #[test]
        fn ycbcr_to_rgb_neutral_chroma_never_produces_a_colour_cast() {
            for matrix in [ColourMatrix::Bt601, ColourMatrix::Bt709, ColourMatrix::Bt2020] {
                for y in [0u8, 64, 128, 192, 255] {
                    let (r, g, b) = ycbcr_to_rgb(y, 128, 128, colour(ColourRange::Full, matrix));
                    let max = r.max(g).max(b);
                    let min = r.min(g).min(b);
                    // cb=cr=128 is not exactly the neutral 0.5 chroma
                    // midpoint (127.5), so a small (<=2/255) colour cast from
                    // that quantisation is expected, not a matrix bug.
                    assert!(
                        max - min <= 2,
                        "expected near-grey for neutral chroma at y={y}, matrix={matrix:?}: got ({r},{g},{b})"
                    );
                }
            }
        }

        #[test]
        fn resize_rgba_nearest_upscales_2x2_to_4x4_by_duplicating_pixels() {
            #[rustfmt::skip]
            let src: Vec<u8> = vec![
                255, 0, 0, 255,   0, 255, 0, 255,
                0, 0, 255, 255,   255, 255, 0, 255,
            ];
            let dst = resize_rgba_nearest(&src, 2, 2, 4, 4);
            assert_eq!(dst.len(), 4 * 4 * 4);
            // Top-left quadrant must be pure red.
            for row in 0..2 {
                for col in 0..2 {
                    let index = (row * 4 + col) * 4;
                    assert_eq!(&dst[index..index + 4], &[255, 0, 0, 255]);
                }
            }
            // Bottom-right quadrant must be pure yellow.
            for row in 2..4 {
                for col in 2..4 {
                    let index = (row * 4 + col) * 4;
                    assert_eq!(&dst[index..index + 4], &[255, 255, 0, 255]);
                }
            }
        }

        #[test]
        fn resize_rgba_nearest_downscales_and_preserves_byte_length_contract() {
            let src = vec![7u8; 8 * 8 * 4];
            let dst = resize_rgba_nearest(&src, 8, 8, 3, 5);
            assert_eq!(dst.len(), 3 * 5 * 4);
        }

        #[test]
        fn nearest_frame_holds_the_last_decoded_frame_when_target_is_ahead() {
            let mut frames = VecDeque::new();
            frames.push_back(RingFrame { pts_seconds: 0.0, rgba: vec![0] });
            frames.push_back(RingFrame { pts_seconds: 0.1, rgba: vec![1] });
            let held = nearest_frame(&frames, 5.0).expect("should hold last frame");
            assert_eq!(held.pts_seconds, 0.1);
        }

        #[test]
        fn nearest_frame_falls_back_to_earliest_when_target_precedes_ring() {
            let mut frames = VecDeque::new();
            frames.push_back(RingFrame { pts_seconds: 1.0, rgba: vec![0] });
            frames.push_back(RingFrame { pts_seconds: 1.1, rgba: vec![1] });
            let held = nearest_frame(&frames, 0.0).expect("should fall back to earliest");
            assert_eq!(held.pts_seconds, 1.0);
        }

        fn empty_ring_state() -> RingState {
            RingState {
                frames: VecDeque::new(),
                last_decoded_pts: None,
                target_pts_seconds: 0.0,
                seek_request: None,
                eof: false,
                fatal_error: None,
                shutdown: false,
            }
        }

        #[test]
        fn should_seek_is_false_for_first_request_before_anything_decoded() {
            let ring = empty_ring_state();
            assert!(!should_seek(&ring, 3.0));
        }

        #[test]
        fn should_seek_is_true_for_large_forward_gap_and_backward_step() {
            let mut ring = empty_ring_state();
            ring.last_decoded_pts = Some(1.0);
            assert!(should_seek(&ring, 1.0 + FORWARD_SEEK_GAP_SECONDS + 0.5));
            assert!(should_seek(&ring, 0.0));
            ring.last_decoded_pts = None;
            ring.frames.push_back(RingFrame { pts_seconds: 2.0, rgba: vec![] });
            ring.frames.push_back(RingFrame { pts_seconds: 2.1, rgba: vec![] });
            assert!(!should_seek(&ring, 2.05), "target inside ring range must not seek");
            assert!(should_seek(&ring, 0.5), "target before ring range must seek");
        }

        #[test]
        fn trim_consumed_frames_keeps_only_the_frame_nearest_frame_would_serve() {
            let mut ring = empty_ring_state();
            for pts in [0.0, 0.1, 0.2, 0.3, 0.4] {
                ring.frames.push_back(RingFrame { pts_seconds: pts, rgba: vec![] });
            }
            trim_consumed_frames(&mut ring, 0.25);
            let pts_values: Vec<f64> = ring.frames.iter().map(|frame| frame.pts_seconds).collect();
            assert_eq!(pts_values, vec![0.2, 0.3, 0.4], "{pts_values:?}");
        }

        #[test]
        fn trim_consumed_frames_never_empties_the_ring_when_target_is_ahead_of_everything() {
            let mut ring = empty_ring_state();
            for pts in [0.0, 0.1, 0.2] {
                ring.frames.push_back(RingFrame { pts_seconds: pts, rgba: vec![] });
            }
            trim_consumed_frames(&mut ring, 99.0);
            assert_eq!(ring.frames.len(), 1, "must hold the last frame, never empty out");
            assert_eq!(ring.frames[0].pts_seconds, 0.2);
        }

        /// Regression test for the bug the perf harness caught: once the ring
        /// reaches `PREFETCH_RING_DEPTH` starting from pts=0 and playback
        /// keeps advancing (repeated `request_frame` calls with an
        /// increasing target), trimming must keep shrinking the ring so the
        /// worker's "full" check (`len >= PREFETCH_RING_DEPTH`) does not
        /// latch permanently true.
        #[test]
        fn trim_consumed_frames_lets_a_full_ring_shrink_as_target_pts_advances() {
            let mut ring = empty_ring_state();
            for index in 0..PREFETCH_RING_DEPTH {
                ring.frames.push_back(RingFrame {
                    pts_seconds: index as f64 * 0.1,
                    rgba: vec![],
                });
            }
            assert_eq!(ring.frames.len(), PREFETCH_RING_DEPTH);
            trim_consumed_frames(&mut ring, 0.35);
            assert!(
                ring.frames.len() < PREFETCH_RING_DEPTH,
                "ring must shrink below capacity once playback moves past buffered frames, \
                 otherwise the worker's fullness check never resumes decoding"
            );
        }
    }
}
