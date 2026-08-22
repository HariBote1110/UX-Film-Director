import type { ProjectFileV2 } from '../utils/projectFile';

// R4-4/R4-5: レシピの解析・展開ロジックの唯一の正は
// rust-core::agent_project::parse_agent_project_spec /
// build_agent_project_file（TDD fixture は
// rust-core/tests/agent_project_schema.rs）。このファイルは
// src/main.tsx（renderer 実行時）からその IPC を呼ぶための薄い
// デリゲーションのみを持つ。TS 側の重複バリデーション実装は削除済み。
//
// AgentProjectSpec 等の型定義自体は schemars/ts-rs 生成物
// （src/generated/rustCore/AgentProjectSpec 等）を参照すること。

type RustBackendAgentBuildResult = {
  success: boolean;
  result?: { project: unknown };
  error?: string;
  errorCode?: number;
};

/**
 * `window.rustBackend.buildAgentProjectFile`（rust-core の
 * `build_agent_project_file` に委譲する Rust IPC、R4-4/R4-5 で配線済み）の
 * 薄い呼び出し口。`src/utils/projectFile.ts` の
 * `RustBackendProjectFileBridge` と同じパターン（デフォルト実装は
 * `window.rustBackend` を直接呼ぶだけで存在チェックはしない — Electron
 * renderer コンテキストであることを前提とする。テストはこの bridge を
 * 差し替えてモックする）を踏襲した。
 */
export interface RustBackendAgentProjectBridge {
  buildAgentProjectFile: (payload: { json: string }) => Promise<RustBackendAgentBuildResult>;
}

const defaultRustBackendAgentProjectBridge = (): RustBackendAgentProjectBridge => ({
  buildAgentProjectFile: (payload) => window.rustBackend.buildAgentProjectFile(payload),
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object'
);

/**
 * Rust 側 (`schema::ProjectFile`) が返した値が期待する最上位 shape を
 * 持つことだけを確認する。フィールド単位の詳細な妥当性検証は rust-core の
 * `serde::Deserialize` に一本化したため、ここでは二重実装しない。
 */
const isProjectFileShape = (value: unknown): value is ProjectFileV2 => (
  isRecord(value)
  && typeof value.format === 'string'
  && typeof value.version === 'number'
  && typeof value.savedAt === 'string'
  && isRecord(value.projectSettings)
  && typeof value.activeSceneId === 'string'
  && Array.isArray(value.scenes)
);

/**
 * エージェント用プロジェクトレシピ（JSON テキスト）を Rust IPC
 * (`agent.buildProjectFile`) 経由で解析・展開する。バリデーション・
 * レイアウト解決・既定値補完はすべて rust-core 側で行われる。
 */
export const buildAgentProjectFile = async (
  json: string,
  bridge: RustBackendAgentProjectBridge = defaultRustBackendAgentProjectBridge()
): Promise<ProjectFileV2> => {
  const response = await bridge.buildAgentProjectFile({ json });
  if (!response.success || !response.result) {
    throw new Error(response.error ?? 'エージェント用プロジェクトの展開に失敗しました。');
  }
  const { project } = response.result;
  if (!isProjectFileShape(project)) {
    throw new Error('エージェント用プロジェクトの展開結果の形式が不正です。');
  }
  return project;
};
