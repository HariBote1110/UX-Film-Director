import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const addonPath = process.env.UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE
  ? path.resolve(process.env.UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE)
  : path.join(repoRoot, 'shared-video-frame-bridge-node', 'shared-video-frame-bridge.node')

assert.ok(
  existsSync(addonPath),
  `shared video frame native addon is missing at ${addonPath}`
)

const addon = require(addonPath)

assert.equal(typeof addon.copyIntoUploadBuffer, 'function')
assert.equal(typeof addon.debugFillForTest, 'function')

const uploadBuffer = new Uint8Array(8)
uploadBuffer.fill(0x11)
const fillReport = addon.debugFillForTest(uploadBuffer, 0x7c)

assert.deepEqual([...uploadBuffer], Array.from({ length: 8 }, () => 0x7c))
assert.deepEqual(fillReport, {
  byteLen: 8,
  fillValue: 0x7c,
})

const mismatch = addon.copyIntoUploadBuffer({
  memoryId: '/uxfd-node-addon-missing-for-length-check',
  slotCount: 1,
  slotByteLen: 16,
  ptsFrame: 0,
}, new Uint8Array(8))

assert.equal(mismatch.success, false)
assert.match(String(mismatch.error), /length|UploadBufferLengthMismatch/i)

console.log('shared video frame native addon contract passed')
