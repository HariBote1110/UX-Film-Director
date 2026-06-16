import type { RustSceneMediaReference } from './rustSceneSnapshot';

export type SharedRendererVideoMediaStatus = 'ready' | 'pending' | 'missingElement';

export interface SharedRendererVideoMediaEntry {
  id: string;
  status: SharedRendererVideoMediaStatus;
  readyState: number;
  currentTime: number;
  width: number;
  height: number;
}

export interface SharedRendererVideoMediaReadiness {
  readyCount: number;
  pendingCount: number;
  missingCount: number;
  videos: SharedRendererVideoMediaEntry[];
}

export interface SharedRendererVideoMediaReadinessInput {
  media: RustSceneMediaReference[];
  videoElements: Map<string, Pick<HTMLVideoElement, 'readyState' | 'videoWidth' | 'videoHeight' | 'currentTime'>>;
}

export const buildSharedRendererVideoMediaReadiness = ({
  media,
  videoElements,
}: SharedRendererVideoMediaReadinessInput): SharedRendererVideoMediaReadiness => {
  const videos = media
    .filter((reference) => reference.kind === 'Video')
    .map((reference): SharedRendererVideoMediaEntry => {
      const element = videoElements.get(reference.id);
      if (!element) {
        return {
          id: reference.id,
          status: 'missingElement',
          readyState: 0,
          currentTime: 0,
          width: reference.width,
          height: reference.height,
        };
      }

      const hasCurrentFrame = element.readyState >= 2 && element.videoWidth > 0 && element.videoHeight > 0;
      return {
        id: reference.id,
        status: hasCurrentFrame ? 'ready' : 'pending',
        readyState: element.readyState,
        currentTime: element.currentTime,
        width: element.videoWidth || reference.width,
        height: element.videoHeight || reference.height,
      };
    });

  return {
    readyCount: videos.filter((video) => video.status === 'ready').length,
    pendingCount: videos.filter((video) => video.status === 'pending').length,
    missingCount: videos.filter((video) => video.status === 'missingElement').length,
    videos,
  };
};
