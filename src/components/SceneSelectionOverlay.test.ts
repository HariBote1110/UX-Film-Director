import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneSelectionOverlay } from './SceneSelectionOverlay';
import { computeSceneSelectionOverlayGeometry } from './sceneSelectionOverlayGeometry';
import type { SceneCamera, SceneHitTestViewport } from '../utils/sceneHitTest';
import type { TimelineObject } from '../types';

/**
 * 実機バグA（ゴースト選択枠）: 再生ヘッドがオブジェクトの
 * [startTime, startTime+duration) の範囲外にあるとき、本体は描かれない
 * （snapshot builder が除外する）のに選択枠（黄色い矩形・ハンドル）だけが
 * 描かれてしまう不具合。`getObjectWorldCorners`（sceneHitTest.ts）に
 * 時間帯ゲートを追加したことで、このコンポーネントは自動的に対象を
 * スキップするようになる。
 *
 * このプロジェクトの vitest 設定（vite.config.ts）は `src/**\/*.test.ts`
 * のみを対象とするため（.tsx テストの前例が無い）、JSX を使わず
 * `React.createElement` で記述する。
 *
 * 【新契約（TDD Red フェーズ）】
 * 時間追従を React 再レンダーではなく `useStore.subscribe` + SVG 属性の
 * 直接更新（命令的パッチ、`sceneSelectionOverlayPatch.ts`）で行うリファクタの
 * 前段として、選択中オブジェクトの `<g data-object-id>` は時間帯外でも
 * 「要素ごと消す」のではなく「常にレンダーした上で display:none にする」
 * よう契約を変更する（命令的パッチが再表示時に同じ要素へ属性を書き戻せる
 * ようにするため）。実機バグA対策としての「時間帯外では視覚的に何も描かれず
 * 操作もできない」という保護目的そのものは変えない。
 * ジオメトリ計算（points/handles の座標）は `sceneSelectionOverlayGeometry.ts`
 * の `computeSceneSelectionOverlayGeometry` へ切り出される。
 */

const identityCamera: SceneCamera = { centreOffsetX: 0, centreOffsetY: 0, zoom: 1, rotationDeg: 0 };

const viewport: SceneHitTestViewport = {
  projectWidth: 400,
  projectHeight: 300,
  displayScale: 1,
  camera: identityCamera,
};

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

describe('SceneSelectionOverlay: 症状A対策（時間帯外の選択オブジェクトは描かない）', () => {
  it('プレイヘッドが選択オブジェクトの時間帯外なら <g> はレンダーされるが display:none で不可視・非操作になる', () => {
    // 新契約: 要素そのものは消えず、常に data-object-id 付きの <g> が
    // レンダーされる。ただし display:none により「視覚的に何も描かれず、
    // ハンドルもクリックできない」という実機バグA対策の保護目的は維持する
    // （renderToStaticMarkup では style={{display:'none'}} は
    // `style="display:none"` という属性文字列になる）。
    //
    // 命令的パッチが再表示時にハンドル要素へ書き戻せるよう、非表示時も
    // 4 つのハンドル <rect> を常時マウントする（位置は x={0} y={0}）。
    const objects = [imageObject()];

    const markup = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, {
        selectedIds: ['obj-1'],
        objects,
        time: 0,
        viewport,
        width: 400,
        height: 300,
      })
    );

    expect(markup).toContain('data-object-id="obj-1"');
    expect(markup).toContain('style="display:none"');
    // 4つのハンドル <rect> が常にレンダーされることを検証
    const rectMatches = markup.match(/<rect/g);
    expect(rectMatches).toHaveLength(4);
  });

  it('プレイヘッドが選択オブジェクトの時間帯内なら選択枠を描画し、display:none は付与されない', () => {
    const objects = [imageObject()];

    const markup = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, {
        selectedIds: ['obj-1'],
        objects,
        time: 5,
        viewport,
        width: 400,
        height: 300,
      })
    );

    expect(markup).toContain('data-object-id="obj-1"');
    expect(markup).toContain('polygon');
    // 時間帯内では group を隠してはならない。
    expect(markup).not.toContain('display:none');
  });

  it('時間帯内の markup は computeSceneSelectionOverlayGeometry の points/handle 座標と完全一致する（React 描画と純関数のパリティ）', () => {
    // このテストは compute 関数を呼んでよい（React 描画と純関数の一致こそが
    // 検証したい契約のため、他のジオメトリ値そのものの検証は
    // sceneSelectionOverlayGeometry.test.ts 側の手計算リテラルが担う）。
    const objects = [imageObject()];
    const time = 5;

    const [entry] = computeSceneSelectionOverlayGeometry({
      selectedIds: ['obj-1'],
      objects,
      time,
      viewport,
    });

    const markup = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, {
        selectedIds: ['obj-1'],
        objects,
        time,
        viewport,
        width: 400,
        height: 300,
      })
    );

    expect(entry.visible).toBe(true);
    expect(markup).toContain(`points="${entry.points}"`);
    for (const handle of entry.handles) {
      expect(markup).toContain(`x="${handle.x}"`);
      expect(markup).toContain(`y="${handle.y}"`);
    }
  });

  it('visualsHidden: true のとき polygon の stroke と rect の fill/stroke が transparent になる', () => {
    const objects = [imageObject()];

    const markup = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, {
        selectedIds: ['obj-1'],
        objects,
        time: 5,
        viewport,
        width: 400,
        height: 300,
        visualsHidden: true,
      })
    );

    expect(markup).toContain('stroke="transparent"');
    expect(markup).toContain('fill="transparent"');
    expect(markup).not.toContain('#ffd700');
    expect(markup).not.toContain('#ffffff');
  });

  it('onHandlePointerDown を渡すとハンドルの pointer-events が auto になり、渡さないと none になる', () => {
    const objects = [imageObject()];
    const baseProps = {
      selectedIds: ['obj-1'],
      objects,
      time: 5,
      viewport,
      width: 400,
      height: 300,
    };

    const markupWithHandler = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, { ...baseProps, onHandlePointerDown: () => {} })
    );
    expect(markupWithHandler).toContain('pointer-events:auto');

    const markupWithoutHandler = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, baseProps)
    );
    expect(markupWithoutHandler).toContain('pointer-events:none');
  });

  it('複数選択時は selectedIds の順ではなく objects 配列の順で <g> が並ぶ', () => {
    const objA = imageObject({ id: 'obj-a' });
    const objB = imageObject({ id: 'obj-b' });
    const objects = [objB, objA]; // objects 配列順は b → a

    const markup = renderToStaticMarkup(
      React.createElement(SceneSelectionOverlay, {
        selectedIds: ['obj-a', 'obj-b'], // selectedIds はあえて逆順で渡す
        objects,
        time: 5,
        viewport,
        width: 400,
        height: 300,
      })
    );

    const indexA = markup.indexOf('data-object-id="obj-a"');
    const indexB = markup.indexOf('data-object-id="obj-b"');
    expect(indexB).toBeGreaterThanOrEqual(0);
    expect(indexA).toBeGreaterThan(indexB);
  });
});
