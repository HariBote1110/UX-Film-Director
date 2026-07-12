import { describe, expect, it } from 'vitest';
import {
  gridColumnsForMode,
  resolveRemoteDeckLayoutMode,
} from '../../shared/remoteDeckLayoutMode';

describe('resolveRemoteDeckLayoutMode', () => {
  it('classifies iPhone portrait as phone-portrait', () => {
    expect(resolveRemoteDeckLayoutMode({ width: 375, height: 812 })).toBe('phone-portrait');
    expect(resolveRemoteDeckLayoutMode({ width: 390, height: 844 })).toBe('phone-portrait');
  });

  it('classifies iPhone landscape as phone-landscape', () => {
    expect(resolveRemoteDeckLayoutMode({ width: 812, height: 375 })).toBe('phone-landscape');
    expect(resolveRemoteDeckLayoutMode({ width: 844, height: 390 })).toBe('phone-landscape');
  });

  it('classifies iPad mini (both orientations) as tablet', () => {
    expect(resolveRemoteDeckLayoutMode({ width: 768, height: 1024 })).toBe('tablet');
    expect(resolveRemoteDeckLayoutMode({ width: 1024, height: 768 })).toBe('tablet');
  });

  it('treats the 768px shorter-side threshold as tablet', () => {
    expect(resolveRemoteDeckLayoutMode({ width: 767, height: 1000 })).toBe('phone-portrait');
    expect(resolveRemoteDeckLayoutMode({ width: 1000, height: 599 })).toBe('phone-landscape');
  });

  it('falls back to phone-portrait for degenerate sizes', () => {
    expect(resolveRemoteDeckLayoutMode({ width: 0, height: 0 })).toBe('phone-portrait');
    expect(resolveRemoteDeckLayoutMode({ width: Number.NaN, height: 100 })).toBe('phone-portrait');
  });
});

describe('gridColumnsForMode', () => {
  it('keeps 3 columns on portrait phones and widens on tablets', () => {
    expect(gridColumnsForMode('phone-portrait', 3)).toBe(3);
    expect(gridColumnsForMode('tablet', 3)).toBe(4);
  });

  it('narrows the transport grid in landscape split view', () => {
    expect(gridColumnsForMode('phone-landscape', 3)).toBe(2);
  });
});
