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
        name: '*表情',
        isGroup: true,
        isRadio: true,
        children: [leaf('l-smile', '笑顔'), leaf('l-angry', '怒り')],
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
  it('returns an empty context when nothing is selected', () => {
    const context = deriveRemoteDeckContext({ selectedId: null, objects: [] } as any);
    expect(context).toEqual({ objectId: null, objectType: null, properties: [] });
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

  it('falls back to type-only context for unsupported object types', () => {
    const shape = { id: 'shape-1', type: 'shape', layer: 0, startTime: 0, duration: 5 } as any;
    const context = deriveRemoteDeckContext({ selectedId: 'shape-1', objects: [shape] } as any);
    expect(context).toEqual({ objectId: 'shape-1', objectType: 'shape', properties: [] });
  });

  it('omits psd expression groups when layer data is missing', () => {
    const psd = { ...buildPsdFixture(), rootLayer: undefined, activeLayerIds: undefined };
    const context = deriveRemoteDeckContext({ selectedId: 'psd-1', objects: [psd] } as any);
    expect(context.properties.map((p) => p.key)).toEqual(['scale']);
  });
});
