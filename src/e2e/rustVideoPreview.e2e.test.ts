import { describe, expect, it, vi } from 'vitest';
import { buildSharedRendererPresentationContract } from '../utils/sharedRendererPresentationContract';
import {
  startSharedRendererViewportPresenter,
  type SharedRendererViewportNativeRenderUploadPreparer,
  type SharedRendererViewportPresenterStarter,
  type SharedRendererViewportVideoUploadsPreparer,
} from '../utils/sharedRendererViewportPresenterOrchestration';
import type {
  SharedRendererDecodedVideoFrameUpload,
  SharedRendererPreviewPresenterControl,
} from '../utils/sharedRendererPreviewPresenterController';
import type { SharedRendererPreviewSession } from '../utils/sharedRendererPreviewSession';
import type { SharedRendererViewportVideoDecodeJob } from '../utils/sharedRendererViewportVideoUpload';
import type { SharedVideoFrameCopyReport } from '../utils/sharedVideoFrameUploadBridge';

const videoJob: SharedRendererViewportVideoDecodeJob = {
  jobId: 'shared-renderer-video-gopro-1920x1080-60over1',
  source: '/tmp/gopro.mp4',
  slotCount: 2,
  width: 1920,
  height: 1080,
  sourceRate: {
    numerator: 60,
    denominator: 1,
  },
};

const videoUpload: SharedRendererDecodedVideoFrameUpload & {
  ok: true;
  copyReport: SharedVideoFrameCopyReport;
} = {
  ok: true,
  descriptor: {
    memoryId: '/uxfd-inline-preview',
    slotIndex: 0,
    generation: 1,
    byteOffset: 0,
    byteLen: 256 * 2,
    width: 32,
    height: 2,
    strideBytes: 256,
    format: 'rgba8Srgb',
    colour: {
      primaries: 'bt709',
      transfer: 'srgb',
      matrix: 'rgb',
      range: 'full',
    },
  },
  ptsFrame: 10,
  rgbaBytes: new Uint8Array(256 * 2),
  copyReport: {
    sequence: 10,
    slotIndex: 0,
    generation: 1,
    byteLen: 256 * 2,
    checksumAlgorithm: 'crc32',
    expectedChecksum: 0,
    actualChecksum: 0,
  },
};

const videoOnlySession: SharedRendererPreviewSession = {
  plan: {
    mode: 'sharedRenderer',
    snapshot: {
      frame_index: 10,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'gopro',
        track_id: 'layer-0',
        media_id: 'gopro',
        source_frame: 10,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 1,
        effects: [],
      }],
    },
    media: [{
      id: 'gopro',
      kind: 'Video',
      source: '/tmp/gopro.mp4',
      width: 1920,
      height: 1080,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }],
  },
  surfaceGate: {
    ok: true,
    canvas: {
      width: 1920,
      height: 1080,
    },
    snapshot: {
      frame_index: 10,
      colour: {
        profile: 'rec709-sdr',
        working_space: 'linear-light',
        alpha: 'premultiplied',
      },
      clips: [{
        clip_id: 'gopro',
        track_id: 'layer-0',
        media_id: 'gopro',
        source_frame: 10,
        z_index: 0,
        transform: {
          translation_x: 0,
          translation_y: 0,
          scale_x: 1,
          scale_y: 1,
          rotation_degrees: 0,
          sampling: 'bilinear',
        },
        opacity: 1,
        effects: [],
      }],
    },
    media: [{
      id: 'gopro',
      kind: 'Video',
      source: '/tmp/gopro.mp4',
      width: 1920,
      height: 1080,
      source_rate: {
        numerator: 60,
        denominator: 1,
      },
    }],
  },
  presentationContract: buildSharedRendererPresentationContract(),
};

const readyControl: SharedRendererPreviewPresenterControl = {
  ok: true,
  format: 'rgba8unorm-srgb',
  solidColourOwnership: {
    owner: 'pixi',
    reason: 'noSolidColourScene',
    solidColourObjectIds: [],
  },
  videoOwnership: {
    owner: 'sharedRenderer',
    reason: 'rustDecodedFrameUploadReady',
    videoObjectIds: ['gopro'],
  },
  imageOwnership: {
    owner: 'pixi',
    reason: 'noImageScene',
    imageObjectIds: [],
  },
  psdOwnership: {
    owner: 'pixi',
    reason: 'noPsdScene',
    psdObjectIds: [],
  },
  textOwnership: {
    owner: 'pixi',
    reason: 'noTextScene',
    textObjectIds: [],
  },
  generatedEffectObjectIds: [],
  dispose: vi.fn(),
};

describe('Rust video preview E2E', () => {
  it('keeps GoPro rust-only preview on the native render path without probing the video-upload fallback', async () => {
    const events: string[] = [];
    let presenterInput: unknown;
    const prepareNativeRenderUpload = vi.fn<SharedRendererViewportNativeRenderUploadPreparer>(async () => {
      events.push('nativeRenderUpload');
      return {
        ok: true,
        activeJobs: [videoJob],
        upload: videoUpload,
        diagnostics: {
          decodePaths: ['inprocess'],
          renderPath: 'webgpuSceneComposite',
          nv12ZeroCopyMediaIds: ['media-gopro'],
        },
      };
    });
    const prepareVideoUploads = vi.fn<SharedRendererViewportVideoUploadsPreparer>(async () => {
      events.push('rustVideoUpload');
      return {
        ok: true,
        activeJobs: [videoJob],
        uploads: [{
          request: {
            clipId: 'gopro',
            mediaId: 'gopro',
            source: '/tmp/gopro.mp4',
            sourceFrame: 10,
            timelineFrame: 10,
            width: 1920,
            height: 1080,
            sourceRate: {
              numerator: 60,
              denominator: 1,
            },
            format: 'rgba8Srgb',
            colour: 'rec709SrgbFullRange',
          },
          upload: videoUpload,
        }],
      };
    });
    const startPresenter: SharedRendererViewportPresenterStarter = async (input) => {
      events.push('presenterReady');
      presenterInput = input;
      return readyControl;
    };

    const result = await startSharedRendererViewportPresenter({
      canvas: {} as HTMLCanvasElement,
      session: videoOnlySession,
      datasets: [],
      diagnosticSwatchEnabled: false,
      videoCutoverEnabled: true,
      nativeRenderPreviewEnabled: true,
      preferNativeRenderUpload: true,
      requireSharedRendererVideo: true,
      activeVideoDecodeJob: null,
      activeVideoDecodeJobs: [],
      requestId: 10,
      prepareNativeRenderUpload,
      prepareVideoUploads,
      startPresenter,
    } as any);

    expect(events).toEqual(['nativeRenderUpload', 'presenterReady']);
    expect(prepareVideoUploads).not.toHaveBeenCalled();
    expect(result.control.ok).toBe(true);
    expect(result.nativeRenderUploadResult).toMatchObject({
      ok: true,
      activeJobs: [videoJob],
    });
    expect(result.videoUploadsResult).toBeUndefined();
    expect(presenterInput).toMatchObject({
      requireSharedRendererVideo: true,
      sharedRendererNativeRenderFailure: undefined,
      sharedRendererNativeRenderFrameUpload: {
        descriptor: videoUpload.descriptor,
        ptsFrame: 10,
      },
      sharedRendererDecodedVideoFrameUploads: undefined,
      sharedRendererVideoUploadFailure: undefined,
    });
  });
});
