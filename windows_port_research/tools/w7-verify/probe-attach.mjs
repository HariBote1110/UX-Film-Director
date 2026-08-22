import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const addon = require('../../../native-overlay/native-overlay.node');
console.log('exports', Object.keys(addon));
console.log('typeof attachNativeOverlay', typeof addon.attachNativeOverlay);
const payload = {
  windowId: 1,
  nativeWindowHandle: Buffer.alloc(8),
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  scaleFactor: 1,
};
const startedAt = Date.now();
console.log('calling attachNativeOverlay...');
const result = addon.attachNativeOverlay(payload);
console.log('call returned, isPromise=', result instanceof Promise, 'elapsedMs=', Date.now() - startedAt);
result
  .then((value) => {
    console.log('RESOLVED after ms=', Date.now() - startedAt, JSON.stringify(value));
    process.exit(0);
  })
  .catch((error) => {
    console.log('REJECTED after ms=', Date.now() - startedAt, error);
    process.exit(1);
  });
setTimeout(() => {
  console.log('TIMEOUT after ms=', Date.now() - startedAt, '- promise never settled');
  process.exit(2);
}, 20000);
