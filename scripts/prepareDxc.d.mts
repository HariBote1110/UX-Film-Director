export const DXC_VERSION: string;
export const DXC_ARCHIVE_URL: string;
export const DXC_ARCHIVE_SHA256: string;
export const DXC_REQUIRED_FILES: string[];
export const DXC_ASSET_DIRECTORY: string;

export function assertDxcArchitecture(architecture: string | number): void;
export function verifyDxcArchiveChecksum(archive: Uint8Array, expectedHash?: string): Promise<void>;
export function validateDxcAssetDirectory(
  assetDirectory: string,
  architecture?: string | number,
): Promise<{ architecture: 'x64'; directory: string; version: string }>;
export function beforePackDxc(context: {
  electronPlatformName: string;
  arch: string | number;
  assetDirectory?: string;
}): Promise<void>;
export function prepareDxcAssets(options?: {
  assetDirectory?: string;
  fetchImpl?: typeof fetch;
  extractArchive?: (archivePath: string, options: { dir: string }) => Promise<void>;
}): Promise<{ architecture: 'x64'; directory: string; version: string }>;

export default beforePackDxc;
