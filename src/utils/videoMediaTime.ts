import type { VideoObject } from '../types';

/**
 * タイムライン時刻がクリップ範囲内のときのみ、動画のメディア時刻（秒）を返す。
 * 範囲外は null（プレビュー外で Vision を叩かないため）。
 */
export const mediaTimeInClipForPlayhead = (
  video: Pick<VideoObject, 'startTime' | 'duration' | 'offset'>,
  timelineTime: number
): number | null => {
  const local = timelineTime - video.startTime;
  if (local < 0 || local > video.duration) return null;
  return (video.offset ?? 0) + local;
};
