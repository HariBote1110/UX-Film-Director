import type { RustSceneMediaReference } from './rustSceneSnapshot';

export type SharedRendererVideoMediaStatus = 'rustRendererRequired';

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
  rustRequiredCount: number;
  videos: SharedRendererVideoMediaEntry[];
}

export interface SharedRendererVideoMediaReadinessInput {
  media: RustSceneMediaReference[];
}

export const buildSharedRendererVideoMediaReadiness = ({
  media,
}: SharedRendererVideoMediaReadinessInput): SharedRendererVideoMediaReadiness => {
  const videos = media
    .filter((reference) => reference.kind === 'Video')
    .map((reference): SharedRendererVideoMediaEntry => ({
      id: reference.id,
      status: 'rustRendererRequired',
      readyState: 0,
      currentTime: 0,
      width: reference.width,
      height: reference.height,
    }));

  return {
    readyCount: 0,
    pendingCount: 0,
    missingCount: 0,
    rustRequiredCount: videos.length,
    videos,
  };
};
