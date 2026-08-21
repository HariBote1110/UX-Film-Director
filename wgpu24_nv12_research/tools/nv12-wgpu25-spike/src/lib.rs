//! wgpu24_nv12_research: minimal, disposable spike crate for hypothesis H1/H2.
//! See wgpu24_nv12_research/notes/ for the write-up. This crate intentionally
//! duplicates a small slice of `native-wgpu-renderer`'s NV12 IOSurface import
//! logic, ported to wgpu = "24.0.5", to check whether the same mechanism
//! still compiles and behaves correctly under the newer wgpu/wgpu-hal/metal
//! version set.

#![allow(unexpected_cfgs)] // objc::sel_impl! cfg noise, same as production crate.

use std::ffi::c_void;
use std::os::raw::c_void as raw_c_void;

use objc::{msg_send, sel, sel_impl};

// ---------------------------------------------------------------------
// IOSurface / CoreVideo raw FFI (ported from native-wgpu-renderer/src/nv12/sys.rs
// and the nv12_fixture test module in native-wgpu-renderer/src/lib.rs).
// ---------------------------------------------------------------------

pub type IOSurfaceRef = *mut raw_c_void;
pub type CVPixelBufferRef = *mut c_void;
pub type CVReturn = i32;
pub type OSType = u32;

pub const K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE: OSType = 0x3432_3076; // '420v'

#[link(name = "IOSurface", kind = "framework")]
extern "C" {
    pub fn IOSurfaceLookup(csid: u32) -> IOSurfaceRef;
    pub fn IOSurfaceGetID(surface: IOSurfaceRef) -> u32;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    pub fn CFRelease(cf: *mut c_void);
}

#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
    static kCVPixelBufferIOSurfacePropertiesKey: core_foundation::string::CFStringRef;
    fn CVPixelBufferCreate(
        allocator: core_foundation::base::CFTypeRef,
        width: usize,
        height: usize,
        pixel_format_type: OSType,
        pixel_buffer_attributes: core_foundation::base::CFTypeRef,
        pixel_buffer_out: *mut CVPixelBufferRef,
    ) -> CVReturn;
    fn CVPixelBufferRelease(buffer: CVPixelBufferRef);
    fn CVPixelBufferGetIOSurface(buffer: CVPixelBufferRef) -> IOSurfaceRef;
    fn CVPixelBufferLockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
    fn CVPixelBufferUnlockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
    fn CVPixelBufferGetBaseAddressOfPlane(buffer: CVPixelBufferRef, plane: usize) -> *mut c_void;
    fn CVPixelBufferGetBytesPerRowOfPlane(buffer: CVPixelBufferRef, plane: usize) -> usize;
}

/// Synthetic IOSurface-backed NV12 `CVPixelBuffer`, freed on `Drop`.
/// Ported from `native-wgpu-renderer/src/lib.rs::tests::nv12_iosurface::nv12_fixture::SyntheticNv12Buffer`.
pub struct SyntheticNv12Buffer {
    pixel_buffer: CVPixelBufferRef,
    pub surface_id: u32,
    pub width: u32,
    pub height: u32,
}

unsafe impl Send for SyntheticNv12Buffer {}

impl Drop for SyntheticNv12Buffer {
    fn drop(&mut self) {
        unsafe { CVPixelBufferRelease(self.pixel_buffer) };
    }
}

