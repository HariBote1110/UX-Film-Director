import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAgentProjectFile, type RustBackendAgentProjectBridge } from './agentProject';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// R4-4/R4-5: レシピの解析・展開ロジック（旧 parseAgentProjectSpec /
// buildAgentProjectFile の中身）は rust-core::agent_project へ移送済み。
// 等価カバレッジは rust-core/tests/agent_project_schema.rs にある
// （バリデーションエラーメッセージ・align/relativeTo のレイアウト解決・
// particle/dotField/shatteredSphere の既定値展開・explainer レシピの
// 具体的な展開結果など）。
//
// このファイルに残すのは、rustBackendProjectFileBoundary.test.ts と同じ
// パターンの「IPC 配線の一貫性」テストと、bridge を差し替えたときの
// エラー伝播（isProjectFileShape・response.error のスルー）だけ。
describe('agent.buildProjectFile RPC bridge boundary', () => {
  it('agent.buildProjectFile をElectron・preload・renderer型から同じ名称で公開する', () => {
    const main = read('../../electron/main.ts');
    const preload = read('../../electron/preload.ts');
    const env = read('../vite-env.d.ts');

    expect(main).toContain("callRustBackend('agent.buildProjectFile'");
    expect(main).toContain("'rust-backend-agent-build-project-file'");
    expect(preload).toContain('rust-backend-agent-build-project-file');
    expect(preload).toContain('buildAgentProjectFile');
    expect(env).toContain('buildAgentProjectFile:');
  });

  it('agent.buildProjectFile RPCもscene RPCと同じくRust error codeをrendererへ保持する', () => {
    const main = read('../../electron/main.ts');
    const handlerIndex = main.indexOf("ipcMain.handle('rust-backend-agent-build-project-file'");
    expect(handlerIndex).toBeGreaterThan(-1);
    const handlerBody = main.slice(handlerIndex, handlerIndex + 400);
    expect(handlerBody).toContain('sceneRpcFailure(error)');
  });
});

describe('buildAgentProjectFile（TS 側の薄いデリゲーション）', () => {
  it('bridgeが返したprojectをそのまま返す', async () => {
    const project = { format: 'uxfd-project', version: 2, savedAt: '', projectSettings: {}, activeSceneId: 'a', scenes: [] };
    const bridge: RustBackendAgentProjectBridge = {
      buildAgentProjectFile: async () => ({ success: true, result: { project } }),
    };
    await expect(buildAgentProjectFile('{}', bridge)).resolves.toEqual(project);
  });

  it('bridgeのエラーメッセージをそのままthrowする', async () => {
    const bridge: RustBackendAgentProjectBridge = {
      buildAgentProjectFile: async () => ({ success: false, error: 'オブジェクト「bg」のレイヤー「missing-layer」が見つかりません。' }),
    };
    await expect(buildAgentProjectFile('{}', bridge)).rejects.toThrow('見つかりません');
  });

  it('projectの形が不正なら日本語エラーをthrowする', async () => {
    const bridge: RustBackendAgentProjectBridge = {
      buildAgentProjectFile: async () => ({ success: true, result: { project: { unexpected: true } } }),
    };
    await expect(buildAgentProjectFile('{}', bridge)).rejects.toThrow('形式が不正です');
  });
});
