import { describe, expect, it } from 'vitest';
import { applySceneSelectionOverlayGeometry } from './sceneSelectionOverlayPatch';
import type {
  SceneSelectionOverlayPatchElement,
  SceneSelectionOverlayPatchGroupElement,
  SceneSelectionOverlayPatchTargets,
} from './sceneSelectionOverlayPatch';
import type { SceneSelectionOverlayObjectGeometry } from './sceneSelectionOverlayGeometry';

/**
 * 選択枠オーバーレイの時間追従を React 再レンダーではなく
 * `useStore.subscribe` + SVG 属性の直接更新（命令的パッチ）で行うための
 * 契約テスト（TDD Red フェーズ）。`src/components/sceneSelectionOverlayPatch.ts`
 * はまだ存在しないため、このファイルは import 解決に失敗して落ちる
 * （それが Red の目的）。
 *
 * DOM を実際には使わず、`setAttribute` 呼び出しを記録するだけの
 * フェイク要素で検証する（jsdom 非導入・vitest environment: node のため）。
 */

/** setAttribute 呼び出しを記録するフェイク要素。 */
class FakePatchElement implements SceneSelectionOverlayPatchElement {
  calls: Array<{ name: string; value: string }> = [];

  setAttribute(name: string, value: string): void {
    this.calls.push({ name, value });
  }

  /** 最後に設定された値（無ければ undefined）。 */
  lastValueOf(name: string): string | undefined {
    const matching = this.calls.filter((c) => c.name === name);
    return matching.length > 0 ? matching[matching.length - 1].value : undefined;
  }
}

/** group 要素は setAttribute に加えて style.display を持つ。 */
class FakePatchGroupElement extends FakePatchElement implements SceneSelectionOverlayPatchGroupElement {
  style: { display: string } = { display: '' };
}

const makeTargets = (): {
  group: FakePatchGroupElement;
  polygon: FakePatchElement;
  handles: {
    'top-left': FakePatchElement;
    'top-right': FakePatchElement;
    'bottom-left': FakePatchElement;
    'bottom-right': FakePatchElement;
  };
  targets: SceneSelectionOverlayPatchTargets;
} => {
  const group = new FakePatchGroupElement();
  const polygon = new FakePatchElement();
  const handles = {
    'top-left': new FakePatchElement(),
    'top-right': new FakePatchElement(),
    'bottom-left': new FakePatchElement(),
    'bottom-right': new FakePatchElement(),
  } as const;

  const targets: SceneSelectionOverlayPatchTargets = {
    group,
    polygon,
    handles,
  };

  return { group, polygon, handles, targets };
};

const visibleEntry = (objectId: string): SceneSelectionOverlayObjectGeometry => ({
  objectId,
  visible: true,
  points: '10,20 110,20 110,70 10,70',
  handles: [
    { corner: 'top-left', x: 5, y: 15 },
    { corner: 'top-right', x: 105, y: 15 },
    { corner: 'bottom-left', x: 5, y: 65 },
    { corner: 'bottom-right', x: 105, y: 65 },
  ],
});

const invisibleEntry = (objectId: string): SceneSelectionOverlayObjectGeometry => ({
  objectId,
  visible: false,
  points: '',
  handles: [],
});

describe('applySceneSelectionOverlayGeometry: 命令的パッチ契約', () => {
  it('visible entry では display が空になり、polygon の points と各ハンドルの x/y が文字列化されて設定される', () => {
    const { group, polygon, handles, targets } = makeTargets();
    const targetsMap = new Map([['obj-1', targets]]);

    applySceneSelectionOverlayGeometry(targetsMap, [visibleEntry('obj-1')]);

    expect(group.style.display).toBe('');
    expect(polygon.lastValueOf('points')).toBe('10,20 110,20 110,70 10,70');
    expect(handles['top-left'].lastValueOf('x')).toBe('5');
    expect(handles['top-left'].lastValueOf('y')).toBe('15');
    expect(handles['top-right'].lastValueOf('x')).toBe('105');
    expect(handles['top-right'].lastValueOf('y')).toBe('15');
    expect(handles['bottom-left'].lastValueOf('x')).toBe('5');
    expect(handles['bottom-left'].lastValueOf('y')).toBe('65');
    expect(handles['bottom-right'].lastValueOf('x')).toBe('105');
    expect(handles['bottom-right'].lastValueOf('y')).toBe('65');
  });

  it('invisible entry では display が "none" になり、polygon/handle の setAttribute は一切呼ばれない', () => {
    const { group, polygon, handles, targets } = makeTargets();
    const targetsMap = new Map([['obj-1', targets]]);

    applySceneSelectionOverlayGeometry(targetsMap, [invisibleEntry('obj-1')]);

    expect(group.style.display).toBe('none');
    expect(polygon.calls).toEqual([]);
    expect(handles['top-left'].calls).toEqual([]);
    expect(handles['top-right'].calls).toEqual([]);
    expect(handles['bottom-left'].calls).toEqual([]);
    expect(handles['bottom-right'].calls).toEqual([]);
  });

  it('targets にはあるが entries に無い objectId は display が "none" になる（選択解除の過渡状態を隠す）', () => {
    const { group, targets } = makeTargets();
    const targetsMap = new Map([['obj-1', targets]]);

    // entries に obj-1 が含まれない（他のオブジェクトだけが渡される）。
    applySceneSelectionOverlayGeometry(targetsMap, [visibleEntry('obj-2')]);

    expect(group.style.display).toBe('none');
  });

  it('entries にはあるが targets に無い objectId は throw しない（何もしない）', () => {
    const targetsMap = new Map<string, SceneSelectionOverlayPatchTargets>();

    expect(() => {
      applySceneSelectionOverlayGeometry(targetsMap, [visibleEntry('obj-missing')]);
    }).not.toThrow();
  });

  it('visible→invisible→visible の順に apply すると、最後の apply で新しいジオメトリが再設定される', () => {
    const { group, polygon, handles, targets } = makeTargets();
    const targetsMap = new Map([['obj-1', targets]]);

    applySceneSelectionOverlayGeometry(targetsMap, [visibleEntry('obj-1')]);
    expect(group.style.display).toBe('');

    applySceneSelectionOverlayGeometry(targetsMap, [invisibleEntry('obj-1')]);
    expect(group.style.display).toBe('none');
    // invisible の間は polygon/handle に触れていないため、直前の値がそのまま残る。
    expect(polygon.lastValueOf('points')).toBe('10,20 110,20 110,70 10,70');

    const movedEntry: SceneSelectionOverlayObjectGeometry = {
      objectId: 'obj-1',
      visible: true,
      points: '20,40 220,40 220,140 20,140',
      handles: [
        { corner: 'top-left', x: 15, y: 35 },
        { corner: 'top-right', x: 215, y: 35 },
        { corner: 'bottom-left', x: 15, y: 135 },
        { corner: 'bottom-right', x: 215, y: 135 },
      ],
    };
    applySceneSelectionOverlayGeometry(targetsMap, [movedEntry]);

    expect(group.style.display).toBe('');
    expect(polygon.lastValueOf('points')).toBe('20,40 220,40 220,140 20,140');
    expect(handles['top-left'].lastValueOf('x')).toBe('15');
    expect(handles['top-left'].lastValueOf('y')).toBe('35');
    expect(handles['bottom-right'].lastValueOf('x')).toBe('215');
    expect(handles['bottom-right'].lastValueOf('y')).toBe('135');
  });
});
