#![cfg(target_os = "macos")]

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::{CFString, CFStringRef};
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::Arc;
use uxfd_golden_harness::RgbaFrame;
use uxfd_native_wgpu_renderer::{
    BgraIoSurfaceTarget, NativeGeneratedGpuSources, NativeShakingPolygonSource,
    NativeWgpuRenderError, NativeWgpuRenderer,
};
use uxfd_rust_core::{ColourPipeline, EvaluatedClip, SceneSnapshot, Transform};

type CVPixelBufferRef = *mut c_void;
type IOSurfaceRef = *mut c_void;
type CVReturn = i32;
type OSType = u32;

const K_CV_PIXEL_FORMAT_TYPE_32_BGRA: OSType = 0x4247_5241; // 'BGRA'

#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
    static kCVPixelBufferIOSurfacePropertiesKey: CFStringRef;
    fn CVPixelBufferCreate(
        allocator: CFTypeRef,
        width: usize,
        height: usize,
        pixel_format_type: OSType,
        pixel_buffer_attributes: CFTypeRef,
        pixel_buffer_out: *mut CVPixelBufferRef,
    ) -> CVReturn;
    fn CVPixelBufferRelease(buffer: CVPixelBufferRef);
    fn CVPixelBufferGetIOSurface(buffer: CVPixelBufferRef) -> IOSurfaceRef;
    fn CVPixelBufferLockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
    fn CVPixelBufferUnlockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> CVReturn;
    fn CVPixelBufferGetBaseAddress(buffer: CVPixelBufferRef) -> *mut c_void;
    fn CVPixelBufferGetBytesPerRow(buffer: CVPixelBufferRef) -> usize;
}

#[link(name = "IOSurface", kind = "framework")]
extern "C" {
    fn IOSurfaceGetID(surface: IOSurfaceRef) -> u32;
}

struct SyntheticBgraBuffer {
    pixel_buffer: CVPixelBufferRef,
    surface_id: u32,
    width: u32,
    height: u32,
}

impl Drop for SyntheticBgraBuffer {
    fn drop(&mut self) {
        unsafe { CVPixelBufferRelease(self.pixel_buffer) };
    }
}

impl SyntheticBgraBuffer {
    fn new(width: u32, height: u32) -> Self {
        let empty_properties: CFDictionary<CFString, CFType> =
            CFDictionary::from_CFType_pairs(&[]);
        let key =
            unsafe { CFString::wrap_under_get_rule(kCVPixelBufferIOSurfacePropertiesKey) };
        let attributes: CFDictionary<CFString, CFType> =
            CFDictionary::from_CFType_pairs(&[(key, empty_properties.as_CFType())]);

        let mut pixel_buffer = std::ptr::null_mut();
        let status = unsafe {
            CVPixelBufferCreate(
                std::ptr::null(),
                width as usize,
                height as usize,
                K_CV_PIXEL_FORMAT_TYPE_32_BGRA,
                attributes.as_concrete_TypeRef() as CFTypeRef,
                &mut pixel_buffer,
            )
        };
        assert_eq!(status, 0, "BGRA CVPixelBuffer creation must succeed");
        assert!(!pixel_buffer.is_null());

        let surface = unsafe { CVPixelBufferGetIOSurface(pixel_buffer) };
        assert!(!surface.is_null(), "pixel buffer must own an IOSurface");

        Self {
            pixel_buffer,
            surface_id: unsafe { IOSurfaceGetID(surface) },
            width,
            height,
        }
    }

    fn centre_bgra(&self) -> [u8; 4] {
        assert_eq!(unsafe { CVPixelBufferLockBaseAddress(self.pixel_buffer, 0) }, 0);
        let stride = unsafe { CVPixelBufferGetBytesPerRow(self.pixel_buffer) };
        let base = unsafe { CVPixelBufferGetBaseAddress(self.pixel_buffer) } as *const u8;
        let offset = self.height as usize / 2 * stride + self.width as usize / 2 * 4;
        let pixel = unsafe {
            [
                *base.add(offset),
                *base.add(offset + 1),
                *base.add(offset + 2),
                *base.add(offset + 3),
            ]
        };
        assert_eq!(
            unsafe { CVPixelBufferUnlockBaseAddress(self.pixel_buffer, 0) },
            0
        );
        pixel
    }
}

