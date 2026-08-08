// path A（現行PSDインポート経路）のend-to-end計測ドライバ。
// scripts/run-video-export-e2e.mjsのElectron/CDP起動パターン
// (waitForPort/waitForDebugTarget/waitForElectronBundle/CdpClient/setFileInput)
// をそのまま踏襲する。動画出力は行わないため、その周辺だけを削ぎ落とした。
//
// 計測対象: file input -> native present。psdImportTrace=1で
// src/perf/psdImportTrace.tsのwindow.__UXFD_PSD_IMPORT_TRACE__を有効化し、
// input/parsed/objectAdded/evaluateReadyの4点を収集する。T5(native present
// 確定)はsrc.components.Viewport.tsxが書くdocument.documentElement.dataset
// (uxfdSharedRendererPresenterPsd*)をポーリングして検出する。
//
// 初回importはコールドコスト(presentSceneの一回限りの初期化)を含むため、
// 同一セッションで2回importして両方を別々に記録する(削除ではなく2枚目の
// 同一PSDを追加する方式。store削除APIはmain.tsx側のe2eフック配線が必要で
// 本タスクの担当範囲外のため採用しない)。
//
// path B計測: 第1引数または UXFD_PSD_IMPORT_E2E_MODE=b で、
// VITE_DEV_SERVER_URLへ `psdRustImport=1` を追加する。src/utils/psdParser.ts
// のフラグ判定に従い、ag-psd(Workerパス)を経由せずrust-backendの
// psd.parseMeta(メタデータのみ、pixelなし)でインポートする経路を測る。
// 結果の出力先もpath Aと混ざらないよう分ける。

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.UXFD_PSD_IMPORT_E2E_VITE_PORT ?? 5303);
const DEBUG_PORT = Number(process.env.UXFD_PSD_IMPORT_E2E_DEBUG_PORT ?? 9335);
const PSD_PATH = process.env.UXFD_PSD_IMPORT_E2E_PSD_PATH
  ? resolve(process.env.UXFD_PSD_IMPORT_E2E_PSD_PATH)
  : resolve(ROOT, '葵ちゃん.psd');
const PSD_NAME = PSD_PATH.split('/').pop() ?? 'standing.psd';

// path A(現行, ag-psd Worker経由)がデフォルト。'b'/'pathb'/'path-b'を渡すと
// path B(rust-backend psd.parseMetaのみ、ピクセルなし)を計測する。
const rawMode = (process.argv[2] ?? process.env.UXFD_PSD_IMPORT_E2E_MODE ?? 'a').trim().toLowerCase();
const IS_PATH_B = ['b', 'pathb', 'path-b'].includes(rawMode);
const OUTPUT_DIR = resolve(
  ROOT,
  IS_PATH_B ? 'vm_tuning_research/e2e-path-b' : 'vm_tuning_research/e2e-path-a-baseline'
);
const RESULT_JSON = resolve(OUTPUT_DIR, `result-${process.pid}.json`);
const RESULT_LOG = resolve(OUTPUT_DIR, `result-${process.pid}.log`);
const ELECTRON_MAIN_BUNDLE = resolve(ROOT, 'dist-electron/main.js');
const ELECTRON_PRELOAD_BUNDLE = resolve(ROOT, 'dist-electron/preload.js');
const USER_DATA_DIR = process.env.UXFD_PSD_IMPORT_E2E_USER_DATA_DIR
  ? resolve(process.env.UXFD_PSD_IMPORT_E2E_USER_DATA_DIR)
  : resolve(OUTPUT_DIR, `electron-profile-${process.pid}`);
const OVERALL_TIMEOUT_MS = Number(process.env.UXFD_PSD_IMPORT_E2E_TIMEOUT_MS ?? 180_000);
// T5(native present)は現行実装では到達しないことが判明している(下記
// waitForNativePresentのコメント参照)。ここでは短いタイムアウトに留め、
// 到達しなかったこと自体を結果として記録する(計測全体は失敗にしない)。
const NATIVE_PRESENT_TIMEOUT_MS = Number(process.env.UXFD_PSD_IMPORT_E2E_NATIVE_PRESENT_TIMEOUT_MS ?? 20_000);

let vite = null;
let electron = null;
let finished = false;
const logLines = [];

