import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCargoBin, buildCargoNotFoundHint } from './resolveCargo.mjs';

const cargoBin = resolveCargoBin();
const bridgeBuildScript = fileURLToPath(new URL('../scripts/build-shared-video-frame-node-addon.mjs', import.meta.url));
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const rustBackendManifest = fileURLToPath(new URL('../rust-backend/Cargo.toml', import.meta.url));
// The preview pipeline does per-frame RGBA compositing/scaling in the Rust
// backend. A debug build makes that pixel work ~10-50x slower (≈0.5fps), so the
// dev preview must run the release backend.
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

const startVite = () => {
  const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_UXFD_SHARED_RENDERER_PREVIEW: '1',
      VITE_UXFD_SHARED_RENDERER_EXPORT: '1',
      VITE_UXFD_RUST_EXPORT_ONLY: '1',
      VITE_UXFD_RUST_VIDEO_ONLY: '1',
      // Force the Electron main process to launch the release backend (resolved
      // first via UXFD_RUST_BACKEND_BIN), not a stale debug build.
      UXFD_RUST_BACKEND_BIN: process.env.UXFD_RUST_BACKEND_BIN ?? rustBackendReleaseBin,
    },
  });

  child.on('exit', finishFromChild);
};

const buildRustBackendRelease = (onDone) => {
  const child = spawn(
    cargoBin,
    ['build', '--release', '--manifest-path', rustBackendManifest],
    { stdio: 'inherit' }
  );
  child.on('error', (err) => {
    console.error(`[dev-rust-video] failed to start "${cargoBin} build" : ${err.message}`);
    if (err.code === 'ENOENT') {
      console.error(buildCargoNotFoundHint('dev-rust-video'));
    }
    process.exit(1);
  });
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
  buildRustBackendRelease(startVite);
});
