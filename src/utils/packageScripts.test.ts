import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('package scripts', () => {
  it('provides a cross-platform Rust video preview/export dev command', () => {
    expect(packageJson.scripts['dev:rust-video']).toBe('node scripts/dev-rust-video.mjs');

    const script = readFileSync(new URL('../../scripts/dev-rust-video.mjs', import.meta.url), 'utf8');
    expect(script).toContain('VITE_UXFD_SHARED_RENDERER_PREVIEW');
    expect(script).toContain('VITE_UXFD_SHARED_RENDERER_EXPORT');
    expect(script).toContain('VITE_UXFD_RUST_EXPORT_ONLY');
    expect(script).toContain('VITE_UXFD_RUST_VIDEO_ONLY');
    expect(script).toContain('node_modules/vite/bin/vite.js');
    expect(script).toContain('scripts/build-shared-video-frame-node-addon.mjs');
    expect(script.indexOf('scripts/build-shared-video-frame-node-addon.mjs'))
      .toBeLessThan(script.indexOf('node_modules/vite/bin/vite.js'));
  });

  it('provides a Native Overlay opt-in dev command that builds the addon before Vite', () => {
    expect(packageJson.scripts['dev:native-overlay']).toBe('node scripts/dev-native-overlay.mjs');

    const script = readFileSync(new URL('../../scripts/dev-native-overlay.mjs', import.meta.url), 'utf8');
    expect(script).toContain('scripts/build-native-overlay-addon.mjs');
    expect(script).toContain('scripts/build-shared-video-frame-node-addon.mjs');
    expect(script).toContain('VITE_UXFD_NATIVE_OVERLAY');
    expect(script).toContain('UXFD_NATIVE_OVERLAY');
    expect(script).toContain('VITE_UXFD_SHARED_RENDERER_PREVIEW');
    expect(script).toContain('VITE_UXFD_RUST_VIDEO_ONLY');
    expect(script).toContain('node_modules/vite/bin/vite.js');
    expect(script.indexOf('scripts/build-native-overlay-addon.mjs'))
      .toBeLessThan(script.indexOf('node_modules/vite/bin/vite.js'));
  });

  it('records real video export E2E duration separately from Electron startup time', () => {
    expect(packageJson.scripts['test:video-export:e2e']).toBe('node scripts/run-video-export-e2e.mjs');

    const script = readFileSync(new URL('../../scripts/run-video-export-e2e.mjs', import.meta.url), 'utf8');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_DURATION_SECONDS');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_USER_DATA_DIR');
    expect(script).toContain('--user-data-dir=');
    expect(script).toContain('exportDurationMs');
    expect(script).toContain('exportFramesPerSecond');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_ADD_MIXED_MEDIA');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_ADD_PSD');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_REPEAT_EXPORTS');
    expect(script).toContain('UXFD_VIDEO_EXPORT_E2E_EXPECT_REPEAT_SPEEDUP');
    expect(script).toContain('mixedMediaResult');
    expect(script).toContain('psdMediaResult');
    expect(script).toContain('aviUtlGeneratedEffectsResult');
    expect(script).toContain('exportAttempts');
    expect(script).toContain('__UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__');
    expect(script).toContain('__UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__');
    expect(script).toContain('mixedMediaDurationResult');
    expect(script).toContain('expectedFrameCount');
    expect(script).toContain('frameCountMatchesDuration');
    expect(script).toContain('exportUsedDirectTranscode');
    expect(script).toContain('const runtimeErrors = collectRuntimeErrors(client)');
    expect(script).toContain('runtimeErrors.length === 0');
    expect(script).toContain('inspectExportedGeneratedEffectsFrame');
    expect(script).toContain('generatedEffectsFrameInspection');
    expect(script).toContain('generatedEffectsFrameInspection?.ok !== false');
    expect(script).toContain('GetColor V2R ドットフィールド');
    expect(script).toContain('hksyチェッカー/グリッド');
    expect(script).toContain('93 SpotLight Probe');
    expect(script).toContain('93音声玉');
    expect(script).toContain('#00ff88');
    expect(script).toContain('#ffffff');
    expect(script).toContain('getColorCyanPixelCount');
    expect(script).toContain('hksyDarkCellPixelCount');
    expect(script).toContain('spotLightWarmPixelCount');
    expect(script).toContain('audioSphereCyanPixelCount');
    expect(script.indexOf('const runtimeErrors = collectRuntimeErrors(client)'))
      .toBeLessThan(script.indexOf('const result = {'));
    expect(script.indexOf('const exportStartTimeMs = Date.now()'))
      .toBeLessThan(script.indexOf('exportDurationMs'));
  });

  it('keeps mixed-media video export E2E duration controlled by the renderer hook', () => {
    const main = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8');
    expect(main).toContain('__UXFD_VIDEO_EXPORT_E2E_SET_ALL_OBJECT_DURATIONS__');
    expect(main).toContain('__UXFD_VIDEO_EXPORT_E2E_ADD_AVIUTL_GENERATED_EFFECTS__');
    expect(main).toContain('GetColor V2R ドットフィールド');
    expect(main).toContain('hksyチェッカー/グリッド');
    expect(main).toContain('93 SpotLight Probe');
    expect(main).toContain('93音声玉');
    expect(main).toContain('E2E_AVIUTL_GETCOLOR_REGION');
    expect(main).toContain('E2E_AVIUTL_HKSY_REGION');
    expect(main).toContain('E2E_AVIUTL_SPOTLIGHT_REGION');
    expect(main).toContain('E2E_AVIUTL_AUDIO_SPHERE_REGION');
    expect(main).toContain('spot_light');
    expect(main).toContain('state.objects.forEach');
    expect(main).toContain('state.setDuration(safeDuration)');
  });

  it('waits for the Electron bundle before launching the video export E2E window', () => {
    const script = readFileSync(new URL('../../scripts/run-video-export-e2e.mjs', import.meta.url), 'utf8');

    expect(script).toContain('waitForElectronBundle');
    expect(script).toContain('dist-electron/main.js');
    expect(script).toContain('dist-electron/preload.js');
    expect(script.indexOf('await waitForElectronBundle()'))
      .toBeLessThan(script.indexOf('Electron 起動: remote-debugging-port='));
  });

  it('provides a real video export quality comparison command', () => {
    expect(packageJson.scripts['test:video-export:quality']).toBe('node scripts/compare-video-export-quality.mjs');

    const script = readFileSync(new URL('../../scripts/compare-video-export-quality.mjs', import.meta.url), 'utf8');
    expect(script).toContain('run-video-export-e2e.mjs');
    expect(script).toContain('psnr=');
    expect(script).toContain('ssim=');
    expect(script).toContain('libvmaf');
    expect(script).toContain('quality-report.json');
  });

  it('provides an all-readable-media Rust boundary E2E command', () => {
    expect(packageJson.scripts['test:all-readable-media:e2e'])
      .toBe('vitest run --config vite.config.ts src/e2e/allReadableMedia.e2e.test.ts');
  });
});
