import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { createCommandBus } from './commandBus';
import { registerAppCommands } from './registerAppCommands';
import { setCommandBridgeForTests } from '../utils/rustBackendCommandBridge';
import type { RustBackendApplyCommandResult } from '../utils/rustBackendCommandBridge';

/** `undoCommand`/`redoCommand`(fire-and-forget)の完了をテストから待つためのヘルパー。 */
const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('registerAppCommands', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
  });

  afterEach(() => {
    setCommandBridgeForTests(null);
  });

  it('wires playback.toggle to togglePlay', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);

    expect(useStore.getState().isPlaying).toBe(false);
    bus.execute('playback.toggle');
    expect(useStore.getState().isPlaying).toBe(true);
  });

  it('wires playback.seekRelative to move currentTime by frames/fps', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    useStore.getState().setTime(1);

    bus.execute('playback.seekRelative', 60);

    expect(useStore.getState().currentTime).toBeCloseTo(2, 5);
  });

  it('wires playback.seekRelative to move backwards for negative frames, clamped at zero', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    useStore.getState().setTime(0.1);

    bus.execute('playback.seekRelative', -60);

    expect(useStore.getState().currentTime).toBe(0);
  });

  it('wires edit.undo and edit.redo to the command-stack history actions', async () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);

    // R4-8 group f: undo/redo は非同期 command stack(`undoCommand`/
    // `redoCommand`)へ移行した。bridge を注入し、setCamera の apply/invert
    // だけを模す最小限のフェイクで配線(edit.undo/edit.redo → undoCommand/
    // redoCommand)を検証する。
    setCommandBridgeForTests({
      applyCommand: async ({ scene, command }): Promise<RustBackendApplyCommandResult> => {
        if (command.kind !== 'setCamera') throw new Error(`unexpected command kind: ${command.kind}`);
        return { success: true, result: { scene: { ...scene, camera: command.next } } };
      },
    });

    const previousCamera = useStore.getState().camera;
    const nextCamera = { ...previousCamera, zoom: 2.5 };
    useStore.getState().pushHistoryCommand({ kind: 'setCamera', previous: previousCamera, next: nextCamera });
    useStore.setState({ camera: nextCamera });

    bus.execute('edit.undo');
    await flushAsync();
    expect(useStore.getState().camera.zoom).not.toBe(2.5);

    bus.execute('edit.redo');
    await flushAsync();
    expect(useStore.getState().camera.zoom).toBe(2.5);
  });

  it('wires edit.delete to deleteSelectedObjects when no ripple payload is given', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const object = {
      id: 'obj-1',
      type: 'text',
      layer: 0,
      x: 0,
      y: 0,
      startTime: 0,
      duration: 5,
    } as any;
    useStore.setState({ objects: [object], selectedIds: ['obj-1'], selectedId: 'obj-1' });

    bus.execute('edit.delete');

    expect(useStore.getState().objects.find((o) => o.id === 'obj-1')).toBeUndefined();
  });

  it('wires property.set to updateObject with clamped scale for a psd object', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const psd = {
      id: 'psd-1',
      type: 'psd',
      layer: 0,
      x: 0,
      y: 0,
      startTime: 0,
      duration: 5,
      scale: 1,
    } as any;
    useStore.setState({ objects: [psd] });

    bus.execute('property.set', { objectId: 'psd-1', propertyKey: 'scale', value: 2.5 });
    expect((useStore.getState().objects[0] as any).scale).toBe(2.5);

    bus.execute('property.set', { objectId: 'psd-1', propertyKey: 'scale', value: 99 });
    expect((useStore.getState().objects[0] as any).scale).toBe(10);
  });

  it('wires property.set to updateObject with clamped volume for an audio object', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const audio = {
      id: 'audio-1',
      type: 'audio',
      layer: 0,
      startTime: 0,
      duration: 5,
      volume: 0.5,
      muted: false,
    } as any;
    useStore.setState({ objects: [audio] });

    bus.execute('property.set', { objectId: 'audio-1', propertyKey: 'volume', value: 0.9 });
    expect((useStore.getState().objects[0] as any).volume).toBe(0.9);

    bus.execute('property.set', { objectId: 'audio-1', propertyKey: 'volume', value: 7 });
    expect((useStore.getState().objects[0] as any).volume).toBe(1);
  });

  it('wires property.set psdRadio keys to switch expression layers exclusively', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const rootLayer = {
      id: 'root',
      name: 'root',
      isGroup: true,
      isRadio: false,
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      defaultVisible: true,
      children: [
        {
          id: 'g-face',
          name: '表情',
          isGroup: true,
          isRadio: false,
          width: 0,
          height: 0,
          left: 0,
          top: 0,
          defaultVisible: true,
          children: [
            { id: 'l-smile', name: '*笑顔', isGroup: false, isRadio: true, children: [], width: 1, height: 1, left: 0, top: 0, defaultVisible: true },
            { id: 'l-angry', name: '*怒り', isGroup: false, isRadio: true, children: [], width: 1, height: 1, left: 0, top: 0, defaultVisible: false },
          ],
        },
      ],
    };
    const psd = {
      id: 'psd-1',
      type: 'psd',
      layer: 0,
      x: 0,
      y: 0,
      startTime: 0,
      duration: 5,
      scale: 1,
      rootLayer,
      activeLayerIds: { root: true, 'g-face': true, 'l-smile': true },
    } as any;
    useStore.setState({ objects: [psd] });

    bus.execute('property.set', {
      objectId: 'psd-1',
      propertyKey: 'psdRadio:g-face',
      value: 'l-angry',
    });

    const updated = useStore.getState().objects[0] as any;
    expect(updated.activeLayerIds['l-angry']).toBe(true);
    expect(updated.activeLayerIds['l-smile']).toBe(false);
    expect(Array.isArray(updated.layerTree)).toBe(true);
  });

  it('wires property.set to generic transform keys with sensible clamps', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const shape = {
      id: 'shape-1',
      type: 'shape',
      layer: 0,
      startTime: 0,
      duration: 5,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
    } as any;
    useStore.setState({ objects: [shape] });

    bus.execute('property.set', { objectId: 'shape-1', propertyKey: 'x', value: 640 });
    bus.execute('property.set', { objectId: 'shape-1', propertyKey: 'y', value: -80 });
    bus.execute('property.set', { objectId: 'shape-1', propertyKey: 'rotation', value: 30 });
    bus.execute('property.set', { objectId: 'shape-1', propertyKey: 'opacity', value: 2 });
    bus.execute('property.set', { objectId: 'shape-1', propertyKey: 'scaleX', value: 0.01 });
    bus.execute('property.set', { objectId: 'shape-1', propertyKey: 'scaleY', value: 3 });

    const updated = useStore.getState().objects[0] as any;
    expect(updated.x).toBe(640);
    expect(updated.y).toBe(-80);
    expect(updated.rotation).toBe(30);
    expect(updated.opacity).toBe(1);
    expect(updated.scaleX).toBe(0.1);
    expect(updated.scaleY).toBe(3);
  });

  it('wires property.set psdLayer to toggle plain layer visibility', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const rootLayer = {
      id: 'root',
      name: 'root',
      isGroup: true,
      isRadio: false,
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      defaultVisible: true,
      children: [
        { id: 'l-body', name: '体', isGroup: false, isRadio: false, children: [], width: 1, height: 1, left: 0, top: 0, defaultVisible: true },
      ],
    };
    const psd = {
      id: 'psd-1',
      type: 'psd',
      layer: 0,
      x: 0,
      y: 0,
      startTime: 0,
      duration: 5,
      scale: 1,
      rootLayer,
      activeLayerIds: { root: true, 'l-body': true },
    } as any;
    useStore.setState({ objects: [psd] });

    bus.execute('property.set', { objectId: 'psd-1', propertyKey: 'psdLayer', value: 'l-body' });
    expect((useStore.getState().objects[0] as any).activeLayerIds['l-body']).toBe(false);

    bus.execute('property.set', { objectId: 'psd-1', propertyKey: 'psdLayer', value: 'l-body' });
    expect((useStore.getState().objects[0] as any).activeLayerIds['l-body']).toBe(true);
  });

  it('safely ignores property.set with a malformed payload', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    expect(() => {
      bus.execute('property.set');
      bus.execute('property.set', { objectId: 'missing', propertyKey: 'scale', value: 1 });
      bus.execute('property.set', { objectId: 42, propertyKey: null });
    }).not.toThrow();
  });

  it('wires selection.escape to clearSelection', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    useStore.setState({ selectedIds: ['x'], selectedId: 'x' });

    bus.execute('selection.escape');

    expect(useStore.getState().selectedIds).toEqual([]);
    expect(useStore.getState().selectedId).toBeNull();
  });
});
