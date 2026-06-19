import { describe, expect, it } from 'vitest';
import type { RustBackendNativeRenderSharedFrameResult } from './rustBackendNativeRenderControl';
import type { RustBackendVideoFrameDescriptor } from './rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
import { buildSharedRendererPresentationContract } from './sharedRendererPresentationContract';
import { prepareSharedRendererViewportNativeRenderUpload } from './sharedRendererViewportNativeRenderUpload';

const descriptor: RustBackendVideoFrameDescriptor = {
  memoryId: '/uxfd-preview-native-render-24',
  slotIndex: 0,
  generation: 1,
  byteOffset: 0,
  byteLen: 1024,
  width: 4,
  height: 4,
  strideBytes: 256,
  format: 'rgba8Srgb',
  colour: {
    primaries: 'bt709',
    transfer: 'srgb',
    matrix: 'rgb',
    range: 'full',
  },
};

const mediaOnlySession: SharedRendererPreviewSession = {
  plan: {
    mode: 'parallelCompare',
    primary: 'pixi',
    candidate: 'sharedRenderer',
    snapshot: {
      frame_index: 24,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'shape-1',
        track_id: 'layer-0',
        media_id: 'shape-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'nearest',
        },
        opacity: 1,
        effects: [],
      }],
    },
    media: [{
      id: 'shape-1',
      kind: 'SolidColour',
      source: '#ff0000',
      width: 4,
      height: 4,
    }],
  },
  surfaceGate: {
    ok: true,
    canvas: { width: 4, height: 4 },
    snapshot: {
      frame_index: 24,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'shape-1',
        track_id: 'layer-0',
        media_id: 'shape-1',
        source_frame: 0,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'nearest',
        },
        opacity: 1,
        effects: [],
      }],
    },
    media: [{
      id: 'shape-1',
      kind: 'SolidColour',
      source: '#ff0000',
      width: 4,
      height: 4,
    }],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const buildPsdOnlySession = (): SharedRendererPreviewSession => {
  if (mediaOnlySession.plan.mode !== 'parallelCompare' || !mediaOnlySession.surfaceGate.ok) {
    throw new Error('mediaOnlySession fixture must be renderable');
  }

  const psdMedia = [{
    id: 'psd-1',
    kind: 'Psd' as const,
    source: '/tmp/standing.psd',
    width: 4,
    height: 4,
  }];
  const psdSnapshot = {
    ...mediaOnlySession.plan.snapshot,
    clips: mediaOnlySession.plan.snapshot.clips.map((clip) => ({
      ...clip,
      clip_id: 'psd-1',
      media_id: 'psd-1',
    })),
  };

  return {
    ...mediaOnlySession,
    plan: {
      mode: 'parallelCompare',
      primary: 'pixi',
      candidate: 'sharedRenderer',
      snapshot: psdSnapshot,
      media: psdMedia,
    },
    surfaceGate: {
      ...mediaOnlySession.surfaceGate,
      snapshot: psdSnapshot,
      media: psdMedia,
    },
  };
};

const psdOnlySession = buildPsdOnlySession();

const buildVideoWithRemotePsdSession = (): SharedRendererPreviewSession => {
  if (!mediaOnlySession.surfaceGate.ok) {
    throw new Error('mediaOnlySession fixture must be renderable');
  }

  const snapshot = {
    ...mediaOnlySession.surfaceGate.snapshot,
    clips: [{
      ...mediaOnlySession.surfaceGate.snapshot.clips[0],
      clip_id: 'video-1',
      media_id: 'video-1',
      source_frame: 24,
      z_index: 0,
      transform: {
        ...mediaOnlySession.surfaceGate.snapshot.clips[0].transform,
        sampling: 'bilinear' as const,
      },
    }, {
      ...mediaOnlySession.surfaceGate.snapshot.clips[0],
      clip_id: 'remote-psd-1',
      media_id: 'remote-psd-1',
      z_index: 1,
      transform: {
        ...mediaOnlySession.surfaceGate.snapshot.clips[0].transform,
        sampling: 'bilinear' as const,
      },
    }],
  };
  const media = [{
    id: 'video-1',
    kind: 'Video' as const,
    source: '/tmp/video.mp4',
    width: 4,
    height: 4,
    source_rate: { numerator: 60, denominator: 1 },
  }, {
    id: 'remote-psd-1',
    kind: 'Psd' as const,
    source: 'https://example.invalid/standing.psd',
    width: 4,
    height: 4,
  }];

  return {
    ...mediaOnlySession,
    plan: {
      mode: 'parallelCompare',
      primary: 'pixi',
      candidate: 'sharedRenderer',
      snapshot,
      media,
    },
    surfaceGate: {
      ...mediaOnlySession.surfaceGate,
      snapshot,
      media,
    },
  };
};

