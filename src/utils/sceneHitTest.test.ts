import { describe, expect, it } from 'vitest';
import {
  getObjectWorldCorners,
  hitTestSceneObjects,
  worldPointToCssPoint,
  type SceneCamera,
  type SceneHitTestViewport,
} from './sceneHitTest';
import type { LayerState, ShapeObject, TimelineObject } from '../types';

const identityCamera: SceneCamera = { centreOffsetX: 0, centreOffsetY: 0, zoom: 1, rotationDeg: 0 };

const viewport = (overrides: Partial<SceneHitTestViewport> = {}): SceneHitTestViewport => ({
  projectWidth: 400,
  projectHeight: 300,
  displayScale: 1,
  camera: identityCamera,
  ...overrides,
});

const shape = (overrides: Partial<ShapeObject> = {}): ShapeObject => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Shape',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 100,
  y: 100,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  shapeType: 'rect',
  width: 50,
  height: 40,
  fill: '#fff',
  ...overrides,
});

describe('hitTestSceneObjects: 基本のCSS座標→ワールド座標変換', () => {
  it('矩形の内側をヒットする', () => {
    const objects: TimelineObject[] = [shape()];
    // world原点 = (projectWidth/2, projectHeight/2) = (200,150) がCSS座標としての基準になるcentreOffsetは0なのでpivot=position。
    // displayScale=1、camera恒等なので CSS座標 == ワールド座標そのまま。
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 0, objects, viewport: viewport() });
    expect(hit).toBe('shape-1');
  });

  it('矩形の外側はヒットしない', () => {
    const objects: TimelineObject[] = [shape()];
    const hit = hitTestSceneObjects({ cssX: 500, cssY: 500, time: 0, objects, viewport: viewport() });
    expect(hit).toBeNull();
  });

  it('displayScale を考慮してCSS座標をワールド座標へ変換する', () => {
    const objects: TimelineObject[] = [shape({ x: 100, y: 100, width: 50, height: 40 })];
    // displayScale=2なら、ワールド座標(110,110)相当のCSS座標は(220,220)
    const hit = hitTestSceneObjects({
      cssX: 220,
      cssY: 220,
      time: 0,
      objects,
      viewport: viewport({ displayScale: 2 }),
    });
    expect(hit).toBe('shape-1');
  });
});

describe('hitTestSceneObjects: 時刻範囲', () => {
  it('startTime未満は除外される', () => {
    const objects: TimelineObject[] = [shape({ startTime: 5, duration: 10 })];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 1, objects, viewport: viewport() });
    expect(hit).toBeNull();
  });

  it('startTime+duration以上は除外される', () => {
    const objects: TimelineObject[] = [shape({ startTime: 0, duration: 10 })];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 10, objects, viewport: viewport() });
    expect(hit).toBeNull();
  });

  it('startTime <= time < startTime+duration は含まれる', () => {
    const objects: TimelineObject[] = [shape({ startTime: 0, duration: 10 })];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 9.99, objects, viewport: viewport() });
    expect(hit).toBe('shape-1');
  });
});

describe('hitTestSceneObjects: 重なり時の前面優先', () => {
  it('同じ位置に重なる2つのオブジェクトは layer が大きい方（前面）を優先する', () => {
    const back = shape({ id: 'back', layer: 0 });
    const front = shape({ id: 'front', layer: 1 });
    const objects: TimelineObject[] = [back, front];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 0, objects, viewport: viewport() });
    expect(hit).toBe('front');
  });

  it('配列順ではなくlayer値で前面判定する', () => {
    const front = shape({ id: 'front', layer: 5 });
    const back = shape({ id: 'back', layer: 0 });
    const objects: TimelineObject[] = [front, back];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 0, objects, viewport: viewport() });
    expect(hit).toBe('front');
  });
});

describe('hitTestSceneObjects: 回転した矩形', () => {
  it('45度回転した矩形の角の外側（回転前の矩形の角）はヒットしない', () => {
    // 幅100・高さ100の矩形をその中心(x=100+50,y=100+50 相当)周りで45度回転。
    // ローカル原点は左上(100,100)なので回転軸はそこではなく左上そのもの。
    const rotated = shape({ x: 100, y: 100, width: 100, height: 100, rotation: 45 });
    const objects: TimelineObject[] = [rotated];
    // 回転前なら(199,199)は矩形内(100..200)だが、左上原点で45度回転すると
    // ローカル(99,99)相当の点はワールド上で大きく移動するため、
    // 元の場所(199,199)は矩形外になるはず。
    const hit = hitTestSceneObjects({ cssX: 199, cssY: 199, time: 0, objects, viewport: viewport() });
    expect(hit).toBeNull();
  });

  it('回転後も矩形の中心付近は常にヒットする', () => {
    const rotated = shape({ x: 100, y: 100, width: 100, height: 100, rotation: 45 });
    const objects: TimelineObject[] = [rotated];
    const hit = hitTestSceneObjects({ cssX: 150, cssY: 150, time: 0, objects, viewport: viewport() });
    expect(hit).toBe('shape-1');
  });

  it('回転後、ローカル座標で回転させた角の位置は正しくヒットする', () => {
    // 左上原点(100,100)、幅100高さ100を45度回転。
    // ローカル右上角(200,100)は原点からの相対(100,0)を45度回転すると
    // world = (100 + 100*cos45, 100 + 100*sin45) = (100+70.7, 100+70.7) = (170.7,170.7) 付近。
    const rotated = shape({ x: 100, y: 100, width: 100, height: 100, rotation: 45 });
    const objects: TimelineObject[] = [rotated];
    const hit = hitTestSceneObjects({ cssX: 170, cssY: 170, time: 0, objects, viewport: viewport() });
    expect(hit).toBe('shape-1');
  });
});

