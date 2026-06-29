import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const addonPath = process.env.UXFD_NATIVE_OVERLAY_MODULE
  ? process.env.UXFD_NATIVE_OVERLAY_MODULE
  : path.join(repoRoot, 'native-overlay', 'native-overlay.node')

const addon = require(addonPath)
const smokeAttachHandleHex = process.env.UXFD_NATIVE_OVERLAY_SMOKE_ATTACH

for (const exportName of [
  'attachNativeOverlay',
  'detachNativeOverlay',
  'getNativeOverlayCapabilities',
]) {
  if (typeof addon[exportName] !== 'function') {
    throw new Error(`missing ${exportName}`)
  }
}

let attach = null
let detach = null
if (smokeAttachHandleHex) {
  attach = addon.attachNativeOverlay({
    windowId: 1,
    nativeWindowHandle: Buffer.from(smokeAttachHandleHex, 'hex'),
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    scaleFactor: 2,
  })
  if (!attach?.success || attach.attached !== true) {
    throw new Error(`unexpected attach response: ${JSON.stringify(attach)}`)
  }

  detach = addon.detachNativeOverlay({
    windowId: 1,
    nativeWindowHandle: Buffer.from(smokeAttachHandleHex, 'hex'),
  })
  if (!detach?.success || detach.attached !== false) {
    throw new Error(`unexpected detach response: ${JSON.stringify(detach)}`)
  }
}

console.log(JSON.stringify({
  capabilities: addon.getNativeOverlayCapabilities(),
  attach,
  detach,
}))
