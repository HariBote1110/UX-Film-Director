//! Decoded frame type: an IOSurface-backed NV12 `CVPixelBuffer` plus metadata.

use std::ptr;

use objc2_core_foundation::CFRetained;
use objc2_core_video::{
    kCVImageBufferYCbCrMatrixKey, kCVImageBufferYCbCrMatrix_ITU_R_601_4,
    kCVImageBufferYCbCrMatrix_ITU_R_709_2, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    CVPixelBuffer, CVPixelBufferGetHeight, CVPixelBufferGetIOSurface,
    CVPixelBufferGetPixelFormatType, CVPixelBufferGetWidth, CVPixelBufferLockBaseAddress,
    CVPixelBufferLockFlags, CVPixelBufferUnlockBaseAddress,
};
use objc2_io_surface::IOSurfaceRef;

use crate::colour::{ColourMatrix, ColourMetadata, ColourRange};

/// A single plane of an NV12 CPU readback (see [`YCbCrReadback`]).
#[derive(Debug, Clone)]
pub struct PlaneReadback {
    pub width: u32,
    pub height: u32,
    /// Bytes per row as reported by CoreVideo; may be larger than
    /// `width * bytes_per_pixel` due to row padding. `data` is exactly
    /// `bytes_per_row * height` bytes, i.e. the padding is preserved so
    /// callers can index it the same way CoreVideo does.
    pub bytes_per_row: usize,
    pub data: Vec<u8>,
}

/// CPU readback of an NV12 (bi-planar 4:2:0) frame: a full-resolution luma
/// plane and a half-resolution, interleaved Cb/Cr plane.
#[derive(Debug, Clone)]
pub struct YCbCrReadback {
    pub y: PlaneReadback,
    pub cb_cr: PlaneReadback,
}

/// One decoded video frame: an IOSurface-backed NV12 `CVPixelBuffer`, its
/// presentation timestamp and dimensions, and the colour metadata that
/// describes how to interpret its samples.
pub struct DecodedVideoFrame {
    pixel_buffer: CFRetained<CVPixelBuffer>,
    pub pts_seconds: f64,
    pub width: u32,
    pub height: u32,
    pub colour: ColourMetadata,
}

// SAFETY: `CVPixelBuffer` (a CoreFoundation type) uses atomic reference
// counting, so retaining/releasing/dropping it from a different thread than
// the one that created it is sound. `DecodedVideoFrame` exposes only
// read-only accessors plus `read_nv12`, which pairs
// `CVPixelBufferLockBaseAddress`/`CVPixelBufferUnlockBaseAddress` within a
// single call and never leaves the buffer locked afterwards, so handing a
// frame to another thread and reading it there is safe.
//
// We deliberately do NOT implement `Sync`: `CVPixelBufferLockBaseAddress`
// maintains an internal "seed" that is not documented as safe to touch
// concurrently from two threads for the same buffer, so callers must not
// call `read_nv12` on the same `&DecodedVideoFrame` from multiple threads at
// once.
unsafe impl Send for DecodedVideoFrame {}

impl DecodedVideoFrame {
    pub(crate) fn new(
        pixel_buffer: CFRetained<CVPixelBuffer>,
        pts_seconds: f64,
        fallback_matrix_dimensions: (u32, u32),
    ) -> Self {
        let width = CVPixelBufferGetWidth(&pixel_buffer) as u32;
        let height = CVPixelBufferGetHeight(&pixel_buffer) as u32;

        // The pixel format we actually got back tells us, unambiguously,
        // which range VideoToolbox produced (we requested the matching
        // Video/Full NV12 variant up front based on the container's tag, see
        // `session.rs`; reading it back here keeps the two paths honest with
        // each other rather than trusting the request blindly).
        let pixel_format = CVPixelBufferGetPixelFormatType(&pixel_buffer);
        let range = if pixel_format == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange {
            ColourRange::Full
        } else {
            ColourRange::Video
        };

        let matrix = read_matrix_attachment(&pixel_buffer)
            .unwrap_or_else(|| {
                ColourMatrix::fallback_for_dimensions(
                    fallback_matrix_dimensions.0,
                    fallback_matrix_dimensions.1,
                )
            });

        Self {
            pixel_buffer,
            pts_seconds,
            width,
            height,
            colour: ColourMetadata { range, matrix },
        }
    }

