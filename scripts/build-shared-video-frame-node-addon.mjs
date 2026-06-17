import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const crateDir = path.join(repoRoot, 'shared-video-frame-bridge-node')
const isRelease = process.argv.includes('--release')
const profile = isRelease ? 'release' : 'debug'
const manifestPath = path.join(crateDir, 'Cargo.toml')

const cargoArgs = ['build', '--manifest-path', manifestPath]
if (isRelease) {
  cargoArgs.push('--release')
}

const cargo = spawnSync('cargo', cargoArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
})

if (cargo.status !== 0) {
  process.exit(cargo.status ?? 1)
}

const nativeLibraryName = process.platform === 'win32'
  ? 'uxfd_shared_video_frame_bridge_node.dll'
  : process.platform === 'darwin'
    ? 'libuxfd_shared_video_frame_bridge_node.dylib'
    : 'libuxfd_shared_video_frame_bridge_node.so'
const sourcePath = path.join(crateDir, 'target', profile, nativeLibraryName)
const outputPath = path.join(crateDir, 'shared-video-frame-bridge.node')

if (!existsSync(sourcePath)) {
  throw new Error(`native library was not built at ${sourcePath}`)
}

mkdirSync(path.dirname(outputPath), { recursive: true })
copyFileSync(sourcePath, outputPath)
console.log(outputPath)
