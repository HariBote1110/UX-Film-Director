import { describe, expect, it } from 'vitest';
import { LayerState } from '../types';
import { MAX_LAYERS } from '../components/timelineConstants';
import { deleteLayerTrack, insertLayerTrack, swapLayerTracks } from './layerTrackOps';

const makeLayers = (): LayerState[] =>
  Array.from({ length: MAX_LAYERS }, (_, index) => ({
    name: `L${index}`,
    visible: true,
    locked: false
  }));

describe('swapLayerTracks', () => {
  it('swaps layer metadata and object indices', () => {
    const layers = makeLayers();
    layers[1] = { name: 'TrackA', visible: true, locked: false };
    layers[3] = { name: 'TrackB', visible: true, locked: false };
    const objects = [
      { id: 'a', type: 'shape' as const, name: 'x', layer: 1, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const },
      { id: 'b', type: 'shape' as const, name: 'y', layer: 3, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const }
    ];
    const { layers: nextLayers, objects: nextObjects } = swapLayerTracks(layers, objects, 1, 3);
    expect(nextLayers[1].name).toBe('TrackB');
    expect(nextLayers[3].name).toBe('TrackA');
    expect(nextObjects.find((o) => o.id === 'a')?.layer).toBe(3);
    expect(nextObjects.find((o) => o.id === 'b')?.layer).toBe(1);
  });

  it('remaps psd lipSync targetLayer when swapping', () => {
    const layers = makeLayers();
    const psd = {
      id: 'p',
      type: 'psd' as const,
      name: 'psd',
      layer: 0,
      startTime: 0,
      duration: 1,
      src: '',
      width: 1,
      height: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 0,
      endY: 0,
      easing: 'linear' as const,
      lipSync: {
        enabled: true,
        sourceMode: 'layer' as const,
        targetLayer: 2,
        audioId: null,
        mapping: { a: '', i: '', u: '', e: '', o: '', n: '' }
      }
    };
    const { objects: nextObjects } = swapLayerTracks(layers, [psd], 2, 5);
    const nextPsd = nextObjects[0];
    if (nextPsd.type !== 'psd' || !nextPsd.lipSync) throw new Error('expected psd');
    expect(nextPsd.lipSync.targetLayer).toBe(5);
  });
});

describe('insertLayerTrack', () => {
  it('shifts objects at and below insert index and keeps length', () => {
    const layers = makeLayers();
    const objects = [
      { id: 'low', type: 'shape' as const, name: 'x', layer: 0, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const },
      { id: 'mid', type: 'shape' as const, name: 'y', layer: 5, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const }
    ];
    const { layers: nextLayers, objects: nextObjects } = insertLayerTrack(layers, objects, 5);
    expect(nextLayers.length).toBe(MAX_LAYERS);
    expect(nextObjects.find((o) => o.id === 'low')?.layer).toBe(0);
    expect(nextObjects.find((o) => o.id === 'mid')?.layer).toBe(6);
  });

  it('drops objects that overflow past the last layer', () => {
    const layers = makeLayers();
    const objects = [
      { id: 'top', type: 'shape' as const, name: 't', layer: MAX_LAYERS - 1, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const }
    ];
    const { objects: nextObjects } = insertLayerTrack(layers, objects, 0);
    expect(nextObjects.find((o) => o.id === 'top')).toBeUndefined();
  });
});

describe('deleteLayerTrack', () => {
  it('removes clips on deleted row and shifts higher layers down', () => {
    const layers = makeLayers();
    const objects = [
      { id: 'gone', type: 'shape' as const, name: 'g', layer: 2, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const },
      { id: 'stay', type: 'shape' as const, name: 's', layer: 5, startTime: 0, duration: 1, shapeType: 'rect' as const, width: 1, height: 1, fill: '#000', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, enableAnimation: false, endX: 0, endY: 0, easing: 'linear' as const }
    ];
    const { layers: nextLayers, objects: nextObjects } = deleteLayerTrack(layers, objects, 2);
    expect(nextLayers.length).toBe(MAX_LAYERS);
    expect(nextObjects.find((o) => o.id === 'gone')).toBeUndefined();
    expect(nextObjects.find((o) => o.id === 'stay')?.layer).toBe(4);
  });

  it('disables lipSync when its target layer is deleted', () => {
    const layers = makeLayers();
    const psd = {
      id: 'p',
      type: 'psd' as const,
      name: 'psd',
      layer: 0,
      startTime: 0,
      duration: 1,
      src: '',
      width: 1,
      height: 1,
      scale: 1,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      enableAnimation: false,
      endX: 0,
      endY: 0,
      easing: 'linear' as const,
      lipSync: {
        enabled: true,
        sourceMode: 'layer' as const,
        targetLayer: 3,
        audioId: null,
        mapping: { a: '', i: '', u: '', e: '', o: '', n: '' }
      }
    };
    const { objects: nextObjects } = deleteLayerTrack(layers, [psd], 3);
    const nextPsd = nextObjects[0];
    if (nextPsd.type !== 'psd' || !nextPsd.lipSync) throw new Error('expected psd');
    expect(nextPsd.lipSync.enabled).toBe(false);
    expect(nextPsd.lipSync.targetLayer).toBe(0);
  });
});
