import { describe, expect, it } from 'vitest';
import { deriveRemoteDeckContext } from './remoteDeckSelectionContext';
import type { PsdLayerNode } from '../types';

const leaf = (id: string, name: string): PsdLayerNode => ({
  id,
  name,
  isGroup: false,
  isRadio: false,
  children: [],
  width: 10,
  height: 10,
  left: 0,
  top: 0,
  defaultVisible: true,
});

const buildPsdFixture = () => {
  const rootLayer: PsdLayerNode = {
    id: 'root',
    name: 'root',
    isGroup: true,
    isRadio: false,
    children: [
      {
        id: 'g-face',
        name: '表情',
        isGroup: true,
        isRadio: false,
        children: [
          { ...leaf('l-smile', '*笑顔'), isRadio: true },
          { ...leaf('l-angry', '*怒り'), isRadio: true },
        ],
        width: 0,
        height: 0,
        left: 0,
        top: 0,
        defaultVisible: true,
      },
      leaf('l-body', '体'),
    ],
    width: 0,
    height: 0,
    left: 0,
    top: 0,
    defaultVisible: true,
  };
  return {
    id: 'psd-1',
    type: 'psd',
    layer: 0,
    x: 0,
    y: 0,
    startTime: 0,
    duration: 5,
    scale: 1.5,
    rootLayer,
    activeLayerIds: { root: true, 'g-face': true, 'l-smile': true, 'l-body': true },
  } as any;
};

