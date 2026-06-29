import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const crateDir = path.join(repoRoot, 'native-overlay')
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
  ? 'uxfd_native_overlay.dll'
  : process.platform === 'darwin'
    ? 'libuxfd_native_overlay.dylib'
    : 'libuxfd_native_overlay.so'
const sourcePath = path.join(crateDir, 'target', profile, nativeLibraryName)
const outputPath = path.join(crateDir, 'native-overlay.node')

if (!existsSync(sourcePath)) {
  throw new Error(`native library was not built at ${sourcePath}`)
}

mkdirSync(path.dirname(outputPath), { recursive: true })
copyFileSync(sourcePath, outputPath)
console.log(outputPath)
