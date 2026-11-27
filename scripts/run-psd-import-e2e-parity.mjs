// R5-6: PSD インポートの CI e2e ゲート。
//
// 実 PSD（葵ちゃん.psd、リポジトリルート）を、実際の import 経路
// （Electron の PSD 追加ボタン → ファイル選択 → `parse-psd-meta` IPC →
// rust-backend の `psd.parseMeta`）に通し、レイヤーツリーの構造
// （ノード数・名前・入れ子構造）を R5-3 で作った ag-psd 由来パリティ
// ベースライン（`rust-backend/tests/fixtures/psd-parity/aoi-chan-agpsd-baseline.json`）
// と機械的に diff する。タイミング計測は行わない
// （`scripts/run-psd-import-e2e.mjs` が研究用の計測ドライバ、
// このスクリプトは合否のみを見る CI ゲート）。
//
// Electron/CDP 起動まわりの骨格は `scripts/lib/electron-e2e-driver.mjs`
// （run-psd-import-e2e.mjs 以降に切り出された共通実装）を使う。
// アプリ側の読み取りフックは `src/e2e/psdImportParityHarness.ts`
// （`?psdImportParityE2e=1` で有効化、`window.__UXFD_PSD_IMPORT_PARITY_E2E__`）。

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CdpClient,
  collectRuntimeErrors,
  sleep,
  waitForFreshElectronBundle,
  waitForHttp,
  waitForRendererTarget,
} from './lib/electron-e2e-driver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = Number(process.env.UXFD_PSD_IMPORT_PARITY_E2E_VITE_PORT ?? 5304);
const DEBUG_PORT = Number(process.env.UXFD_PSD_IMPORT_PARITY_E2E_DEBUG_PORT ?? 9336);
const PSD_PATH = resolve(ROOT, '葵ちゃん.psd');
const PSD_NAME = PSD_PATH.split('/').pop() ?? '葵ちゃん.psd';
const BASELINE_PATH = resolve(
  ROOT,
  'rust-backend/tests/fixtures/psd-parity/aoi-chan-agpsd-baseline.json',
);
const OUTPUT_DIR = resolve(ROOT, '.codex/psd-import-e2e-parity');
const RESULT_JSON = resolve(OUTPUT_DIR, 'result.json');
const RESULT_LOG = resolve(OUTPUT_DIR, 'result.log');
const OVERALL_TIMEOUT_MS = Number(process.env.UXFD_PSD_IMPORT_PARITY_E2E_TIMEOUT_MS ?? 180_000);
const ELECTRON_MAIN_BUNDLE = resolve(ROOT, 'dist-electron/main.js');
const ELECTRON_PRELOAD_BUNDLE = resolve(ROOT, 'dist-electron/preload.js');

let vite = null;
let electron = null;
let finished = false;
const logLines = [];

const log = (message) => {
  const line = `[psd-import-e2e-parity] ${message}`;
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

const writeResult = (result) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(RESULT_JSON, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(RESULT_LOG, `${logLines.join('\n')}\n`, 'utf8');
};

/**
 * ベースライン（`ownGroupId`/`parentGroupId`/`order`、visible、sibling-relative
 * order）をアプリ側 `psdImportParityHarness.ts` の `SerialisedPsdNode` 形式
 * （`{name, isGroup, isRadio, children}`）と同じ形へ組み立て直す。
 * `psd.parseMeta`（`rust-backend/src/media.rs`）が実際に払い出す `psdId`/
 * `parentPsdId` と、このベースラインの `ownGroupId`/`parentGroupId` は
 * 同じ名前空間（グループは own_group_id、親はグループの id、`order` は
 * フラット配列内の通し番号）なので素直に対応する
 * （`src/remoteDeck/remoteDeckPsdLayers.e2e.test.ts` の変換ロジックと同一）。
 */
const buildExpectedTree = (baseline) => {
  const byParent = new Map();
  for (const node of baseline.nodes) {
    const key = node.parentGroupId;
    const bucket = byParent.get(key) ?? [];
    bucket.push(node);
    byParent.set(key, bucket);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.order - b.order);
  }

  const build = (node) => ({
    name: node.name,
    isGroup: node.isGroup,
    isRadio: node.name.startsWith('*'),
    children: (node.isGroup ? byParent.get(node.ownGroupId) ?? [] : []).map(build),
  });

  return (byParent.get(null) ?? []).map(build);
};

const countNodes = (nodes) =>
  nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);

