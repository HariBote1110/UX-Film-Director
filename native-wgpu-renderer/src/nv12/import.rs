//! macOS(Metal) 専用: IOSurface のゼロコピー import。
//!
//! `wgpu::Device::as_hal::<wgpu::hal::api::Metal, _, _>` で内部の
//! `metal::Device`（metal-rs、wgpu-hal と同一バージョン 0.28）を取得し、
//! `-[MTLDevice newTextureWithDescriptor:iosurface:plane:]` を
//! （metal-rs には無いため）`objc::msg_send!` で直接呼び出して plane 0
//! （Y, R8Unorm）と plane 1（CbCr, RG8Unorm interleaved half-res）の
//! `metal::Texture` を作る。CPU 側のピクセルコピーは一切発生しない。
//!
//! できあがった `metal::Texture` は
//! `wgpu_hal::metal::Device::texture_from_raw` で hal レイヤーの
//! `Texture` に包み、さらに `wgpu::Device::create_texture_from_hal` で
//! 通常の `wgpu::Texture` に昇格させる。以降は既存の RGBA パイプラインと
//! 同じ `wgpu::TextureView`/bind group の扱いができる。
//!
//! `objc` 0.2.7 の `sel_impl!` マクロ展開が存在しない `cargo-clippy` cfg
//! 値を参照するため誤検知の warning が出る（upstream 側の実装によるもの
//! で、このクレートの問題ではない）。モジュール全体で抑制する。
#![allow(unexpected_cfgs)]

use objc::{msg_send, sel, sel_impl};

use crate::NativeWgpuRenderError;

use super::sys::{self, IOSurfaceRef};
use super::Nv12IoSurfaceSource;

/// metal-rs 0.28 は IOSurface からのテクスチャ作成 API
/// (`newTextureWithDescriptor:iosurface:plane:`) を提供していないため、
/// `objc::msg_send!` で直接呼び出す拡張トレイト。`metal::DeviceRef` は
/// metal-rs 内部で `unsafe impl objc::Message` 済みなのでこれで安全に
/// メッセージ送信できる。
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
    // IOSurface 由来のテクスチャは Private ストレージを使えない
    // （バッキングストアが実メモリの IOSurface であるため）。Apple
    // Silicon には Managed が存在しないため、両アーキテクチャで有効な
    // Shared を使う。
    descriptor.set_storage_mode(metal::MTLStorageMode::Shared);
    descriptor.set_usage(metal::MTLTextureUsage::ShaderRead);
    descriptor
}

/// `source.surface_id` を `IOSurfaceLookup` で解決し、Y/CbCr の 2 枚の
/// `wgpu::Texture` をゼロコピーで import する。戻り値は
/// `(y_texture, cbcr_texture)`。
pub(crate) fn import_nv12_iosurface_textures(
    device: &wgpu::Device,
    source: &Nv12IoSurfaceSource,
) -> Result<(wgpu::Texture, wgpu::Texture), NativeWgpuRenderError> {
    let surface_ref: IOSurfaceRef = unsafe { sys::IOSurfaceLookup(source.surface_id) };
    if surface_ref.is_null() {
        return Err(NativeWgpuRenderError::Nv12SurfaceLookupFailed {
            surface_id: source.surface_id,
        });
    }

    let chroma_width = (source.width / 2).max(1);
    let chroma_height = (source.height / 2).max(1);

    // metal::Device のロックは 2 枚の plane テクスチャ生成が終わるまでの
    // 短時間のみ保持する（`objc::rc::autoreleasepool` で ObjC autorelease
    // プールも明示的に flush し、テクスチャ import を繰り返しても
    // autorelease オブジェクトが溜まらないようにする）。
    let metal_textures = unsafe {
        device.as_hal::<wgpu::hal::api::Metal, _, _>(|hal_device| {
            hal_device.map(|hal_device| {
                let metal_device = hal_device.raw_device().lock();
                objc::rc::autoreleasepool(|| {
                    let y_descriptor = plane_texture_descriptor(
                        metal::MTLPixelFormat::R8Unorm,
                        source.width as u64,
                        source.height as u64,
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

    // Metal は import 時に IOSurface を内部で保持するため、`IOSurfaceLookup`
    // で得た（create rule の）参照はここで解放してよい。
    unsafe { sys::CFRelease(surface_ref) };

    let Some((y_metal_texture, cbcr_metal_texture)) = metal_textures else {
        return Err(NativeWgpuRenderError::Nv12ImportUnsupportedPlatform);
    };

    let y_hal_texture = unsafe {
        wgpu::hal::metal::Device::texture_from_raw(
            y_metal_texture,
            wgpu::TextureFormat::R8Unorm,
            metal::MTLTextureType::D2,
            1,
            1,
            wgpu::hal::CopyExtent {
                width: source.width,
                height: source.height,
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
                label: Some("UXFD nv12 y plane texture"),
                size: wgpu::Extent3d {
                    width: source.width,
                    height: source.height,
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
                label: Some("UXFD nv12 cbcr plane texture"),
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
