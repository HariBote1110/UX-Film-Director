#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertNativeOverlayBenchTraceBudgets,
  createNativeOverlayBenchTraceSummary,
  ingestNativeOverlayBenchTraceText,
} from './native-overlay-bench-trace.mjs';

const displayCommand = 'npm run dev:native-overlay';
const outputDir = resolve(process.cwd(), 'perf', 'native-overlay-long-bench');
const outputJsonPath = resolve(outputDir, 'perf-agent-output.json');
const timeoutMs = Number.parseInt(process.env.UXFD_NATIVE_OVERLAY_BENCH_TIMEOUT_MS ?? '', 10) || 3_900_000;
const benchDurationMs = Number.parseInt(process.env.UXFD_NATIVE_OVERLAY_BENCH_DURATION_MS ?? '', 10) || 3_600_000;
const steadyDurationMs = Number.parseInt(process.env.UXFD_NATIVE_OVERLAY_STEADY_DURATION_MS ?? '', 10) || 4_200;
const decodeTraceEnabled = process.env.UXFD_NATIVE_OVERLAY_BENCH_TRACE === '1';
const steadyMeanBudgetMs = Number.parseFloat(process.env.UXFD_NATIVE_OVERLAY_STEADY_MEAN_BUDGET_MS ?? '') || 16.8;
const steadyP95BudgetMs = Number.parseFloat(process.env.UXFD_NATIVE_OVERLAY_STEADY_P95_BUDGET_MS ?? '') || 20.0;
const decodeBudgetMs = Number.parseFloat(process.env.UXFD_NATIVE_OVERLAY_DECODE_BUDGET_MS ?? '') || 16.0;
const presentBudgetMs = Number.parseFloat(process.env.UXFD_NATIVE_OVERLAY_PRESENT_BUDGET_MS ?? '') || 16.0;

let child = null;
let finished = false;
let markerPayload = null;
let completedRuns = 0;
let benchTraceSummary = createNativeOverlayBenchTraceSummary();

const parseMarkerLine = (line) => {
  const marker = 'UXFD_PERF_RESULT_JSON:';
  const index = line.indexOf(marker);
  if (index === -1) {
    return;
  }
  const jsonText = line.slice(index + marker.length).trim();
  try {
    markerPayload = JSON.parse(jsonText);
  } catch (error) {
    console.error('[native-overlay-bench] perf marker JSON parse failed:', error instanceof Error ? error.message : String(error));
  }
};

const filterNativeOverlayBenchEchoText = (text, traceEnabled) => {
  if (!traceEnabled) {
    return text;
  }
  return text
    .split(/(\r?\n)/u)
    .filter((part) => {
      if (part === '\n' || part === '\r\n') {
        return true;
      }
      return !part.includes('[decode.trace]')
        && !part.includes('[RustBackend]')
        && !part.includes('[NativeOverlay] presentSharedFrameTrace');
    })
    .join('');
};

const handleOutput = (chunk, write) => {
  const text = chunk.toString();
  write(filterNativeOverlayBenchEchoText(text, decodeTraceEnabled));
  if (decodeTraceEnabled) {
    ingestNativeOverlayBenchTraceText(benchTraceSummary, text);
  }
  for (const line of text.split(/\r?\n/)) {
    parseMarkerLine(line);
  }
};

