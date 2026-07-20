//! Phase 4c Stage 2: shared vocabulary for a clip's resolved video render
//! source when that source is a zero-copy NV12 (biplanar 4:2:0) IOSurface
//! from a Stage 1 in-process decode session (`rust-backend/src/
//! inprocess_decode.rs`), rather than a CPU-converted RGBA frame.
//!
//! `Nv12IoSurfaceRef` is produced by rust-backend (which resolves the
//! surface id + colour metadata + content revision from a resident
//! `InProcessDecodeSession`'s most recently served frame) and consumed by
//! native-wgpu-renderer's production composite path
//! (`prepare_scene_clips_with_upload_fence`), which imports the surface via
//! `IOSurfaceLookup` directly into a `wgpu::Texture` -- no CPU pixel copy.
//!
//! This type is deliberately **not** embedded in `SceneSnapshot`/
//! `EvaluatedClip` (the RPC wire contract pinned by
//! `tests/timeline_snapshot_contract.rs`): an IOSurface id is a
//! rust-backend-process-internal decode-session detail that the JS/Electron
//! side never sees or sends, so there is nothing for it to round-trip
//! through JSON there. Call sites carry it as a sidecar
//! `HashMap<String, Nv12IoSurfaceRef>` keyed by media_id, alongside the
//! existing `HashMap<String, RgbaFrame>` sources map -- a media_id absent
//! from this map keeps resolving via the RGBA path exactly as before, so
//! this addition is purely additive: any existing `SceneSnapshot` JSON
//! (which never mentions NV12) parses and renders identically to before.

use serde::{Deserialize, Serialize};

/// NV12 quantisation range. Mirrors `macos-video-decode`'s `ColourRange`
/// (rust-core has no dependency on that -- or any -- platform crate; the
/// dependency direction is the other way around, so this is kept as an
/// independent, canonical copy that platform crates convert into).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Nv12ColourRange {
    /// limited/video range (8-bit: Y in [16,235], Cb/Cr in [16,240]).
    Video,
    /// full range (8-bit: Y/Cb/Cr all in [0,255]).
    Full,
}

/// NV12 YCbCr→RGB matrix. Mirrors `macos-video-decode`'s `ColourMatrix`,
/// including the `Bt2020` variant it can report -- the "no distinct BT.2020
/// coefficients yet, treat as BT.709" approximation is a numeric decision
/// made where the GPU/CPU conversion coefficients themselves are chosen
/// (`native-wgpu-renderer`'s `Nv12Params`/`rust-backend`'s `ycbcr_to_rgb`),
/// not a reason to lose the distinction at the type level here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Nv12ColourMatrix {
    /// ITU-R BT.601 (common for SD video).
    Bt601,
    /// ITU-R BT.709 (common for HD video).
    Bt709,
    /// ITU-R BT.2020 (common for UHD/HDR video).
    Bt2020,
}

/// A zero-copy reference to an NV12 (biplanar 4:2:0) IOSurface, resolved
/// in-process by rust-backend from a Phase 4c Stage 1 in-process decode
/// session's most recently served frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Nv12IoSurfaceRef {
    /// Resolvable via `IOSurfaceLookup` -- valid only within the process
    /// that created it (see `progress/phase4c-inprocess-decode-integration.md`
    /// for the empirical cross-process `IOSurfaceLookup` finding that scopes
    /// this to rust-backend's own compositor).
    pub surface_id: u32,
    /// Y plane dimensions. The CbCr plane is half-resolution
    /// (`width / 2`, `height / 2`).
    pub width: u32,
    pub height: u32,
    pub colour_range: Nv12ColourRange,
    pub colour_matrix: Nv12ColourMatrix,
    /// Caller-supplied content generation: an unchanged `(surface_id,
    /// revision)` pair for the same media_id lets a GPU texture cache skip
    /// re-importing the surface, mirroring the existing RGBA
    /// `collect_native_render_source_content_revisions` contract.
    pub revision: u64,
}
