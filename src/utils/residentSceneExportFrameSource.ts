import type {
  ProjectExportRustEncodeFrameRequest,
  ProjectExportRustFrameSource,
} from './projectExportFrameCanvas';
import type {
  RustBackendNativeRenderAudioWaveform,
  RustBackendNativeRenderSharedFrameSource,
} from './rustBackendNativeRenderControl';

export interface ResidentSceneExportDynamicSources {
  sources?: readonly RustBackendNativeRenderSharedFrameSource[];
  audioWaveforms?: readonly RustBackendNativeRenderAudioWaveform[];
  releaseAfterEncodeSuccess?: () => Promise<void>;
  releaseAfterEncodeFailure?: () => Promise<void>;
}

export interface CreateResidentSceneExportFrameSourceInput {
  sceneId: string;
  revision: number;
  confirmedScene?: Promise<{ sceneId: string; revision: number }>;
  prepareDynamicSources?: (
    request: ProjectExportRustEncodeFrameRequest
  ) => Promise<ResidentSceneExportDynamicSources>;
}

const writeResidentSceneEncodeFramePayload = ({
  request,
  sceneId,
  revision,
  dynamicSources,
}: {
  request: ProjectExportRustEncodeFrameRequest;
  sceneId: string;
  revision: number;
  dynamicSources: ResidentSceneExportDynamicSources;
}) => ({
  sessionId: request.encodeSessionId,
  sceneId,
  revision,
  frameIndex: request.frameIndex,
  ...(dynamicSources.sources ? { sources: dynamicSources.sources } : {}),
  ...(dynamicSources.audioWaveforms
    ? { audioWaveforms: dynamicSources.audioWaveforms }
    : {}),
});

export const createResidentSceneExportFrameSource = ({
  sceneId,
  revision,
  confirmedScene,
  prepareDynamicSources,
}: CreateResidentSceneExportFrameSourceInput): ProjectExportRustFrameSource => ({
  encodeTarget: 'iosurfaceVideoToolbox',
  async renderEncodeFrame(request) {
    const confirmed = await confirmedScene;
    const dynamicSources = await prepareDynamicSources?.(request) ?? {};
    return {
      timestamp: request.timestampUs,
      residentSceneEncodeFramePayload: writeResidentSceneEncodeFramePayload({
        request,
        sceneId: confirmed?.sceneId ?? sceneId,
        revision: confirmed?.revision ?? revision,
        dynamicSources,
      }),
      releaseResidentSceneSourcesAfterWrite: {
        releaseAfterEncodeSuccess: dynamicSources.releaseAfterEncodeSuccess,
        releaseAfterEncodeFailure: dynamicSources.releaseAfterEncodeFailure,
      },
    };
  },
});
