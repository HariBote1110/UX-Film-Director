import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = 5301;
const DEBUG_PORT = 9333;
const VIDEO_PATH = process.env.UXFD_VIDEO_LOAD_E2E_VIDEO_PATH
  ? resolve(process.env.UXFD_VIDEO_LOAD_E2E_VIDEO_PATH)
  : resolve(ROOT, 'perf/heavy-media/GX010052.MP4');
const VIDEO_NAME = VIDEO_PATH.split('/').pop() ?? 'video';
const OUTPUT_DIR = resolve(ROOT, '.codex/video-load-e2e');
const RESULT_JSON = resolve(OUTPUT_DIR, 'result.json');
const RESULT_LOG = resolve(OUTPUT_DIR, 'result.log');
const RESULT_SCREENSHOT = resolve(OUTPUT_DIR, 'shared-renderer-surface.png');
const OVERALL_TIMEOUT_MS = Number(process.env.UXFD_VIDEO_LOAD_E2E_TIMEOUT_MS ?? 90_000);

let vite = null;
let electron = null;
let finished = false;

const logLines = [];

const log = (message) => {
  const line = `[video-load-e2e] ${message}`;
  logLines.push(line);
  console.log(line);
};

const finish = (code) => {
  if (finished) return;
  finished = true;
  for (const proc of [electron, vite]) {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
  process.exit(code);
};

process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const waitForPort = async (port, timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`);
      if (response.status < 500) return;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error(`port ${port} did not become ready`);
};

const waitForDebugTarget = async (timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => (
        target.type === 'page'
        && typeof target.webSocketDebuggerUrl === 'string'
        && typeof target.url === 'string'
        && target.url.startsWith(`http://localhost:${VITE_PORT}/`)
      ));
      if (page) return page;
    } catch {
      // retry
    }
    await sleep(250);
  }
  throw new Error('Electron renderer debug target did not become ready');
};

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveConnect, rejectConnect) => {
      const timer = setTimeout(() => rejectConnect(new Error('CDP websocket timeout')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolveConnect();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        rejectConnect(new Error('CDP websocket failed'));
      }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePending, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolvePending(message.result ?? {});
        return;
      }
      if (message.method) {
        this.events.push(message);
        if (message.method === 'Page.javascriptDialogOpening') {
          this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        }
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePending, reject) => {
      this.pending.set(id, { resolve: resolvePending, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 20_000);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    let result;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        result = await this.send('Runtime.evaluate', {
          expression,
          awaitPromise,
          returnByValue: true,
          userGesture: true,
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Cannot find default execution context') || attempt === 19) {
          throw error;
        }
        await sleep(250);
      }
    }
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
    }
    return result.result?.value;
  }

  async querySelector(selector) {
    const { root } = await this.send('DOM.getDocument', { depth: 1, pierce: true });
    const { nodeId } = await this.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    return nodeId;
  }

  close() {
    this.socket?.close();
  }
}

const capturePng = async (client, clip) => {
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip,
  });
  return Buffer.from(screenshot.data, 'base64');
};

const readPngRgba = (png) => {
  const signature = png.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Captured screenshot is not a PNG image.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colourType = 0;
  const idatChunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colourType = data[9];
      if (bitDepth !== 8 || (colourType !== 2 && colourType !== 6)) {
        throw new Error(`Unsupported screenshot PNG format: bitDepth=${bitDepth} colourType=${colourType}`);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let rgbaOffset = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Uint8Array.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    unfilterPngRow(row, previous, channels, filter);
    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      rgba[rgbaOffset] = row[i];
      rgba[rgbaOffset + 1] = row[i + 1];
      rgba[rgbaOffset + 2] = row[i + 2];
      rgba[rgbaOffset + 3] = colourType === 6 ? row[i + 3] : 255;
      rgbaOffset += 4;
    }
    previous = row;
  }
  return { width, height, rgba };
};