const log = (message) => {
  const line = `[psd-import-e2e] ${message}`;
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

const electronBundleReady = (startedAtMs) => {
  if (!existsSync(ELECTRON_MAIN_BUNDLE) || !existsSync(ELECTRON_PRELOAD_BUNDLE)) {
    return false;
  }
  const mainStat = statSync(ELECTRON_MAIN_BUNDLE);
  const preloadStat = statSync(ELECTRON_PRELOAD_BUNDLE);
  if (mainStat.mtimeMs < startedAtMs || preloadStat.mtimeMs < startedAtMs) {
    return false;
  }
  const mainSource = readFileSync(ELECTRON_MAIN_BUNDLE, 'utf8');
  const preloadSource = readFileSync(ELECTRON_PRELOAD_BUNDLE, 'utf8');
  return mainSource.includes('rust-backend-audio-waveform-samples')
    && preloadSource.includes('rust-backend-audio-waveform-samples');
};

const waitForElectronBundle = async (startedAtMs, timeoutMs = 30_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (electronBundleReady(startedAtMs)) return;
    await sleep(250);
  }
  throw new Error('Electron bundle did not finish before launching the PSD import E2E window.');
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

const collectRuntimeErrors = (client) => client.events
  .filter((event) => event.method === 'Runtime.exceptionThrown')
  .map((event) => {
    const details = event.params?.exceptionDetails;
    return details?.exception?.description
      ?? details?.exception?.value
      ?? details?.text
      ?? 'Runtime exception';
  });

const clickToolbarTextButton = async (client, labels) => client.evaluate(`
  (() => {
    const wanted = new Set(${JSON.stringify(labels)});
    const button = [...document.querySelectorAll('button')]
      .find((entry) => wanted.has((entry.textContent || '').trim()));
    if (!button) return false;
    button.click();
    return true;
  })()
`);

const setFileInput = async (client, selector, filePath, label) => {
  const inputNodeId = await client.querySelector(selector);
  if (!inputNodeId) throw new Error(`${label} inputが見つかりません。`);
  await client.send('DOM.setFileInputFiles', {
    nodeId: inputNodeId,
    files: [filePath],
  });
};

const waitForTimelineItemCount = async (client, expectedText, expectedCount, timeoutMs = 30_000) => client.evaluate(`
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const items = [...document.querySelectorAll('[data-timeline-item="true"]')]
        .map((node) => node.textContent || '');
      const matching = items.filter((text) => text.includes(${JSON.stringify(expectedText)}));
      const body = document.body.innerText || '';
      if (matching.length >= ${JSON.stringify(expectedCount)}) {
        resolve({ ok: true, items, matchingCount: matching.length });
        return;
      }
      if (body.includes('Failed to parse PSD file') || body.includes('psd.parse')) {
        resolve({ ok: false, reason: 'uiFailedToLoad', items, body });
        return;
      }
      if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
        resolve({ ok: false, reason: 'timeout', items, body });
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  })
`);

// T5: sharedRendererPresenterDiagnostics.tsがdocument.documentElement.datasetに
// 書くPSD所有権フラグを見る。sharedPsdObjectCountがそのimportで期待する数まで
// 到達し、かつcutoverReason==='nativeRenderFrameReady' / owner==='sharedRenderer'
// になった時点をnative present確定として扱う。
//
// 実測での既知の制約: sharedRendererViewportPresenterOrchestration.tsの
// prepareNativeRenderUpload(nativeRenderFrameReadyをtrueにする唯一の経路)は
// 現行のViewport.tsxからは一切呼び出されていない(呼び出し元は
// sharedRendererPreviewPresenterController.test.tsのみ)。そのためPSD単体の
// importではT5に到達しない実装状態が確認できた(2026-08-08)。ここでは
// 到達しなくても計測全体を失敗にはせず、タイムアウトを結果として記録する。
const waitForNativePresent = async (client, expectedPsdObjectCount, timeoutMs) => client.evaluate(`
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const dataset = { ...document.documentElement.dataset };
      const count = Number(dataset.uxfdSharedRendererPresenterSharedPsdObjectCount ?? '0');
      const ready = dataset.uxfdSharedRendererPresenterPsdCutoverReason === 'nativeRenderFrameReady'
        && dataset.uxfdSharedRendererPresenterPsdOwner === 'sharedRenderer'
        && count >= ${JSON.stringify(expectedPsdObjectCount)};
      if (ready) {
        resolve({ ok: true, dataset, elapsedMs: Date.now() - started });
        return;
      }
      if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
        resolve({ ok: false, reason: 'timeout', dataset, elapsedMs: Date.now() - started });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  })
`);

const resetTrace = async (client) => client.evaluate(`
  window.__UXFD_PSD_IMPORT_TRACE__?.reset() ?? null
`);

const snapshotTrace = async (client) => client.evaluate(`
  window.__UXFD_PSD_IMPORT_TRACE__?.snapshot() ?? null
`);

const importPsdOnce = async (client, importIndex) => {
  await resetTrace(client);
  client.dialogs.length = 0;

  const wallStartMs = Date.now();
  const psdClicked = await clickToolbarTextButton(client, ['PSD']);
  if (!psdClicked) throw new Error('PSD追加ボタンが見つかりません。');
  await sleep(300);
  await setFileInput(client, 'input[accept=".psd"]', PSD_PATH, 'PSD');

  const timelineResult = await waitForTimelineItemCount(client, PSD_NAME, importIndex, 90_000);
  if (!timelineResult?.ok) {
    return { ok: false, importIndex, stage: 'timelineItem', timelineResult };
  }

  const nativePresentResult = await waitForNativePresent(client, importIndex, NATIVE_PRESENT_TIMEOUT_MS);
  const wallEndMs = Date.now();
  const trace = await snapshotTrace(client);

  // T5未到達は既知の実装制約(prepareNativeRenderUploadが未配線)のため、
  // ここではevaluateReadyまでの4点が揃っていればimportそのものは成功と
  // 扱う。nativePresentResult.okは別途結果に残し、到達可否をそのまま記録する。
  return {
    ok: Boolean(trace?.marks?.evaluateReady !== undefined),
    importIndex,
    wallMsToNativePresent: wallEndMs - wallStartMs,
    timelineResult,
    nativePresentResult,
    trace,
    dialogs: [...client.dialogs],
  };
};

const writeResult = (result) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
};

