import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { createCommandBus } from './commandBus';
import { registerAppCommands } from './registerAppCommands';

describe('registerAppCommands', () => {
  beforeEach(() => {
    useStore.getState().initializeProject({
      width: 1920,
      height: 1080,
      fps: 60,
      sampleRate: 48_000,
    });
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

  it('wires edit.undo and edit.redo to the history slice actions', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    useStore.getState().setDuration(45);
    useStore.getState().pushHistory();
    useStore.getState().setDuration(50);

    bus.execute('edit.undo');
    expect(useStore.getState().duration).toBe(45);

    bus.execute('edit.redo');
    expect(useStore.getState().duration).toBe(50);
  });

  it('wires edit.delete to deleteSelectedObjects when no ripple payload is given', () => {
    const bus = createCommandBus();
    registerAppCommands(bus, useStore);
    const object = {
      id: 'obj-1',
      type: 'text',
      layerId: useStore.getState().layers[0].id,
      x: 0,
      y: 0,
      startTime: 0,
      duration: 5,
    } as any;
    useStore.setState({ objects: [object], selectedIds: ['obj-1'], selectedId: 'obj-1' });

    bus.execute('edit.delete');

    expect(useStore.getState().objects.find((o) => o.id === 'obj-1')).toBeUndefined();
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