    /// The `IOSurfaceID` backing this frame's `CVPixelBuffer`, for later
    /// cross-process / GPU import. `None` if the buffer is unexpectedly not
    /// IOSurface-backed (should not happen given we always request
    /// `kCVPixelBufferIOSurfacePropertiesKey`).
    pub fn io_surface_id(&self) -> Option<u32> {
        let surface: CFRetained<IOSurfaceRef> =
            CVPixelBufferGetIOSurface(Some(&self.pixel_buffer))?;
        Some(surface.id())
    }

    /// Copies the NV12 planes out to CPU-owned buffers. Used by tests (and
    /// any future CPU-side consumer) to validate plane layout and colour
    /// range/matrix without needing a GPU import path.
    pub fn read_nv12(&self) -> YCbCrReadback {
        let lock_result = unsafe {
            CVPixelBufferLockBaseAddress(&self.pixel_buffer, CVPixelBufferLockFlags::empty())
        };
        assert_eq!(
            lock_result, 0,
            "CVPixelBufferLockBaseAddress failed with CVReturn {lock_result}"
        );

        let y = copy_plane(&self.pixel_buffer, 0);
        let cb_cr = copy_plane(&self.pixel_buffer, 1);

        let unlock_result = unsafe {
            CVPixelBufferUnlockBaseAddress(&self.pixel_buffer, CVPixelBufferLockFlags::empty())
        };
        assert_eq!(
            unlock_result, 0,
            "CVPixelBufferUnlockBaseAddress failed with CVReturn {unlock_result}"
        );

        YCbCrReadback { y, cb_cr }
    }
}

fn copy_plane(pixel_buffer: &CVPixelBuffer, plane_index: usize) -> PlaneReadback {
    use objc2_core_video::{
        CVPixelBufferGetBaseAddressOfPlane, CVPixelBufferGetBytesPerRowOfPlane,
        CVPixelBufferGetHeightOfPlane, CVPixelBufferGetWidthOfPlane,
    };

    let width = CVPixelBufferGetWidthOfPlane(pixel_buffer, plane_index) as u32;
    let height = CVPixelBufferGetHeightOfPlane(pixel_buffer, plane_index) as u32;
    let bytes_per_row = CVPixelBufferGetBytesPerRowOfPlane(pixel_buffer, plane_index);
    let base = CVPixelBufferGetBaseAddressOfPlane(pixel_buffer, plane_index);

    let len = bytes_per_row * height as usize;
    let data = if base.is_null() || len == 0 {
        Vec::new()
    } else {
        // SAFETY: the buffer is locked by the caller (`read_nv12`) for the
        // duration of this call, `base` points at `len` readable bytes as
        // reported by CoreVideo itself, and we copy out before unlocking.
        unsafe { std::slice::from_raw_parts(base as *const u8, len).to_vec() }
    };

    PlaneReadback {
        width,
        height,
        bytes_per_row,
        data,
    }
}

fn read_matrix_attachment(pixel_buffer: &CVPixelBuffer) -> Option<ColourMatrix> {
    let key = unsafe { kCVImageBufferYCbCrMatrixKey };
    let value = unsafe { pixel_buffer.attachment(key, ptr::null_mut()) }?;
    let value = value
        .downcast::<objc2_core_foundation::CFString>()
        .ok()?;

    let bt709 = unsafe { kCVImageBufferYCbCrMatrix_ITU_R_709_2 };
    let bt601 = unsafe { kCVImageBufferYCbCrMatrix_ITU_R_601_4 };

    if &*value == bt709 {
        Some(ColourMatrix::Bt709)
    } else if &*value == bt601 {
        Some(ColourMatrix::Bt601)
    } else {
        // Covers BT.2020 and any future/unknown tag: we don't yet special
        // case BT.2020 numerically, so fall through to the dimension
        // heuristic at the call site rather than mis-report it as 601/709.
        None
    }
}
