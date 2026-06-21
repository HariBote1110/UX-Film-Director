import { describe, expect, it } from 'vitest';
import { buildAviUtlPaperAirplaneObject } from './paperAirplaneObjectFactory';

describe('paperAirplaneObjectFactory', () => {
  it('builds an AviUtlPackV4 paper airplane object for timeline insertion', () => {
    const object = buildAviUtlPaperAirplaneObject({
      id: 'paper-airplane-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 3,
      layer: 21,
    });

    expect(object).toMatchObject({
      id: 'paper-airplane-1',
      type: 'paper_airplane',
      name: '紙飛行機',
      layer: 21,
      startTime: 3,
      duration: 5,
      x: 800,
      y: 420,
      width: 320,
      height: 240,
      bodyLength: 200,
      wingWidth: 80,
      foldHeight: 50,
      gap: 50,
      followMotionDirection: false,
      axisMode: 0,
      fillColour: '#ffffff',
    });
  });
});
