import { describe, expect, it } from 'vitest';
import { buildOrderedPerfHeavyVideoPaths, PERF_HEAVY_VIDEO_BASE_NAMES, type PathJoiner } from './perfHeavyVideo';

const posixJoin: PathJoiner = (...segments) => segments.filter((s) => s !== '').join('/');

describe('PERF_HEAVY_VIDEO_BASE_NAMES', () => {
  it('lists higher-bitrate sample first', () => {
    expect(PERF_HEAVY_VIDEO_BASE_NAMES[0]).toContain('20000');
    expect(PERF_HEAVY_VIDEO_BASE_NAMES[1]).toContain('10000');
  });
});

describe('buildOrderedPerfHeavyVideoPaths', () => {
  it('searches perf/heavy-media before repository root for each tier', () => {
    expect(buildOrderedPerfHeavyVideoPaths('/repo', posixJoin)).toEqual([
      '/repo/perf/heavy-media/20000kbps_60fps.mp4',
      '/repo/20000kbps_60fps.mp4',
      '/repo/perf/heavy-media/10000kbps_60fps.mp4',
      '/repo/10000kbps_60fps.mp4',
    ]);
  });
});
