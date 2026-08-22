import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// R4-5: 検証ロジックの唯一の正は rust-core::agent_project::parse_agent_project_spec。
// このスクリプトは agent_validate バイナリを呼ぶだけの薄いラッパで、
// バリデーションを重複実装しない。

const projectPath = resolve(process.cwd(), process.argv[2] ?? 'public/agent-projects/ai-demo.json');

const fail = (message: string) => {
  console.error(`[agent-project] NG: ${message}`);
  process.exitCode = 1;
};

if (!existsSync(projectPath)) {
  fail(`ファイルが見つかりません: ${projectPath}`);
} else {
  const result = spawnSync(
    'cargo',
    ['run', '--quiet', '--manifest-path', 'rust-core/Cargo.toml', '--bin', 'agent_validate', '--', projectPath],
    { encoding: 'utf8' }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    fail(result.error.message);
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}
