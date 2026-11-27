import { describe, expect, it } from 'vitest';
import { buildVisionDetectionOverlayBoxes, VISION_DETECTION_OVERLAY_COLOURS } from './visionDetectionOverlayGeometry';
import type { SceneHitTestViewport } from './sceneHitTest';
import type { VideoObject } from '../types';
import type { RustEvaluatedGeometryFrame } from './rustSceneEvaluatedGeometry';
import type { VisionDetectionOverlayState } from '../store/storeTypes';

const viewport: SceneHitTestViewport = {
  projectWidth: 400,
  projectHeight: 300,
  displayScale: 1,
  camera: { centreOffsetX: 0, centreOffsetY: 0, zoom: 1, rotationDeg: 0 },
};

const video = (patch: Partial<VideoObject> = {}): VideoObject => ({
  id: 'video-1',
  type: 'video',
  name: 'video.mp4',
  layer: 0,
  startTime: 0,
  duration: 10,
  offset: 0,
  x: 100,
  y: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 100,
  endY: 50,
  easing: 'linear',
  src: 'blob:video',
  filePath: '/tmp/video.mp4',
  width: 200,
  height: 100,
  volume: 1,
  muted: false,
  ...patch,
});

const overlayState = (patch: Partial<VisionDetectionOverlayState> = {}): VisionDetectionOverlayState => ({
  videoId: 'video-1',
  mediaTimeSec: 2,
  observations: [
    {
      identifier: 'cat',
      confidence: 0.9,
      boundingBox: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    } as VisionDetectionOverlayState['observations'][number],
  ],
  ...patch,
});

const frameFor = (object: VideoObject): RustEvaluatedGeometryFrame => ({
  sceneId: 'test', revision: 1, frameIndex: 60,
  snapshot: { frame_index: 60, colour: { profile: 'rec709-sdr', working_space: 'linear-light', alpha: 'premultiplied' }, clips: [{
    clip_id: object.id, track_id: String(object.layer), media_id: 'video-media', source_frame: 60, z_index: 0,
    transform: { translation_x: object.x, translation_y: object.y, scale_x: object.scaleX ?? 1, scale_y: object.scaleY ?? 1, rotation_degrees: object.rotation ?? 0, sampling: 'bilinear' }, opacity: object.opacity, effects: [],
  }] },
  media: [{ id: 'video-media', kind: 'Video', source: '', width: object.width, height: object.height }],
});

describe('buildVisionDetectionOverlayBoxes', () => {
  it('正規化bboxを動画ローカル→ワールド→CSSへ変換したSVG polygon点列を返す', () => {
    const obj = video();
    const result = buildVisionDetectionOverlayBoxes({
      video: obj,
      overlay: overlayState(),
      time: 2,
      frame: frameFor(obj),
      viewport,
    });

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.stale).toBe(false);
    expect(result.boxes).toHaveLength(1);
    // bbox {x:0.25,y:0.25,w:0.5,h:0.5}（Vision座標は下原点）→ ローカル (50,25)-(150,75)。
    // 恒等カメラ・位置(100,50)なので CSS は (150,75)-(250,125)。
    expect(result.boxes[0].points).toBe('150,75 250,75 250,125 150,125');
    expect(result.boxes[0].colour).toBe(VISION_DETECTION_OVERLAY_COLOURS[0]);
  });

  it('mediaTimeSec と現在フレームの差が 0.35s を超えると stale=true を返す', () => {
    const obj = video();
    const result = buildVisionDetectionOverlayBoxes({
      video: obj,
      overlay: overlayState({ mediaTimeSec: 5 }),
      time: 2,
      frame: frameFor(obj),
      viewport,
    });

    expect(result).not.toBeNull();
    expect(result?.stale).toBe(true);
  });

  it('observations が空なら null を返す', () => {
    const obj = video();
    const result = buildVisionDetectionOverlayBoxes({
      video: obj,
      overlay: overlayState({ observations: [] }),
      time: 2,
      frame: frameFor(obj),
      viewport,
    });

    expect(result).toBeNull();
  });
});
