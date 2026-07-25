import React from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import type { VisionDetectionOverlayState } from '../store/storeTypes';
import type { SceneHitTestViewport } from '../utils/sceneHitTest';
import { buildVisionDetectionOverlayBoxes } from '../utils/visionDetectionOverlayGeometry';

/**
 * Vision 検出枠（cat/dog 単フレーム検出プレビュー）を `Viewport.tsx` から
 * 切り出した独立コンポーネント。
 *
 * この層は vision 検出プレビュー有効時のみマウントされる opt-in 機能で、
 * マウント中のみ毎フレーム再レンダーを許容する（`currentTime` を意図的に
 * hook 購読する）。`Viewport.tsx` 本体は再生中の毎フレーム再レンダーを
 * 避けるため `currentTime` を購読しない方針へ移行済みだが、本コンポーネントは
 * vision 検出プレビューが有効な間だけマウントされる小さなオーバーレイであり、
 * SceneSelectionDecorationLayer / TimelineCurrentTimeIndicator と同様の
 * subscribe 化までは行わない。
 */

export interface VisionDetectionOverlayLayerProps {
  objects: TimelineObject[];
  overlay: VisionDetectionOverlayState;
  viewportRef: React.MutableRefObject<SceneHitTestViewport>;
  width: number;
  height: number;
  displayScale: number;
}

export const VisionDetectionOverlayLayer: React.FC<VisionDetectionOverlayLayerProps> = ({
  objects,
  overlay,
  viewportRef,
  width,
  height,
  displayScale,
}) => {
  const currentTime = useStore((s) => s.currentTime);

  const targetVideo = objects.find(
    (object): object is VideoObject =>
      object.type === 'video' && object.id === overlay.videoId
  );
  if (!targetVideo) return null;

  const detection = buildVisionDetectionOverlayBoxes({
    video: targetVideo,
    overlay,
    time: currentTime,
    objects,
    viewport: viewportRef.current,
  });
  if (!detection) return null;

  return (
    <svg
      data-testid="vision-detection-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        opacity: detection.stale ? 0.42 : 1,
      }}
    >
      {detection.boxes.map((box, index) => (
        <polygon
          key={index}
          points={box.points}
          fill="none"
          stroke={box.colour}
          strokeWidth={5 * displayScale}
        />
      ))}
    </svg>
  );
};

export default VisionDetectionOverlayLayer;
