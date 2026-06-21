import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildProjectExportFrameSourcePlan,
  createSingleUseProjectExportFrameSourceCloser,
  formatProjectExportRustFrameSourceUnavailableDetail,
  hasProjectExportNativeRenderMediaObjects,
  resolveProjectExportRustFrameSourceContext,
  resolveProjectExportFrameSourcePolicyForEncode,
  resolveProjectExportFrameRuntimePlan,
  resolveProjectExportFrameCanvas,
  shouldSynchroniseTimelineForProjectExportFrame,
  type ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import type { AudioObject, AudioVisualizationObject, BarcodeObject, CircularArrowObject, ColourWheelObject, GearObject, GourdObject, HistogramObject, ImageObject, ParticleObject, PieChartObject, PsdObject, PuzzlePieceObject, ShapeObject, SunburstObject, TimelineObject, TrackBarObject, TriangleBracketObject, VideoObject } from '../types';

const source = () =>
  readFileSync(new URL('./projectExportFrameCanvas.ts', import.meta.url), 'utf8');

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'GoPro.mp4',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:video',
  filePath: '/tmp/GoPro.mp4',
  width: 1920,
  height: 1080,
  volume: 1,
  muted: false,
  ...patch,
});

const image = (patch: Partial<ImageObject> = {}): ImageObject => ({
  id: 'image-1',
  type: 'image',
  name: 'overlay.png',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:image',
  filePath: '/tmp/overlay.png',
  width: 1280,
  height: 720,
  ...patch,
});

const shape = (patch: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Rectangle',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  shapeType: 'rect',
  width: 320,
  height: 180,
  fill: '#ff0000',
  ...patch,
});

const audio = (patch: Partial<AudioObject> = {}): AudioObject => ({
  id: 'audio-1',
  type: 'audio',
  name: 'music.wav',
  layer: 2,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:audio',
  filePath: '/tmp/music.wav',
  volume: 1,
  muted: false,
  ...patch,
});

const audioVisualisation = (patch: Partial<AudioVisualizationObject> = {}): AudioVisualizationObject => ({
  id: 'waveform-1',
  type: 'audio_visualization',
  name: 'Audio waveform',
  layer: 3,
  startTime: 0,
  duration: 5,
  x: 640,
  y: 540,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 640,
  endY: 540,
  easing: 'linear',
  targetAudioId: 'audio-1',
  visualizationType: 'waveform',
  color: '#00ff88',
  thickness: 2,
  width: 640,
  height: 160,
  amplitude: 1,
  ...patch,
});

const psd = (patch: Partial<PsdObject> = {}): PsdObject => ({
  id: 'psd-1',
  type: 'psd',
  name: 'standing.psd',
  layer: 1,
  startTime: 0,
  duration: 5,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  src: 'blob:psd',
  filePath: '/tmp/standing.psd',
  width: 512,
  height: 768,
  scale: 1,
  activeLayerIds: {},
  ...patch,
});

const particle = (patch: Partial<ParticleObject> = {}): ParticleObject => ({
  id: 'particle-1',
  type: 'particle',
  name: '標準パーティクル',
  layer: 3,
  startTime: 0,
  duration: 5,
  x: 960,
  y: 540,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 960,
  endY: 540,
  easing: 'linear',
  width: 640,
  height: 360,
  particleCount: 32,
  seed: 93,
  spread: 180,
  speed: 120,
  size: 6,
  colour: '#ffffff',
  lifetimeSeconds: 1.5,
  ...patch,
});

const barcode = (patch: Partial<BarcodeObject> = {}): BarcodeObject => ({
  id: 'barcode-1',
  type: 'barcode',
  name: 'バーコードT',
  layer: 4,
  startTime: 0,
  duration: 5,
  x: 700,
  y: 450,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 700,
  endY: 450,
  easing: 'linear',
  width: 520,
  height: 180,
  data: 'AviUtl',
  minimumBarWidth: 2,
  horizontalMargin: 30,
  verticalMargin: 20,
  foregroundColour: '#000000',
  backgroundColour: '#ffffff',
  ...patch,
});

const puzzlePiece = (patch: Partial<PuzzlePieceObject> = {}): PuzzlePieceObject => ({
  id: 'puzzle-1',
  type: 'puzzle_piece',
  name: 'パズルピース',
  layer: 5,
  startTime: 0,
  duration: 5,
  x: 840,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 840,
  endY: 420,
  easing: 'linear',
  width: 240,
  height: 240,
  size: 120,
  shapeVariant: 1,
  connectorMode: 'convex',
  fillColour: '#ffffff',
  ...patch,
});

