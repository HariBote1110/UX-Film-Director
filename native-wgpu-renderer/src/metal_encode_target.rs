//! macOS Metal 専用: BGRA IOSurface を WGPU の render target として import する。

#![allow(unexpected_cfgs)]

use objc::{msg_send, sel, sel_impl};

use crate::nv12::sys::{self, IOSurfaceRef};
use crate::{BgraIoSurfaceTarget, NativeWgpuRenderError};

trait IOSurfaceRenderTargetExt {
    unsafe fn uxfd_new_render_target_from_iosurface(
        &self,
        descriptor: &metal::TextureDescriptorRef,
        surface: IOSurfaceRef,
    ) -> metal::Texture;
}

impl IOSurfaceRenderTargetExt for metal::DeviceRef {
    unsafe fn uxfd_new_render_target_from_iosurface(
        &self,
        descriptor: &metal::TextureDescriptorRef,
        surface: IOSurfaceRef,
    ) -> metal::Texture {
        msg_send![self, newTextureWithDescriptor: descriptor iosurface: surface plane: 0_u64]
    }
}

pub(crate) fn import_bgra_iosurface_render_target(
    device: &wgpu::Device,
    target: BgraIoSurfaceTarget,
) -> Result<wgpu::Texture, NativeWgpuRenderError> {
    let surface_ref = unsafe { sys::IOSurfaceLookup(target.surface_id) };
    if surface_ref.is_null() {
        return Err(NativeWgpuRenderError::BgraSurfaceLookupFailed {
            surface_id: target.surface_id,
        });
    }

    let actual_width = unsafe { sys::IOSurfaceGetWidth(surface_ref) } as u32;
    let actual_height = unsafe { sys::IOSurfaceGetHeight(surface_ref) } as u32;
    if actual_width != target.width || actual_height != target.height {
        unsafe { sys::CFRelease(surface_ref) };
        return Err(NativeWgpuRenderError::BgraSurfaceSizeMismatch {
            surface_id: target.surface_id,
            expected_width: target.width,
            expected_height: target.height,
            actual_width,
            actual_height,
        });
    }

    let metal_texture = unsafe {
        device.as_hal::<wgpu::hal::api::Metal, _, _>(|hal_device| {
            hal_device.map(|hal_device| {
                let metal_device = hal_device.raw_device().lock();
                objc::rc::autoreleasepool(|| {
                    let descriptor = metal::TextureDescriptor::new();
                    descriptor.set_texture_type(metal::MTLTextureType::D2);
                    descriptor.set_pixel_format(metal::MTLPixelFormat::BGRA8Unorm_sRGB);
                    descriptor.set_width(target.width as u64);
                    descriptor.set_height(target.height as u64);
                    descriptor.set_mipmap_level_count(1);
                    descriptor.set_storage_mode(metal::MTLStorageMode::Shared);
                    descriptor.set_usage(
                        metal::MTLTextureUsage::RenderTarget | metal::MTLTextureUsage::ShaderRead,
                    );
                    metal_device
                        .uxfd_new_render_target_from_iosurface(&descriptor, surface_ref)
                })
            })
        })
    };
    unsafe { sys::CFRelease(surface_ref) };

    let Some(metal_texture) = metal_texture else {
        return Err(NativeWgpuRenderError::BgraImportUnsupportedPlatform);
    };
    let hal_texture = unsafe {
        wgpu::hal::metal::Device::texture_from_raw(
            metal_texture,
            wgpu::TextureFormat::Bgra8UnormSrgb,
            metal::MTLTextureType::D2,
            1,
            1,
            wgpu::hal::CopyExtent {
                width: target.width,
                height: target.height,
                depth: 1,
            },
        )
    };

    Ok(unsafe {
        device.create_texture_from_hal::<wgpu::hal::api::Metal>(
            hal_texture,
            &wgpu::TextureDescriptor {
                label: Some("UXFD VideoToolbox BGRA IOSurface render target"),
                size: wgpu::Extent3d {
                    width: target.width,
                    height: target.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Bgra8UnormSrgb,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                view_formats: &[],
            },
        )
    })
}
