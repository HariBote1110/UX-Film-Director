#!/usr/bin/env node
/**
 * エクスポートテスト自動実行スクリプト
 *
 * 1. Vite 開発サーバーを VITE_EXPORT_TEST=1 で起動
 * 2. Electron を起動（テストが自動実行・終了）
 * 3. Vite を終了
 * 4. perf/export-test-results.log の内容を標準出力に表示
 *
 * 使い方: node scripts/run-export-test.mjs
 *         または npm run test:export:ci
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = resolve(ROOT, 'perf', 'export-test-results.log');
const JSON_PATH = resolve(ROOT, 'perf', 'export-test-results.json');

const waitForPort = (port, timeoutMs = 15_000) => new Promise((resolve, reject) => {
  const start = Date.now();
  const check = () => {
    fetch(`http://localhost:${port}/`).then(() => resolve()).catch(() => {
      if (Date.now() - start > timeoutMs) { reject(new Error(`Port ${port} not ready`)); return; }
      setTimeout(check, 300);
    });
  };
  check();
});

const findVitePort = (output) => {
  const m = output.match(/Local:\s+http:\/\/localhost:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
};

console.log('[run-export-test] Vite 起動中...');

const vite = spawn('npx', ['vite', '--port', '5299', '--strictPort'], {
  cwd: ROOT,
  env: { ...process.env, VITE_EXPORT_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let viteReady = false;
let viteOutput = '';

vite.stdout.on('data', (d) => {
  viteOutput += d.toString();
  if (!viteReady && viteOutput.includes('localhost')) {
    viteReady = true;
  }
});
vite.stderr.on('data', (d) => process.stderr.write(d));

// Vite の準備を待つ
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('Vite 起動タイムアウト')), 20_000);
  const check = setInterval(() => {
    if (viteReady) { clearInterval(check); clearTimeout(t); resolve(); }
  }, 200);
});

// ポート確認
await waitForPort(5299).catch(() => {});
console.log('[run-export-test] Vite 起動完了 → Electron 起動');

// 前回の結果ファイルを削除して完了判定を確実に
for (const p of [LOG_PATH, JSON_PATH]) {
  try { if (existsSync(p)) { (await import('node:fs/promises')).unlink(p).catch(() => {}); } } catch {}
}

const electron = spawn(
  resolve(ROOT, 'node_modules', '.bin', 'electron'),
  ['.'],
  {
    cwd: ROOT,
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5299/' },
    stdio: 'inherit',
  }
);

const exitCode = await new Promise((resolve) => {
  electron.on('close', (code) => resolve(code ?? 0));
});

vite.kill('SIGTERM');

console.log('\n[run-export-test] Electron 終了 (exitCode=' + exitCode + ')');

if (existsSync(LOG_PATH)) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(readFileSync(LOG_PATH, 'utf-8'));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
} else {
  console.error('[run-export-test] 結果ファイルが見つかりません:', LOG_PATH);
}

process.exit(exitCode);
