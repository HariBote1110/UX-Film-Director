// R5-7: 目視一致確認用の使い捨てキャプチャスクリプト。
//
// 葵ちゃん.psd を実 Electron の import 経路でインポートし、プレビュー領域を
// CDP の Page.captureScreenshot で PNG 保存する。R5 では display 経路
// （rust-backend 自前デコード → native-overlay 経由の合成）自体には手を
// 入れていないため、CDP screenshot は native-overlay 合成後の最終フレーム
// を直接キャプチャできない可能性がある（Chromium のページサーフェスのみを
// 撮る場合、native overlay window の内容が写らない）。その場合でも
// 「何を撮って何を確認したか」を正直に記録する目的で使う一回限りのスクリプト
// （テストスイートには組み込まない、R5-7 の progress 記録用）。
//
// 使い方: node scripts/run-psd-visual-parity-capture.mjs <output.png>

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CdpClient,
  sleep,
  waitForFreshElectronBundle,
  waitForHttp,
  waitForRendererTarget,
} from './lib/electron-e2e-driver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.UXFD_PSD_VISUAL_PARITY_VITE_PORT ?? 5308);
const DEBUG_PORT = Number(process.env.UXFD_PSD_VISUAL_PARITY_DEBUG_PORT ?? 9339);
const PSD_PATH = resolve(ROOT, '葵ちゃん.psd');
const PSD_NAME = PSD_PATH.split('/').pop() ?? '葵ちゃん.psd';
const OUTPUT_PATH = resolve(process.cwd(), process.argv[2] ?? 'psd-visual-parity.png');
const ELECTRON_MAIN_BUNDLE = resolve(ROOT, 'dist-electron/main.js');
const ELECTRON_PRELOAD_BUNDLE = resolve(ROOT, 'dist-electron/preload.js');
const OVERALL_TIMEOUT_MS = 180_000;

let vite = null;
let electron = null;
let finished = false;

const log = (message) => console.log(`[psd-visual-parity] ${message}`);

const finish = (code) => {
  if (finished) return;
  finished = true;
  for (const proc of [electron, vite]) {
    if (proc && !proc.killed) proc.kill('SIGTERM');
  }
  process.exit(code);
};

process.on('SIGINT', () => finish(130));
process.on('SIGTERM', () => finish(143));

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
  const { root } = await client.send('DOM.getDocument', { depth: 1, pierce: true });
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`${label} inputが見つかりません。`);
  await client.send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
};

const waitForTimelineItem = async (client, expectedText, timeoutMs = 90_000) => client.evaluate(`
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const items = [...document.querySelectorAll('[data-timeline-item="true"]')]
        .map((node) => node.textContent || '');
      const matching = items.filter((text) => text.includes(${JSON.stringify(expectedText)}));
      if (matching.length >= 1) {
        resolve({ ok: true, items });
        return;
      }
      if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
        resolve({ ok: false, reason: 'timeout', items });
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  })
`);

const capturePng = async (client) => {
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  return Buffer.from(screenshot.data, 'base64');
};

const main = async () => {
  log(`Vite 起動: port=${VITE_PORT}`);
  const viteStartedAtMs = Date.now();
  vite = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  vite.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  vite.on('error', (error) => log(`Vite error: ${error.message}`));
  await waitForHttp(`http://localhost:${VITE_PORT}/`);
  await waitForFreshElectronBundle({
    mainBundle: ELECTRON_MAIN_BUNDLE,
    preloadBundle: ELECTRON_PRELOAD_BUNDLE,
    startedAtMs: viteStartedAtMs,
    requiredMainText: 'parse-psd-meta',
    requiredPreloadText: 'invoke',
  });

  // `psdImportParityE2e` フラグは実プロダクションコード非依存の e2e フックだが、
  // 副次効果として main.tsx が起動時に `initializeProject` を自動実行してくれる
  // ため、プロジェクト作成画面をスキップできる（他の e2e ハーネスと同じ流儀）。
  const devServerUrl = `http://localhost:${VITE_PORT}/?psdImportParityE2e=1`;
  log(`Electron 起動: remote-debugging-port=${DEBUG_PORT}`);
  electron = spawn(resolve(ROOT, 'node_modules/.bin/electron'), [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '.',
  ], {
    cwd: ROOT,
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  electron.stdout.on('data', (chunk) => log(chunk.toString().trim()));
  electron.stderr.on('data', (chunk) => log(chunk.toString().trim()));
  electron.on('error', (error) => log(`Electron error: ${error.message}`));

  const timeout = setTimeout(() => {
    log(`timeout ${OVERALL_TIMEOUT_MS}ms`);
    finish(124);
  }, OVERALL_TIMEOUT_MS);

  const target = await waitForRendererTarget({
    debugPort: DEBUG_PORT,
    urlPrefix: `http://localhost:${VITE_PORT}/`,
  });
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('DOM.enable');

  log('PSD追加ボタンの表示を待機');
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

  const psdClicked = await clickToolbarTextButton(client, ['PSD']);
  if (!psdClicked) throw new Error('PSD追加ボタンが見つかりません。');
  await sleep(300);

  log(`PSD インポート実行: ${PSD_PATH}`);
  await setFileInput(client, 'input[accept=".psd"]', PSD_PATH, 'PSD');
  const timelineResult = await waitForTimelineItem(client, PSD_NAME);
  if (!timelineResult?.ok) {
    throw new Error(`PSDインポートに失敗しました: ${JSON.stringify(timelineResult)}`);
  }
  log(`タイムラインへの反映を確認: ${JSON.stringify(timelineResult.items)}`);

  // プレビューの合成描画が落ち着くのを待つ（native-overlay 反映のマージン）。
  await sleep(2000);

  const png = await capturePng(client);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, png);
  log(`スクリーンショット保存: ${OUTPUT_PATH} (${png.length} bytes)`);

  client.close();
  clearTimeout(timeout);
  finish(0);
};

main().catch((error) => {
  log(`失敗: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  finish(1);
});