const colourWheel = (patch: Partial<ColourWheelObject> = {}): ColourWheelObject => ({
  id: 'colour-wheel-1',
  type: 'colour_wheel',
  name: '色相環',
  layer: 6,
  startTime: 0,
  duration: 5,
  x: 840,
  y: 420,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 840,
  endY: 420,
  easing: 'linear',
  width: 240,
  height: 240,
  radius: 120,
  saturation: 100,
  brightness: 100,
  ringWidthPercent: 25,
  segmentCount: 24,
  ...patch,
});

const gourd = (patch: Partial<GourdObject> = {}): GourdObject => ({
  id: 'gourd-1',
  type: 'gourd',
  name: 'ひょうたんTM',
  layer: 7,
  startTime: 0,
  duration: 5,
  x: 760,
  y: 340,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 760,
  endY: 340,
  easing: 'linear',
  width: 400,
  height: 400,
  bodyRadius: 80,
  bodyWidth: 250,
  waistRadius: 10,
  squashPercent: 40,
  repeatCount: 1,
  fillColour: '#ffffff',
  ...patch,
});

const gear = (patch: Partial<GearObject> = {}): GearObject => ({
  id: 'gear-1',
  type: 'gear',
  name: '歯車',
  layer: 8,
  startTime: 0,
  duration: 5,
  x: 800,
  y: 380,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 800,
  endY: 380,
  easing: 'linear',
  width: 320,
  height: 320,
  outerRadius: 160,
  innerRadiusPercent: 45,
  toothCount: 20,
  toothDepthPercent: 18,
  toothSkewPercent: 0,
  fillColour: '#ffffff',
  ...patch,
});

const trackBar = (patch: Partial<TrackBarObject> = {}): TrackBarObject => ({
  id: 'track-bar-1',
  type: 'track_bar',
  name: 'カスタムトラックバー',
  layer: 9,
  startTime: 0,
  duration: 5,
  x: 780,
  y: 480,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 780,
  endY: 480,
  easing: 'linear',
  width: 360,
  height: 120,
  trackValues: [0, 25, 50, -50],
  trackRanges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
  labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
  barColour: '#ffffff',
  backgroundOpacity: 0.05,
  ...patch,
});

const pieChart = (patch: Partial<PieChartObject> = {}): PieChartObject => ({
  id: 'pie-chart-1',
  type: 'pie_chart',
  name: 'パイシートグラフ',
  layer: 10,
  startTime: 0,
  duration: 5,
  x: 760,
  y: 340,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 760,
  endY: 340,
  easing: 'linear',
  width: 400,
  height: 400,
  values: [10, 20, 30, 40],
  sortMode: 'descending',
  normaliseToHundred: true,
  labelMode: 'percentage',
  progressPercent: 100,
  strokeWidth: 20,
  sliceColours: ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'],
  ...patch,
});

const histogram = (patch: Partial<HistogramObject> = {}): HistogramObject => ({
  id: 'histogram-1',
  type: 'histogram',
  name: '簡易ヒストグラム',
  layer: 11,
  startTime: 0,
  duration: 5,
  x: 832,
  y: 440,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 832,
  endY: 440,
  easing: 'linear',
  width: 256,
  height: 200,
  binValues: [0.08, 0.18, 0.32, 0.55, 0.78, 0.92, 0.64, 0.36],
  heightScalePercent: 100,
  lineWidth: 1,
  showLuminance: true,
  showRed: true,
  showGreen: true,
  showBlue: true,
  channelColours: ['#ffffff', '#ff4b4b', '#4bff6a', '#4b8cff'],
  backgroundColour: '#000000',
  ...patch,
});

const sunburst = (patch: Partial<SunburstObject> = {}): SunburstObject => ({
  id: 'sunburst-1',
  type: 'sunburst',
  name: '日の出',
  layer: 12,
  startTime: 0,
  duration: 5,
  x: 560,
  y: 315,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 560,
  endY: 315,
  easing: 'linear',
  width: 800,
  height: 450,
  rayCount: 10,
  rayCoveragePercent: 50,
  rotationOffsetDegrees: 0,
  centreXPercent: 50,
  centreYPercent: 50,
  motifSize: 200,
  motifShape: 'circle',
  rayColour: '#ff0000',
  backgroundColour: '#ffff00',
  ...patch,
});

