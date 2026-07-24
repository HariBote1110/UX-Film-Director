import React, { Profiler, type PropsWithChildren } from 'react';
import { rendererReactProfileCollector } from '../perf/rendererReactProfileTrace';

export const RendererTraceProfiler: React.FC<
  PropsWithChildren<{ id: 'Viewport' | 'Timeline' | 'PropertyPanel' }>
> = ({ id, children }) => {
  if (!rendererReactProfileCollector.enabled) {
    return <>{children}</>;
  }
  return (
    <Profiler
      id={id}
      onRender={(
        profileId,
        phase,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
      ) => {
        rendererReactProfileCollector.record({
          id: profileId,
          phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        });
      }}
    >
      {children}
    </Profiler>
  );
};
