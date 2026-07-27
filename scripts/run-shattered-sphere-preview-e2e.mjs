import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.UXFD_SHATTERED_SPHERE_E2E_VITE_PORT ?? 5302);
const DEBUG_PORT = Number(process.env.UXFD_SHATTERED_SPHERE_E2E_DEBUG_PORT ?? 9334);
const OUTPUT_DIR = resolve(ROOT, '.codex/shattered-sphere-preview-e2e');
const RESULT_JSON = resolve(OUTPUT_DIR, 'result.json');
const RESULT_LOG = resolve(OUTPUT_DIR, 'result.log');
const RESULT_SCREENSHOT = resolve(OUTPUT_DIR, 'shared-renderer-shattered-sphere.png');
const OVERALL_TIMEOUT_MS = Number(process.env.UXFD_SHATTERED_SPHERE_E2E_TIMEOUT_MS ?? 90_000);

let vite = null;
let electron = null;
let finished = false;
const logLines = [];

const log = (message) => {
  const line = `[shattered-sphere-preview-e2e] ${message}`;
  logLines.push(line);
  console.log(line);
};

const finish = (code) => {
  if (finished) return;
  finished = true;
  for (const proc of [electron, vite]) {
    if (proc && !proc.killed) proc.kill('SIGTERM');
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
      if (message.method) this.events.push(message);
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
      }, 60_000);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
    }
    return result.result?.value;
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
    if (filter === 1) row[i] = (row[i] + left) & 0xff;
    else if (filter === 2) row[i] = (row[i] + up) & 0xff;
    else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) row[i] = (row[i] + paethPredictor(left, up, upLeft)) & 0xff;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter type: ${filter}`);
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

const analyseShatteredSpherePixels = ({ width, height, rgba }) => {
  let brightWhiteCount = 0;
  let brightNonBackgroundCount = 0;
  let variedCount = 0;
  const buckets = new Set();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const red = rgba[i];
      const green = rgba[i + 1];
      const blue = rgba[i + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (red > 190 && green > 190 && blue > 190) brightWhiteCount += 1;
      if (luminance > 120) brightNonBackgroundCount += 1;
      if (spread > 8 || luminance > 80) variedCount += 1;
      if (x % 8 === 0 && y % 8 === 0) buckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);
    }
  }
  return {
    width,
    height,
    brightWhiteCount,
    brightNonBackgroundCount,
    variedCount,
    colourBucketCount: buckets.size,
    visible: brightWhiteCount > 500 && brightNonBackgroundCount > 1500 && buckets.size > 4,
  };
};

const collectConsoleEvents = (client) => client.events
  .filter((event) => event.method === 'Runtime.consoleAPICalled')
  .map((event) => (event.params?.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' '));

const collectRuntimeErrors = (client) => client.events
  .filter((event) => event.method === 'Runtime.exceptionThrown')
  .map((event) => {
    const details = event.params?.exceptionDetails;
    return details?.exception?.description
      ?? details?.exception?.value
      ?? details?.text
      ?? 'Runtime exception';
  });

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
        surfaceGate: canvas.dataset.sharedRendererSurfaceGate,
        presenterStatus: canvas.dataset.uxfdSharedRendererPresenterStatus,
        nativeRenderFrameReady: canvas.dataset.uxfdSharedRendererPresenterNativeRenderFrameReady,
        nativeRenderFailureReason: canvas.dataset.uxfdSharedRendererPresenterNativeRenderFailureReason,
        nativeRenderFailureDetail: canvas.dataset.uxfdSharedRendererPresenterNativeRenderFailureDetail,
      };
    })()
  `);
  if (!rect?.ok) return rect;
  const png = await capturePng(client, {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    scale: 1,
  });
  writeFileSync(RESULT_SCREENSHOT, png);
  const frame = readPngRgba(png);
  const analysis = analyseShatteredSpherePixels(frame);
  return {
    ok: analysis.visible,
    reason: analysis.visible ? undefined : 'shatteredSpherePixelsMissing',
    rect,
    screenshotPath: RESULT_SCREENSHOT,
    analysis,
  };
};

const waitForAppReady = (client) => client.evaluate(`
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (typeof window.__UXFD_SHATTERED_SPHERE_PREVIEW_E2E_ADD__ === 'function') {
        resolve({ ok: true });
        return;
      }
      if (Date.now() - started > 15000) {
        resolve({ ok: false, body: document.body.innerText, html: document.body.innerHTML.slice(0, 2000) });
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  })
`);

