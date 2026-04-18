import React, { useMemo } from 'react';

// Mocking some constants and state
const duration = 100;
const MAX_LAYERS = 20;

// Original
const renderOriginal = () => {
    const ticks = Array.from({ length: Math.ceil(duration / 5) + 1 });
    const layers = Array.from({ length: MAX_LAYERS });
    return ticks.length + layers.length;
};

// Optimized
const cachedLayers = Array.from({ length: MAX_LAYERS });
const renderOptimized = () => {
    // pretending useMemo works like this for the same duration
    const ticks = Array.from({ length: Math.ceil(duration / 5) + 1 });
    // Wait, the optimization is avoiding this array creation entirely when duration doesn't change
    return ticks.length + cachedLayers.length;
};

const start1 = performance.now();
for (let i = 0; i < 100000; i++) {
    renderOriginal();
}
const end1 = performance.now();

const start2 = performance.now();
// Mocking the memoized ticks
const memoizedTicks = Array.from({ length: Math.ceil(duration / 5) + 1 });
for (let i = 0; i < 100000; i++) {
    const result = memoizedTicks.length + cachedLayers.length;
}
const end2 = performance.now();

console.log("Original:", end1 - start1, "ms");
console.log("Optimized:", end2 - start2, "ms");
