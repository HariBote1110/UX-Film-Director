import type { PuzzlePieceObject } from '../types';

export interface BuildAviUtlPuzzlePieceObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildAviUtlPuzzlePieceObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlPuzzlePieceObjectInput): PuzzlePieceObject => {
  const size = Math.max(80, Math.round(Math.min(projectWidth, projectHeight) / 9));
  const width = size * 2;
  const height = size * 2;
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'puzzle_piece',
    name: 'パズルピース',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    size,
    shapeVariant: 1,
    connectorMode: 'convex',
    fillColour: '#ffffff',
  };
};