const waitForNativePreviewReady = (client) => client.evaluate(`
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const gate = window.__UXFD_SHARED_RENDERER_PREVIEW_SURFACE_GATE__;
      const mediaKinds = gate?.ok ? gate.media.map((entry) => entry.kind) : [];
      const root = document.documentElement.dataset;
      const canvas = document.querySelector('[data-shared-renderer-preview-surface="true"]');
      const canvasData = canvas ? { ...canvas.dataset } : {};
      const state = {
        ok: Boolean(
          gate?.ok
          && mediaKinds.includes('GeneratedShatteredSphere')
          && root.uxfdSharedRendererPresenterStatus === 'ready'
          && root.uxfdSharedRendererPresenterNativeRenderFrameReady === 'true'
        ),
        planMode: window.__UXFD_SHARED_RENDERER_PREVIEW_PLAN__?.mode,
        surfaceGate: gate?.ok ? 'ok' : gate?.reason,
        mediaKinds,
        rootDataset: { ...root },
        canvasDataset: canvasData,
      };
      if (state.ok) {
        resolve(state);
        return;
      }
      if (Date.now() - started > 30000) {
        resolve({ ...state, ok: false, reason: 'nativePreviewReadyTimeout' });
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  })
`);

const main = async () => {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  log(`Vite 起動: port=${VITE_PORT}`);
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER: '1',
      VITE_UXFD_SHARED_RENDERER_PREVIEW: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  vite.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  vite.on('error', (error) => log(`Vite error: ${error.message}`));
  await waitForPort(VITE_PORT);

  log(`Electron 起動: remote-debugging-port=${DEBUG_PORT}`);
  electron = spawn(resolve(ROOT, 'node_modules/.bin/electron'), ['.', `--remote-debugging-port=${DEBUG_PORT}`], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}/?shatteredSpherePreviewE2e=1`,
      VITE_UXFD_SHARED_RENDERER_VIDEO_CUTOVER: '1',
      VITE_UXFD_SHARED_RENDERER_PREVIEW: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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

  const ready = await waitForAppReady(client);
  if (!ready?.ok) throw new Error(`E2E hook did not become ready: ${JSON.stringify(ready)}`);

  const addResult = await client.evaluate('window.__UXFD_SHATTERED_SPHERE_PREVIEW_E2E_ADD__()');
  log(`砕け散る球を追加: ${JSON.stringify(addResult)}`);
  const previewReady = await waitForNativePreviewReady(client);
  await sleep(500);
  // 画素検証は「再生を追加する前」の状態で行う。再生を先に走らせるとシーンが
  // 進行して見た目が変わり、既存の検証結果が変化してしまうため、
  // 検証→再生→presenter再起動回数計測、の順序を厳守する。
  const visualResult = previewReady?.ok
    ? await captureSharedRendererSurfaceAnalysis(client)
    : undefined;
  // 動画を含まないこのシーンで、再生区間中に shared renderer presenter が
  // 何回フル再起動したかを診断計測する（PASS/FAIL判定には含めない）。
  // canReuseNativeRenderPresenter（src/components/Viewport.tsx）が
  // rustVideoOnlyEnabled前提のため、本E2E構成では reuse が効かず publish
  // ごとにフル再起動している疑いがあり、その実測用。
  const presenterRestarts = previewReady?.ok
    ? await client.evaluate('window.__UXFD_SHATTERED_SPHERE_PREVIEW_E2E_PLAY__(2000)')
    : undefined;
  if (presenterRestarts) {
    log(`presenter再起動回数(診断・再生区間): before=${presenterRestarts.before} after=${presenterRestarts.after} duringPlayback=${presenterRestarts.duringPlayback}`);
  }
  const consoleLines = collectConsoleEvents(client);
  const runtimeErrors = collectRuntimeErrors(client);
  const blockingDiagnostics = [
    ...consoleLines,
    ...runtimeErrors,
    ...logLines,
    previewReady?.reason,
    visualResult?.reason,
    previewReady?.rootDataset?.uxfdSharedRendererPresenterNativeRenderFailureReason,
    previewReady?.rootDataset?.uxfdSharedRendererPresenterNativeRenderFailureDetail,
  ].filter((line) => typeof line === 'string' && line.length > 0)
    .filter((line) => (
      /GPUDevice:|Invalid CommandBuffer|nativeRender.*Failed|nativeRenderUnsupportedMedia|nativeRenderSourcesUnavailable|presenterStartFailed|shatteredSpherePixelsMissing/i.test(line)
    ));
  const result = {
    // presenterRestartsは診断計測のためPASS/FAIL判定には含めない。
    passed: Boolean(addResult?.ok && previewReady?.ok && visualResult?.ok && blockingDiagnostics.length === 0),
    addResult,
    previewReady,
    visualResult,
    presenterRestarts,
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