const circularArrow = (patch: Partial<CircularArrowObject> = {}): CircularArrowObject => ({
  id: 'circular-arrow-1',
  type: 'circular_arrow',
  name: '円矢印',
  layer: 13,
  startTime: 0,
  duration: 5,
  x: 860,
  y: 440,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 860,
  endY: 440,
  easing: 'linear',
  width: 200,
  height: 200,
  radius: 100,
  lineWidth: 20,
  headSize: 50,
  angleDegrees: 260,
  centreAngleDegrees: 0,
  headShape: 'triangle',
  showTailHead: false,
  flipVertical: false,
  flipHorizontal: false,
  arrowColour: '#ffff00',
  ...patch,
});

const triangleBracket = (patch: Partial<TriangleBracketObject> = {}): TriangleBracketObject => ({
  id: 'triangle-bracket-1',
  type: 'triangle_bracket',
  name: '三角括弧',
  layer: 14,
  startTime: 0,
  duration: 5,
  x: 880,
  y: 490,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 880,
  endY: 490,
  easing: 'linear',
  width: 160,
  height: 100,
  bracketWidth: 100,
  angleDegrees: 120,
  armLength: 50,
  offsetDistance: 0,
  bracketColour: '#ffffff',
  ...patch,
});

describe('resolveProjectExportFrameCanvas', () => {
  it('uses the explicit export canvas without requiring a legacy canvas', () => {
    const sharedRendererCanvas = { id: 'shared-renderer-export' } as unknown as HTMLCanvasElement;

    expect(resolveProjectExportFrameCanvas({
      getExportCanvas: () => sharedRendererCanvas,
      legacyCanvas: null,
    })).toEqual({
      ok: true,
      canvas: sharedRendererCanvas,
      source: 'explicitExportCanvas',
    });
  });

  it('falls back to the legacy canvas while export is still migrating', () => {
    const legacyCanvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;

    expect(resolveProjectExportFrameCanvas({
      legacyCanvas,
    })).toEqual({
      ok: true,
      canvas: legacyCanvas,
      source: 'legacyCanvas',
    });
  });

  it('fails loud when no export frame canvas is available', () => {
    expect(resolveProjectExportFrameCanvas({
      getExportCanvas: () => null,
      legacyCanvas: null,
    })).toEqual({
      ok: false,
      reason: 'exportCanvasUnavailable',
      detail: 'Export requires a frame canvas from the shared renderer export path or the legacy canvas fallback.',
    });
  });
});

