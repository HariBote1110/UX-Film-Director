import type {
  RustFrameRate,
  RustSceneMediaReference,
  RustSceneSnapshot,
} from './rustSceneSnapshot';

export type SharedRendererDecodedVideoFrameFormat = 'rgba8Srgb';
export type SharedRendererVideoDecodeColour = 'rec709SrgbFullRange';

export interface SharedRendererVideoFrameDecodeRequest {
  clipId: string;
  mediaId: string;
  source: string;
  sourceFrame: number;
  sourceRate: RustFrameRate;
  timelineFrame: number;
  width: number;
  height: number;
  format: SharedRendererDecodedVideoFrameFormat;
  colour: SharedRendererVideoDecodeColour;
}

export type SharedRendererVideoFrameDecodeRequestResult =
  | {
      ok: true;
      requestCount: number;
      requests: SharedRendererVideoFrameDecodeRequest[];
    }
  | {
      ok: false;
      reason: 'invalidVideoMediaReference';
      detail: string;
      mediaId: string;
    };

export interface SharedRendererVideoFrameDecodeRequestInput {
  snapshot: RustSceneSnapshot;
  media: RustSceneMediaReference[];
}

export type SharedRendererVideoFrameDecodeRequestBuilder = (
  input: SharedRendererVideoFrameDecodeRequestInput
) => SharedRendererVideoFrameDecodeRequestResult;

export const buildSharedRendererVideoFrameDecodeRequests: SharedRendererVideoFrameDecodeRequestBuilder = ({
  snapshot,
  media,
}) => {
  const mediaById = new Map(media.map((reference) => [reference.id, reference]));
  const requests: SharedRendererVideoFrameDecodeRequest[] = [];

  const videoClips = [...snapshot.clips]
    .sort((left, right) => left.z_index - right.z_index)
    .filter((clip) => mediaById.get(clip.media_id)?.kind === 'Video');

  for (const clip of videoClips) {
    const reference = mediaById.get(clip.media_id);
    if (!reference) continue;

    if (reference.source.trim() === '') {
      return {
        ok: false,
        reason: 'invalidVideoMediaReference',
        detail: 'Video media source must be a non-empty path or URI.',
        mediaId: reference.id,
      };
    }
    if (reference.width <= 0 || reference.height <= 0) {
      return {
        ok: false,
        reason: 'invalidVideoMediaReference',
        detail: `Video media dimensions must be positive, got ${reference.width}x${reference.height}.`,
        mediaId: reference.id,
      };
    }
    if (!validFrameRate(reference.source_rate)) {
      return {
        ok: false,
        reason: 'invalidVideoMediaReference',
        detail: 'Video media source_rate must be present and rational.',
        mediaId: reference.id,
      };
    }

    requests.push({
      clipId: clip.clip_id,
      mediaId: reference.id,
      source: reference.source,
      sourceFrame: clip.source_frame,
      sourceRate: reference.source_rate,
      timelineFrame: snapshot.frame_index,
      width: reference.width,
      height: reference.height,
      format: 'rgba8Srgb',
      colour: 'rec709SrgbFullRange',
    });
  }

  return {
    ok: true,
    requestCount: requests.length,
    requests,
  };
};

const validFrameRate = (frameRate: RustFrameRate | undefined): frameRate is RustFrameRate =>
  frameRate !== undefined
  && Number.isInteger(frameRate.numerator)
  && Number.isInteger(frameRate.denominator)
  && frameRate.numerator > 0
  && frameRate.denominator > 0;
