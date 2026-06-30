const emptyTimingSummary = () => ({
  count: 0,
  maxMs: 0,
});

export const createNativeOverlayBenchTraceSummary = () => ({
  decode: emptyTimingSummary(),
  present: emptyTimingSummary(),
  releaseGenerationViolationCount: 0,
  pendingDecodeTrace: '',
  pendingPresentTrace: '',
  steadyTraceActive: false,
  steadyTraceMarkerSeen: false,
});

const recordTiming = (summary, field, value) => {
  if (!Number.isFinite(value)) {
    return;
  }
  summary[field].count += 1;
  summary[field].maxMs = Math.max(summary[field].maxMs, value);
};

const numberFromMatch = (text, pattern) => {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const consumePresentTraceBlock = (summary, block) => {
  const presentMs = numberFromMatch(block, /presentMs:\s*([0-9.]+)/u);
  if (presentMs !== null) {
    recordTiming(summary, 'present', presentMs);
  }

  const generation = numberFromMatch(block, /(?:^|[\s,{])generation:\s*([0-9.]+)/u);
  const releaseGeneration = numberFromMatch(block, /releaseGeneration:\s*([0-9.]+)/u);
  if (generation !== null && releaseGeneration !== null && generation !== releaseGeneration) {
    summary.releaseGenerationViolationCount += 1;
  }
};

export const ingestNativeOverlayBenchTraceText = (summary, text) => {
  for (const line of String(text).split(/\r?\n/u)) {
    if (line.includes('UXFD_NATIVE_OVERLAY_STEADY_TRACE_BEGIN')) {
      summary.decode = emptyTimingSummary();
      summary.present = emptyTimingSummary();
      summary.releaseGenerationViolationCount = 0;
      summary.pendingDecodeTrace = '';
      summary.steadyTraceActive = true;
      summary.steadyTraceMarkerSeen = true;
      summary.pendingPresentTrace = '';
      continue;
    }
    if (line.includes('UXFD_NATIVE_OVERLAY_STEADY_TRACE_END')) {
      if (summary.pendingPresentTrace) {
        consumePresentTraceBlock(summary, summary.pendingPresentTrace);
        summary.pendingPresentTrace = '';
      }
      summary.pendingDecodeTrace = '';
      summary.steadyTraceActive = false;
      summary.steadyTraceMarkerSeen = true;
      continue;
    }

    if (summary.steadyTraceMarkerSeen && !summary.steadyTraceActive) {
      continue;
    }

    if (summary.pendingDecodeTrace) {
      const splitDecodeMs = numberFromMatch(line, /(?:^|\s)([0-9.]+)\s*$/u);
      if (splitDecodeMs !== null) {
        recordTiming(summary, 'decode', splitDecodeMs);
      }
      summary.pendingDecodeTrace = '';
      if (splitDecodeMs !== null) {
        continue;
      }
    }

    const decodeMs = numberFromMatch(line, /\[decode\.trace\].*decodeMs=([0-9.]+)/u);
    if (decodeMs !== null) {
      recordTiming(summary, 'decode', decodeMs);
    } else if (/\[decode\.trace\].*decodeMs=\s*$/u.test(line)) {
      summary.pendingDecodeTrace = line;
    }

    if (summary.pendingPresentTrace) {
      summary.pendingPresentTrace += `\n${line}`;
      if (line.trim() === '}') {
        consumePresentTraceBlock(summary, summary.pendingPresentTrace);
        summary.pendingPresentTrace = '';
      }
      continue;
    }

    if (line.includes('[NativeOverlay] presentSharedFrameTrace')) {
      summary.pendingPresentTrace = line;
      if (line.includes('}')) {
        consumePresentTraceBlock(summary, summary.pendingPresentTrace);
        summary.pendingPresentTrace = '';
      }
    }
  }
};

export const assertNativeOverlayBenchTraceBudgets = (summary, options = {}) => {
  const decodeMaxMs = options.decodeMaxMs ?? 16;
  const presentMaxMs = options.presentMaxMs ?? 16;
  const minimumDecodeSamples = options.minimumDecodeSamples ?? 1;
  const minimumPresentSamples = options.minimumPresentSamples ?? 1;
  const failures = [];

  if (summary.decode.count < minimumDecodeSamples) {
    failures.push(`decodeMs samples ${summary.decode.count} < ${minimumDecodeSamples}`);
  }
  if (summary.present.count < minimumPresentSamples) {
    failures.push(`presentMs samples ${summary.present.count} < ${minimumPresentSamples}`);
  }
  if (summary.decode.maxMs > decodeMaxMs) {
    failures.push(`decodeMs max ${summary.decode.maxMs}ms > ${decodeMaxMs}ms`);
  }
  if (summary.present.maxMs > presentMaxMs) {
    failures.push(`presentMs max ${summary.present.maxMs}ms > ${presentMaxMs}ms`);
  }
  if (summary.releaseGenerationViolationCount > 0) {
    failures.push(`release generation violations ${summary.releaseGenerationViolationCount}`);
  }

  if (failures.length > 0) {
    throw new Error(`Native Overlay bench trace gate failed: ${failures.join('; ')}`);
  }
};
