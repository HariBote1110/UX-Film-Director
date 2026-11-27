import type { PieChartObject } from '../../types';

export interface BuildAviUtlPieChartObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

const defaultSliceColours = ['#389ba6', '#f2e2c4', '#f29422', '#f27830', '#f24b0f'];

export const buildAviUtlPieChartObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildAviUtlPieChartObjectInput): PieChartObject => {
  const size = Math.max(240, Math.round(Math.min(projectWidth, projectHeight, 1080) * 0.37037));
  const x = Math.round((projectWidth - size) / 2);
  const y = Math.round((projectHeight - size) / 2);

  return {
    id,
    type: 'pie_chart',
    name: 'パイシートグラフ',
    layer,
    startTime,
    duration: 5,
    x,
    y,
    width: size,
    height: size,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    enableAnimation: false,
    endX: x,
    endY: y,
    easing: 'linear',
    values: [10, 20, 30, 40],
    sortMode: 'descending',
    normaliseToHundred: true,
    labelMode: 'percentage',
    progressPercent: 100,
    strokeWidth: 20,
    sliceColours: defaultSliceColours,
  };
};
