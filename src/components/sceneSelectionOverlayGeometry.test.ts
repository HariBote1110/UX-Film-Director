import { describe, expect, it } from 'vitest';
import {
  computeSceneSelectionOverlayGeometry,
  SCENE_SELECTION_RESIZE_HANDLE_SIZE,
} from './sceneSelectionOverlayGeometry';
import type { SceneCamera, SceneHitTestViewport } from '../utils/sceneHitTest';
import type { TimelineObject } from '../types';

/**
 * `SceneSelectionOverlay.tsx` から選択枠のジオメトリ計算を純関数へ切り出すための
 * 契約テスト（TDD Red フェーズ）。`src/components/sceneSelectionOverlayGeometry.ts`
 * はまだ存在しないため、このファイルは import 解決に失敗して落ちる
 * （それが Red の目的）。
 *
 * 期待値はすべて `src/utils/sceneHitTest.ts` の座標式
 * （`getObjectWorldCorners` / `worldPointToCssPoint`）を手計算で追った
 * リテラル値であり、`getObjectWorldCorners` 等の本番関数を呼び出して
 * 期待値を作る同語反復はしていない。
 *
 * vitest 設定（vite.config.ts）は `src/**\/*.test.ts` のみを対象とし
 * `.tsx` テストの前例が無いため、既存テスト（SceneSelectionOverlay.test.ts）
 * に倣い JSX を使わずプレーンな TypeScript のみで記述する。
 */

const identityCamera: SceneCamera = { centreOffsetX: 0, centreOffsetY: 0, zoom: 1, rotationDeg: 0 };

const baseViewport: SceneHitTestViewport = {
  projectWidth: 400,
  projectHeight: 300,
  displayScale: 1,
  camera: identityCamera,
};

// 既存テスト（SceneSelectionOverlay.test.ts）の imageObject ヘルパーと同じ形。
// x=10, y=20, width=100, height=50, rotation=0, scale=1, startTime=5, duration=10。
const imageObject = (overrides: Partial<Record<string, unknown>> = {}): TimelineObject => ({
  id: 'obj-1',
  type: 'image',
  name: 'obj-1',
  src: 'image.png',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  layer: 0,
  startTime: 5,
  duration: 10,
  ...overrides,
} as unknown as TimelineObject);

