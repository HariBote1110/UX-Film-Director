/** Basenames only; resolution order is implemented in `buildOrderedPerfHeavyVideoPaths`. */
export const PERF_HEAVY_VIDEO_BASE_NAMES = ['20000kbps_60fps.mp4', '10000kbps_60fps.mp4'] as const;

export type PathJoiner = (...segments: string[]) => string;

/**
 * Candidate absolute paths for the perf harness (first existing file wins).
 * For each bitrate tier: `perf/heavy-media/<name>` then repository root `<name>`.
 */
export const buildOrderedPerfHeavyVideoPaths = (appRoot: string, join: PathJoiner): string[] => {
  const heavyDir = join(appRoot, 'perf', 'heavy-media');
  const paths: string[] = [];
  for (const name of PERF_HEAVY_VIDEO_BASE_NAMES) {
    paths.push(join(heavyDir, name));
    paths.push(join(appRoot, name));
  }
  return paths;
};
