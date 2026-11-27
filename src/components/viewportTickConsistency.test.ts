import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shouldDeferCurrentTimeTick, type CurrentTimeTickRenderedState } from './Viewport';
import { shouldDeferSelectionDecorationTick } from './SceneSelectionDecorationLayer';

/**
 * 敵対的レビューで確定した回帰の再発防止契約。
 *
 * コミット 86e03c0c で Viewport の currentTime tick 処理を素の
 * `useStore.subscribe` へ一元化した。zustand の setState はリスナーを
 * set() 呼び出し内で同期実行するため、`switchScene` / `addScene` /
 * `deleteScene` / `loadProject` / `initializeProject`（src/store/useStore.ts）
 * のように objects・layers・isPlaying・currentTime を単一の set() で
 * まとめて変更するアクションでは、tick ハンドラが React のコミット前に
 * 「1レンダー分古い closure」（旧シーンの objects・stale isPlaying 等）で
 * 発火してしまう。結果、旧シーンのオブジェクトを新時刻で描く誤 publish・
 * stale isPlaying=true による旧シーン音声の audio.play()・3D ビルボードの
 * 旧データ同期が一瞬発生する（その後 renderedTickStateRef 経由の catch-up
 * effect で自己修復する）。
 *
 * 修正は「store がコミット済みレンダーより先行している tick は保留し、
 * コミット後の catch-up effect で最新 closure により実行する」。
 * この契約は、判定に使う純関数の入出力と、実装がその純関数を実際に
 * 使っている（保留・catch-up の配線が消えていない）ことの両方を固定する。
 */

const viewportSource = () => readFileSync(resolve(__dirname, 'Viewport.tsx'), 'utf8');
const selectionDecorationLayerSource = () =>
  readFileSync(resolve(__dirname, 'SceneSelectionDecorationLayer.tsx'), 'utf8');

const baseRenderedState: CurrentTimeTickRenderedState = {
  objects: ['a'],
  layers: ['layer-1'],
  isPlaying: false,
  isExporting: false,
  nativePlaybackActive: false,
  activeSceneId: 'scene-1',
  projectSettings: { width: 1920 },
};

describe('shouldDeferCurrentTimeTick', () => {
  it('returns false when every structural field matches the committed render', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(false);
  });

  it('returns true when only the objects reference differs (switchScene 等)', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, objects: ['b'] };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });

  it('returns true when only layers differs', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, layers: ['layer-2'] };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });

  it('returns true when only isPlaying differs (stale isPlaying=true による旧シーン音声再生を防ぐ)', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, isPlaying: true };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });

  it('returns true when only isExporting differs', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, isExporting: true };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });

  it('returns true when only nativePlaybackActive differs', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, nativePlaybackActive: true };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });

  it('returns true when only activeSceneId differs (switchScene/loadProject 等のシーン切替)', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, activeSceneId: 'scene-2' };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });

  it('returns true when only projectSettings differs', () => {
    const state: CurrentTimeTickRenderedState = { ...baseRenderedState, projectSettings: { width: 1280 } };
    expect(shouldDeferCurrentTimeTick(state, baseRenderedState)).toBe(true);
  });
});

describe('shouldDeferSelectionDecorationTick', () => {
  const baseSelectionState = { objects: ['a'], selectedIds: ['id-1'] };

  it('returns false when objects and selectedIds both match the committed render', () => {
    expect(
      shouldDeferSelectionDecorationTick({ ...baseSelectionState }, baseSelectionState)
    ).toBe(false);
  });

  it('returns true when only objects differs', () => {
    expect(
      shouldDeferSelectionDecorationTick({ ...baseSelectionState, objects: ['b'] }, baseSelectionState)
    ).toBe(true);
  });

  it('returns true when only selectedIds differs', () => {
    expect(
      shouldDeferSelectionDecorationTick(
        { ...baseSelectionState, selectedIds: ['id-2'] },
        baseSelectionState
      )
    ).toBe(true);
  });
});

describe('viewport tick deferral wiring (source boundary)', () => {
  it('has the currentTime subscribe listener consult shouldDeferCurrentTimeTick and stash pending ticks for catch-up', () => {
    const code = viewportSource();
    const start = code.indexOf('const unsubscribe = useStore.subscribe((state) => {');
    const end = code.indexOf('return unsubscribe;', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const listenerBlock = code.slice(start, end);
    expect(listenerBlock).toContain('shouldDeferCurrentTimeTick(');
    expect(listenerBlock).toContain('pendingDeferredTickRef');
  });

  it('runs a dependency-less catch-up effect that flushes a pending tick after commit', () => {
    const code = viewportSource();
    expect(code).toContain('pendingDeferredTickRef.current = false;');
    expect(code).toContain('onCurrentTimeTickRef.current(useStore.getState().currentTime);');
  });

  it('assigns renderedTickStateRef every render so the deferral check sees the committed values', () => {
    const code = viewportSource();
    expect(code).toContain('renderedTickStateRef.current = {');
  });
});

describe('selection decoration tick deferral wiring (source boundary)', () => {
  it('has the currentTime subscribe listener consult shouldDeferSelectionDecorationTick', () => {
    const code = selectionDecorationLayerSource();
    const start = code.indexOf('const unsubscribe = useStore.subscribe((state) => {');
    const end = code.indexOf('return unsubscribe;', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const listenerBlock = code.slice(start, end);
    expect(listenerBlock).toContain('shouldDeferSelectionDecorationTick(');
  });
});

describe('isSharedRendererNativeRenderOnlySession duplication stays in sync', () => {
  // SceneSelectionDecorationLayer.tsx のコメントが明示するとおり、この述語は
  // Viewport.tsx から意図的に複製されている（境界テストが Viewport.tsx 側の
  // 定義位置を固定しており、export 化すると無関係な多数のテストが壊れる。
  // 一方で循環 import になるため共有 util へも切り出せない）。複製である以上
  // 乖離のリスクが残るため、両ファイルから本文を抽出し正規化した文字列が
  // 一致することを固定する。乖離した場合はどちらかの修正漏れとして検知する。
  const extractFunctionBody = (code: string, name: string): string => {
    const marker = `const ${name} = (`;
    const start = code.indexOf(marker);
    if (start === -1) throw new Error(`${name} の定義が見つからない`);
    const end = code.indexOf('\n};', start);
    if (end === -1) throw new Error(`${name} の終端が見つからない`);
    return code.slice(start, end);
  };

  const normalise = (source: string): string => source.replace(/\s+/g, ' ').trim();

  it('keeps the two copies textually identical modulo whitespace', () => {
    const viewportBody = extractFunctionBody(viewportSource(), 'isSharedRendererNativeRenderOnlySession');
    const layerBody = extractFunctionBody(
      selectionDecorationLayerSource(),
      'isSharedRendererNativeRenderOnlySession'
    );

    expect(normalise(layerBody)).toBe(normalise(viewportBody));
    // 中身が空にすり替わっていないことも合わせて固定する。
    expect(normalise(viewportBody)).toContain("mediaKindById.get(clip.media_id) !== 'Video'");
  });
});