describe('hitTestSceneObjects: レイヤー非表示・ロック', () => {
  it('非表示レイヤーのオブジェクトは除外する', () => {
    const objects: TimelineObject[] = [shape({ layer: 0 })];
    const layers: LayerState[] = [{ name: 'L0', visible: false, locked: false }];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 0, objects, viewport: viewport(), layers });
    expect(hit).toBeNull();
  });

  it('ロックされたレイヤーのオブジェクトはヒット対象に含まれる（選択のみ許可されるため除外しない）', () => {
    const objects: TimelineObject[] = [shape({ layer: 0 })];
    const layers: LayerState[] = [{ name: 'L0', visible: true, locked: true }];
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 0, objects, viewport: viewport(), layers });
    expect(hit).toBe('shape-1');
  });
});

describe('hitTestSceneObjects: width/heightを持たない種別', () => {
  it('group_controlのようなサイズを持たないオブジェクトはヒット対象から除外する', () => {
    const group: TimelineObject = {
      id: 'group-1',
      type: 'group_control',
      name: 'Group',
      layer: 0,
      startTime: 0,
      duration: 10,
      x: 100,
      y: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 0,
      endY: 0,
      easing: 'linear',
      targetLayerCount: 0,
    } as TimelineObject;
    const hit = hitTestSceneObjects({ cssX: 110, cssY: 110, time: 0, objects: [group], viewport: viewport() });
    expect(hit).toBeNull();
  });
});

describe('hitTestSceneObjects: カメラ変換', () => {
  it('zoomを考慮してCSS座標をワールド座標へ変換する', () => {
    const objects: TimelineObject[] = [shape({ x: 100, y: 100, width: 50, height: 40 })];
    // world原点は(200,150)固定（pivot=position時）。zoom=2なら
    // world座標系での(110,110)は、原点からの相対(-90,-40)を2倍した
    // (-180,-80)だけCSS側でずれた位置、つまりCSS(20,70)に対応する。
    const hit = hitTestSceneObjects({
      cssX: 20,
      cssY: 70,
      time: 0,
      objects,
      viewport: viewport({ camera: { centreOffsetX: 0, centreOffsetY: 0, zoom: 2, rotationDeg: 0 } }),
    });
    expect(hit).toBe('shape-1');
  });

  it('centreOffsetを考慮してCSS座標をワールド座標へ変換する', () => {
    const objects: TimelineObject[] = [shape({ x: 100, y: 100, width: 50, height: 40 })];
    const hit = hitTestSceneObjects({
      cssX: 130,
      cssY: 110,
      time: 0,
      objects,
      viewport: viewport({ camera: { centreOffsetX: 20, centreOffsetY: 0, zoom: 1, rotationDeg: 0 } }),
    });
    expect(hit).toBe('shape-1');
  });
});

describe('worldPointToCssPoint: cssPointToWorldPointの逆変換', () => {
  it('恒等カメラ・displayScale=1では素通り', () => {
    const p = worldPointToCssPoint({ x: 123, y: 45 }, viewport());
    expect(p.x).toBeCloseTo(123);
    expect(p.y).toBeCloseTo(45);
  });

  it('zoom/centreOffset/displayScaleを考慮した変換になる', () => {
    const vp = viewport({
      displayScale: 2,
      camera: { centreOffsetX: 0, centreOffsetY: 0, zoom: 2, rotationDeg: 0 },
    });
    // hitTestSceneObjectsのケース「displayScale/zoomを考慮」と対になる往復確認。
    const css = worldPointToCssPoint({ x: 110, y: 110 }, vp);
    // world原点(200,150)からの相対(-90,-40)をzoom=2倍、さらにdisplayScale=2倍。
    expect(css.x).toBeCloseTo((200 + (110 - 200) * 2) * 2);
    expect(css.y).toBeCloseTo((150 + (110 - 150) * 2) * 2);
  });
});

describe('getObjectWorldCorners: 変形済み矩形の四隅', () => {
  it('回転無しの矩形は単純な矩形の四隅を返す', () => {
    const obj = shape({ x: 100, y: 100, width: 50, height: 40, rotation: 0 });
    const corners = getObjectWorldCorners(obj, 0, [obj]);
    expect(corners.topLeft).toEqual({ x: 100, y: 100 });
    expect(corners.topRight).toEqual({ x: 150, y: 100 });
    expect(corners.bottomLeft).toEqual({ x: 100, y: 140 });
    expect(corners.bottomRight).toEqual({ x: 150, y: 140 });
  });

  it('90度回転した矩形は左上を中心に90度回転した位置になる', () => {
    const obj = shape({ x: 100, y: 100, width: 50, height: 40, rotation: 90 });
    const corners = getObjectWorldCorners(obj, 0, [obj]);
    // ローカル(50,0)を90度回転すると(0,50)、つまりtopRight = (100,150)
    expect(corners.topRight.x).toBeCloseTo(100);
    expect(corners.topRight.y).toBeCloseTo(150);
  });
});
