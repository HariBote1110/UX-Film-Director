import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { TimelineObject, VideoObject } from '../types';
import type { VisionDetectionOverlayState } from '../store/storeTypes';
import type { SceneHitTestViewport } from '../utils/sceneHitTest';
import { buildVisionDetectionOverlayBoxes } from '../utils/visionDetectionOverlayGeometry';
import { getRustSceneEvaluatedGeometryFrame, subscribeRustSceneEvaluatedGeometryFrame } from '../utils/rustSceneEvaluatedGeometryStore';
import { secondsToFrameIndex } from '../utils/rustSceneFrameRate';
import { getRustScenePositionQueryTarget, rustScenePositionQueryTargetMatchesGraph } from '../utils/rustScenePositionQueryRevision';

export interface VisionDetectionOverlayLayerProps {
  objects: TimelineObject[];
  overlay: VisionDetectionOverlayState;
  viewportRef: React.MutableRefObject<SceneHitTestViewport>;
  width: number;
  height: number;
  displayScale: number;
  expectedRevision: number | null;
  expectedProjectSettings: object;
  expectedLayers: readonly unknown[];
}

export const VisionDetectionOverlayLayer: React.FC<VisionDetectionOverlayLayerProps> = ({
  objects,
  overlay,
  viewportRef,
  width,
  height,
  displayScale,
  expectedRevision,
  expectedProjectSettings,
  expectedLayers,
}) => {
  const currentTime = useStore((s) => s.currentTime);
  const fps = useStore((s) => s.projectSettings.fps);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const polygonRefs = useRef<Map<number, SVGPolygonElement>>(new Map());
  const targetVideo = objects.find(
    (object): object is VideoObject => object.type === 'video' && object.id === overlay.videoId,
  );
  const latestRef = useRef({ objects, overlay, viewportRef, currentTime, fps, targetVideo, expectedRevision, expectedProjectSettings, expectedLayers });
  latestRef.current = { objects, overlay, viewportRef, currentTime, fps, targetVideo, expectedRevision, expectedProjectSettings, expectedLayers };

  const applyGeometry = () => {
    const svg = svgRef.current;
    const latest = latestRef.current;
    const frame = getRustSceneEvaluatedGeometryFrame();
    const video = latest.targetVideo;
    const state = useStore.getState();
    const target = getRustScenePositionQueryTarget();
    if (!svg || !video || !frame
      || frame.sceneId !== 'viewport-rust-timeline'
      || frame.revision !== latest.expectedRevision
      || !rustScenePositionQueryTargetMatchesGraph(target, {
        sceneId: frame.sceneId,
        revision: frame.revision,
        projectSettings: state.projectSettings,
        layers: state.layers,
        objects: state.objects,
      })
      || state.projectSettings !== latest.expectedProjectSettings
      || state.layers !== latest.expectedLayers
      || frame.frameIndex !== secondsToFrameIndex(latest.currentTime, latest.fps)) {
      if (svg) svg.style.display = 'none';
      return;
    }
    const detection = buildVisionDetectionOverlayBoxes({
      video,
      overlay: latest.overlay,
      time: latest.currentTime,
      frame,
      viewport: latest.viewportRef.current,
    });
    if (!detection) {
      svg.style.display = 'none';
      return;
    }
    svg.style.display = '';
    svg.style.opacity = detection.stale ? '0.42' : '1';
    detection.boxes.forEach((box, index) => {
      const polygon = polygonRefs.current.get(index);
      if (!polygon) return;
      polygon.setAttribute('points', box.points);
      polygon.setAttribute('stroke', box.colour);
    });
  };

  useEffect(() => subscribeRustSceneEvaluatedGeometryFrame(applyGeometry), []);
  useEffect(() => { applyGeometry(); });

  if (!targetVideo) return null;
  return (
    <svg
      ref={svgRef}
      data-testid="vision-detection-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {overlay.observations.map((_observation, index) => (
        <polygon
          key={index}
          ref={(element) => {
            if (element) polygonRefs.current.set(index, element);
            else polygonRefs.current.delete(index);
          }}
          fill="none"
          strokeWidth={5 * displayScale}
        />
      ))}
    </svg>
  );
};

export default VisionDetectionOverlayLayer;
