import { describe, expect, it } from 'vitest';
import { buildAviUtlPuzzlePieceObject } from './puzzlePieceObjectFactory';

describe('puzzlePieceObjectFactory', () => {
  it('builds an AviUtlPackV4 puzzle piece object for timeline insertion', () => {
    const object = buildAviUtlPuzzlePieceObject({
      id: 'puzzle-1',
      projectWidth: 1920,
      projectHeight: 1080,
      startTime: 1.5,
      layer: 11,
    });

    expect(object).toMatchObject({
      id: 'puzzle-1',
      type: 'puzzle_piece',
      name: 'パズルピース',
      layer: 11,
      startTime: 1.5,
      duration: 5,
      x: 840,
      y: 420,
      width: 240,
      height: 240,
      size: 120,
      shapeVariant: 1,
      connectorMode: 'convex',
      fillColour: '#ffffff',
    });
  });
});
