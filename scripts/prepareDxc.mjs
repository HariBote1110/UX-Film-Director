import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DXC_VERSION = '1.9.2607';
export const DXC_ARCHIVE_URL = 'https://github.com/microsoft/DirectXShaderCompiler/releases/download/v1.9.2607/dxc_2026_07_29.zip';
export const DXC_ARCHIVE_SHA256 = 'a1dfb116ba3eeae6a1582291b53a8e7bf65ad760676bd3194685c8f7367cd241';
export const DXC_REQUIRED_FILES = [
  'dxcompiler.dll',
  'dxil.dll',
  'LICENSE-LLVM.txt',
  'LICENSE-MS.txt',
  'LICENCE-MIT.txt',
];

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DXC_ASSET_DIRECTORY = path.join(repositoryRoot, 'windows', 'dxc', 'x64');

const architectureName = (architecture) => {
  if (architecture === 'x64' || architecture === 1) return 'x64';
  if (architecture === 'arm64' || architecture === 3) return 'arm64';
  if (architecture === 'ia32' || architecture === 0) return 'ia32';
  return String(architecture);
};

export const assertDxcArchitecture = (architecture) => {
  const name = architectureName(architecture);
  if (name !== 'x64') {
    throw new Error(`DXC package assets are available for Windows x64 only; requested ${name}.`);
  }
};

export const verifyDxcArchiveChecksum = async (archive, expectedHash = DXC_ARCHIVE_SHA256) => {
  const digest = createHash('sha256').update(archive).digest('hex');
  if (digest !== expectedHash) {
    throw new Error(`DXC archive SHA-256 mismatch: expected ${expectedHash}, received ${digest}.`);
  }
};

export const validateDxcAssetDirectory = async (assetDirectory, architecture = 'x64') => {
  assertDxcArchitecture(architecture);
  if (path.basename(path.resolve(assetDirectory)).toLowerCase() !== 'x64') {
    throw new Error(`DXC x64 assets must be staged in an x64 directory: ${assetDirectory}`);
  }

  for (const filename of DXC_REQUIRED_FILES) {
    const filePath = path.join(assetDirectory, filename);
    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch {
      throw new Error(`Required DXC package file is missing: ${filePath}`);
    }
    if (!fileStats.isFile() || fileStats.size === 0) {
      throw new Error(`Required DXC package file is empty or not a file: ${filePath}`);
    }
  }

  return { architecture: 'x64', directory: assetDirectory, version: DXC_VERSION };
};

export const beforePackDxc = async ({ electronPlatformName, arch, assetDirectory = DXC_ASSET_DIRECTORY }) => {
  if (electronPlatformName !== 'win32') return;
  await validateDxcAssetDirectory(assetDirectory, arch);
};

const downloadArchive = async (fetchImpl) => {
  const response = await fetchImpl(DXC_ARCHIVE_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`DXC ${DXC_VERSION} download failed: HTTP ${response.status}.`);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  await verifyDxcArchiveChecksum(archive);
  return archive;
};

export const prepareDxcAssets = async ({
  assetDirectory = DXC_ASSET_DIRECTORY,
  fetchImpl = globalThis.fetch,
  extractArchive,
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new Error('Node.js fetch is required to download DXC.');
  const extractZip = extractArchive ?? (await import('extract-zip')).default;
  const archive = await downloadArchive(fetchImpl);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'uxfd-dxc-'));
  const extractedDirectory = path.join(temporaryRoot, 'extracted');
  const stagingRoot = `${assetDirectory}.staging-${process.pid}`;
  const stagingDirectory = path.join(stagingRoot, 'x64');

  try {
    await mkdir(extractedDirectory);
    const archivePath = path.join(temporaryRoot, 'dxc.zip');
    await writeFile(archivePath, archive);
    await extractZip(archivePath, { dir: extractedDirectory });

    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingDirectory, { recursive: true });
    for (const filename of DXC_REQUIRED_FILES) {
      const sourcePath = path.join(extractedDirectory, 'bin', 'x64', filename);
      const licensePath = path.join(extractedDirectory, filename);
      await copyFile(filename.endsWith('.dll') ? sourcePath : licensePath, path.join(stagingDirectory, filename));
    }
    await validateDxcAssetDirectory(stagingDirectory, 'x64');
    await rm(assetDirectory, { recursive: true, force: true });
    await mkdir(path.dirname(assetDirectory), { recursive: true });
    await rename(stagingDirectory, assetDirectory);
    return validateDxcAssetDirectory(assetDirectory, 'x64');
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

export default beforePackDxc;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] !== '--prepare') {
    throw new Error('Usage: node scripts/prepareDxc.mjs --prepare');
  }
  const result = await prepareDxcAssets();
  console.log(`Prepared DirectX Shader Compiler ${result.version} for Windows ${result.architecture}: ${result.directory}`);
}