const videoWithRemotePsdSession = buildVideoWithRemotePsdSession();

const renderResult: RustBackendNativeRenderSharedFrameResult = {
  rendered: true,
  renderId: 'preview-native-render-24',
  memoryId: descriptor.memoryId,
  slotCount: 1,
  slotByteLen: descriptor.byteLen,
  frame: {
    descriptor,
    ptsFrame: 24,
  },
};

describe('prepareSharedRendererViewportNativeRenderUpload', () => {
  it('renders a media-only scene natively, copies the output frame, and releases the native render output after GPU upload', async () => {
    const calls: unknown[] = [];

    const result = await prepareSharedRendererViewportNativeRenderUpload({
      session: mediaOnlySession,
      requestId: 24,
      activeJobs: [],
      prepareNativeRenderSources: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'no video',
        activeJobs: [],
      }),
      renderNativeSharedFrame: async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: true,
          result: renderResult,
        };
      },
      releaseNativeSharedFrame: async (payload) => {
        calls.push(['releaseNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            released: true,
            memoryId: payload.memoryId,
          },
        };
      },
      copyBridge: {
        copyIntoUploadBuffer: async (payload, target) => {
          calls.push(['copyIntoUploadBuffer', payload]);
          target.fill(0x7e);
          return {
            success: true,
            result: {
              sequence: 24,
              slotIndex: descriptor.slotIndex,
              generation: descriptor.generation,
              byteLen: descriptor.byteLen,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      activeJobs: [],
      upload: {
        descriptor,
        ptsFrame: 24,
      },
    });
    if (!result.ok) throw new Error('expected native render upload to succeed');
    expect(result.upload.rgbaBytes[0]).toBe(0x7e);
    await result.upload.releaseAfterGpuUpload?.();
    expect(calls).toEqual([
      ['renderNativeSharedFrame', {
        renderId: 'preview-native-render-24',
        memoryId: '/uxfd-preview-native-render-24',
        slotCount: 1,
        ptsFrame: 24,
        width: 4,
        height: 4,
        snapshot: mediaOnlySession.surfaceGate.ok ? mediaOnlySession.surfaceGate.snapshot : null,
        media: mediaOnlySession.surfaceGate.ok ? mediaOnlySession.surfaceGate.media : null,
        sources: [],
      }],
      ['copyIntoUploadBuffer', {
        memoryId: descriptor.memoryId,
        slotCount: 1,
        slotByteLen: descriptor.byteLen,
        slotIndex: descriptor.slotIndex,
        generation: descriptor.generation,
        ptsFrame: 24,
      }],
      ['releaseNativeSharedFrame', {
        memoryId: descriptor.memoryId,
      }],
    ]);
  });

  it('releases a native render preview output at most once even if both upload callbacks run', async () => {
    const calls: unknown[] = [];

    const result = await prepareSharedRendererViewportNativeRenderUpload({
      session: mediaOnlySession,
      requestId: 25,
      activeJobs: [],
      prepareNativeRenderSources: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'no video',
        activeJobs: [],
      }),
      renderNativeSharedFrame: async () => ({
        success: true,
        result: {
          ...renderResult,
          renderId: 'preview-native-render-25',
          frame: {
            descriptor: {
              ...descriptor,
              memoryId: '/uxfd-preview-native-render-25',
            },
            ptsFrame: 25,
          },
        },
      }),
      releaseNativeSharedFrame: async (payload) => {
        calls.push(['releaseNativeSharedFrame', payload]);
        return {
          success: true,
          result: {
            released: true,
            memoryId: payload.memoryId,
          },
        };
      },
      copyBridge: {
        copyIntoUploadBuffer: async (_payload, target) => {
          target.fill(0x7e);
          return {
            success: true,
            result: {
              sequence: 25,
              slotIndex: descriptor.slotIndex,
              generation: descriptor.generation,
              byteLen: descriptor.byteLen,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
    });

    if (!result.ok) throw new Error('expected native render upload to succeed');
    await result.upload.releaseAfterGpuUpload?.();
    await result.upload.releaseAfterUploadAbort?.();
    await result.upload.releaseAfterGpuUpload?.();

    expect(calls).toEqual([
      ['releaseNativeSharedFrame', {
        memoryId: '/uxfd-preview-native-render-25',
      }],
    ]);
  });

  it('allows a PSD-only scene to use Rust native render media sources instead of Pixi fallback', async () => {
    const calls: unknown[] = [];

    const result = await prepareSharedRendererViewportNativeRenderUpload({
      session: psdOnlySession,
      requestId: 24,
      activeJobs: [],
      prepareNativeRenderSources: async () => ({
        ok: false,
        reason: 'noVideoDecodeRequest',
        detail: 'no video',
        activeJobs: [],
      }),
      renderNativeSharedFrame: async (payload) => {
        calls.push(['renderNativeSharedFrame', payload]);
        return {
          success: true,
          result: renderResult,
        };
      },
      releaseNativeSharedFrame: async () => ({ success: true }),
      copyBridge: {
        copyIntoUploadBuffer: async () => ({
          success: true,
          result: {
            sequence: 24,
            slotIndex: descriptor.slotIndex,
            generation: descriptor.generation,
            byteLen: descriptor.byteLen,
            expectedChecksum: 0x1234,
            actualChecksum: 0x1234,
          },
        }),
      },
    });

    expect(result).toMatchObject({
      ok: true,
      activeJobs: [],
    });
    expect(calls).toEqual([
      ['renderNativeSharedFrame', {
        renderId: 'preview-native-render-24',
        memoryId: '/uxfd-preview-native-render-24',
        slotCount: 1,
        ptsFrame: 24,
        width: 4,
        height: 4,
        snapshot: psdOnlySession.surfaceGate.ok ? psdOnlySession.surfaceGate.snapshot : null,
        media: psdOnlySession.surfaceGate.ok ? psdOnlySession.surfaceGate.media : null,
        sources: [],
      }],
    ]);
  });

  it('releases preview native render video sources after native output upload preparation succeeds', async () => {
    const calls: unknown[] = [];
    const videoOnlySession = buildVideoWithRemotePsdSession();
    if (!videoOnlySession.surfaceGate.ok) {
      throw new Error('videoOnlySession fixture must be renderable');
    }
    const session: SharedRendererPreviewSession = {
      ...videoOnlySession,
      plan: {
        mode: 'parallelCompare',
        primary: 'pixi',
        candidate: 'sharedRenderer',
        snapshot: {
          ...videoOnlySession.surfaceGate.snapshot,
          clips: [videoOnlySession.surfaceGate.snapshot.clips[0]],
        },
        media: [videoOnlySession.surfaceGate.media[0]],
      },
      surfaceGate: {
        ...videoOnlySession.surfaceGate,
        snapshot: {
          ...videoOnlySession.surfaceGate.snapshot,
          clips: [videoOnlySession.surfaceGate.snapshot.clips[0]],
        },
        media: [videoOnlySession.surfaceGate.media[0]],
      },
    };

    const result = await prepareSharedRendererViewportNativeRenderUpload({
      session,
      requestId: 26,
      activeJobs: [],
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: {
            descriptor,
            ptsFrame: 26,
          },
          releaseAfterNativeRenderComplete: async () => {
            calls.push(['releaseAfterNativeRenderComplete']);
          },
          releaseAfterNativeRenderAbort: async () => {
            calls.push(['releaseAfterNativeRenderAbort']);
          },
        }],
      }),
      renderNativeSharedFrame: async (payload) => {
        calls.push(['renderNativeSharedFrame', payload.sources]);
        return {
          success: true,
          result: {
            ...renderResult,
            renderId: 'preview-native-render-26',
            frame: {
              descriptor: {
                ...descriptor,
                memoryId: '/uxfd-preview-native-render-26',
              },
              ptsFrame: 26,
            },
          },
        };
      },
      releaseNativeSharedFrame: async () => ({ success: true }),
      copyBridge: {
        copyIntoUploadBuffer: async (_payload, target) => {
          target.fill(0x7e);
          return {
            success: true,
            result: {
              sequence: 26,
              slotIndex: descriptor.slotIndex,
              generation: descriptor.generation,
              byteLen: descriptor.byteLen,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([
      ['renderNativeSharedFrame', [{
        mediaId: 'video-1',
        slotCount: 2,
        frame: {
          descriptor,
          ptsFrame: 26,
        },
      }]],
      ['releaseAfterNativeRenderComplete'],
    ]);
  });

  it('blocks preview native render before consuming video sources without release callbacks', async () => {
    const calls: unknown[] = [];
    const videoOnlySession = buildVideoWithRemotePsdSession();
    if (!videoOnlySession.surfaceGate.ok) {
      throw new Error('videoOnlySession fixture must be renderable');
    }
    const session: SharedRendererPreviewSession = {
      ...videoOnlySession,
      plan: {
        mode: 'parallelCompare',
        primary: 'pixi',
        candidate: 'sharedRenderer',
        snapshot: {
          ...videoOnlySession.surfaceGate.snapshot,
          clips: [videoOnlySession.surfaceGate.snapshot.clips[0]],
        },
        media: [videoOnlySession.surfaceGate.media[0]],
      },
      surfaceGate: {
        ...videoOnlySession.surfaceGate,
        snapshot: {
          ...videoOnlySession.surfaceGate.snapshot,
          clips: [videoOnlySession.surfaceGate.snapshot.clips[0]],
        },
        media: [videoOnlySession.surfaceGate.media[0]],
      },
    };

    const result = await prepareSharedRendererViewportNativeRenderUpload({
      session,
      requestId: 27,
      activeJobs: [],
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: {
            descriptor,
            ptsFrame: 27,
          },
        }],
      }),
      renderNativeSharedFrame: async () => {
        calls.push(['renderNativeSharedFrame']);
        throw new Error('Rust native render must not consume a decoded source without release ownership.');
      },
      releaseNativeSharedFrame: async () => ({ success: true }),
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          calls.push(['copyIntoUploadBuffer']);
          return {
            success: true,
            result: {
              sequence: 27,
              slotIndex: descriptor.slotIndex,
              generation: descriptor.generation,
              byteLen: descriptor.byteLen,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'nativeRenderSourceReleaseUnavailable',
      detail: "Rust native render source 'video-1' is missing decoded frame release callbacks.",
      activeJobs: [],
    });
    expect(calls).toEqual([]);
  });

  it('blocks mixed video preview before native render when an overlay media source is unsupported', async () => {
    const calls: unknown[] = [];

    const result = await prepareSharedRendererViewportNativeRenderUpload({
      session: videoWithRemotePsdSession,
      requestId: 24,
      activeJobs: [],
      prepareNativeRenderSources: async () => ({
        ok: true,
        activeJobs: [],
        sources: [{
          mediaId: 'video-1',
          slotCount: 2,
          frame: {
            descriptor,
            ptsFrame: 24,
          },
          releaseAfterNativeRenderComplete: async () => {
            calls.push(['releaseAfterNativeRenderComplete']);
          },
          releaseAfterNativeRenderAbort: async () => {
            calls.push(['releaseAfterNativeRenderAbort']);
          },
        }],
      }),
      renderNativeSharedFrame: async () => {
        calls.push(['renderNativeSharedFrame']);
        throw new Error('Rust native render must not receive unsupported remote PSD media.');
      },
      releaseNativeSharedFrame: async () => ({ success: true }),
      copyBridge: {
        copyIntoUploadBuffer: async () => {
          calls.push(['copyIntoUploadBuffer']);
          return {
            success: true,
            result: {
              sequence: 24,
              slotIndex: descriptor.slotIndex,
              generation: descriptor.generation,
              byteLen: descriptor.byteLen,
              expectedChecksum: 0x1234,
              actualChecksum: 0x1234,
            },
          };
        },
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'nativeRenderUnsupportedMedia',
      detail: "Rust native render does not support Psd media 'remote-psd-1' from 'https://example.invalid/standing.psd'.",
      activeJobs: [],
    });
    expect(calls).toEqual([
      ['releaseAfterNativeRenderAbort'],
    ]);
  });
});