const cleanup = () => {
  if (child && !child.killed) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    const ref = child;
    setTimeout(() => {
      try {
        if (!ref.killed) {
          ref.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
    }, 1500);
  }
};

const finish = (code) => {
  if (finished) {
    return;
  }
  finished = true;
  cleanup();
  setTimeout(() => process.exit(code), 250);
};

const readAgentPayload = () => {
  if (!existsSync(outputJsonPath)) {
    throw new Error(`perf-agent-output.json was not written: ${outputJsonPath}`);
  }
  return JSON.parse(readFileSync(outputJsonPath, 'utf8'));
};

const assertBenchPayload = (payload) => {
  if (payload?.success !== true) {
    throw new Error(payload?.errorMessage || 'perf harness reported failure');
  }
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const heavyVideo = rows.find((row) => row?.scenario === 'native_overlay_steady_playback');
  if (!heavyVideo) {
    throw new Error('native_overlay_steady_playback row was not recorded');
  }
  if (typeof heavyVideo.notes === 'string' && heavyVideo.notes.startsWith('skipped_')) {
    throw new Error(`native_overlay_steady_playback was skipped: ${heavyVideo.notes}`);
  }
  if (typeof heavyVideo.rafMeanMs === 'number' && heavyVideo.rafMeanMs > steadyMeanBudgetMs) {
    throw new Error(`native_overlay_steady_playback mean exceeded 60fps budget: ${heavyVideo.rafMeanMs}ms`);
  }
  if (typeof heavyVideo.rafP95Ms === 'number' && heavyVideo.rafP95Ms > steadyP95BudgetMs) {
    throw new Error(`native_overlay_steady_playback p95 exceeded jitter budget: ${heavyVideo.rafP95Ms}ms`);
  }
};

process.on('SIGINT', () => {
  console.error('\n[native-overlay-bench] 中断します');
  finish(130);
});
process.on('SIGTERM', () => finish(143));

await mkdir(outputDir, { recursive: true });
try {
  rmSync(outputJsonPath, { force: true });
} catch {
  // ignore
}

console.log(`[native-overlay-bench] ${displayCommand} を perf agent mode で起動します`);
console.log(`[native-overlay-bench] timeoutMs=${timeoutMs}`);
console.log(`[native-overlay-bench] durationMs=${benchDurationMs}`);
console.log(`[native-overlay-bench] steadyDurationMs=${steadyDurationMs}`);

const runSingleBench = () => new Promise((resolveRun) => {
  markerPayload = null;
  benchTraceSummary = createNativeOverlayBenchTraceSummary();
  try {
    rmSync(outputJsonPath, { force: true });
  } catch {
    // ignore
  }

  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:native-overlay'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_PERF_AGENT_MODE: '1',
      ...(decodeTraceEnabled ? { UXFD_DECODE_TRACE: '1' } : {}),
      UXFD_PERF_OUTPUT_DIR: outputDir,
      UXFD_NATIVE_OVERLAY: '1',
      VITE_UXFD_NATIVE_OVERLAY: '1',
      VITE_UXFD_NATIVE_OVERLAY_STEADY_DURATION_MS: String(steadyDurationMs),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => handleOutput(chunk, (text) => process.stdout.write(text)));
  child.stderr.on('data', (chunk) => handleOutput(chunk, (text) => process.stderr.write(text)));
  child.on('error', (error) => {
    resolveRun({ code: 1, error: new Error(`起動失敗: ${error instanceof Error ? error.message : String(error)}`) });
  });

  const timeout = setTimeout(() => {
    resolveRun({ code: 124, error: new Error(`timeout (${timeoutMs}ms)`) });
    cleanup();
  }, timeoutMs);

  child.on('close', (code) => {
    clearTimeout(timeout);
    try {
      const payload = readAgentPayload();
      assertBenchPayload(payload);
      if (decodeTraceEnabled) {
        assertNativeOverlayBenchTraceBudgets(benchTraceSummary, {
          decodeMaxMs: decodeBudgetMs,
          presentMaxMs: presentBudgetMs,
          minimumDecodeSamples: 1,
          minimumPresentSamples: 1,
        });
      }
      if (markerPayload?.success === false) {
        throw new Error(markerPayload.errorMessage || 'perf marker reported failure');
      }
      completedRuns += 1;
      console.log(`[native-overlay-bench] run ${completedRuns} 完了: ${outputJsonPath}`);
      resolveRun({ code: code ?? 0 });
    } catch (error) {
      resolveRun({ code: 1, error });
    }
  });
});

const deadline = Date.now() + benchDurationMs;
while (completedRuns === 0 || Date.now() < deadline) {
  const result = await runSingleBench();
  if (result.error) {
    console.error('[native-overlay-bench] gate failed:', result.error instanceof Error ? result.error.message : String(result.error));
    finish(result.code ?? 1);
    break;
  }
  if (result.code && result.code !== 0) {
    finish(result.code);
    break;
  }
}

console.log(`[native-overlay-bench] 完了: runs=${completedRuns}, output=${outputDir}`);
finish(0);
