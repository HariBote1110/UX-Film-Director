import { describe, expect, it } from 'vitest';
import {
  computeBillboardSyncPlan,
  nextBillboardSourceKeys,
  type BillboardSyncEntry,
} from './billboardSyncPlan';

const entry = (overrides: Partial<BillboardSyncEntry> & { id: string; sourceKey: string }): BillboardSyncEntry => ({
  rgba: new Uint8Array([1, 2, 3, 4]),
  widthPx: 2,
  heightPx: 2,
  worldX: 0,
  worldY: 0,
  worldZ: 0,
  yawRadians: 0,
  worldWidth: 1,
  worldHeight: 1,
  opacity: 1,
  ...overrides,
});

describe('computeBillboardSyncPlan', () => {
  it('classifies a brand-new id as added', () => {
    const plan = computeBillboardSyncPlan(new Map(), [entry({ id: 'a', sourceKey: 'file.psd::' })]);
    expect(plan.syncs).toEqual([{ entry: expect.objectContaining({ id: 'a' }), kind: 'added' }]);
    expect(plan.removes).toEqual([]);
  });

  it('classifies an id with an unchanged sourceKey as reused', () => {
    const previous = new Map([['a', 'file.psd::layer1']]);
    const plan = computeBillboardSyncPlan(previous, [entry({ id: 'a', sourceKey: 'file.psd::layer1' })]);
    expect(plan.syncs[0].kind).toBe('reused');
  });

  it('classifies an id with a changed sourceKey (e.g. active layers toggled) as updated', () => {
    const previous = new Map([['a', 'file.psd::layer1']]);
    const plan = computeBillboardSyncPlan(previous, [entry({ id: 'a', sourceKey: 'file.psd::layer1,layer2' })]);
    expect(plan.syncs[0].kind).toBe('updated');
  });

  it('lists ids present previously but absent from entries as removes', () => {
    const previous = new Map([['a', 'file.psd::'], ['b', 'other.psd::']]);
    const plan = computeBillboardSyncPlan(previous, [entry({ id: 'a', sourceKey: 'file.psd::' })]);
    expect(plan.removes).toEqual(['b']);
  });

  it('always includes every current entry in syncs regardless of kind (position may have changed)', () => {
    const previous = new Map([['a', 'file.psd::'], ['b', 'other.psd::']]);
    const entries = [entry({ id: 'a', sourceKey: 'file.psd::' }), entry({ id: 'b', sourceKey: 'other.psd::' })];
    const plan = computeBillboardSyncPlan(previous, entries);
    expect(plan.syncs.map((op) => op.entry.id)).toEqual(['a', 'b']);
    expect(plan.syncs.every((op) => op.kind === 'reused')).toBe(true);
  });
});

describe('nextBillboardSourceKeys', () => {
  it('folds entries into an id -> sourceKey map for the next frame', () => {
    const entries = [entry({ id: 'a', sourceKey: 'x' }), entry({ id: 'b', sourceKey: 'y' })];
    expect(nextBillboardSourceKeys(entries)).toEqual(new Map([['a', 'x'], ['b', 'y']]));
  });
});
