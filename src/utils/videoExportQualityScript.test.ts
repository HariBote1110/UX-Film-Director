import { describe, expect, it } from 'vitest';

const qualityScriptUrl = new URL('../../scripts/compare-video-export-quality.mjs', import.meta.url).href;
const loadModule = () => import(qualityScriptUrl);

describe('video export quality comparison script', () => {
  it('builds the same centred reference geometry as the direct transcode fast path', async () => {
    const { buildReferenceGeometry } = await loadModule();

    expect(buildReferenceGeometry({
      outputWidth: 1920,
      outputHeight: 1080,
      objectX: -960,
      objectY: -540,
      objectWidth: 3840,
      objectHeight: 2160,
    })).toEqual({
      cropX: 960,
      cropY: 540,
      padX: 0,
      padY: 0,
      canvasWidth: 3840,
      canvasHeight: 2160,
    });
  });

  it('parses ffmpeg PSNR, SSIM, and VMAF aggregate metrics', async () => {
    const { parseQualityMetrics } = await loadModule();

    expect(parseQualityMetrics({
      psnrStderr: '[Parsed_psnr_8 @ 0x123] PSNR y:42.112 u:45.000 v:46.000 average:43.210 min:39.000 max:52.000',
      ssimStderr: '[Parsed_ssim_9 @ 0x123] SSIM Y:0.991000 (20.457) U:0.995000 (23.010) V:0.996000 (24.001) All:0.992500 (21.249)',
      vmafJsonText: '{"pooled_metrics":{"vmaf":{"mean":94.321}}}',
    })).toEqual({
      psnrAverage: 43.21,
      psnrMin: 39,
      ssimAll: 0.9925,
      vmafMean: 94.321,
    });
  });

  it('classifies good exports with thresholds that catch obvious quality loss', async () => {
    const { classifyQualityMetrics } = await loadModule();

    expect(classifyQualityMetrics({
      psnrAverage: 43.21,
      psnrMin: 39,
      ssimAll: 0.9925,
      vmafMean: 94.321,
    })).toMatchObject({
      passed: true,
    });
    expect(classifyQualityMetrics({
      psnrAverage: 28,
      psnrMin: 20,
      ssimAll: 0.91,
      vmafMean: 70,
    })).toMatchObject({
      passed: false,
    });
  });

  it('parses a comma-separated preset matrix for speed/quality/size comparison', async () => {
    const { parseQualityPresetMatrix } = await loadModule();

    expect(parseQualityPresetMatrix('compact,speed,balanced,quality')).toEqual([
      'compact',
      'speed',
      'balanced',
      'quality',
    ]);
    expect(parseQualityPresetMatrix('unknown,,balanced')).toEqual(['balanced']);
  });
});
