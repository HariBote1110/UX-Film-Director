/** Regenerates the P0 editable scene builder contract fixture. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEditableSceneBuilderContractFixture, serialiseEditableSceneBuilderContractFixture } from '../src/utils/editableSceneBuilderContractFixture';

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, '..', 'rust-core', 'tests', 'fixtures', 'editable-scene-builder');
const outputPath = join(outputDir, 'cross-object-resolution.json');
const fixture = buildEditableSceneBuilderContractFixture();

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, serialiseEditableSceneBuilderContractFixture(), 'utf8');
console.log(`P0 契約 case ${fixture.cases.length} 件を出力: ${outputPath}`);
