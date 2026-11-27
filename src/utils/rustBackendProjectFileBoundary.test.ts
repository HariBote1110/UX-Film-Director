import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// R4-2: rust-core の project_file 境界（ProjectFile の解析/移行と pretty JSON
// 直列化）を Electron IPC 経由で公開する配線の一貫性テスト。
//
// このリポジトリの既存パターン（rustBackendSceneControlBoundary.test.ts 等）
// と同様、実際のプロセス間 RPC（rust-backend サブプロセスとの通信）を vitest
// から起動する仕組みは存在しない（electron/main.ts はテスト用にモック化
// されておらず、callRustBackend は実際に子プロセスを spawn する）ため、
// ここでは「main/preload/renderer 型の三箇所が同じチャネル名で一貫して
// 配線されていること」を静的に検証する。実際の RPC 呼び出し（
// project.deserialize/project.serialize がドメインロジックとして正しく
// 動作すること）は rust-backend 側のユニットテスト
// （rust-backend/src/project_file.rs の #[cfg(test)] mod tests）で
// カバーしている。
describe('Rust backend project file RPC bridge boundary', () => {
  it('project.deserialize/project.serialize をElectron・preload・renderer型から同じ名称で公開する', () => {
    const main = read('../../electron/main.ts');
    const preload = read('../../electron/preload.ts');
    const env = read('../vite-env.d.ts');

    expect(main).toContain("callRustBackend('project.deserialize'");
    expect(main).toContain("callRustBackend('project.serialize'");
    expect(main).toContain("'rust-backend-project-deserialize'");
    expect(main).toContain("'rust-backend-project-serialize'");

    expect(preload).toContain('rust-backend-project-deserialize');
    expect(preload).toContain('rust-backend-project-serialize');
    expect(preload).toContain('deserializeProjectFile');
    expect(preload).toContain('serializeProjectFile');

    expect(env).toContain('deserializeProjectFile:');
    expect(env).toContain('serializeProjectFile:');
  });

  it('project file RPCもscene RPCと同じくRust error codeをrendererへ保持する', () => {
    const main = read('../../electron/main.ts');

    // sceneRpcFailure（errorCode 付きの失敗整形）を project.deserialize/
    // project.serialize でも再利用していること。専用の失敗整形を新設して
    // errorCode を握りつぶしていないかを検出する。
    const deserializeHandlerIndex = main.indexOf(
      "ipcMain.handle('rust-backend-project-deserialize'"
    );
    const serializeHandlerIndex = main.indexOf(
      "ipcMain.handle('rust-backend-project-serialize'"
    );
    expect(deserializeHandlerIndex).toBeGreaterThan(-1);
    expect(serializeHandlerIndex).toBeGreaterThan(-1);

    const deserializeHandlerBody = main.slice(
      deserializeHandlerIndex,
      deserializeHandlerIndex + 400
    );
    const serializeHandlerBody = main.slice(serializeHandlerIndex, serializeHandlerIndex + 400);

    expect(deserializeHandlerBody).toContain('sceneRpcFailure(error)');
    expect(serializeHandlerBody).toContain('sceneRpcFailure(error)');
  });
});
