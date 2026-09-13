import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const fixturePath = join(
  __dirname,
  '..',
  '..',
  'rust-core',
  'tests',
  'fixtures',
  'editable-scene-builder',
  'all-object-types.json'
);

describe('editable scene builder coverage fixture', () => {
  it('現在の TS builder の出力と一致する', async () => {
    const committedFixture = readFileSync(fixturePath, 'utf8');
    process.env.UXFD_SKIP_COVERAGE_FIXTURE_WRITE = '1';
    const generatorPath = '../../scripts/generate-editable-scene-builder-coverage-fixture.mts';
    const { buildEditableSceneBuilderCoverageFixture } = await import(generatorPath);
    expect(
      committedFixture,
      `fixture が古い: ${fixturePath}\nnpm run fixture:editable-scene-builder:coverage で再生成する`
    ).toBe(`${JSON.stringify(buildEditableSceneBuilderCoverageFixture(), null, 2)}\n`);
  });
});
