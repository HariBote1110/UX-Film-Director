import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nativeOverlayBuildScript = fileURLToPath(new URL('../scripts/build-native-overlay-addon.mjs', import.meta.url));
const bridgeBuildScript = fileURLToPath(new URL('../scripts/build-shared-video-frame-node-addon.mjs', import.meta.url));
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const rustBackendManifest = fileURLToPath(new URL('../rust-backend/Cargo.toml', import.meta.url));
const rustBackendReleaseBin = fileURLToPath(
  new URL(
    process.platform === 'win32'
      ? '../rust-backend/target/release/uxfd-rust-backend.exe'
      : '../rust-backend/target/release/uxfd-rust-backend',
    import.meta.url
  )
);

const finishFromChild = (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
};

const runCommand = (command, args, onDone) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal) {
      finishFromChild(code, signal);
      return;
    }
    if (code && code !== 0) {
      process.exit(code);
      return;
    }
    onDone();
  });
};

const startVite = () => {
  const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_UXFD_NATIVE_OVERLAY: process.env.VITE_UXFD_NATIVE_OVERLAY ?? '1',
      UXFD_NATIVE_OVERLAY: process.env.UXFD_NATIVE_OVERLAY ?? process.env.VITE_UXFD_NATIVE_OVERLAY ?? '1',
      VITE_UXFD_SHARED_RENDERER_PREVIEW: '1',
      VITE_UXFD_SHARED_RENDERER_EXPORT: '1',
      VITE_UXFD_RUST_EXPORT_ONLY: '1',
      VITE_UXFD_RUST_VIDEO_ONLY: '1',
      VITE_UXFD_RUST_TIMELINE_SCENE_RPC: process.env.VITE_UXFD_RUST_TIMELINE_SCENE_RPC ?? '1',
      UXFD_RUST_BACKEND_BIN: process.env.UXFD_RUST_BACKEND_BIN ?? rustBackendReleaseBin,
    },
  });

  child.on('exit', finishFromChild);
};

const buildRustBackendRelease = (onDone) => {
  runCommand('cargo', ['build', '--release', '--manifest-path', rustBackendManifest], onDone);
};

runCommand(process.execPath, [nativeOverlayBuildScript, '--release'], () => {
  runCommand(process.execPath, [bridgeBuildScript, '--release'], () => {
    buildRustBackendRelease(startVite);
  });
});
