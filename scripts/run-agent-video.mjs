import { spawn } from 'node:child_process';

const projectPath = process.argv[2] ?? 'public/agent-projects/ai-demo.json';
const child = spawn(process.execPath, ['scripts/run-video-export-e2e.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    UXFD_VIDEO_EXPORT_E2E_AGENT_PROJECT_PATH: projectPath,
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`[agent-video] 起動に失敗しました: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[agent-video] ${signal} で終了しました。`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
