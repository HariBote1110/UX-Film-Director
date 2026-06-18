import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_UXFD_SHARED_RENDERER_PREVIEW: '1',
    VITE_UXFD_SHARED_RENDERER_EXPORT: '1',
    VITE_UXFD_RUST_VIDEO_ONLY: '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
