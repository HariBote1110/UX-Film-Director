export function parseClearSelectionBeforePlaybackOption(
  env: Record<string, string | undefined> | undefined,
): boolean;

export function parseCpuThrottleRateOption(
  env: Record<string, string | undefined> | undefined,
): number;

export function resolveRealisticHeavyEditRustBackendBinaryProfile(
  rustBackendBinPath: string | null | undefined,
): 'release' | 'debug' | 'default-debug';
