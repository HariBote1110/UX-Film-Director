import { describe, expect, it } from 'vitest';
import { buildStablePsdLayerNodeId } from './psdParser';

describe('buildStablePsdLayerNodeId', () => {
  it('matches Rust PSD parser ids for leaf layers and groups', () => {
    expect(buildStablePsdLayerNodeId({
      layerIndex: 7,
      isGroup: false,
      ownGroupId: null,
    })).toBe('psd-layer-7');
    expect(buildStablePsdLayerNodeId({
      layerIndex: 3,
      isGroup: true,
      ownGroupId: 1,
    })).toBe('psd-group-1');
  });

  it('falls back to layer index when a group id is unavailable', () => {
    expect(buildStablePsdLayerNodeId({
      layerIndex: 4,
      isGroup: true,
      ownGroupId: null,
    })).toBe('psd-group-4');
  });
});
