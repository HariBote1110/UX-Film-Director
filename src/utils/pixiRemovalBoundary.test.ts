import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PixiJS 排除計画 Phase 5 の再侵入防止 boundary テスト。
 * `useProjectExportBoundary.test.ts` と同型のソース文字列検査で、
 * src/ 配下（テストを除く）へ pixi.js が二度と import されないこと、
 * Pixi 依存モジュール群と package.json の依存が削除済みであることを固定する。
 */

const utilsDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(utilsDir, '..');
const repoRoot = join(srcDir, '..');

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    files.push(fullPath);
  }
  return files;
};

describe('Pixi removal boundary', () => {
  it('src 配下（テスト除く）のどのファイルも pixi.js を import しない', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(srcDir)) {
      const code = readFileSync(file, 'utf8');
      if (code.includes("from 'pixi.js'")
        || code.includes('from "pixi.js"')
        || code.includes('import * as PIXI')
        || code.includes("require('pixi.js')")) {
        offenders.push(relative(srcDir, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Pixi 依存モジュール群（pixiRenderHelper / pixiUtils / usePixiInteraction / pixi*Cutover）は存在しない', () => {
    const forbiddenFiles = [
      'src/utils/pixiRenderHelper.ts',
      'src/utils/pixiUtils.ts',
      'src/hooks/usePixiInteraction.ts',
      'src/utils/pixiSolidColourCutover.ts',
      'src/utils/pixiImageCutover.ts',
      'src/utils/pixiPsdCutover.ts',
      'src/utils/pixiGeneratedEffectCutover.ts',
      'src/utils/pixiTextCutover.ts',
    ];
    const remaining = forbiddenFiles.filter((file) => existsSync(join(repoRoot, file)));
    expect(remaining).toEqual([]);
  });

  it('package.json は pixi.js に依存しない', () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies ?? {}).not.toHaveProperty('pixi.js');
    expect(packageJson.devDependencies ?? {}).not.toHaveProperty('pixi.js');
  });
});
