import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.UXFD_VIDEO_EXPORT_E2E_VITE_PORT ?? 5302);
const DEBUG_PORT = Number(process.env.UXFD_VIDEO_EXPORT_E2E_DEBUG_PORT ?? 9334);
const VIDEO_PATH = process.env.UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH
  ? resolve(process.env.UXFD_VIDEO_EXPORT_E2E_VIDEO_PATH)
  : resolve(ROOT, 'perf/heavy-media/GX010052.MP4');
const VIDEO_NAME = VIDEO_PATH.split('/').pop() ?? 'video';
const OUTPUT_DIR = resolve(ROOT, '.codex/video-export-e2e');
const OUTPUT_MP4 = resolve(OUTPUT_DIR, 'video-export-e2e-output.mp4');
const RESULT_JSON = resolve(OUTPUT_DIR, 'result.json');
const RESULT_LOG = resolve(OUTPUT_DIR, 'result.log');
const OVERALL_TIMEOUT_MS = Number(process.env.UXFD_VIDEO_EXPORT_E2E_TIMEOUT_MS ?? 180_000);

let vite = null;
let electron = null;
let finished = false;
const logLines = [];

const log = (message) => {
  const line = `[video-export-e2e] ${message}`;
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
    this.dialogs = [];
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
          this.dialogs.push({
            type: message.params?.type,
            message: message.params?.message ?? '',
          });
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
      }, 90_000);
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
        if (!message.includes('Cannot find default execution context') || attempt === 19) throw error;
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

const collectConsoleEvents = (client) => client.events
  .filter((event) => event.method === 'Runtime.consoleAPICalled')
  .map((event) => (event.params?.args ?? [])
    .map((arg) => arg.value ?? arg.description ?? '')
    .join(' '));

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
  electron = spawn(resolve(ROOT, 'node_modules/.bin/electron'), ['.', `--remote-debugging-port=${DEBUG_PORT}`], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: `http://localhost:${VITE_PORT}/?videoExportE2e=1`,
      UXFD_VIDEO_EXPORT_E2E_SAVE_PATH: OUTPUT_MP4,
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

  await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        const buttons = [...document.querySelectorAll('button')];
        const createButton = buttons.find((button) => (button.textContent || '').includes('作成'));
        if (createButton) {
          createButton.click();
          resolve({ ok: true, created: true });
          return;
        }
        if (document.querySelector('button[title="Video"]')) {
          resolve({ ok: true, created: false });
          return;
        }
        if (Date.now() - started > 10000) {
          resolve({ ok: false, body: document.body.innerText });
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    })
  `);

  const ready = await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (document.querySelector('button[title="Video"]')) {
          resolve({ ok: true });
          return;
        }
        if (Date.now() - started > 10000) {
          resolve({ ok: false, body: document.body.innerText });
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
    })
  `);
  if (!ready?.ok) throw new Error(`Video追加ボタンの表示待ちに失敗しました: ${JSON.stringify(ready)}`);

  await client.evaluate(`document.querySelector('button[title="Video"]')?.click()`);
  await sleep(300);
  const inputNodeId = await client.querySelector('input[accept="video/*"]');
  if (!inputNodeId) throw new Error('動画inputが見つかりません。');
  log(`動画inputへ実ファイルを設定: ${VIDEO_PATH}`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: inputNodeId,
    files: [VIDEO_PATH],
  });

  const loadResult = await client.evaluate(`
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
        ));
        if (hasTimelineVideo && presenterReady) {
          resolve({ ok: true, items, diagnostics });
          return;
        }
        if (body.includes('Failed to load video') || body.includes('Failed to load')) {
          resolve({ ok: false, reason: 'uiFailedToLoad', items, body, diagnostics });
          return;
        }
        if (Date.now() - started > 120000) {
          resolve({ ok: false, reason: 'timeout', items, body, diagnostics });
          return;
        }
        setTimeout(tick, 250);
      };
      tick();
    })
  `);
  if (!loadResult?.ok) {
    throw new Error(`動画読み込みに失敗しました: ${JSON.stringify(loadResult)}`);
  }
  const durationShortened = await client.evaluate(`
    window.__UXFD_VIDEO_EXPORT_E2E_SET_VIDEO_DURATION__?.(1) ?? false
  `);
  if (!durationShortened) {
    throw new Error('動画export E2E用の短尺化に失敗しました。');
  }

  log(`動画出力を開始: ${OUTPUT_MP4}`);
  const exportClicked = await client.evaluate(`
    (() => {
      const buttons = [...document.querySelectorAll('button')];
      const button = buttons.find((entry) => (entry.textContent || '').includes('動画出力'))
        ?? buttons.find((entry) => (entry.textContent || '').includes('Export'));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!exportClicked) throw new Error('動画出力ボタンが見つかりません。');

  const startedExportWait = Date.now();
  let exportResult = null;
  while (Date.now() - startedExportWait < 120000) {
    const dialog = client.dialogs.find((entry) => (
      entry.message.includes('エクスポート完了')
      || entry.message.includes('エクスポート失敗')
    ));
    const progressSnapshot = await client.evaluate(`
      (() => ({
        dataset: { ...document.documentElement.dataset },
        body: document.body.innerText || '',
      }))()
    `).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (dialog) {
      exportResult = {
        ok: dialog.message.includes('エクスポート完了'),
        reason: dialog.message.includes('エクスポート完了') ? 'completionDialog' : 'failureDialog',
        dialog,
        progressSnapshot,
      };
      break;
    }
    await sleep(500);
  }
  exportResult ??= {
    ok: false,
    reason: 'exportTimeout',
    progressSnapshot: await client.evaluate(`
      (() => ({
        dataset: { ...document.documentElement.dataset },
        body: document.body.innerText || '',
      }))()
    `).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    })),
  };

  await sleep(500);
  const outputStat = existsSync(OUTPUT_MP4)
    ? {
      exists: true,
      size: statSync(OUTPUT_MP4).size,
    }
    : { exists: false, size: 0 };
  const result = {
    passed: Boolean(outputStat.exists && outputStat.size > 0 && client.dialogs.some((dialog) => dialog.message.includes('エクスポート完了'))),
    videoPath: VIDEO_PATH,
    outputPath: OUTPUT_MP4,
    outputStat,
    loadResult,
    exportResult,
    dialogs: client.dialogs,
    consoleLines: collectConsoleEvents(client),
    runtimeErrors: collectRuntimeErrors(client),
    processLines: logLines,
  };
  writeResult(result);
  log(JSON.stringify(result, null, 2));

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
