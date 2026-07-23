import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Rust backend scene RPC bridge boundary', () => {
  it('scene.replace/evaluate をElectron・preload・renderer型から同じ名称で公開する', () => {
    const main = read('../../electron/main.ts');
    const preload = read('../../electron/preload.ts');
    const env = read('../vite-env.d.ts');

    expect(main).toContain("callRustBackend('scene.replace'");
    expect(main).toContain("callRustBackend('scene.evaluate'");
    expect(preload).toContain("rust-backend-scene-replace");
    expect(preload).toContain("rust-backend-scene-evaluate");
    expect(env).toContain('replaceScene: (payload: unknown)');
    expect(env).toContain('evaluateScene: (payload: unknown)');
  });

  it('scene RPCだけはRust error codeをrendererへ保持する', () => {
    const main = read('../../electron/main.ts');

    expect(main).toContain('errorCode:');
    expect(main).toContain('RustBackendRpcError');
  });
});
