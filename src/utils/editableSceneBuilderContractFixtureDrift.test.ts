import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { serialiseEditableSceneBuilderContractFixture } from './editableSceneBuilderContractFixture';

const fixturePath = join(
  __dirname,
  '..',
  '..',
  'rust-core',
  'tests',
  'fixtures',
  'editable-scene-builder',
  'cross-object-resolution.json'
);

describe('editable scene builder P0 契約 fixture', () => {
  it('現在の TS resolver / serializer の出力と一致する', () => {
    expect(
      readFileSync(fixturePath, 'utf8'),
      `fixture が古い: ${fixturePath}\nnpm run fixture:editable-scene-builder で再生成する`
    ).toBe(serialiseEditableSceneBuilderContractFixture());
  });
});
