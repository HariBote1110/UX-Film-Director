import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectPath = resolve(process.cwd(), process.argv[2] ?? 'public/agent-projects/ai-demo.json');
const supportedKinds = new Set(['shape', 'text', 'particle', 'dotField', 'shatteredSphere']);

const fail = (message) => {
  console.error(`[agent-project] NG: ${message}`);
  process.exitCode = 1;
};

if (!existsSync(projectPath)) {
  fail(`ファイルが見つかりません: ${projectPath}`);
} else {
  try {
    const spec = JSON.parse(readFileSync(projectPath, 'utf8'));
    if (spec?.version !== 1) throw new Error('version は 1 を指定してください。');
    const project = spec?.project;
    for (const key of ['width', 'height', 'fps', 'sampleRate', 'duration']) {
      if (!Number.isFinite(project?.[key]) || project[key] <= 0) {
        throw new Error(`project.${key} は正の数値で指定してください。`);
      }
    }
    if (!Array.isArray(spec.layers) || spec.layers.length === 0) {
      throw new Error('layers は1件以上指定してください。');
    }
    const layerIds = new Set();
    spec.layers.forEach((layer, index) => {
      if (!layer?.id || !layer?.name) throw new Error(`layers[${index}] にid/nameが必要です。`);
      if (layerIds.has(layer.id)) throw new Error(`レイヤーID「${layer.id}」が重複しています。`);
      layerIds.add(layer.id);
    });
    if (!Array.isArray(spec.objects)) throw new Error('objects は配列で指定してください。');
    const objectIds = new Set();
    spec.objects.forEach((object, index) => {
      if (!object?.id || !object?.kind || !object?.layer) {
        throw new Error(`objects[${index}] にid/kind/layerが必要です。`);
      }
      if (!supportedKinds.has(object.kind)) throw new Error(`objects[${index}].kind「${object.kind}」は未対応です。`);
      if (objectIds.has(object.id)) throw new Error(`オブジェクトID「${object.id}」が重複しています。`);
      objectIds.add(object.id);
      if (!layerIds.has(object.layer)) throw new Error(`オブジェクト「${object.id}」のレイヤー「${object.layer}」が見つかりません。`);
      if (!Number.isFinite(object.start) || !Number.isFinite(object.duration) || object.duration <= 0) {
        throw new Error(`objects[${index}] のstart/durationが不正です。`);
      }
    });
    console.log(`[agent-project] OK: ${projectPath}`);
    console.log(`  ${spec.layers.length} layers / ${spec.objects.length} objects / ${project.duration}s @ ${project.fps}fps`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
