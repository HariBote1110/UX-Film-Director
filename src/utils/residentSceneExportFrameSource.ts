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
  prepareDynamicSources,
}: CreateResidentSceneExportFrameSourceInput): ProjectExportRustFrameSource => ({
  async renderEncodeFrame(request) {
    const dynamicSources = await prepareDynamicSources?.(request) ?? {};
    return {
      timestamp: request.timestampUs,
      residentSceneEncodeFramePayload: writeResidentSceneEncodeFramePayload({
        request,
        sceneId,
        revision,
        dynamicSources,
      }),
      releaseResidentSceneSourcesAfterWrite: {
        releaseAfterEncodeSuccess: dynamicSources.releaseAfterEncodeSuccess,
        releaseAfterEncodeFailure: dynamicSources.releaseAfterEncodeFailure,
      },
    };
  },
});
