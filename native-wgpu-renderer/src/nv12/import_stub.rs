//! 非 macOS プラットフォーム向けスタブ。IOSurface import は macOS(Metal)
//! 専用の機能のため、crate 自体はクロスプラットフォームでビルドできる
//! ようにしつつ、実際に NV12 クリップを渡すと明確なエラーを返す。

use crate::NativeWgpuRenderError;

use super::Nv12IoSurfaceSource;

pub(crate) fn import_nv12_iosurface_textures(
    _device: &wgpu::Device,
    _source: &Nv12IoSurfaceSource,
) -> Result<(wgpu::Texture, wgpu::Texture), NativeWgpuRenderError> {
    Err(NativeWgpuRenderError::Nv12ImportUnsupportedPlatform)
}
