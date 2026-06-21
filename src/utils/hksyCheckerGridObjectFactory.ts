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
