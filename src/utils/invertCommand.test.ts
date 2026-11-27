import { describe, expect, it } from 'vitest';
import { invertCommand } from './invertCommand';
import type { Command } from '../generated/rustCore/Command';

describe('invertCommand', () => {
  describe('batch', () => {
    it('reverses the sub-command order and inverts each element (mirrors rust-core::command::invert semantics)', () => {
      const setOpacity: Command = {
        kind: 'setObjectField',
        objectId: 'object-a',
        field: 'opacity',
        next: 0.5,
        previous: 1.0,
      };
      const toggleFilter: Command = {
        kind: 'toggleFilterEnabled',
        objectId: 'object-b',
        filterId: 'filter-1',
      };
      const setLayer: Command = {
        kind: 'setLayerState',
        index: 2,
        next: { name: 'Renamed', visible: true, locked: false },
        previous: { name: 'Original', visible: false, locked: true },
      };

      const batch: Command = {
        kind: 'batch',
        commands: [setOpacity, toggleFilter, setLayer],
      };

      const inverted = invertCommand(batch);

      expect(inverted).toEqual({
        kind: 'batch',
        commands: [invertCommand(setLayer), invertCommand(toggleFilter), invertCommand(setOpacity)],
      });

      // 具体的な順序・中身も明示的に検証する。
      if (inverted.kind !== 'batch') {
        throw new Error('inverted command should still be a batch');
      }
      expect(inverted.commands).toEqual([
        {
          kind: 'setLayerState',
          index: 2,
          next: { name: 'Original', visible: false, locked: true },
          previous: { name: 'Renamed', visible: true, locked: false },
        },
        { kind: 'toggleFilterEnabled', objectId: 'object-b', filterId: 'filter-1' },
        {
          kind: 'setObjectField',
          objectId: 'object-a',
          field: 'opacity',
          next: 1.0,
          previous: 0.5,
        },
      ]);
    });

    it('round-trips: invertCommand(invertCommand(batch)) restores the original batch', () => {
      const batch: Command = {
        kind: 'batch',
        commands: [
          { kind: 'setObjectField', objectId: 'a', field: 'x', next: 10, previous: 0 },
          { kind: 'moveFilter', objectId: 'b', filterId: 'f', fromIndex: 0, toIndex: 2 },
        ],
      };

      expect(invertCommand(invertCommand(batch))).toEqual(batch);
    });

    it('handles an empty batch by returning an empty batch (no reordering to do)', () => {
      const batch: Command = { kind: 'batch', commands: [] };

      expect(invertCommand(batch)).toEqual({ kind: 'batch', commands: [] });
    });
  });
});
