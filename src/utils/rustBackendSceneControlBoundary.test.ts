import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Rust backend scene RPC bridge boundary', () => {
  it('scene.replace/evaluate/position query をElectron・preload・renderer型から同じ名称で公開する', () => {
    const main = read('../../electron/main.ts');
    const preload = read('../../electron/preload.ts');
    const env = read('../vite-env.d.ts');

    expect(main).toContain("callRustBackend('scene.replace'");
    expect(main).toContain("callRustBackend('scene.evaluate'");
    expect(main).toContain("callRustBackend('scene.query_object_positions'");
    expect(preload).toContain("rust-backend-scene-replace");
    expect(preload).toContain("rust-backend-scene-evaluate");
    expect(preload).toContain("rust-backend-scene-query-object-positions");
    expect(env).toContain('replaceScene: (payload: unknown)');
    expect(env).toContain('evaluateScene: (payload: unknown)');
    expect(env).toContain('queryObjectPositions: (payload: unknown)');
  });

  it('scene RPCだけはRust error codeをrendererへ保持する', () => {
    const main = read('../../electron/main.ts');

    expect(main).toContain('errorCode:');
    expect(main).toContain('RustBackendRpcError');
  });
});