describe('buildProjectExportFrameSourcePlan', () => {
  const rustFrameSource: ProjectExportRustFrameSource = {
    renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
  };

  it('requires the video-object sentinel at the planning type boundary', () => {
    const code = source();

    expect(code).toContain('hasVideoObjects: boolean');
    expect(code).not.toContain('hasVideoObjects?: boolean');
    expect(code).not.toContain('hasVideoObjects = false');
  });

  it('uses the shared renderer Rust frame source before legacy canvas capture', () => {
    const legacyCanvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource,
      legacyCanvas,
      hasVideoObjects: false,
    })).toEqual({
      ok: true,
      source: 'sharedRendererRustFrameSource',
      frameSource: rustFrameSource,
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      rustFrameSourceBlockedFallback: 'legacyCanvas',
    });
  });

  it('fails video exports instead of restoring legacy canvas after the Rust frame source is blocked', () => {
    const directEncodeFrameSource: ProjectExportRustFrameSource = {
      renderEncodeFrame: async () => ({
        timestamp: 0,
        sharedFramePayload: {
          sessionId: 'session-video',
          frameIndex: 0,
          timestampUs: 0,
          slotCount: 1,
          frame: {
            descriptor: {
              memoryId: '/uxfd-video-export',
              slotIndex: 0,
              generation: 1,
              byteOffset: 0,
              byteLen: 16,
              width: 1,
              height: 1,
              strideBytes: 256,
              format: 'rgba8Srgb',
              colour: {
                primaries: 'bt709',
                transfer: 'srgb',
                matrix: 'rgb',
                range: 'full',
              },
            },
            ptsFrame: 0,
          },
        },
      }),
    };
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource: directEncodeFrameSource,
      hasVideoObjects: true,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');
    if (plan.source !== 'sharedRendererRustFrameSource') throw new Error('expected shared renderer Rust export source plan');

    expect(plan.rustFrameSourceBlockedFallback).toBe('failExport');
    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: true,
    })).toEqual({
      source: 'sharedRendererRustFrameSourceBlocked',
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: true,
    });
  });

  it('refuses bitmap-only Rust frame sources for video exports', () => {
    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource,
      hasVideoObjects: true,
    })).toEqual({
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Video export requires a shared-frame Rust export source.',
    });
  });

  it('falls back to the explicit export canvas while the Rust frame source is unavailable', () => {
    const exportCanvas = { id: 'shared-renderer-export-canvas' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      getExportCanvas: () => exportCanvas,
      hasVideoObjects: false,
    })).toEqual({
      ok: true,
      source: 'explicitExportCanvas',
      canvas: exportCanvas,
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
    });
  });

  it('refuses legacy canvas capture when the Rust frame source is required', () => {
    const legacyCanvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      legacyCanvas,
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceUnavailableDetail: 'Shared renderer surface requires a parallelCompare plan.',
      hasVideoObjects: false,
    })).toEqual({
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Rust-only export requires a shared renderer Rust frame source. Shared renderer surface requires a parallelCompare plan.',
    });
  });

  it('explains that native-render media exports require a Rust frame source before legacy canvas capture', () => {
    const legacyCanvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      legacyCanvas,
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceUnavailableDetail: 'Shared renderer surface requires a parallelCompare plan.',
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
    })).toEqual({
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Image/PSD export requires a shared renderer Rust frame source. Shared renderer surface requires a parallelCompare plan.',
    });
  });

  it('refuses legacy canvas capture for video exports even when the caller omits the Rust-required policy', () => {
    const legacyCanvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      legacyCanvas,
      rustFrameSourceUnavailableDetail: 'Shared renderer surface requires a parallelCompare plan.',
      hasVideoObjects: true,
    })).toEqual({
      ok: false,
      reason: 'rustFrameSourceRequired',
      detail: 'Video export requires a shared renderer Rust frame source. Shared renderer surface requires a parallelCompare plan.',
    });
  });

  it('falls back to the legacy canvas only as legacy export capture', () => {
    const legacyCanvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;

    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      legacyCanvas,
      hasVideoObjects: false,
    })).toEqual({
      ok: true,
      source: 'legacyCanvas',
      canvas: legacyCanvas,
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
    });
  });

  it('fails loud when no export frame source is available', () => {
    expect(buildProjectExportFrameSourcePlan({
      rustFrameSource: null,
      getExportCanvas: () => null,
      legacyCanvas: null,
      hasVideoObjects: false,
    })).toEqual({
      ok: false,
      reason: 'exportFrameSourceUnavailable',
      detail: 'Export requires a Rust frame source, shared renderer export canvas, or legacy canvas.',
    });
  });
});

describe('projectExportFrameCanvas browser video boundary', () => {
  it('does not expose Pixi-specific canvas API names from the export frame source boundary', () => {
    const code = source();

    expect(code).not.toContain('pixiCanvas');
    expect(code).not.toContain("'pixiCanvas'");
  });

  it('does not expose legacy browser video pause helpers', () => {
    const code = source();

    expect(code).not.toContain('pauseLegacyBrowserVideosForExport');
    expect(code).not.toContain('ProjectExportBrowserVideoElement');
    expect(code).not.toContain("Pick<HTMLVideoElement, 'pause'>");
    expect(code).not.toContain('requiresLegacyBrowserVideoProviders');
    expect(code).not.toContain('requiresHtmlVideoElementSeekFallback');
  });
});

describe('resolveProjectExportFrameSourcePolicyForEncode', () => {
  it('does not expose rustVideoOnly as an export frame source policy input', () => {
    expect(source()).not.toContain('rustVideoOnly');
  });

  it('requires a Rust frame source whenever the Rust backend encoder is selected', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      hasVideoObjects: false,
      encodeEngine: 'rustBackendVideoEncoder',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

  it('keeps legacy canvas fallback only for the WebCodecs compatibility encoder', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      hasVideoObjects: false,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'allowLegacyCanvas',
      rustFrameSourceBlockedFallback: 'legacyCanvas',
    });
  });

  it('requires a Rust frame source for video exports even when the WebCodecs compatibility encoder is selected', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      hasVideoObjects: true,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

  it('requires a Rust frame source for native-render media exports even when the WebCodecs compatibility encoder is selected', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: false,
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

  it('requires a Rust frame source when Rust-only export is enabled', () => {
    expect(resolveProjectExportFrameSourcePolicyForEncode({
      rustExportOnly: true,
      hasVideoObjects: false,
      encodeEngine: 'webCodecsMp4Muxer',
    })).toEqual({
      rustFrameSourcePolicy: 'requireRustFrameSource',
      rustFrameSourceBlockedFallback: 'failExport',
    });
  });

});

