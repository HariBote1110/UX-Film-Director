const emptyTimingSummary = () => ({
  count: 0,
  maxMs: 0,
  maxDetail: '',
});

export const createNativeOverlayBenchTraceSummary = () => ({
  decode: emptyTimingSummary(),
  present: emptyTimingSummary(),
  releaseGenerationViolationCount: 0,
  pendingDecodeTrace: '',
  pendingPresentTrace: '',
  steadyTraceActive: false,
  steadyTraceMarkerSeen: false,
  skipNextSteadyDecode: false,
});

const recordTiming = (summary, field, value, detail = '') => {
  if (!Number.isFinite(value)) {
    return;
  }
  summary[field].count += 1;
  if (value > summary[field].maxMs) {
    summary[field].maxMs = value;
    summary[field].maxDetail = detail;
  }
};

const numberFromMatch = (text, pattern) => {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasTrueField = (text, fieldName) => {
  const fieldPattern = new RegExp(`(?:\\b${fieldName}:\\s*true\\b|"${fieldName}"\\s*:\\s*true)`, 'u');
  return fieldPattern.test(text);
};

const numberFromField = (text, fieldName) => {
  const fieldPattern = new RegExp(`(?:\\b${fieldName}:\\s*|"${fieldName}"\\s*:\\s*)([0-9.]+)`, 'u');
  return numberFromMatch(text, fieldPattern);
};

const isSteadyDecodeTraceLine = (line) => {
  if (!line.includes('[decode.trace]')) {
    return false;
  }
  if (/\breason=cacheHit\b/u.test(line)) {
    return true;
  }
  const skipped = numberFromMatch(line, /\bskipped=([0-9]+)/u);
  return /\breason=sequential\b/u.test(line)
    && /\brestarted=false\b/u.test(line)
    && skipped === 0;
};

const isDecodeTraceLine = (line) => line.includes('[decode.trace]');

const consumePresentTraceBlock = (summary, block) => {
  const success = hasTrueField(block, 'success');
  const attached = hasTrueField(block, 'attached');
  if (!success || !attached) {
    return;
  }

  const presentMs = numberFromField(block, 'presentMs');
  if (presentMs !== null) {
    recordTiming(summary, 'present', presentMs, block);
  }

  const generation = numberFromField(block, 'generation');
  const releaseGeneration = numberFromField(block, 'releaseGeneration');
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
      summary.skipNextSteadyDecode = false;
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
        recordTiming(summary, 'decode', splitDecodeMs, summary.pendingDecodeTrace);
      }
      summary.pendingDecodeTrace = '';
      if (splitDecodeMs !== null) {
        continue;
      }
    }

    const steadyDecode = isSteadyDecodeTraceLine(line);
    if (isDecodeTraceLine(line) && !steadyDecode) {
      summary.skipNextSteadyDecode = true;
    }
    const decodeMs = steadyDecode ? numberFromMatch(line, /\[decode\.trace\].*decodeMs=([0-9.]+)/u) : null;
    if (decodeMs !== null) {
      if (summary.skipNextSteadyDecode) {
        summary.skipNextSteadyDecode = false;
      } else {
        recordTiming(summary, 'decode', decodeMs, line);
      }
    } else if (steadyDecode && /\[decode\.trace\].*decodeMs=\s*$/u.test(line)) {
      if (summary.skipNextSteadyDecode) {
        summary.skipNextSteadyDecode = false;
      } else {
        summary.pendingDecodeTrace = line;
      }
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
    failures.push(`decodeMs max ${summary.decode.maxMs}ms > ${decodeMaxMs}ms${summary.decode.maxDetail ? ` (${summary.decode.maxDetail})` : ''}`);
  }
  if (summary.present.maxMs > presentMaxMs) {
    failures.push(`presentMs max ${summary.present.maxMs}ms > ${presentMaxMs}ms${summary.present.maxDetail ? ` (${summary.present.maxDetail})` : ''}`);
  }
  if (summary.releaseGenerationViolationCount > 0) {
    failures.push(`release generation violations ${summary.releaseGenerationViolationCount}`);
  }

  if (failures.length > 0) {
    throw new Error(`Native Overlay bench trace gate failed: ${failures.join('; ')}`);
  }
};
