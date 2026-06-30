import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('native overlay napi crate boundary', () => {
  it('defines a napi-rs cdylib crate for the Electron main process', () => {
    expect(existsSync(resolve(root, 'native-overlay/Cargo.toml'))).toBe(true);
    const cargoToml = read('native-overlay/Cargo.toml');

    expect(cargoToml).toContain('name = "uxfd-native-overlay"');
    expect(cargoToml).toContain('crate-type = ["cdylib"]');
    expect(cargoToml).toContain('napi = ');
    expect(cargoToml).toContain('napi-derive = ');
    expect(cargoToml).toContain('napi-build = ');
  });

  it('exports attach, detach, and capability functions through napi', () => {
    const lib = read('native-overlay/src/lib.rs');

    expect(lib).toContain('#[napi(js_name = "attachNativeOverlay")]');
    expect(lib).toContain('#[napi(js_name = "detachNativeOverlay")]');
    expect(lib).toContain('#[napi(js_name = "getNativeOverlayCapabilities")]');
    expect(lib).toContain('std::panic::catch_unwind');
  });

  it('keeps macOS support behind cfg while non-macOS returns an explicit fallback capability', () => {
    const lib = read('native-overlay/src/lib.rs');

    expect(lib).toContain('#[cfg(target_os = "macos")]');
    expect(lib).toContain('#[cfg(not(target_os = "macos"))]');
    expect(lib).toContain('available: false');
  });

  it('keeps AppKit and CAMetalLayer code isolated in a macOS overlay module', () => {
    const cargoToml = read('native-overlay/Cargo.toml');
    const lib = read('native-overlay/src/lib.rs');

    expect(cargoToml).toContain('objc = ');
    expect(cargoToml).toContain('metal = ');
    expect(cargoToml).toContain('core-graphics-types = ');
    expect(lib).toContain('mod macos_overlay;');
    expect(lib).toContain('macos_overlay::attach_overlay_view');
    expect(existsSync(resolve(root, 'native-overlay/src/macos_overlay.rs'))).toBe(true);
    const macosOverlay = read('native-overlay/src/macos_overlay.rs');
    expect(macosOverlay).toContain('CAMetalLayer');
    expect(macosOverlay).toContain('isMainThread');
    expect(macosOverlay).toContain('setWantsLayer');
    expect(macosOverlay).toContain('setPixelFormat');
    expect(macosOverlay).toContain('setDrawableSize');
    expect(macosOverlay).toContain('addSubview');
    expect(macosOverlay).toContain('present_fixed_colour');
    expect(macosOverlay).toContain('next_drawable');
    expect(macosOverlay).toContain('set_clear_color');
    expect(macosOverlay).toContain('present_drawable');
    expect(macosOverlay).toContain('contract.view_width');
    expect(macosOverlay).toContain('contract.drawable_width');
  });

  it('depends on wgpu, raw-window-handle, and native-wgpu-renderer for live CAMetalLayer presentation', () => {
    const cargoToml = read('native-overlay/Cargo.toml');

    expect(cargoToml).toContain('wgpu = ');
    expect(cargoToml).toContain('raw-window-handle = ');
    expect(cargoToml).toContain('uxfd-native-wgpu-renderer = { path = "../native-wgpu-renderer" }');
  });

  it('stores a live wgpu surface renderer from attach and presents shared frames through it', () => {
    const lib = read('native-overlay/src/lib.rs');
    const macosOverlay = read('native-overlay/src/macos_overlay.rs');

    expect(lib).toContain('NativeOverlayLiveSurfaceRenderer');
    expect(lib).toContain('LIVE_OVERLAY_RENDERERS');
    expect(lib).toContain('attach_live_overlay_surface_renderer');
    expect(lib).toContain('present_overlay_shared_frame_to_live_surface');
    expect(lib).not.toContain('match present_overlay_shared_frame_for_test(request)');
    expect(macosOverlay).toContain('overlay_layer_handle');
    expect(macosOverlay).toContain('create_surface_target_from_ca_metal_layer');
  });

  it('uses the native-wgpu-renderer scene pipeline for live surface presentation', () => {
    const nativeWgpuRenderer = read('native-wgpu-renderer/src/lib.rs');
    const lib = read('native-overlay/src/lib.rs');

    expect(nativeWgpuRenderer).toContain('pub struct NativeWgpuLiveSurfaceRenderer');
    expect(nativeWgpuRenderer).toContain('present_scene_to_surface_texture');
    expect(nativeWgpuRenderer).toContain('create_pipeline_for_format');
    expect(nativeWgpuRenderer).toContain('SurfaceTargetUnsafe::CoreAnimationLayer');
    expect(lib).toContain('NativeWgpuLiveSurfaceRenderer');
    expect(lib).toContain('present_scene_to_surface_texture');
    expect(lib).not.toContain('sample_upload_clear_colour');
  });

  it('exposes a live surface readback path for end-to-end overlay parity', () => {
    const nativeWgpuRenderer = read('native-wgpu-renderer/src/lib.rs');

    expect(nativeWgpuRenderer).toContain('present_scene_to_surface_texture_with_readback');
    expect(nativeWgpuRenderer).toContain('wgpu::TextureUsages::COPY_SRC');
    expect(nativeWgpuRenderer).toContain('copy_live_surface_texture_to_readback');
    expect(nativeWgpuRenderer).toContain('readback_to_rgba8');
  });

  it('keeps the wgpu instance alive for live CAMetalLayer adapter selection', () => {
    const nativeWgpuRenderer = read('native-wgpu-renderer/src/lib.rs');

    expect(nativeWgpuRenderer).toContain('instance: wgpu::Instance');
    expect(nativeWgpuRenderer).toContain('Self::from_surface(instance, surface, width, height).await');
    expect(nativeWgpuRenderer).toContain('instance.request_adapter(&wgpu::RequestAdapterOptions');
    expect(nativeWgpuRenderer).not.toContain('pub async fn from_surface(\n        surface: wgpu::Surface');
  });

  it('accepts scene snapshots and image media in the live overlay shared-frame payload', () => {
    const lib = read('native-overlay/src/lib.rs');

    expect(lib).toContain('pub snapshot: Option<NativeOverlaySceneSnapshotPayload>');
    expect(lib).toContain('pub media: Option<Vec<NativeOverlaySceneMediaPayload>>');
    expect(lib).toContain('pub struct NativeOverlaySceneSnapshotPayload');
    expect(lib).toContain('pub struct NativeOverlaySceneMediaPayload');
    expect(lib).toContain('scene_present_request_from_payload');
    expect(lib).toContain('load_overlay_image_sources_for_scene');
    expect(lib).toContain('NativeOverlaySceneSource');
    expect(lib).toContain('upload_frame_to_scene_sources');
    expect(lib).not.toContain('upload_frame_to_single_clip_scene');
  });

  it('removes an existing AppKit overlay view before attaching a replacement', () => {
    const macosOverlay = read('native-overlay/src/macos_overlay.rs');

    expect(macosOverlay).toContain('NATIVE_OVERLAY_VIEW_IDENTIFIER');
    expect(macosOverlay).toContain('remove_existing_overlay_view(parent_view)?;');
    expect(macosOverlay).toContain('setIdentifier');
    expect(macosOverlay).toContain('removeFromSuperview');
  });

  it('uses the native window handle to remove the AppKit overlay during detach', () => {
    const lib = read('native-overlay/src/lib.rs');
    const macosOverlay = read('native-overlay/src/macos_overlay.rs');

    expect(lib).toContain('pub native_window_handle: Option<Buffer>');
    expect(lib).toContain('macos_overlay::detach_overlay_view(&native_window_handle)');
    expect(macosOverlay).toContain('pub fn detach_overlay_view');
    expect(macosOverlay).toContain('remove_existing_overlay_view(parent_view)?;');
  });

  it('provides build and smoke-test scripts for the native overlay addon', () => {
    expect(existsSync(resolve(root, 'scripts/build-native-overlay-addon.mjs'))).toBe(true);
    expect(existsSync(resolve(root, 'scripts/test-native-overlay-addon.mjs'))).toBe(true);

    expect(read('scripts/build-native-overlay-addon.mjs')).toContain('native-overlay.node');
    const smokeScript = read('scripts/test-native-overlay-addon.mjs');
    expect(smokeScript).toContain('attachNativeOverlay');
    expect(smokeScript).toContain('UXFD_NATIVE_OVERLAY_SMOKE_ATTACH');
    expect(smokeScript).not.toContain('Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])');
  });
});
