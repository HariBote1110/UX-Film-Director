import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import packageJson from '../../package.json';
import {
  assertDxcArchitecture,
  beforePackDxc,
  verifyDxcArchiveChecksum,
  validateDxcAssetDirectory,
} from '../../scripts/prepareDxc.mjs';

const temporaryDirectories: string[] = [];

const createAssetDirectory = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'uxfd-dxc-test-'));
  temporaryDirectories.push(root);
  const assetDirectory = path.join(root, 'x64');
  await mkdir(assetDirectory);
  for (const filename of [
    'dxcompiler.dll',
    'dxil.dll',
    'LICENSE-LLVM.txt',
    'LICENSE-MS.txt',
    'LICENCE-MIT.txt',
  ]) {
    await writeFile(path.join(assetDirectory, filename), filename);
  }
  return assetDirectory;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('DXC Windows package assets', () => {
  it('x64用DLLと全ライセンス文書が揃った配置だけを受理する', async () => {
    const assetDirectory = await createAssetDirectory();

    await expect(validateDxcAssetDirectory(assetDirectory, 'x64')).resolves.toMatchObject({ architecture: 'x64' });
    await expect(validateDxcAssetDirectory(assetDirectory, 'arm64')).rejects.toThrow(/x64/);
  });

  it('片方のDLLまたは再配布ライセンスが欠けている配置を拒否する', async () => {
    const assetDirectory = await createAssetDirectory();
    await rm(path.join(assetDirectory, 'dxil.dll'));
    await expect(validateDxcAssetDirectory(assetDirectory, 'x64')).rejects.toThrow(/dxil\.dll/);

    await writeFile(path.join(assetDirectory, 'dxil.dll'), 'dxil');
    await rm(path.join(assetDirectory, 'LICENSE-MS.txt'));
    await expect(validateDxcAssetDirectory(assetDirectory, 'x64')).rejects.toThrow(/LICENSE-MS\.txt/);
  });

  it('Windows x64のpack前だけを検査し、arm64 Windowsは失敗する', async () => {
    const assetDirectory = await createAssetDirectory();
    await expect(beforePackDxc({ electronPlatformName: 'darwin', arch: 'arm64', assetDirectory })).resolves.toBeUndefined();
    await expect(beforePackDxc({ electronPlatformName: 'win32', arch: 'arm64', assetDirectory })).rejects.toThrow(/x64/);
    await expect(beforePackDxc({ electronPlatformName: 'win32', arch: 'x64', assetDirectory })).resolves.toBeUndefined();
  });

  it('アーキテクチャと配布アーカイブのchecksumを厳密に検証する', async () => {
    expect(() => assertDxcArchitecture('x64')).not.toThrow();
    expect(() => assertDxcArchitecture('arm64')).toThrow(/x64/);
    const archive = Buffer.from('pinned archive');
    const checksum = createHash('sha256').update(archive).digest('hex');
    await expect(verifyDxcArchiveChecksum(archive, checksum)).resolves.toBeUndefined();
    await expect(verifyDxcArchiveChecksum(Buffer.from('tampered archive'), checksum)).rejects.toThrow(/SHA-256/);
  });

  it('electron-builderはDXC DLLとライセンスをWindowsのexe横へextraFiles配置する', () => {
    expect(packageJson.build.extraFiles).toBeUndefined();
    expect(packageJson.build.win.extraFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'windows/dxc/x64', to: '.' }),
    ]));
  });
});
