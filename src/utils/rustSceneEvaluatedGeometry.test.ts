import { describe, expect, it } from 'vitest';
import {
  getRustEvaluatedObjectGeometry,
  getRustEvaluatedObjectLogicalOrigin,
  hitTestRustEvaluatedScene,
  type RustEvaluatedGeometryFrame,
} from './rustSceneEvaluatedGeometry';
import type { SceneHitTestViewport } from './sceneHitTest';

const viewport: SceneHitTestViewport = {
  projectWidth: 400,
  projectHeight: 300,
  displayScale: 1,
  camera: { centreOffsetX: 0, centreOffsetY: 0, zoom: 1, rotationDeg: 0 },
};

const frame = (patch: Partial<RustEvaluatedGeometryFrame> = {}): RustEvaluatedGeometryFrame => ({
  sceneId: 'viewport-rust-timeline',
  revision: 12,
  frameIndex: 15,
  snapshot: {
    frame_index: 15,
    colour: { profile: 'rec709-sdr', working_space: 'linear-light', alpha: 'premultiplied' },
    clips: [{
      clip_id: 'shape-1',
      track_id: 'layer-0',
      media_id: 'media-shape',
      source_frame: 0,
      z_index: 0,
      transform: {
        translation_x: 40,
        translation_y: 30,
        scale_x: 1,
        scale_y: 1,
        rotation_degrees: 0,
        sampling: 'bilinear',
      },
      opacity: 1,
      effects: [],
    }],
  },
  media: [{ id: 'media-shape', kind: 'GeneratedShape', source: '{}', width: 100, height: 60 }],
  ...patch,
});

describe('Rust evaluated scene geometry', () => {
  it('snapshotの最終transformとmedia寸法から可視object boundsを作る', () => {
    const geometry = getRustEvaluatedObjectGeometry(frame(), 'shape-1');
    expect(geometry).toMatchObject({
      objectId: 'shape-1',
      zIndex: 0,
      width: 100,
      height: 60,
      transform: { translation_x: 40, translation_y: 30 },
    });
    expect(geometry?.worldCorners).toEqual({
      topLeft: { x: 40, y: 30 },
      topRight: { x: 140, y: 30 },
      bottomLeft: { x: 40, y: 90 },
      bottomRight: { x: 140, y: 90 },
    });
  });

  it('text decoration planeはinsetを二重加算せず、編集用logical originを復元する', () => {
    const evaluated = frame({
      snapshot: {
        ...frame().snapshot,
        clips: [{
          ...frame().snapshot.clips[0],
          clip_id: 'text-1',
          media_id: 'media-text',
          transform: {
            translation_x: 80,
            translation_y: 40,
            scale_x: 2,
            scale_y: 1,
            rotation_degrees: 90,
            sampling: 'bilinear',
          },
        }],
      },
      media: [{
        id: 'media-text',
        kind: 'Text',
        source: JSON.stringify({ __renderOffsetX: 20, __renderOffsetY: 10 }),
        width: 120,
        height: 60,
      }],
    });

    const corners = getRustEvaluatedObjectGeometry(evaluated, 'text-1')?.worldCorners;
    expect(corners?.topLeft.x).toBeCloseTo(80);
    expect(corners?.topLeft.y).toBeCloseTo(40);
    expect(corners?.topRight.x).toBeCloseTo(80);
    expect(corners?.topRight.y).toBeCloseTo(280);
    expect(corners?.bottomLeft.x).toBeCloseTo(20);
    expect(corners?.bottomLeft.y).toBeCloseTo(40);
    expect(corners?.bottomRight.x).toBeCloseTo(20);
    expect(corners?.bottomRight.y).toBeCloseTo(280);
    expect(getRustEvaluatedObjectLogicalOrigin(evaluated, 'text-1')).toEqual({ x: 70, y: 80 });
  });

  it('pointer hit test uses only the exact displayed scene revision and frame', () => {
    const displayed = frame();
    const hit = (revision: number, frameIndex: number) => hitTestRustEvaluatedScene({
      cssX: 80,
      cssY: 60,
      frame: displayed,
      expected: { sceneId: 'viewport-rust-timeline', revision, frameIndex },
      viewport,
    });
    expect(hit(12, 15)).toBe('shape-1');
    expect(hit(13, 15)).toBeNull();
    expect(hit(12, 16)).toBeNull();
    expect(hitTestRustEvaluatedScene({
      cssX: 80,
      cssY: 60,
      frame: displayed,
      expected: { sceneId: 'other-scene', revision: 12, frameIndex: 15 },
      viewport,
    })).toBeNull();
  });

  it('opacityが0でもRust snapshotに存在するobjectは従来どおり選択できる', () => {
    const invisible = frame({
      snapshot: { ...frame().snapshot, clips: [{ ...frame().snapshot.clips[0], opacity: 0 }] },
    });
    expect(hitTestRustEvaluatedScene({
      cssX: 80,
      cssY: 60,
      frame: invisible,
      expected: { sceneId: invisible.sceneId, revision: invisible.revision, frameIndex: invisible.frameIndex },
      viewport,
    })).toBe('shape-1');
  });

  it('missing clip/mediaと無効transformはhit対象にしない', () => {
    const displayed = frame();
    expect(getRustEvaluatedObjectGeometry(displayed, 'missing')).toBeNull();
    expect(hitTestRustEvaluatedScene({
      cssX: 80,
      cssY: 60,
      frame: { ...displayed, media: [] },
      expected: { sceneId: displayed.sceneId, revision: displayed.revision, frameIndex: displayed.frameIndex },
      viewport,
    })).toBeNull();
  });
});
