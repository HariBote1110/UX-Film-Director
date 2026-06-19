import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../..', import.meta.url).pathname;

const productionFiles = [
  'electron/main.ts',
  'rust-backend/src/main.rs',
  'rust-backend/Cargo.toml',
];

const forbiddenTokens = [
  'start-export',
  'write-frame',
  'end-export',
  'export.start',
  'export.write_frame',
  'export.end',
  'frameBase64',
  'frame_base64',
  'base64 =',
  'check-intermediate',
  'generate-intermediate',
  'cancel-intermediate',
  'intermediate-progress',
  'intermediateCachePath',
];

describe('legacy base64 export boundary', () => {
  it('keeps legacy base64 export IPC/RPC out of production Electron and Rust boundaries', () => {
    const offenders = productionFiles.flatMap((file) => {
      const path = join(projectRoot, file);
      const code = readFileSync(path, 'utf8');
      return forbiddenTokens
        .filter((token) => code.includes(token))
        .map((token) => `${relative(projectRoot, path)} -> ${token}`);
    });

    expect(offenders).toEqual([]);
  });
});
