#!/usr/bin/env node
/**
 * エクスポートパイプライン テスト/ベンチを「ワンコマンド」で自動実行する。
 *
 *   npm run test:export:ci         … 全テスト（シーク方式の低速計測を含む）
 *   EXPORT_FAST=1 npm run ...:ci    … 速い版（シーク方式テストを省略）
 *   npm run test:export:fast        … 上のショートカット
 *
 * 流れ:
 *   1. Vite を VITE_EXPORT_TEST=1 (＋ mode) で起動
 *   2. Electron 起動 → ハーネスが自動実行し、終わると自分で quit する
 *   3. Vite/Electron を確実に後始末（タイムアウト・SIGINT 対応）
 *   4. perf/export-test-results.log を標準出力に表示
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = resolve(ROOT, 'perf', 'export-test-results.log');
const JSON_PATH = resolve(ROOT, 'perf', 'export-test-results.json');

const FAST = process.env.EXPORT_FAST === '1' || process.argv.includes('--fast');
const MODE = FAST ? 'fast' : 'all';
// fast は ~30秒、全実行はシークテストで ~3分。余裕を持たせる。
const OVERALL_TIMEOUT_MS = FAST ? 120_000 : 360_000;

let vite = null;
let electron = null;
let cleanedUp = false;

const cleanup = () => {
  if (cleanedUp) return;
  cleanedUp = true;
  for (const proc of [electron, vite]) {
    if (proc && !proc.killed) {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      // 念のため少し後に SIGKILL
      const ref = proc;
      setTimeout(() => { try { if (!ref.killed) ref.kill('SIGKILL'); } catch { /* ignore */ } }, 1500);
    }
  }
};

const finish = (code) => {
  cleanup();
  // 子プロセスの後始末を待ってから終了
  setTimeout(() => process.exit(code), 300);
};

process.on('SIGINT', () => { console.error('\n[run-export-test] 中断 → 後始末'); finish(130); });
process.on('SIGTERM', () => { finish(143); });

const waitForPort = (port, timeoutMs = 20_000) => new Promise((res, rej) => {
  const start = Date.now();
  const check = () => {
    fetch(`http://localhost:${port}/`).then(() => res()).catch(() => {
      if (Date.now() - start > timeoutMs) { rej(new Error(`Port ${port} not ready`)); return; }
      setTimeout(check, 300);
    });
  };
  check();
});

console.log(`[run-export-test] mode=${MODE} / Vite 起動中...`);

vite = spawn('npx', ['vite', '--port', '5299', '--strictPort', '--force'], {
  cwd: ROOT,
  env: { ...process.env, VITE_EXPORT_TEST: '1', VITE_EXPORT_MODE: MODE },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let viteReady = false;
let viteOutput = '';
vite.stdout.on('data', (d) => {
  viteOutput += d.toString();
  if (!viteReady && viteOutput.includes('localhost')) viteReady = true;
});
vite.stderr.on('data', (d) => process.stderr.write(d));
vite.on('error', (e) => { console.error('[run-export-test] Vite 起動失敗:', e.message); finish(1); });

try {
  // Vite の準備を待つ
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Vite 起動タイムアウト')), 30_000);
    const check = setInterval(() => {
      if (viteReady) { clearInterval(check); clearTimeout(t); res(); }
    }, 200);
  });
  await waitForPort(5299).catch(() => {});
  console.log('[run-export-test] Vite 起動完了 → Electron 起動');

  // 前回の結果を消して完了判定を確実に
  for (const p of [LOG_PATH, JSON_PATH]) {
    try { if (existsSync(p)) await unlink(p).catch(() => {}); } catch { /* ignore */ }
  }

  electron = spawn(
    resolve(ROOT, 'node_modules', '.bin', 'electron'),
    ['.'],
    { cwd: ROOT, env: { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5299/' }, stdio: 'inherit' }
  );

  // Electron 終了 or 全体タイムアウトのどちらか
  const exitCode = await new Promise((res) => {
    const to = setTimeout(() => {
      console.error(`[run-export-test] 全体タイムアウト(${OVERALL_TIMEOUT_MS / 1000}s) → 強制終了`);
      res(124);
    }, OVERALL_TIMEOUT_MS);
    electron.on('close', (code) => { clearTimeout(to); res(code ?? 0); });
    electron.on('error', (e) => { clearTimeout(to); console.error('[run-export-test] Electron 起動失敗:', e.message); res(1); });
  });

  console.log(`\n[run-export-test] 終了 (exitCode=${exitCode})`);
  if (existsSync(LOG_PATH)) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(readFileSync(LOG_PATH, 'utf-8'));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } else {
    console.error('[run-export-test] 結果ファイルが見つかりません:', LOG_PATH);
  }
  finish(exitCode);
} catch (e) {
  console.error('[run-export-test] エラー:', e instanceof Error ? e.message : String(e));
  finish(1);
}
