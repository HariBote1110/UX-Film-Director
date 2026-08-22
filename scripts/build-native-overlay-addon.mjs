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

if (cargo.error) {
  console.error(
    `[build-native-overlay-addon] failed to start "cargo ${cargoArgs.join(' ')}" (cwd: ${repoRoot}): ${cargo.error.message}`
  )
  process.exit(1)
}

if (cargo.status !== 0) {
  console.error(
    `[build-native-overlay-addon] "cargo ${cargoArgs.join(' ')}" exited with code ${cargo.status}`
  )
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

if (process.platform === 'darwin') {
  const codesignArgs = ['--force', '--sign', '-', sourcePath, outputPath]
  const codesign = spawnSync('codesign', codesignArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
  if (codesign.error) {
    console.error(
      `[build-native-overlay-addon] failed to start "codesign ${codesignArgs.join(' ')}" (cwd: ${repoRoot}): ${codesign.error.message}`
    )
    process.exit(1)
  }
  if (codesign.status !== 0) {
    console.error(
      `[build-native-overlay-addon] "codesign ${codesignArgs.join(' ')}" exited with code ${codesign.status}`
    )
    process.exit(codesign.status ?? 1)
  }
}

console.log(outputPath)
