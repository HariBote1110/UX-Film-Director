import type { SimpleTubeObject } from '../../types';

export interface BuildAviUtlSimpleTubeObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

const buildBaseSimpleTubeObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlSimpleTubeObjectInput): Omit<SimpleTubeObject, 'name'> => {
  const width = Math.max(320, Math.round(projectWidth * 0.4167));
  const height = Math.max(180, Math.round(projectHeight * 0.4167));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'simple_tube',
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
    radius: 150,
    depth: 280,
    segments: 16,
    rings: 10,
    twistDegrees: 0,
    randomAmount: 0,
    strokeWidth: 3,
    colour: '#0e769f',
    secondaryColour: '#ffffff',
    colourPattern: 'single',
    fogStrength: 0,
    fogColour: '#ffffff',
    seed: 93,
    torus: false,
  };
};

export const buildAviUtlSimpleTubeObject = (input: BuildAviUtlSimpleTubeObjectInput): SimpleTubeObject => ({
  ...buildBaseSimpleTubeObject(input),
  name: '93 SimpleTube',
});

export const buildAviUtlSimpleTubeTorusObject = (input: BuildAviUtlSimpleTubeObjectInput): SimpleTubeObject => ({
  ...buildBaseSimpleTubeObject(input),
  name: '93 SimpleTube トーラス',
  radius: 170,
  depth: 260,
  segments: 24,
  rings: 16,
  twistDegrees: 120,
  secondaryColour: '#f9f9f9',
  colourPattern: 'ring',
  fogStrength: 0.35,
  fogColour: '#ffffff',
  torus: true,
});
