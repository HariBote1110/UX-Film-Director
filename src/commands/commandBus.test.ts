import { describe, expect, it, vi } from 'vitest';
import { createCommandBus } from './commandBus';

describe('commandBus', () => {
  it('registers a handler and executes it with the given payload', () => {
    const bus = createCommandBus();
    const handler = vi.fn();
    bus.register('playback.toggle', handler);

    const handled = bus.execute('playback.toggle', { foo: 'bar' });

    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('executes without a payload when none is supplied', () => {
    const bus = createCommandBus();
    const handler = vi.fn();
    bus.register('edit.undo', handler);

    bus.execute('edit.undo');

    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('safely ignores execute for an unregistered command id and returns false', () => {
    const bus = createCommandBus();
    expect(() => bus.execute('unknown.command')).not.toThrow();
    expect(bus.execute('unknown.command')).toBe(false);
  });

  it('overwrites an existing handler when the same id is registered again', () => {
    const bus = createCommandBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.register('edit.redo', first);
    bus.register('edit.redo', second);

    bus.execute('edit.redo');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unregisters a handler so subsequent executes are ignored', () => {
    const bus = createCommandBus();
    const handler = vi.fn();
    bus.register('selection.escape', handler);
    bus.unregister('selection.escape');

    const handled = bus.execute('selection.escape');

    expect(handled).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('reports whether a command id is registered via has()', () => {
    const bus = createCommandBus();
    expect(bus.has('edit.delete')).toBe(false);
    bus.register('edit.delete', vi.fn());
    expect(bus.has('edit.delete')).toBe(true);
  });
});