describe('formatProjectExportRustFrameSourceUnavailableDetail', () => {
  it('formats fallback reason and blocked native render envelope detail for export failures', () => {
    expect(formatProjectExportRustFrameSourceUnavailableDetail({
      reason: 'exportSessionBlocked',
      detail: 'Shared renderer surface requires a parallelCompare plan.',
      nativeRenderEnvelope: {
        ok: false,
        reason: 'surfaceGateUnavailable',
        detail: 'Shared renderer surface requires a parallelCompare plan.',
      },
    })).toBe(
      'Shared renderer surface requires a parallelCompare plan. [fallback=exportSessionBlocked; nativeRenderEnvelope=surfaceGateUnavailable: Shared renderer surface requires a parallelCompare plan.]'
    );
  });

  it('formats ready native render envelope media counts when the fallback carries preflight context', () => {
    expect(formatProjectExportRustFrameSourceUnavailableDetail({
      reason: 'exportSessionBlocked',
      detail: 'Native render source handoff failed.',
      nativeRenderEnvelope: {
        ok: true,
        mediaCount: 2,
        mediaKinds: ['Video', 'Psd'],
        sourceCount: 1,
        sourceMediaIds: ['video-1'],
      },
    })).toBe(
      'Native render source handoff failed. [fallback=exportSessionBlocked; nativeRenderEnvelope=ready media=2 kinds=Video,Psd sources=1 sourceMediaIds=video-1]'
    );
  });
});

