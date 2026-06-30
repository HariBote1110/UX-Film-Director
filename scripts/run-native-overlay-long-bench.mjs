#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const displayCommand = 'npm run dev:native-overlay';
const outputDir = resolve(process.cwd(), 'perf', 'native-overlay-long-bench');
const outputJsonPath = resolve(outputDir, 'perf-agent-output.json');
const timeoutMs = Number.parseInt(process.env.UXFD_NATIVE_OVERLAY_BENCH_TIMEOUT_MS ?? '', 10) || 3_900_000;

let child = null;
let finished = false;
let markerPayload = null;

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

const handleOutput = (chunk, write) => {
  const text = chunk.toString();
  write(text);
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
  const heavyVideo = rows.find((row) => row?.scenario === 'raf_heavy_video_scrub');
  if (!heavyVideo) {
    throw new Error('raf_heavy_video_scrub row was not recorded');
  }
  if (typeof heavyVideo.notes === 'string' && heavyVideo.notes.startsWith('skipped_')) {
    throw new Error(`raf_heavy_video_scrub was skipped: ${heavyVideo.notes}`);
  }
  if (typeof heavyVideo.rafP95Ms === 'number' && heavyVideo.rafP95Ms > 16.7) {
    throw new Error(`raf_heavy_video_scrub p95 exceeded 60fps budget: ${heavyVideo.rafP95Ms}ms`);
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

child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:native-overlay'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_PERF_AGENT_MODE: '1',
    UXFD_DECODE_TRACE: '1',
    UXFD_PERF_OUTPUT_DIR: outputDir,
    UXFD_NATIVE_OVERLAY: '1',
    VITE_UXFD_NATIVE_OVERLAY: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => handleOutput(chunk, (text) => process.stdout.write(text)));
child.stderr.on('data', (chunk) => handleOutput(chunk, (text) => process.stderr.write(text)));
child.on('error', (error) => {
  console.error('[native-overlay-bench] 起動失敗:', error instanceof Error ? error.message : String(error));
  finish(1);
});

const timeout = setTimeout(() => {
  console.error(`[native-overlay-bench] timeout (${timeoutMs}ms)`);
  finish(124);
}, timeoutMs);

child.on('close', (code) => {
  clearTimeout(timeout);
  try {
    const payload = readAgentPayload();
    assertBenchPayload(payload);
    if (markerPayload?.success === false) {
      throw new Error(markerPayload.errorMessage || 'perf marker reported failure');
    }
    console.log(`[native-overlay-bench] 完了: ${outputJsonPath}`);
    finish(code ?? 0);
  } catch (error) {
    console.error('[native-overlay-bench] gate failed:', error instanceof Error ? error.message : String(error));
    finish(1);
  }
});