describe('computeSceneSelectionOverlayGeometry: ジオメトリ計算契約', () => {
  it('SCENE_SELECTION_RESIZE_HANDLE_SIZE は現行 SceneSelectionOverlay.tsx の RESIZE_HANDLE_SIZE と同じ 10', () => {
    expect(SCENE_SELECTION_RESIZE_HANDLE_SIZE).toBe(10);
  });

  it('平行移動のみ（rotation 0, scale 1, identity camera, displayScale 1）で points/handles が手計算値と一致する', () => {
    // getObjectWorldCorners:
    //   base = {x:10, y:20}（keyframes/enableAnimation 無し → obj.x/obj.y そのまま）
    //   groupEffects = 0（group_control 無し）, vib = {x:0,y:0}（filters 無し）
    //   containerX=10, containerY=20, rotationRad=0, scaleX=scaleY=1
    //   local corners: tl(0,0) tr(100,0) bl(0,50) br(100,50)（width=100, height=50）
    //   rotation 0 なので rotateVec はそのまま → world = container + local
    //   tl=(10,20) tr=(110,20) bl=(10,70) br=(110,70)
    // worldPointToCssPoint（identity camera, displayScale=1）:
    //   pivot=(200,150), position=pivot（centreOffset 0）, zoom=1, rotation=0
    //   → parentPoint = positionX + (worldPoint - pivot) = worldPoint（恒等変換）
    //   → css = world * displayScale(1) = world
    // よって css: tl=(10,20) tr=(110,20) bl=(10,70) br=(110,70)
    const objects = [imageObject()];

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1'],
      objects,
      time: 5,
      viewport: baseViewport,
    });

    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry.objectId).toBe('obj-1');
    expect(entry.visible).toBe(true);
    // points は tl→tr→br→bl の順。
    expect(entry.points).toBe('10,20 110,20 110,70 10,70');
    // handles は top-left, top-right, bottom-left, bottom-right の順で
    // 各コーナー座標 - RESIZE_HANDLE_SIZE/2(=5)。
    expect(entry.handles).toEqual([
      { corner: 'top-left', x: 5, y: 15 },
      { corner: 'top-right', x: 105, y: 15 },
      { corner: 'bottom-left', x: 5, y: 65 },
      { corner: 'bottom-right', x: 105, y: 65 },
    ]);
  });

  it('displayScale=2 のとき CSS 座標がすべて 2 倍になる', () => {
    // worldPointToCssPoint の最終行 `x: parentX * displayScale` により、
    // identity camera（zoom=1, centreOffset=0, rotation=0）では
    // parentPoint = worldPoint のため、css = world * 2。
    // world 座標は上のテストと同じ: tl=(10,20) tr=(110,20) bl=(10,70) br=(110,70)
    // → css: tl=(20,40) tr=(220,40) bl=(20,140) br=(220,140)
    const objects = [imageObject()];
    const viewport: SceneHitTestViewport = { ...baseViewport, displayScale: 2 };

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1'],
      objects,
      time: 5,
      viewport,
    });

    const entry = result[0];
    expect(entry.visible).toBe(true);
    expect(entry.points).toBe('20,40 220,40 220,140 20,140');
    expect(entry.handles).toEqual([
      { corner: 'top-left', x: 15, y: 35 },
      { corner: 'top-right', x: 215, y: 35 },
      { corner: 'bottom-left', x: 15, y: 135 },
      { corner: 'bottom-right', x: 215, y: 135 },
    ]);
  });

  it('camera の zoom / centreOffset があるとき worldPointToCssPoint の式どおりに変換される', () => {
    // camera: zoom=2, centreOffsetX=50, centreOffsetY=-30, rotationDeg=0, displayScale=1
    // world 座標は変わらず: tl=(10,20) tr=(110,20) bl=(10,70) br=(110,70)
    // worldPointToCssPoint:
    //   pivot=(200,150)
    //   position=(200+50, 150-30)=(250,120)
    //   unscaled = world - pivot
    //   scaled = unscaled * zoom(2)
    //   rotated = scaled（rotation 0 なのでそのまま）
    //   parent = position + rotated
    //   css = parent * displayScale(1) = parent
    //
    // tl: unscaled=(-190,-130) scaled=(-380,-260) parent=(250-380,120-260)=(-130,-140)
    // tr: unscaled=(-90,-130)  scaled=(-180,-260) parent=(250-180,120-260)=(70,-140)
    // bl: unscaled=(-190,-80)  scaled=(-380,-160) parent=(250-380,120-160)=(-130,-40)
    // br: unscaled=(-90,-80)   scaled=(-180,-160) parent=(250-180,120-160)=(70,-40)
    const objects = [imageObject()];
    const viewport: SceneHitTestViewport = {
      ...baseViewport,
      camera: { centreOffsetX: 50, centreOffsetY: -30, zoom: 2, rotationDeg: 0 },
    };

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1'],
      objects,
      time: 5,
      viewport,
    });

    const entry = result[0];
    expect(entry.visible).toBe(true);
    expect(entry.points).toBe('-130,-140 70,-140 70,-40 -130,-40');
    expect(entry.handles).toEqual([
      { corner: 'top-left', x: -135, y: -145 },
      { corner: 'top-right', x: 65, y: -145 },
      { corner: 'bottom-left', x: -135, y: -45 },
      { corner: 'bottom-right', x: 65, y: -45 },
    ]);
  });

  it('rotation=90° のときコーナー順序（tl→tr→br→bl）が回転後の座標へ正しく対応する', () => {
    // getObjectWorldCorners: rotationRad = 90° = π/2。
    // rotateVec(v, rad) = (v.x*cos - v.y*sin, v.x*sin + v.y*cos)。
    // IEEE754 では Math.cos(π/2) は厳密には 0 ではなく 6.123233995736766e-17
    // という極小の誤差を持つ（Math.sin(π/2) は厳密に 1）。
    // そのため tl→tr→br→bl の「ワールド座標」の一部は理論値からごく僅かに
    // ずれる（例: topRight.x は 10 ではなく 10.000000000000005 …）。
    // ただし本テストでは identity camera（zoom=1, centreOffset=0, rotation=0）
    // を使っており、worldPointToCssPoint は pivot(200,150) を一旦引いてから
    // 再び足し戻すだけの恒等変換になる。この pivot 往復により上記の極小誤差は
    // 打ち消され、CSS 座標としては厳密に整数値へ丸まることを実測で確認済み
    // （Node で worldPointToCssPoint 相当の式を実行し === で確認した）。
    // よって以下のリテラル値は厳密一致で問題ない。
    //
    // 手計算（理想値 cos=0, sin=1 で近似した「回転後の位置」の直感）:
    //   container=(10,20)
    //   local: tl(0,0) tr(100,0) bl(0,50) br(100,50)
    //   rotateVec(local, 90°) ≈ (-local.y, local.x)
    //     tl: (0,0)      → world (10,20)
    //     tr: (0,100)    → world (10,120)
    //     bl: (-50,0)    → world (-40,20)
    //     br: (-50,100)  → world (-40,120)
    //   worldPointToCssPoint（identity camera, displayScale 1）は恒等変換なので
    //   css はそのまま同じ値になる。
    const objects = [imageObject({ rotation: 90 })];

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1'],
      objects,
      time: 5,
      viewport: baseViewport,
    });

    const entry = result[0];
    expect(entry.visible).toBe(true);
    // tl→tr→br→bl の順で points 文字列を構成する。
    expect(entry.points).toBe('10,20 10,120 -40,120 -40,20');
    expect(entry.handles).toEqual([
      { corner: 'top-left', x: 5, y: 15 },
      { corner: 'top-right', x: 5, y: 115 },
      { corner: 'bottom-left', x: -45, y: 15 },
      { corner: 'bottom-right', x: -45, y: 115 },
    ]);
  });

  it('プレイヘッドが時間帯外（time < startTime）なら visible:false, points:"", handles:[] を返す', () => {
    // isObjectVisibleAtTime: time >= startTime && time < startTime+duration。
    // startTime=5 に対し time=0 は範囲外 → getObjectWorldCorners は null。
    const objects = [imageObject()];

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1'],
      objects,
      time: 0,
      viewport: baseViewport,
    });

    expect(result).toHaveLength(1);
    const entry = result[0];
    expect(entry.objectId).toBe('obj-1');
    expect(entry.visible).toBe(false);
    expect(entry.points).toBe('');
    expect(entry.handles).toEqual([]);
  });

  it('selectedIds に含まれないオブジェクトは結果に含まれない', () => {
    const objects = [imageObject({ id: 'obj-1' }), imageObject({ id: 'obj-2' })];

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-2'],
      objects,
      time: 5,
      viewport: baseViewport,
    });

    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('obj-2');
  });

  it('複数選択時は selectedIds の順ではなく objects 配列の順で返す', () => {
    // objects は obj-2, obj-1 の順。selectedIds はあえて逆順（obj-1, obj-2）で渡す。
    // 現行 SceneSelectionOverlay.tsx の
    // `objects.filter((obj) => selectedIds.includes(obj.id))` は objects の順を
    // 保持するため、その挙動を踏襲する。
    const objects = [imageObject({ id: 'obj-2' }), imageObject({ id: 'obj-1' })];

    const result = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1', 'obj-2'],
      objects,
      time: 5,
      viewport: baseViewport,
    });

    expect(result.map((entry) => entry.objectId)).toEqual(['obj-2', 'obj-1']);
  });
});
