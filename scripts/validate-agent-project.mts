import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAgentProjectSpec } from '../src/agentProject/agentProject.ts';

const projectPath = resolve(process.cwd(), process.argv[2] ?? 'public/agent-projects/ai-demo.json');

const fail = (message: string) => {
  console.error(`[agent-project] NG: ${message}`);
  process.exitCode = 1;
};

if (!existsSync(projectPath)) {
  fail(`ファイルが見つかりません: ${projectPath}`);
} else {
  try {
    const json = JSON.parse(readFileSync(projectPath, 'utf8'));
    const spec = parseAgentProjectSpec(json);
    console.log(`[agent-project] OK: ${projectPath}`);
    console.log(
      `  ${spec.layers.length} layers / ${spec.objects.length} objects / ${spec.project.duration}s @ ${spec.project.fps}fps`,
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
