import { runPerformanceHarness } from './performanceHarness';

let scheduled = false;

const detectAutorun = (): boolean => {
  const envFlag = import.meta.env.VITE_PERF_AUTORUN;
  if (envFlag === 'true' || envFlag === '1') {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).has('perfHarness');
};

/** Schedules a synthetic workload once (startup). Guarded by env or `?perfHarness=1`. */
export const schedulePerformanceHarness = () => {
  if (scheduled) {
    return;
  }

  if (!detectAutorun()) {
    return;
  }

  scheduled = true;

  window.setTimeout(() => {
    void runPerformanceHarness().catch((error) => {
      console.error('[perf] Harness failed:', error);
    });
  }, 2800);
};
