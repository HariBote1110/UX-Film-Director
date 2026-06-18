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
assert.equal(typeof addon.createWritableSharedFrameRing, 'function')
assert.equal(typeof addon.writeIntoSharedFrameRing, 'function')
assert.equal(typeof addon.closeWritableSharedFrameRing, 'function')
assert.equal(typeof addon.takePresentedFrameSharedFrame, 'function')
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

const memoryId = `/un${process.pid.toString(16)}${Date.now().toString(16).slice(-8)}`
const slotCount = 2
const slotByteLen = 16
const createRing = addon.createWritableSharedFrameRing({
  memoryId,
  slotCount,
  slotByteLen,
})
assert.equal(createRing.success, true, String(createRing.error))
assert.deepEqual(createRing.result, {
  memoryId,
  slotCount,
  slotByteLen,
})

const sourceFrame = new Uint8Array(slotByteLen)
sourceFrame.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
const writeFrame = addon.writeIntoSharedFrameRing({
  memoryId,
  ptsFrame: 7,
}, sourceFrame)
assert.equal(writeFrame.success, true, String(writeFrame.error))
assert.equal(writeFrame.result.sequence, 7)
assert.equal(writeFrame.result.byteLen, slotByteLen)

const copiedFrame = new Uint8Array(slotByteLen)
const copyFrame = addon.copyIntoUploadBuffer({
  memoryId,
  slotCount,
  slotByteLen,
  ptsFrame: 7,
}, copiedFrame)
assert.equal(copyFrame.success, true, String(copyFrame.error))
assert.deepEqual([...copiedFrame], [...sourceFrame])

const closeRing = addon.closeWritableSharedFrameRing({ memoryId })
assert.equal(closeRing.success, true, String(closeRing.error))

const handoff = addon.takePresentedFrameSharedFrame({
  encodeSessionId: 'uxfd-native-handoff-test',
  memoryId,
  frameIndex: 7,
  timestampUs: 116_667,
  width: 2,
  height: 2,
  fps: 60,
  device: {},
  texture: {},
  format: 'bgra8unorm',
  canvasSize: {
    width: 2,
    height: 2,
  },
})
assert.equal(handoff.success, false)
assert.match(String(handoff.error), /WebGPU texture handoff is not implemented/i)

console.log('shared video frame native addon contract passed')
