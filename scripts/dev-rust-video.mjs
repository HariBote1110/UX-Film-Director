import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bridgeBuildScript = fileURLToPath(new URL('../scripts/build-shared-video-frame-node-addon.mjs', import.meta.url));
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const finishFromChild = (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
};

const startVite = () => {
  const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_UXFD_SHARED_RENDERER_PREVIEW: '1',
      VITE_UXFD_SHARED_RENDERER_EXPORT: '1',
      VITE_UXFD_RUST_EXPORT_ONLY: '1',
      VITE_UXFD_RUST_VIDEO_ONLY: '1',
    },
  });

  child.on('exit', finishFromChild);
};

const bridgeBuild = spawn(process.execPath, [bridgeBuildScript], {
  stdio: 'inherit',
});

bridgeBuild.on('exit', (code, signal) => {
  if (signal) {
    finishFromChild(code, signal);
    return;
  }
  if (code && code !== 0) {
    process.exit(code);
    return;
  }
  startVite();
});
