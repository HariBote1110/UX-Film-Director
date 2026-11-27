const SCRIPTING_EVENTS = new Set([
  'EvaluateScript',
  'EventDispatch',
  'FireAnimationFrame',
  'FunctionCall',
  'RunMicrotasks',
  'TimerFire',
  'V8.Execute',
]);

const RENDERING_EVENTS = new Set([
  'CompositeLayers',
  'HitTest',
  'Layerize',
  'Layout',
  'Paint',
  'PrePaint',
  'UpdateLayoutTree',
]);

const isCompleteEvent = (event) => (
  event?.ph === 'X'
  && Number.isFinite(event.ts)
  && Number.isFinite(event.dur)
  && event.dur >= 0
);

const isTaskEvent = (event) => (
  event.name === 'RunTask'
  || event.name === 'ThreadControllerImpl::RunTask'
  || event.name.endsWith('::RunTask')
);

const isGcEvent = (event) => (
  event.name === 'MinorGC'
  || event.name === 'MajorGC'
  || event.name.includes('.GC')
  || event.name.startsWith('V8.GC')
);

const intervalDurationMicros = (events) => {
  const intervals = events
    .filter(isCompleteEvent)
    .map((event) => [event.ts, event.ts + event.dur])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let total = 0;
  let currentStart = null;
  let currentEnd = null;
  for (const [start, end] of intervals) {
    if (currentStart === null || currentEnd === null) {
      currentStart = start;
      currentEnd = end;
      continue;
    }
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = start;
    currentEnd = end;
  }
  if (currentStart !== null && currentEnd !== null) {
    total += currentEnd - currentStart;
  }
  return total;
};

const roundedMillis = (microseconds) => (
  Math.round((microseconds / 1_000) * 1_000) / 1_000
);

const roundedMetricMillis = (seconds) => Math.round(seconds * 1_000_000) / 1_000;

export const diffChromiumPerformanceMetrics = (before, after) => {
  const beforeByName = new Map(before.map((metric) => [metric.name, metric.value]));
  const afterByName = new Map(after.map((metric) => [metric.name, metric.value]));
  const delta = (name) => (
    (afterByName.get(name) ?? 0) - (beforeByName.get(name) ?? 0)
  );
  return {
    taskMs: roundedMetricMillis(delta('TaskDuration')),
    scriptMs: roundedMetricMillis(delta('ScriptDuration')),
    layoutMs: roundedMetricMillis(delta('LayoutDuration')),
    recalcStyleMs: roundedMetricMillis(delta('RecalcStyleDuration')),
    layoutCount: delta('LayoutCount'),
    recalcStyleCount: delta('RecalcStyleCount'),
    jsHeapUsedBytesDelta: delta('JSHeapUsedSize'),
    nodeCountDelta: delta('Nodes'),
  };
};

const aggregateBy = (events, keyForEvent, limit = 20) => {
  const aggregate = new Map();
  for (const event of events) {
    const key = keyForEvent(event);
    if (!key) continue;
    const previous = aggregate.get(key) ?? {
      key,
      totalMicros: 0,
      count: 0,
      maxMicros: 0,
      event,
    };
    previous.totalMicros += event.dur;
    previous.count += 1;
    previous.maxMicros = Math.max(previous.maxMicros, event.dur);
    aggregate.set(key, previous);
  }
  return [...aggregate.values()]
    .sort((left, right) => right.totalMicros - left.totalMicros)
    .slice(0, limit);
};

const rendererMainThreadForEvents = (traceEvents) => {
  const metadata = traceEvents.find((event) => (
    event?.ph === 'M'
    && event.name === 'thread_name'
    && event.args?.name === 'CrRendererMain'
    && Number.isFinite(event.pid)
    && Number.isFinite(event.tid)
  ));
  if (metadata) return { pid: metadata.pid, tid: metadata.tid };

  const task = traceEvents.find((event) => isCompleteEvent(event) && isTaskEvent(event));
  return task ? { pid: task.pid, tid: task.tid } : null;
};

export const summariseChromiumRendererTrace = (traceEvents) => {
  const rendererMainThread = rendererMainThreadForEvents(traceEvents);
  if (!rendererMainThread) {
    return {
      rendererMainThread: null,
      wallDurationMs: 0,
      busyMs: 0,
      busyRatio: 0,
      categories: { scriptingMs: 0, renderingMs: 0, gcMs: 0 },
      topEvents: [],
      topFunctions: [],
      userTimings: [],
    };
  }
  const mainEvents = traceEvents.filter((event) => (
    isCompleteEvent(event)
    && event.pid === rendererMainThread.pid
    && event.tid === rendererMainThread.tid
  ));
  const firstTimestamp = Math.min(...mainEvents.map((event) => event.ts));
  const lastTimestamp = Math.max(...mainEvents.map((event) => event.ts + event.dur));
  const wallMicros = mainEvents.length === 0 ? 0 : lastTimestamp - firstTimestamp;
  const busyMicros = intervalDurationMicros(mainEvents.filter(isTaskEvent));
  const scriptingMicros = intervalDurationMicros(
    mainEvents.filter((event) => SCRIPTING_EVENTS.has(event.name)),
  );
  const renderingMicros = intervalDurationMicros(
    mainEvents.filter((event) => RENDERING_EVENTS.has(event.name)),
  );
  const gcMicros = intervalDurationMicros(mainEvents.filter(isGcEvent));

  const topEvents = aggregateBy(mainEvents, (event) => event.name).map((entry) => ({
    name: entry.key,
    totalMs: roundedMillis(entry.totalMicros),
    count: entry.count,
    maxMs: roundedMillis(entry.maxMicros),
  }));
  const functionEvents = mainEvents.filter((event) => event.name === 'FunctionCall');
  const topFunctions = aggregateBy(functionEvents, (event) => {
    const data = event.args?.data ?? {};
    return [
      data.functionName || '(anonymous)',
      data.url || '',
      Number.isFinite(data.lineNumber) ? data.lineNumber : '',
    ].join('|');
  }).map((entry) => {
    const data = entry.event.args?.data ?? {};
    return {
      functionName: data.functionName || '(anonymous)',
      url: data.url || '',
      lineNumber: Number.isFinite(data.lineNumber) ? data.lineNumber : null,
      totalMs: roundedMillis(entry.totalMicros),
      callCount: entry.count,
      maxMs: roundedMillis(entry.maxMicros),
    };
  });
  const userTimings = aggregateBy(
    mainEvents.filter((event) => (
      String(event.cat ?? '').includes('blink.user_timing')
      && String(event.name ?? '').startsWith('uxfd.')
    )),
    (event) => event.name,
  ).map((entry) => ({
    name: entry.key,
    totalMs: roundedMillis(entry.totalMicros),
    count: entry.count,
    maxMs: roundedMillis(entry.maxMicros),
  }));

  return {
    rendererMainThread,
    wallDurationMs: roundedMillis(wallMicros),
    busyMs: roundedMillis(busyMicros),
    busyRatio: wallMicros > 0 ? busyMicros / wallMicros : 0,
    categories: {
      scriptingMs: roundedMillis(scriptingMicros),
      renderingMs: roundedMillis(renderingMicros),
      gcMs: roundedMillis(gcMicros),
    },
    topEvents,
    topFunctions,
    userTimings,
  };
};