const unfilterPngRow = (row, previous, bytesPerPixel, filter) => {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
    const up = previous[i] ?? 0;
    const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] ?? 0 : 0;
    if (filter === 1) {
      row[i] = (row[i] + left) & 0xff;
    } else if (filter === 2) {
      row[i] = (row[i] + up) & 0xff;
    } else if (filter === 3) {
      row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[i] = (row[i] + paethPredictor(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter type: ${filter}`);
    }
  }
};

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
};

const analyseVisiblePixels = ({ width, height, rgba }) => {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
  let count = 0;
  let luminanceSum = 0;
  let luminanceSquareSum = 0;
  let nonGreyCount = 0;
  let opaqueCount = 0;
  const buckets = new Set();

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const red = rgba[i];
      const green = rgba[i + 1];
      const blue = rgba[i + 2];
      const alpha = rgba[i + 3];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      count += 1;
      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      if (spread > 10) nonGreyCount += 1;
      if (alpha > 245) opaqueCount += 1;
      buckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);
    }
  }

  const mean = luminanceSum / Math.max(1, count);
  const variance = luminanceSquareSum / Math.max(1, count) - mean * mean;
  const stddev = Math.sqrt(Math.max(0, variance));
  const nonGreyRatio = nonGreyCount / Math.max(1, count);
  const opaqueRatio = opaqueCount / Math.max(1, count);
  return {
    width,
    height,
    samples: count,
    luminanceMean: Number(mean.toFixed(2)),
    luminanceStddev: Number(stddev.toFixed(2)),
    nonGreyRatio: Number(nonGreyRatio.toFixed(4)),
    opaqueRatio: Number(opaqueRatio.toFixed(4)),
    colourBucketCount: buckets.size,
    visible: stddev > 8 || nonGreyRatio > 0.05 || buckets.size > 24,
  };
};

const collectConsoleEvents = (client) => client.events
  .filter((event) => event.method === 'Runtime.consoleAPICalled')
  .map((event) => {
    const args = event.params?.args ?? [];
    return args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
  });

const collectRuntimeErrors = (client) => client.events
  .filter((event) => event.method === 'Runtime.exceptionThrown')
  .map((event) => {
    const details = event.params?.exceptionDetails;
    return details?.exception?.description
      ?? details?.exception?.value
      ?? details?.text
      ?? 'Runtime exception';
  });

const findBlockingDiagnostics = ({ consoleLines, runtimeErrors, processLines, pollResult, visualResult }) => {
  const diagnostics = pollResult?.diagnostics ?? [];
  const statusLines = diagnostics
    .map((entry) => [
      entry.uxfdSharedRendererPresenterStatus ? `status=${entry.uxfdSharedRendererPresenterStatus}` : null,
      entry.uxfdSharedRendererPresenterFailureReason ? `reason=${entry.uxfdSharedRendererPresenterFailureReason}` : null,
      entry.uxfdSharedRendererPresenterNativeRenderFailureReason ? `native=${entry.uxfdSharedRendererPresenterNativeRenderFailureReason}` : null,
      entry.uxfdSharedRendererPresenterNativeRenderFailureDetail,
      entry.uxfdSharedRendererPresenterVideoUploadFailureReason ? `video=${entry.uxfdSharedRendererPresenterVideoUploadFailureReason}` : null,
      entry.uxfdSharedRendererPresenterVideoUploadFailureDetail,
    ].filter(Boolean).join(' / '))
    .filter(Boolean);
  const allLines = [
    ...consoleLines,
    ...runtimeErrors,
    ...processLines,
    ...statusLines,
    visualResult?.reason,
  ].filter((line) => typeof line === 'string' && line.length > 0);
  const blockingPatterns = [
    /TextureView .* associated with \[Device\].* cannot be used with \[Device\]/i,
    /Invalid CommandBuffer/i,
    /GPUDevice:/i,
    /presenterStartFailed/i,
    /requiredVideoOwnershipUnavailable/i,
    /nativeRenderSourcesUnavailable/i,
    /startFailed/i,
    /frameDecodeFailed/i,
    /Decode session already active for jobId/i,
    /No active decode session/i,
    /surfacePixelsBlankOrGrey/i,
  ];
  return allLines.filter((line) => blockingPatterns.some((pattern) => pattern.test(line)));
};

const writeResult = (result) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
};

const captureSharedRendererSurfaceAnalysis = async (client) => {
  const rect = await client.evaluate(`
    (() => {
      const canvas = document.querySelector('[data-shared-renderer-preview-surface="true"]');
      if (!canvas) return { ok: false, reason: 'surfaceCanvasMissing' };
      const rect = canvas.getBoundingClientRect();
      return {
        ok: rect.width > 0 && rect.height > 0,
        reason: rect.width > 0 && rect.height > 0 ? undefined : 'surfaceCanvasEmpty',
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        devicePixelRatio: window.devicePixelRatio,
        visibility: getComputedStyle(canvas).visibility,
      };
    })()
  `);
  if (!rect?.ok) return rect;
  const clip = {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    scale: 1,
  };
  const png = await capturePng(client, clip);
  writeFileSync(RESULT_SCREENSHOT, png);
  const analysis = analyseVisiblePixels(readPngRgba(png));
  return {
    ok: analysis.visible,
    reason: analysis.visible ? undefined : 'surfacePixelsBlankOrGrey',
    rect,
    screenshotPath: RESULT_SCREENSHOT,
    analysis,
  };
};

const main = async () => {
  if (!existsSync(VIDEO_PATH)) {
    throw new Error(`video fixture is missing: ${VIDEO_PATH}`);
  }

  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  log(`Vite 起動: port=${VITE_PORT}`);
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  vite.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  vite.on('error', (error) => log(`Vite error: ${error.message}`));
  await waitForPort(VITE_PORT);

  log(`Electron 起動: remote-debugging-port=${DEBUG_PORT}`);
  electron = spawn(
    resolve(ROOT, 'node_modules/.bin/electron'),
    ['.', `--remote-debugging-port=${DEBUG_PORT}`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}/?videoLoadE2e=1`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  electron.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  electron.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  electron.on('error', (error) => log(`Electron error: ${error.message}`));

  const timeout = setTimeout(() => {
    log(`timeout ${OVERALL_TIMEOUT_MS}ms`);
    finish(124);
  }, OVERALL_TIMEOUT_MS);

  const target = await waitForDebugTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');

  const videoButtonReady = await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector('button[title="Video"]')) {
          resolve({ ok: true });
          return;
        }
        if (Date.now() - started > 10000) {
          resolve({
            ok: false,
            body: document.body.innerText,
            html: document.body.innerHTML.slice(0, 2000),
          });
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    })
  `);
  if (!videoButtonReady?.ok) {
    throw new Error(`Video追加ボタンの表示待ちに失敗しました: ${JSON.stringify(videoButtonReady)}`);
  }

  log('Videoボタンをクリック');
  const clicked = await client.evaluate(`
    (() => {
      const button = document.querySelector('button[title="Video"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) {
    throw new Error('Video追加ボタンが見つかりません。');
  }

  await sleep(300);
  const inputNodeId = await client.querySelector('input[accept="video/*"]');
  if (!inputNodeId) {
    throw new Error('動画inputが見つかりません。');
  }

  log(`動画inputへ実ファイルを設定: ${VIDEO_PATH}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: inputNodeId,
    files: [VIDEO_PATH],
  });

  const pollResult = await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const items = [...document.querySelectorAll('[data-timeline-item="true"]')].map((node) => node.textContent || '');
        const body = document.body.innerText || '';
        const diagnostics = [...document.querySelectorAll('[data-uxfd-shared-renderer-presenter-status], [data-uxfd-shared-renderer-presenter-video-owner]')]
          .map((node) => ({ ...node.dataset }));
        const hasTimelineVideo = items.some((text) => text.includes(${JSON.stringify(VIDEO_NAME)}));
        const presenterReady = diagnostics.some((entry) => (
          entry.uxfdSharedRendererPresenterStatus === 'ready'
          && entry.uxfdSharedRendererPresenterVideoOwner === 'sharedRenderer'
          && entry.uxfdSharedRendererPresenterVideoFrameUploadReady === 'true'
          && !entry.uxfdSharedRendererPresenterNativeRenderFailureReason
          && !entry.uxfdSharedRendererPresenterVideoUploadFailureReason
        ));
        if (hasTimelineVideo && presenterReady) {
          resolve({ ok: true, items, body, diagnostics });
          return;
        }
        if (body.includes('Failed to load video') || body.includes('Failed to load')) {
          resolve({ ok: false, reason: 'uiFailedToLoad', items, body, diagnostics });
          return;
        }
        if (Date.now() - started > 15000) {
          resolve({ ok: false, reason: 'timeout', items, body, diagnostics });
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    })
  `);

  const consoleLines = collectConsoleEvents(client);
  const runtimeErrors = collectRuntimeErrors(client);
  const visualResult = pollResult?.ok
    ? await captureSharedRendererSurfaceAnalysis(client)
    : undefined;
  const blockingDiagnostics = findBlockingDiagnostics({
    consoleLines,
    runtimeErrors,
    processLines: logLines,
    pollResult,
    visualResult,
  });
  const result = {
    passed: Boolean(pollResult?.ok && visualResult?.ok && blockingDiagnostics.length === 0),
    videoPath: VIDEO_PATH,
    pollResult,
    visualResult,
    consoleLines,
    runtimeErrors,
    blockingDiagnostics,
  };
  writeResult(result);
  log(readFileSync(RESULT_JSON, 'utf8'));

  client.close();
  clearTimeout(timeout);
  finish(result.passed ? 0 : 1);
};

main().catch((error) => {
  writeResult({
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  });
  log(`失敗: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  finish(1);
});
