import { describe, expect, it } from 'vitest';
import type { RustBackendNativeRenderSharedFrameResult } from './rustBackendNativeRenderControl';
import type { RustBackendVideoFrameDescriptor } from './rustBackendVideoDecodeControl';
import type { SharedRendererPreviewSession } from './sharedRendererPreviewSession';
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
  presentationContract: {
    colourSpace: 'srgb',
    alphaMode: 'premultiplied',
    textureFormat: 'rgba8unorm-srgb',
    fallbackAdapterAllowed: false,
  },
};

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
        ptsFrame: 24,
      }],
      ['releaseNativeSharedFrame', {
        memoryId: descriptor.memoryId,
      }],
    ]);
  });
});