describe('deriveRemoteDeckContext', () => {
  it('builds an enum from radio GROUP siblings (PSDTool hair-style switching)', () => {
    const short = {
      ...leaf('g-short', '*髪ショート'),
      isGroup: true,
      isRadio: true,
      children: [leaf('l-colour', '!髪色')],
    };
    const long = {
      ...leaf('g-long', '*髪ロング'),
      isGroup: true,
      isRadio: true,
      children: [leaf('l-colour-l', '!髪色L')],
    };
    const rootLayer: PsdLayerNode = {
      id: 'root',
      name: 'root',
      isGroup: true,
      isRadio: false,
      children: [
        { ...leaf('g-hair', '!髪'), isGroup: true, children: [short, long] },
      ],
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      defaultVisible: true,
    };
    const psd = {
      ...buildPsdFixture(),
      rootLayer,
      activeLayerIds: { root: true, 'g-hair': true, 'g-short': true, 'l-colour': true },
    };
    const context = deriveRemoteDeckContext({ selectedId: 'psd-1', objects: [psd] } as any);

    const hairEnum = context.properties.find((p) => p.key === 'psdRadio:g-hair');
    expect(hairEnum).toEqual({
      key: 'psdRadio:g-hair',
      label: '髪',
      kind: 'enum',
      value: 'g-short',
      options: [
        { value: 'g-short', label: '髪ショート' },
        { value: 'g-long', label: '髪ロング' },
      ],
    });
    // ラジオグループの内側（!髪色 等）は排他選択肢として扱わない
    expect(context.properties.some((p) => p.key === 'psdRadio:g-short')).toBe(false);
  });

  it('strips PSDTool markers (* and !) from labels', () => {
    const psd = buildPsdFixture();
    psd.rootLayer!.children[1] = { ...leaf('l-body', '!体') };
    const context = deriveRemoteDeckContext({ selectedId: 'psd-1', objects: [psd] } as any);
    const body = context.psdLayerTree!.find((n) => n.id === 'l-body');
    expect(body!.label).toBe('体');
  });

  it('returns an empty context when nothing is selected', () => {
    const context = deriveRemoteDeckContext({ selectedId: null, objects: [] } as any);
    expect(context).toEqual({ objectId: null, objectType: null, objectName: null, properties: [] });
  });

  it('returns an empty context when the selected id no longer exists', () => {
    const context = deriveRemoteDeckContext({ selectedId: 'gone', objects: [] } as any);
    expect(context.objectId).toBeNull();
  });

  it('derives scale and expression properties for a psd object', () => {
    const context = deriveRemoteDeckContext({
      selectedId: 'psd-1',
      objects: [buildPsdFixture()],
    } as any);

    expect(context.objectId).toBe('psd-1');
    expect(context.objectType).toBe('psd');

    const scale = context.properties.find((p) => p.key === 'scale');
    expect(scale).toEqual({
      key: 'scale',
      label: 'スケール',
      kind: 'number',
      value: 1.5,
      min: 0.1,
      max: 10,
      step: 0.01,
    });

    const expression = context.properties.find((p) => p.key === 'psdRadio:g-face');
    expect(expression).toEqual({
      key: 'psdRadio:g-face',
      label: '表情',
      kind: 'enum',
      value: 'l-smile',
      options: [
        { value: 'l-smile', label: '笑顔' },
        { value: 'l-angry', label: '怒り' },
      ],
    });
  });

  it('derives a volume property for an audio object', () => {
    const audio = {
      id: 'audio-1',
      type: 'audio',
      layer: 0,
      startTime: 0,
      duration: 5,
      volume: 0.8,
      muted: false,
    } as any;
    const context = deriveRemoteDeckContext({ selectedId: 'audio-1', objects: [audio] } as any);

    expect(context.objectType).toBe('audio');
    expect(context.properties).toEqual([
      { key: 'volume', label: '音量', kind: 'number', value: 0.8, min: 0, max: 1, step: 0.01 },
    ]);
  });

  it('derives common transform properties for visual objects', () => {
    const shape = {
      id: 'shape-1',
      type: 'shape',
      layer: 0,
      startTime: 0,
      duration: 5,
      x: 320,
      y: 240,
      rotation: 45,
      scaleX: 1.5,
      scaleY: 0.5,
      opacity: 0.8,
    } as any;
    const context = deriveRemoteDeckContext({ selectedId: 'shape-1', objects: [shape] } as any);

    const byKey = Object.fromEntries(context.properties.map((p) => [p.key, p]));
    expect(byKey.x).toMatchObject({ kind: 'number', value: 320, step: 1 });
    expect(byKey.y).toMatchObject({ kind: 'number', value: 240, step: 1 });
    expect(byKey.rotation).toMatchObject({ kind: 'number', value: 45, min: -180, max: 180 });
    expect(byKey.opacity).toMatchObject({ kind: 'number', value: 0.8, min: 0, max: 1 });
    expect(byKey.scaleX).toMatchObject({ kind: 'number', value: 1.5, min: 0.1, max: 10 });
    expect(byKey.scaleY).toMatchObject({ kind: 'number', value: 0.5, min: 0.1, max: 10 });
  });

  it('includes transform properties for psd objects alongside scale', () => {
    const psd = { ...buildPsdFixture(), x: 10, y: 20, rotation: 0, opacity: 1 };
    const context = deriveRemoteDeckContext({ selectedId: 'psd-1', objects: [psd] } as any);
    const keys = context.properties.map((p) => p.key);
    expect(keys).toContain('scale');
    expect(keys).toContain('x');
    expect(keys).toContain('y');
    expect(keys).toContain('rotation');
    expect(keys).toContain('opacity');
    expect(keys).not.toContain('scaleX');
  });

  it('keeps the audio surface volume-only (no meaningless transforms)', () => {
    const audio = {
      id: 'audio-1',
      type: 'audio',
      layer: 0,
      startTime: 0,
      duration: 5,
      volume: 0.8,
      muted: false,
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
    } as any;
    const context = deriveRemoteDeckContext({ selectedId: 'audio-1', objects: [audio] } as any);
    expect(context.properties.map((p) => p.key)).toEqual(['volume']);
  });

  it('includes a psd layer tree with visibility and radio flags', () => {
    const context = deriveRemoteDeckContext({
      selectedId: 'psd-1',
      objects: [buildPsdFixture()],
    } as any);

    expect(context.psdLayerTree).toEqual([
      {
        id: 'g-face',
        label: '表情',
        isGroup: true,
        isRadio: false,
        visible: true,
        children: [
          { id: 'l-smile', label: '笑顔', isGroup: false, isRadio: true, visible: true, children: [] },
          { id: 'l-angry', label: '怒り', isGroup: false, isRadio: true, visible: false, children: [] },
        ],
      },
      { id: 'l-body', label: '体', isGroup: false, isRadio: false, visible: true, children: [] },
    ]);
  });

  it('caps the serialised psd layer tree by reducing depth for huge trees', () => {
    const wide = (idPrefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => leaf(`${idPrefix}-${i}`, `L${i}`));
    const rootLayer: PsdLayerNode = {
      id: 'root',
      name: 'root',
      isGroup: true,
      isRadio: false,
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      defaultVisible: true,
      children: Array.from({ length: 30 }, (_, g) => ({
        id: `g-${g}`,
        name: `G${g}`,
        isGroup: true,
        isRadio: false,
        width: 0,
        height: 0,
        left: 0,
        top: 0,
        defaultVisible: true,
        children: wide(`g-${g}-leaf`, 30),
      })),
    };
    const psd = { ...buildPsdFixture(), rootLayer, activeLayerIds: { root: true } };
    const context = deriveRemoteDeckContext({ selectedId: 'psd-1', objects: [psd] } as any);

    const countNodes = (nodes: any[]): number =>
      nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
    expect(context.psdLayerTree).toBeDefined();
    expect(countNodes(context.psdLayerTree!)).toBeLessThanOrEqual(200);
    // 深さ制限で切られてもトップレベルのグループ自体は残る
    expect(context.psdLayerTree!.length).toBe(30);
  });

  it('falls back to type-only context for unsupported object types', () => {
    const shape = { id: 'shape-1', type: 'shape', layer: 0, startTime: 0, duration: 5 } as any;
    const context = deriveRemoteDeckContext({ selectedId: 'shape-1', objects: [shape] } as any);
    expect(context.objectId).toBe('shape-1');
    expect(context.objectType).toBe('shape');
  });

  it('omits psd expression groups when layer data is missing', () => {
    const psd = { ...buildPsdFixture(), rootLayer: undefined, activeLayerIds: undefined };
    const context = deriveRemoteDeckContext({ selectedId: 'psd-1', objects: [psd] } as any);
    expect(context.properties.some((p) => p.key.startsWith('psdRadio:'))).toBe(false);
    expect(context.psdLayerTree).toBeUndefined();
    expect(context.properties.map((p) => p.key)).toContain('scale');
  });
});