#[test]
fn renders_scene_directly_into_bgra_iosurface_without_readback() {
    let width = 32;
    let height = 32;
    let target = SyntheticBgraBuffer::new(width, height);
    let snapshot = SceneSnapshot {
        frame_index: 0,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "clip-red".to_string(),
            track_id: "track-1".to_string(),
            media_id: "solid-red".to_string(),
            source_frame: 0,
            z_index: 0,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };
    let sources = HashMap::from([(
        "solid-red".to_string(),
        Arc::new(
            RgbaFrame::from_rgba8(
                width,
                height,
                [255, 0, 0, 255].repeat((width * height) as usize),
            )
            .expect("valid solid frame"),
        ),
    )]);
    let renderer = match pollster::block_on(NativeWgpuRenderer::new(width, height)) {
        Ok(renderer) => renderer,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping BGRA IOSurface target test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native renderer setup failed: {error:?}"),
    };

    let report = pollster::block_on(renderer.render_frame_to_bgra_iosurface(
        &snapshot,
        &sources,
        &HashMap::new(),
        &HashMap::new(),
        BgraIoSurfaceTarget {
            surface_id: target.surface_id,
            width,
            height,
        },
    ))
    .expect("direct BGRA IOSurface render succeeds");

    assert_eq!(report.readback_encode, std::time::Duration::ZERO);
    assert_eq!(target.centre_bgra(), [0, 0, 255, 255]);
}

#[test]
fn renders_shaking_polygon_gpu_source_into_bgra_iosurface_without_cpu_rgba() {
    let width = 64;
    let height = 48;
    let target = SyntheticBgraBuffer::new(width, height);
    let snapshot = SceneSnapshot {
        frame_index: 1,
        colour: ColourPipeline::rec709_sdr_linear(),
        clips: vec![EvaluatedClip {
            clip_id: "shaking-polygon-clip".to_string(),
            track_id: "track-1".to_string(),
            media_id: "shaking-polygon-media".to_string(),
            source_frame: 1,
            z_index: 0,
            transform: Transform::identity(),
            opacity: 1.0,
            effects: Vec::new(),
        }],
    };
    let shaking_polygon_sources = HashMap::from([(
        "shaking-polygon-media".to_string(),
        NativeShakingPolygonSource {
            source: r##"{"width":360,"height":360,"lineWidth":3,"vertexCount":5,"fixedDiameter":36,"verticalDistortionPercent":10,"repeatCount":3,"repeatFrequency":2,"fill":true,"jitterRange":4,"jitterInterval":2,"stepped":false,"colour":"#ff8000","seed":93}"##.to_string(),
            width,
            height,
            source_frame: 1,
            config_revision: 14,
        },
    )]);
    let generated_sources = NativeGeneratedGpuSources {
        shaking_polygons: shaking_polygon_sources,
        ..NativeGeneratedGpuSources::default()
    };
    let renderer = match pollster::block_on(NativeWgpuRenderer::new(width, height)) {
        Ok(renderer) => renderer,
        Err(NativeWgpuRenderError::AdapterUnavailable) => {
            eprintln!("skipping GPU source BGRA IOSurface test: no GPU adapter available");
            return;
        }
        Err(error) => panic!("native renderer setup failed: {error:?}"),
    };

    let report = pollster::block_on(
        renderer.render_frame_to_bgra_iosurface_with_audio_waveforms(
            &snapshot,
            &HashMap::new(),
            &[],
            &generated_sources,
            &HashMap::new(),
            &HashMap::new(),
            BgraIoSurfaceTarget {
                surface_id: target.surface_id,
                width,
                height,
            },
        ),
    )
    .expect("GPU ShakingPolygon must render directly into the BGRA IOSurface");

    assert_eq!(report.readback_encode, std::time::Duration::ZERO);
    let [blue, green, red, alpha] = target.centre_bgra();
    assert!(red > 140, "centre red channel must be visible: {red}");
    assert!(green > 60, "centre green channel must be visible: {green}");
    assert!(
        red > green.saturating_add(50),
        "centre must preserve the orange source colour: red={red}, green={green}"
    );
    assert!(blue < 80, "centre blue channel must stay low: {blue}");
    assert!(alpha > 0, "centre alpha must be visible");
}
