import type { TimelineObject, VideoObject } from '../types';
import type { VisionDetectionOverlayState } from '../store/storeTypes';
import { visionNormBoundingBoxToVideoLocalRect } from './visionTrackingGeometry';
import {
  objectLocalPointToWorldPoint,
  worldPointToCssPoint,
  type SceneHitTestViewport,
} from './sceneHitTest';

/**
 * Vision 検出枠（cat/dog の単フレーム検出プレビュー）を SVG polygon として
 * 描くための座標計算。PixiJS 排除計画 Phase 4 で、旧 Viewport.tsx の
 * PIXI.Graphics 描画（vision-detection-overlay）を置き換える Pixi 非依存実装。
 * 座標系契約は sceneHitTest.ts と同じ（CSS pt、preview 要素基準）。
 */

export const VISION_DETECTION_OVERLAY_COLOURS = [
  '#22c55e',
  '#38bdf8',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
] as const;

/** 旧 Pixi 実装と同じ「表示中フレームとの乖離が 0.35s を超えたら薄く描く」判定閾値。 */
const STALE_MEDIA_TIME_DELTA_SECONDS = 0.35;

export interface VisionDetectionOverlayBox {
  /** SVG polygon の points 属性（CSS pt）。 */
  points: string;
  colour: string;
}

export interface VisionDetectionOverlayBoxesResult {
  boxes: VisionDetectionOverlayBox[];
  /** 検出時刻と表示フレームが乖離しているか（薄表示にする）。 */
  stale: boolean;
}

const formatPoint = (point: { x: number; y: number }): string => {
  const format = (value: number): string => {
    const rounded = Math.round(value * 1000) / 1000;
    return String(rounded);
  };
  return `${format(point.x)},${format(point.y)}`;
};

export const buildVisionDetectionOverlayBoxes = ({
  video,
  overlay,
  time,
  objects,
  viewport,
}: {
  video: VideoObject;
  overlay: VisionDetectionOverlayState;
  time: number;
  objects: TimelineObject[];
  viewport: SceneHitTestViewport;
}): VisionDetectionOverlayBoxesResult | null => {
  if (overlay.videoId !== video.id) return null;
  if (overlay.observations.length === 0) return null;

  const localT = time - video.startTime;
  const clampedLocal = Math.max(0, Math.min(video.duration, localT));
  const mediaT = (video.offset ?? 0) + clampedLocal;
  const stale = Math.abs(mediaT - overlay.mediaTimeSec) > STALE_MEDIA_TIME_DELTA_SECONDS;

  const boxes = overlay.observations.map((observation, index) => {
    const rect = visionNormBoundingBoxToVideoLocalRect(
      observation.boundingBox,
      video.width,
      video.height
    );
    const localCorners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
    const points = localCorners
      .map((local) => worldPointToCssPoint(
        objectLocalPointToWorldPoint(local, video, time, objects),
        viewport
      ))
      .map(formatPoint)
      .join(' ');

    return {
      points,
      colour: VISION_DETECTION_OVERLAY_COLOURS[index % VISION_DETECTION_OVERLAY_COLOURS.length],
    };
  });

  return { boxes, stale };
};
