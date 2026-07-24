use crate::{BgraIoSurfaceTarget, NativeWgpuRenderError};

pub(crate) fn import_bgra_iosurface_render_target(
    _device: &wgpu::Device,
    _target: BgraIoSurfaceTarget,
) -> Result<wgpu::Texture, NativeWgpuRenderError> {
    Err(NativeWgpuRenderError::BgraImportUnsupportedPlatform)
}
