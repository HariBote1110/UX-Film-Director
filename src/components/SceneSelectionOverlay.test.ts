import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneSelectionOverlay } from './SceneSelectionOverlay';
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
  it('プレイヘッドが選択オブジェクトの時間帯外なら何も描画しない', () => {
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

    expect(markup).not.toContain('data-object-id="obj-1"');
    expect(markup).not.toContain('polygon');
  });

  it('プレイヘッドが選択オブジェクトの時間帯内なら選択枠を描画する', () => {
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
  });
});
