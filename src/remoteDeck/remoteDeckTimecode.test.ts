import { describe, expect, it } from 'vitest';
import { formatRemoteDeckTimecode } from '../../shared/remoteDeckTimecode';

describe('formatRemoteDeckTimecode', () => {
  it('formats zero as HH:MM:SS:FF', () => {
    expect(formatRemoteDeckTimecode(0, 60)).toBe('00:00:00:00');
  });

  it('formats seconds and frames according to fps', () => {
    expect(formatRemoteDeckTimecode(1.5, 60)).toBe('00:00:01:30');
    expect(formatRemoteDeckTimecode(2.5, 30)).toBe('00:00:02:15');
  });

  it('rolls over minutes and hours', () => {
    expect(formatRemoteDeckTimecode(3661.25, 30)).toBe('01:01:01:07');
  });

  it('clamps negative time to zero', () => {
    expect(formatRemoteDeckTimecode(-5, 60)).toBe('00:00:00:00');
  });

  it('falls back to 60fps for invalid fps values', () => {
    expect(formatRemoteDeckTimecode(1.5, 0)).toBe('00:00:01:30');
    expect(formatRemoteDeckTimecode(1.5, Number.NaN)).toBe('00:00:01:30');
  });

  it('never renders a frame count equal to fps (edge rounding)', () => {
    expect(formatRemoteDeckTimecode(0.9999999, 60)).toBe('00:00:00:59');
  });
});
