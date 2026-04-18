import { test } from 'node:test';
import assert from 'node:assert';
import { easingFunctions } from './easings.ts';

test('easeOutBounce calculations', () => {
  const easeOutBounce = easingFunctions.easeOutBounce;

  // Test boundary conditions
  assert.strictEqual(easeOutBounce(0), 0);
  assert.strictEqual(easeOutBounce(1), 1);

  // Test conditions for x < 1 / d1
  const d1 = 2.75;
  const n1 = 7.5625;

  // Segment 1: x < 1 / d1
  let x1 = 0.5 / d1; // ~0.1818
  assert.strictEqual(easeOutBounce(x1), 0.25);

  // Segment 2: 1 / d1 <= x < 2 / d1
  let x2 = 1.5 / d1; // ~0.5454
  // Value directly from function: (x -= 1.5 / d1) becomes 0, so 0.75
  assert.ok(Math.abs(easeOutBounce(x2) - 0.75) < 1e-10);

  // Segment 3: 2 / d1 <= x < 2.5 / d1
  let x3 = 2.25 / d1; // ~0.8181
  // Value directly from function: (x -= 2.25 / d1) becomes 0, so 0.9375
  assert.ok(Math.abs(easeOutBounce(x3) - 0.9375) < 1e-10);

  // Segment 4: x >= 2.5 / d1
  let x4 = 2.625 / d1; // ~0.9545
  // Value directly from function: (x -= 2.625 / d1) becomes 0, so 0.984375
  assert.ok(Math.abs(easeOutBounce(x4) - 0.984375) < 1e-10);
});