const main = async () => {
  if (!existsSync(PSD_PATH)) {
    throw new Error(`PSD fixture is missing: ${PSD_PATH}`);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  rmSync(USER_DATA_DIR, { recursive: true, force: true });
  mkdirSync(USER_DATA_DIR, { recursive: true });

  log(`Vite 起動: port=${VITE_PORT}`);
  const viteStartedAtMs = Date.now();
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: {
      ...process.env,
      // evaluateReady(T4)はrustTimelineSceneRpcEnabled配下でしか発火しない
      // (Viewport.tsx:724)。scripts/run-realistic-heavy-edit-e2e.mjsと同じ
      // opt-inを使う。
      VITE_UXFD_RUST_TIMELINE_SCENE_RPC: '1',
      VITE_UXFD_NATIVE_OVERLAY: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  vite.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  vite.on('error', (error) => log(`Vite error: ${error.message}`));
  await waitForPort(VITE_PORT);
  await waitForElectronBundle(viteStartedAtMs);

  const devServerUrl = `http://localhost:${VITE_PORT}/?psdImportTrace=1${IS_PATH_B ? '&psdRustImport=1' : ''}`;
  log(`Electron 起動: remote-debugging-port=${DEBUG_PORT} mode=${IS_PATH_B ? 'pathB' : 'pathA'} url=${devServerUrl}`);
  electron = spawn(resolve(ROOT, 'node_modules/.bin/electron'), [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '.',
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devServerUrl,
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
        if ([...document.querySelectorAll('button')].some((entry) => (entry.textContent || '').trim() === 'PSD')) {
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

  const psdButtonReady = await client.evaluate(`
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if ([...document.querySelectorAll('button')].some((entry) => (entry.textContent || '').trim() === 'PSD')) {
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
  if (!psdButtonReady?.ok) throw new Error(`PSD追加ボタンの表示待ちに失敗しました: ${JSON.stringify(psdButtonReady)}`);

  log('1回目のPSDインポートを実行');
  const firstImport = await importPsdOnce(client, 1);
  if (!firstImport.ok) {
    throw new Error(`1回目のPSDインポートに失敗しました: ${JSON.stringify(firstImport)}`);
  }
  log(`1回目 完了: ${JSON.stringify(firstImport.trace)}`);

  log('2回目のPSDインポートを実行(同一ファイルをもう一枚追加)');
  const secondImport = await importPsdOnce(client, 2);
  if (!secondImport.ok) {
    throw new Error(`2回目のPSDインポートに失敗しました: ${JSON.stringify(secondImport)}`);
  }
  log(`2回目 完了: ${JSON.stringify(secondImport.trace)}`);

  const runtimeErrors = collectRuntimeErrors(client);
  const result = {
    passed: Boolean(firstImport.ok && secondImport.ok && runtimeErrors.length === 0),
    mode: IS_PATH_B ? 'pathB' : 'pathA',
    psdPath: PSD_PATH,
    firstImport,
    secondImport,
    runtimeErrors,
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
