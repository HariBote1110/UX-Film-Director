//! Colour metadata describing how a decoded frame's YCbCr samples map to RGB.

/// Whether luma/chroma samples occupy the full 0-255 (8-bit) code range ("pc")
/// or the limited/legal 16-235 range ("tv").
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColourRange {
    /// Legal/limited range (ITU-R BT.601/709 "tv" convention).
    Video,
    /// Full/PC range.
    Full,
}

/// The YCbCr matrix used to convert between RGB and YCbCr.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColourMatrix {
    /// ITU-R BT.601 (standard-definition).
    Bt601,
    /// ITU-R BT.709 (high-definition).
    Bt709,
    /// ITU-R BT.2020 (ultra-high-definition / wide colour gamut).
    Bt2020,
}

impl ColourMatrix {
    /// Fallback used when the source track does not tag a matrix explicitly.
    ///
    /// Mirrors the convention already applied by ffmpeg and by
    /// `rust-backend/src/decode.rs`: content whose longer edge is below the
    /// 1280px HD threshold is assumed BT.601, everything else BT.709.
    pub(crate) fn fallback_for_dimensions(width: u32, height: u32) -> Self {
        if width.max(height) >= 1280 {
            ColourMatrix::Bt709
        } else {
            ColourMatrix::Bt601
        }
    }
}

/// Colour metadata attached to a [`crate::DecodedVideoFrame`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ColourMetadata {
    pub range: ColourRange,
    pub matrix: ColourMatrix,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fallback_matrix_is_bt601_below_hd_threshold() {
        assert_eq!(
            ColourMatrix::fallback_for_dimensions(320, 180),
            ColourMatrix::Bt601
        );
        assert_eq!(
            ColourMatrix::fallback_for_dimensions(1279, 100),
            ColourMatrix::Bt601
        );
    }

    #[test]
    fn fallback_matrix_is_bt709_at_or_above_hd_threshold() {
        assert_eq!(
            ColourMatrix::fallback_for_dimensions(1280, 720),
            ColourMatrix::Bt709
        );
        assert_eq!(
            ColourMatrix::fallback_for_dimensions(1920, 1080),
            ColourMatrix::Bt709
        );
        // Portrait orientation: the longer edge still decides.
        assert_eq!(
            ColourMatrix::fallback_for_dimensions(720, 1280),
            ColourMatrix::Bt709
        );
    }
}