impl SyntheticNv12Buffer {
    pub fn new(
        width: u32,
        height: u32,
        y_at: impl Fn(u32, u32) -> u8,
        cbcr_at: impl Fn(u32, u32) -> (u8, u8),
    ) -> Self {
        use core_foundation::base::{CFType, CFTypeRef, TCFType};
        use core_foundation::dictionary::CFDictionary;
        use core_foundation::string::CFString;

        assert_eq!(width % 2, 0, "NV12 width must be even");
        assert_eq!(height % 2, 0, "NV12 height must be even");

        let empty_props: CFDictionary<CFString, CFType> = CFDictionary::from_CFType_pairs(&[]);
        let key = unsafe { CFString::wrap_under_get_rule(kCVPixelBufferIOSurfacePropertiesKey) };
        let attributes: CFDictionary<CFString, CFType> =
            CFDictionary::from_CFType_pairs(&[(key, empty_props.as_CFType())]);

        let mut pixel_buffer: CVPixelBufferRef = std::ptr::null_mut();
        let status = unsafe {
            CVPixelBufferCreate(
                std::ptr::null(),
                width as usize,
                height as usize,
                K_CV_PIXEL_FORMAT_TYPE_420YP_CB_CR8_BI_PLANAR_VIDEO_RANGE,
                attributes.as_concrete_TypeRef() as CFTypeRef,
                &mut pixel_buffer,
            )
        };
        assert_eq!(status, 0, "CVPixelBufferCreate must succeed");
        assert!(!pixel_buffer.is_null());

        let lock_status = unsafe { CVPixelBufferLockBaseAddress(pixel_buffer, 0) };
        assert_eq!(lock_status, 0);

        unsafe {
            let y_base = CVPixelBufferGetBaseAddressOfPlane(pixel_buffer, 0) as *mut u8;
            let y_stride = CVPixelBufferGetBytesPerRowOfPlane(pixel_buffer, 0);
            for row in 0..height {
                for col in 0..width {
                    let offset = row as usize * y_stride + col as usize;
                    *y_base.add(offset) = y_at(row, col);
                }
            }

            let cbcr_base = CVPixelBufferGetBaseAddressOfPlane(pixel_buffer, 1) as *mut u8;
            let cbcr_stride = CVPixelBufferGetBytesPerRowOfPlane(pixel_buffer, 1);
            let chroma_width = width / 2;
            let chroma_height = height / 2;
            for row in 0..chroma_height {
                for col in 0..chroma_width {
                    let (cb, cr) = cbcr_at(row, col);
                    let offset = row as usize * cbcr_stride + col as usize * 2;
                    *cbcr_base.add(offset) = cb;
                    *cbcr_base.add(offset + 1) = cr;
                }
            }
        }

        unsafe { CVPixelBufferUnlockBaseAddress(pixel_buffer, 0) };

        let surface_ref = unsafe { CVPixelBufferGetIOSurface(pixel_buffer) };
        assert!(!surface_ref.is_null(), "must be IOSurface-backed");
        let surface_id = unsafe { IOSurfaceGetID(surface_ref) };

        Self {
            pixel_buffer,
            surface_id,
            width,
            height,
        }
    }
}

// ---------------------------------------------------------------------
// Metal texture-from-IOSurface import (ported from
// native-wgpu-renderer/src/nv12/import.rs), adapted to wgpu = "24.0.5".
// ---------------------------------------------------------------------

trait IOSurfaceTextureExt {
    unsafe fn uxfd_new_texture_from_iosurface(
        &self,
        descriptor: &metal::TextureDescriptorRef,
        surface: IOSurfaceRef,
        plane: u64,
    ) -> metal::Texture;
}

impl IOSurfaceTextureExt for metal::DeviceRef {
    unsafe fn uxfd_new_texture_from_iosurface(
        &self,
        descriptor: &metal::TextureDescriptorRef,
        surface: IOSurfaceRef,
        plane: u64,
    ) -> metal::Texture {
        msg_send![self, newTextureWithDescriptor: descriptor iosurface: surface plane: plane]
    }
}

fn plane_texture_descriptor(
    pixel_format: metal::MTLPixelFormat,
    width: u64,
    height: u64,
) -> metal::TextureDescriptor {
    let descriptor = metal::TextureDescriptor::new();
    descriptor.set_texture_type(metal::MTLTextureType::D2);
    descriptor.set_pixel_format(pixel_format);
    descriptor.set_width(width);
    descriptor.set_height(height);
    descriptor.set_mipmap_level_count(1);
    descriptor.set_storage_mode(metal::MTLStorageMode::Shared);
    descriptor.set_usage(metal::MTLTextureUsage::ShaderRead);
    descriptor
}