describe('resolveProjectExportRustFrameSourceContext', () => {
  it('requests encode-only Rust frame sources for video exports regardless of the compatibility encoder hint', () => {
    const objects: TimelineObject[] = [video()];
    const presentedFrameSharedFrameTaker = async () => null;

    expect(resolveProjectExportRustFrameSourceContext({
      objects,
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker,
    })).toEqual({
      objects,
      hasVideoObjects: true,
      hasNativeRenderMediaObjects: true,
      time: 0,
      preferEncodeOnly: true,
      presentedFrameSharedFrameTaker,
    });
  });

  it('keeps bitmap-capable Rust frame sources for non-video compatibility exports', () => {
    expect(resolveProjectExportRustFrameSourceContext({
      objects: [],
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects: [],
      hasVideoObjects: false,
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });

  it('marks image and PSD exports as native-render media even for compatibility exports', () => {
    expect(resolveProjectExportRustFrameSourceContext({
      objects: [image(), psd()],
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects: [image(), psd()],
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });

  it('marks shape image and audio MVP exports as native-render media while leaving audio out of visual media detection', () => {
    const objects: TimelineObject[] = [shape(), image(), audio()];

    expect(resolveProjectExportRustFrameSourceContext({
      objects,
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects,
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });

  it('marks shape-only MVP exports as native-render media instead of legacy canvas work', () => {
    const objects: TimelineObject[] = [shape(), audio()];

    expect(resolveProjectExportRustFrameSourceContext({
      objects,
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects,
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });

  it('marks standard particle exports as native-render media instead of legacy canvas work', () => {
    const objects: TimelineObject[] = [particle(), barcode(), puzzlePiece(), colourWheel(), gourd(), gear(), trackBar(), pieChart(), histogram(), sunburst(), circularArrow(), triangleBracket(), audio()];

    expect(hasProjectExportNativeRenderMediaObjects(objects)).toBe(true);
    expect(resolveProjectExportRustFrameSourceContext({
      objects,
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects,
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });

  it('marks audio visualisation exports as native-render visual media while plain audio stays non-visual', () => {
    const objects: TimelineObject[] = [audio(), audioVisualisation()];

    expect(hasProjectExportNativeRenderMediaObjects([audio()])).toBe(false);
    expect(hasProjectExportNativeRenderMediaObjects(objects)).toBe(true);
    expect(resolveProjectExportRustFrameSourceContext({
      objects,
      time: 0,
      encodeEngine: 'webCodecsMp4Muxer',
      presentedFrameSharedFrameTaker: undefined,
    })).toEqual({
      objects,
      hasVideoObjects: false,
      hasNativeRenderMediaObjects: true,
      time: 0,
      preferEncodeOnly: false,
      presentedFrameSharedFrameTaker: undefined,
    });
  });
});

describe('resolveProjectExportFrameRuntimePlan', () => {
  const rustFrameSource: ProjectExportRustFrameSource = {
    renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
  };

  it('keeps browser video side effects disabled while the Rust frame source is active', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
      hasVideoObjects: false,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: false,
    })).toEqual({
      source: 'sharedRendererRustFrameSource',
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: false,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });

  it('enables only legacy canvas capture after the Rust frame source is blocked', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
      hasVideoObjects: false,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: true,
    })).toEqual({
      source: 'legacyCanvasAfterRustBlocked',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });

  it('fails the export instead of restoring legacy canvas after a required Rust frame source is blocked', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
      rustFrameSourceBlockedFallback: 'failExport',
      hasVideoObjects: false,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: true,
    })).toEqual({
      source: 'sharedRendererRustFrameSourceBlocked',
      captureCanvas: false,
      requiresRenderScene: false,
      usesExportFrameOverrides: false,
      shouldCloseRustFrameSource: true,
      shouldFailOnRustFrameSourceBlocked: true,
    });
  });

  it('keeps canvas fallback side effects enabled for legacy frame sources', () => {
    const canvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;
    const plan = buildProjectExportFrameSourcePlan({
      legacyCanvas: canvas,
      hasVideoObjects: false,
    });
    if (!plan.ok) throw new Error('expected canvas export source plan');

    expect(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: false,
    })).toEqual({
      source: 'legacyCanvas',
      captureCanvas: true,
      requiresRenderScene: true,
      usesExportFrameOverrides: true,
      shouldCloseRustFrameSource: false,
      shouldFailOnRustFrameSourceBlocked: false,
    });
  });
});

describe('shouldSynchroniseTimelineForProjectExportFrame', () => {
  const rustFrameSource: ProjectExportRustFrameSource = {
    renderFrame: async () => ({ close: () => undefined }) as ImageBitmap,
  };
  const directEncodeRustFrameSource: ProjectExportRustFrameSource = {
    renderEncodeFrame: async (request) => ({
      timestamp: request.timestampUs,
      sharedFramePayload: {} as never,
    }),
  };

  it('keeps timeline time updates disabled while Rust owns the export frame', () => {
    const plan = buildProjectExportFrameSourcePlan({
      rustFrameSource: directEncodeRustFrameSource,
      hasVideoObjects: true,
    });
    if (!plan.ok) throw new Error('expected Rust export source plan');

    expect(shouldSynchroniseTimelineForProjectExportFrame(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: plan,
      rustFrameSourceBlocked: false,
    }))).toBe(false);
  });

  it('synchronises timeline time only when legacy canvas rendering is required', () => {
    const canvas = { id: 'legacy-export' } as unknown as HTMLCanvasElement;
    const legacyPlan = buildProjectExportFrameSourcePlan({
      legacyCanvas: canvas,
      hasVideoObjects: false,
    });
    if (!legacyPlan.ok) throw new Error('expected legacy export source plan');

    const rustPlan = buildProjectExportFrameSourcePlan({
      rustFrameSource,
      hasVideoObjects: false,
    });
    if (!rustPlan.ok) throw new Error('expected Rust export source plan');

    expect(shouldSynchroniseTimelineForProjectExportFrame(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: legacyPlan,
      rustFrameSourceBlocked: false,
    }))).toBe(true);
    expect(shouldSynchroniseTimelineForProjectExportFrame(resolveProjectExportFrameRuntimePlan({
      frameSourcePlan: rustPlan,
      rustFrameSourceBlocked: true,
    }))).toBe(true);
  });
});

describe('createSingleUseProjectExportFrameSourceCloser', () => {
  it('closes a Rust export frame source only once across blocked and final cleanup paths', async () => {
    const calls: string[] = [];
    const closeFrameSource = createSingleUseProjectExportFrameSourceCloser({
      close: async () => {
        calls.push('close');
      },
    });

    await closeFrameSource();
    await closeFrameSource();

    expect(calls).toEqual(['close']);
  });
});
