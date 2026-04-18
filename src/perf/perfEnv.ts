const truthyEnv = (value: string | undefined): boolean => (
  value === '1' || value === 'true'
);

/** Agent / CI: autorun harness, write `perf-agent-output.json`, print marker line, exit app. */
export const isPerfAgentMode = (): boolean => truthyEnv(import.meta.env.VITE_PERF_AGENT_MODE);

export const isPerfAutorun = (): boolean => (
  isPerfAgentMode()
  || truthyEnv(import.meta.env.VITE_PERF_AUTORUN)
);