/// Imports the Y (R8Unorm) and CbCr (RG8Unorm) planes of `surface_id` as
/// zero-copy `wgpu::Texture`s. This is the H1 spike: same API shape as
/// production `import_nv12_iosurface_textures`, ported line-for-line to
/// wgpu 24's `as_hal`/`create_texture_from_hal`/`texture_from_raw`.
pub fn import_nv12_iosurface_textures(
    device: &wgpu::Device,
    surface_id: u32,
    width: u32,
    height: u32,
) -> Result<(wgpu::Texture, wgpu::Texture), String> {
    let surface_ref: IOSurfaceRef = unsafe { IOSurfaceLookup(surface_id) };
    if surface_ref.is_null() {
        return Err(format!("IOSurfaceLookup failed for id {surface_id}"));
    }

    let chroma_width = (width / 2).max(1);
    let chroma_height = (height / 2).max(1);

    let metal_textures = unsafe {
        device.as_hal::<wgpu::hal::api::Metal, _, _>(|hal_device| {
            hal_device.map(|hal_device| {
                let metal_device = hal_device.raw_device().lock();
                objc::rc::autoreleasepool(|| {
                    let y_descriptor = plane_texture_descriptor(
                        metal::MTLPixelFormat::R8Unorm,
                        width as u64,
                        height as u64,
                    );
                    let cbcr_descriptor = plane_texture_descriptor(
                        metal::MTLPixelFormat::RG8Unorm,
                        chroma_width as u64,
                        chroma_height as u64,
                    );
                    let y_texture = metal_device.uxfd_new_texture_from_iosurface(
                        &y_descriptor,
                        surface_ref,
                        0,
                    );
                    let cbcr_texture = metal_device.uxfd_new_texture_from_iosurface(
                        &cbcr_descriptor,
                        surface_ref,
                        1,
                    );
                    (y_texture, cbcr_texture)
                })
            })
        })
    };

    unsafe { CFRelease(surface_ref) };

    // wgpu 24 API DIFFERENCE vs wgpu 0.20.1 (see notes/h1-hal-import-path.md):
    // `wgpu::Device::as_hal` returned `Option<R>` in wgpu 0.20.1 (an outer
    // `Option` from downcasting the context to `ContextWgpuCore`, wrapping
    // the callback's own `Option` from `hal_device_callback(None)`), so
    // production code called `metal_textures.flatten()` on an
    // `Option<Option<(Texture, Texture)>>`. In wgpu 24.0.5, `as_hal` returns
    // `R` directly (the wgpu-core downcast is now infallible/always present
    // in this build, or the crate just stopped wrapping it) -- so
    // `metal_textures` here is already `Option<(Texture, Texture)>` and
    // `.flatten()` no longer type-checks (E0599: `Option<(Texture, Texture)>`
    // is not an iterator). Only `metal_textures` itself (no `.flatten()`)
    // is needed.
    let Some((y_metal_texture, cbcr_metal_texture)) = metal_textures else {
        return Err("as_hal returned None: Metal backend not selected".to_string());
    };

    let y_hal_texture = unsafe {
        wgpu::hal::metal::Device::texture_from_raw(
            y_metal_texture,
            wgpu::TextureFormat::R8Unorm,
            metal::MTLTextureType::D2,
            1,
            1,
            wgpu::hal::CopyExtent {
                width,
                height,
                depth: 1,
            },
        )
    };
    let cbcr_hal_texture = unsafe {
        wgpu::hal::metal::Device::texture_from_raw(
            cbcr_metal_texture,
            wgpu::TextureFormat::Rg8Unorm,
            metal::MTLTextureType::D2,
            1,
            1,
            wgpu::hal::CopyExtent {
                width: chroma_width,
                height: chroma_height,
                depth: 1,
            },
        )
    };

    let y_texture = unsafe {
        device.create_texture_from_hal::<wgpu::hal::api::Metal>(
            y_hal_texture,
            &wgpu::TextureDescriptor {
                label: Some("spike nv12 y plane texture"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::R8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            },
        )
    };
    let cbcr_texture = unsafe {
        device.create_texture_from_hal::<wgpu::hal::api::Metal>(
            cbcr_hal_texture,
            &wgpu::TextureDescriptor {
                label: Some("spike nv12 cbcr plane texture"),
                size: wgpu::Extent3d {
                    width: chroma_width,
                    height: chroma_height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rg8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            },
        )
    };

    Ok((y_texture, cbcr_texture))
}
