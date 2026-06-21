import { describe, expect, it } from 'vitest';
import { buildAviUtlTrackBarObject } from './trackBarObjectFactory';

describe('trackBarObjectFactory', () => {
  it('builds an AviUtlPackV4 custom track bar object for timeline insertion', () => {
    const object = buildAviUtlTrackBarObject({
      id: 'track-bar-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 0.75,
      layer: 12,
    });

    expect(object).toMatchObject({
      id: 'track-bar-1',
      type: 'track_bar',
      name: 'カスタムトラックバー',
      layer: 12,
      startTime: 0.75,
      duration: 5,
      x: 780,
      y: 480,
      width: 360,
      height: 120,
      trackValues: [0, 0, 0, 0],
      trackRanges: [[0, 100], [0, 100], [0, 100], [-100, 100]],
      labels: ['TrackA', 'TrackB', 'TrackC', 'TrackD'],
      barColour: '#ffffff',
      backgroundOpacity: 0.05,
    });
  });
});
