import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCargoBin, buildCargoNotFoundHint } from './resolveCargo.mjs';

const cargoBin = resolveCargoBin();
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

console.error(`[dev] node ${process.version} platform=${process.platform} cwd=${process.cwd()}`);

const finishFromChild = (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
};

const describeCommand = (command, args) => [command, ...args].join(' ');

const runCommand = (label, command, args, onDone) => {
  const child = spawn(command, args, { stdio: 'inherit' });

  child.on('error', (err) => {
    console.error(
      `[dev] failed to start step "${label}" (${describeCommand(command, args)}) in cwd=${process.cwd()}: ${err.message}`
    );
    if (err.code === 'ENOENT' && command === cargoBin) {
      console.error(buildCargoNotFoundHint('dev'));
    }
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      finishFromChild(code, signal);
      return;
    }
    if (code && code !== 0) {
      console.error(
        `[dev] step "${label}" (${describeCommand(command, args)}) failed with exit code ${code}`
      );
      process.exit(code);
      return;
    }
    onDone();
  });
};

const startVite = () => {
  console.error('[dev] starting vite...');
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

  child.on('error', (err) => {
    console.error(
      `[dev] failed to start step "vite" (${describeCommand(process.execPath, [viteBin])}) in cwd=${process.cwd()}: ${err.message}`
    );
    process.exit(1);
  });

  child.on('exit', finishFromChild);
};

const buildRustBackendRelease = (onDone) => {
  console.error('[dev] building rust-backend (release)...');
  runCommand('rust-backend build', cargoBin, ['build', '--release', '--manifest-path', rustBackendManifest], onDone);
};

console.error('[dev] building native-overlay addon...');
runCommand('native-overlay addon build', process.execPath, [nativeOverlayBuildScript, '--release'], () => {
  console.error('[dev] building shared-video-frame-bridge addon...');
  runCommand('shared-video-frame-bridge addon build', process.execPath, [bridgeBuildScript, '--release'], () => {
    buildRustBackendRelease(startVite);
  });
});