const diffTrees = (expected, actual, path = '') => {
  const diffs = [];
  const length = Math.max(expected.length, actual.length);
  for (let i = 0; i < length; i += 1) {
    const nodePath = `${path}[${i}]`;
    const expectedNode = expected[i];
    const actualNode = actual[i];
    if (!expectedNode) {
      diffs.push(`${nodePath}: unexpected extra node "${actualNode?.name}"`);
      continue;
    }
    if (!actualNode) {
      diffs.push(`${nodePath}: missing node "${expectedNode.name}" (expected)`);
      continue;
    }
    if (expectedNode.name !== actualNode.name) {
      diffs.push(`${nodePath}: name mismatch expected="${expectedNode.name}" actual="${actualNode.name}"`);
    }
    if (expectedNode.isGroup !== actualNode.isGroup) {
      diffs.push(`${nodePath} (${expectedNode.name}): isGroup mismatch expected=${expectedNode.isGroup} actual=${actualNode.isGroup}`);
    }
    if (expectedNode.isRadio !== actualNode.isRadio) {
      diffs.push(`${nodePath} (${expectedNode.name}): isRadio mismatch expected=${expectedNode.isRadio} actual=${actualNode.isRadio}`);
    }
    diffs.push(...diffTrees(expectedNode.children, actualNode.children, `${nodePath}.${expectedNode.name}`));
  }
  return diffs;
};

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
      const body = document.body.innerText || '';
      if (matching.length >= 1) {
        resolve({ ok: true, items });
        return;
      }
      if (body.includes('Failed to parse PSD file') || body.includes('PSDファイルの解析に失敗しました')) {
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

const waitForHarnessReady = (client) => client.evaluate(`
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (typeof window.__UXFD_PSD_IMPORT_PARITY_E2E__?.snapshot === 'function') {
        resolve({ ok: true });
        return;
      }
      if (Date.now() - started > 15000) {
        resolve({ ok: false, body: document.body.innerText });
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  })
`);

const main = async () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const expectedTree = buildExpectedTree(baseline);
  const expectedNodeCount = countNodes(expectedTree);
  if (expectedNodeCount !== baseline.nodeCount) {
    throw new Error(
      `baseline self-check failed: reconstructed tree has ${expectedNodeCount} nodes, baseline.nodeCount=${baseline.nodeCount}`,
    );
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

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

  const devServerUrl = `http://localhost:${VITE_PORT}/?psdImportParityE2e=1`;
  log(`Electron 起動: remote-debugging-port=${DEBUG_PORT} url=${devServerUrl}`);
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

  const harnessReady = await waitForHarnessReady(client);
  if (!harnessReady?.ok) {
    throw new Error(`psdImportParityHarness did not become ready: ${JSON.stringify(harnessReady)}`);
  }

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

  // useStore の反映（rootLayer/activeLayerIds の構築）を待つ。
  await sleep(300);
  const importSnapshot = await client.evaluate('window.__UXFD_PSD_IMPORT_PARITY_E2E__.snapshot()');
  log(`importSnapshot: ok=${importSnapshot?.ok} nodeCount=${importSnapshot?.nodeCount} psdObjectCount=${importSnapshot?.psdObjectCount}`);

  const runtimeErrors = collectRuntimeErrors(client);

  const structureDiffs = importSnapshot?.tree
    ? diffTrees(expectedTree, importSnapshot.tree)
    : ['no tree in snapshot'];
  const nodeCountMatches = importSnapshot?.nodeCount === expectedNodeCount;
  const docSizeMatches =
    importSnapshot?.docWidth === baseline.docWidth
    && importSnapshot?.docHeight === baseline.docHeight;

  const passed = Boolean(
    importSnapshot?.ok
    && importSnapshot?.psdObjectCount === 1
    && nodeCountMatches
    && docSizeMatches
    && structureDiffs.length === 0
    && runtimeErrors.length === 0,
  );

  const result = {
    passed,
    psdPath: PSD_PATH,
    baselinePath: BASELINE_PATH,
    expectedNodeCount,
    actualNodeCount: importSnapshot?.nodeCount,
    nodeCountMatches,
    docSizeMatches,
    expectedDocSize: { width: baseline.docWidth, height: baseline.docHeight },
    actualDocSize: { width: importSnapshot?.docWidth, height: importSnapshot?.docHeight },
    structureDiffs,
    activeLayerIdDiffs: importSnapshot?.activeLayerIdDiffs ?? [],
    rootActive: importSnapshot?.rootActive,
    importSnapshotOk: importSnapshot?.ok,
    psdObjectCount: importSnapshot?.psdObjectCount,
    timelineResult,
    runtimeErrors,
  };
  writeResult(result);
  log(JSON.stringify({ ...result, structureDiffs: structureDiffs.slice(0, 20) }, null, 2));

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
