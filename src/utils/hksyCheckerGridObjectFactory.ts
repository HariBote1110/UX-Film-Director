import type { HksyCheckerGridObject } from '../types';

export interface BuildHksyCheckerGridObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export const buildHksyCheckerGridObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildHksyCheckerGridObjectInput): HksyCheckerGridObject => {
  const width = Math.max(320, Math.round(projectWidth * 0.4167));
  const height = Math.max(180, Math.round(projectHeight * 0.4167));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'hksy_checker_grid',
    name: 'hksy チェッカー/グリッド',
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
    cellSize: 50,
    lineWidth: 2,
    checkerEnabled: true,
    gridEnabled: true,
    foregroundColour: '#ffffff',
    secondaryColour: '#333333',
    backgroundColour: '#000000',
  };
};

export const buildHksyLineObject = (input: BuildHksyCheckerGridObjectInput): HksyCheckerGridObject => ({
  ...buildHksyCheckerGridObject(input),
  name: 'hksy 直線',
  cellSize: 64,
  lineWidth: 4,
  checkerEnabled: false,
  gridEnabled: true,
  foregroundColour: '#ffffff',
  secondaryColour: '#ffffff',
  backgroundColour: '#000000',
});

export const buildHksyMultiColourCheckerObject = (input: BuildHksyCheckerGridObjectInput): HksyCheckerGridObject => ({
  ...buildHksyCheckerGridObject(input),
  name: 'hksy 複数色チェッカー',
  cellSize: 56,
  lineWidth: 0,
  checkerEnabled: true,
  gridEnabled: false,
  foregroundColour: '#ff5c8a',
  secondaryColour: '#36c2ff',
  backgroundColour: '#111111',
  paletteColours: ['#ff5c8a', '#36c2ff', '#ffd166', '#70e000'],
});

export const buildHksyDiamondObject = (input: BuildHksyCheckerGridObjectInput): HksyCheckerGridObject => {
  const base = buildHksyCheckerGridObject(input);
  const width = Math.max(240, Math.round(input.projectWidth * 0.25));
  const height = Math.max(180, Math.round(input.projectHeight * 0.3333));
  const x = Math.round((input.projectWidth - width) / 2);
  const y = Math.round((input.projectHeight - height) / 2);

  return {
    ...base,
    name: 'hksy 菱形',
    x,
    y,
    width,
    height,
    endX: x,
    endY: y,
    pattern: 'diamond',
    cellSize: 64,
    lineWidth: 96,
    checkerEnabled: false,
    gridEnabled: false,
    foregroundColour: '#ffffff',
    secondaryColour: '#ffffff',
    backgroundColour: '#000000',
  };
};

export const buildHksyMeasuredGridObject = (input: BuildHksyCheckerGridObjectInput): HksyCheckerGridObject => {
  const base = buildHksyCheckerGridObject(input);
  const width = Math.max(480, Math.round(input.projectWidth * 0.5));
  const height = Math.max(270, Math.round(input.projectHeight * 0.5));
  const x = Math.round((input.projectWidth - width) / 2);
  const y = Math.round((input.projectHeight - height) / 2);

  return {
    ...base,
    name: 'hksy グリッド',
    x,
    y,
    width,
    height,
    endX: x,
    endY: y,
    pattern: 'measured-grid',
    cellSize: 32,
    lineWidth: 1,
    checkerEnabled: false,
    gridEnabled: true,
    foregroundColour: '#ffffff',
    secondaryColour: '#bbeeff',
    backgroundColour: '#10131a',
    separateInterval: 5,
    separateLineWidth: 3,
  };
};

export const buildHksyAnchorLineObject = (input: BuildHksyCheckerGridObjectInput): HksyCheckerGridObject => {
  const base = buildHksyCheckerGridObject(input);
  const width = Math.max(240, Math.round(input.projectWidth * 0.25));
  const height = Math.max(180, Math.round(input.projectHeight * 0.3333));
  const x = Math.round((input.projectWidth - width) / 2);
  const y = Math.round((input.projectHeight - height) / 2);

  return {
    ...base,
    name: 'hksy ライン（アンカー指定）',
    x,
    y,
    width,
    height,
    endX: x,
    endY: y,
    pattern: 'anchor-line',
    cellSize: 64,
    lineWidth: 20,
    checkerEnabled: false,
    gridEnabled: false,
    foregroundColour: '#ffffff',
    secondaryColour: '#ffffff',
    backgroundColour: '#000000',
    anchorPoints: [
      { x: -88, y: 50 },
      { x: 0, y: -100 },
      { x: 88, y: 50 },
    ],
    roundCaps: true,
    maxJoinDistance: 50,
  };
};
