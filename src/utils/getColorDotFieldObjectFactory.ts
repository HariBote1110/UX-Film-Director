import type { GetColorDotFieldObject } from '../types';

export interface BuildGetColorDotFieldObjectInput {
  id: string;
  projectWidth: number;
  projectHeight: number;
  startTime: number;
  layer: number;
}

export interface BuildGetColorSampledDotFieldObjectInput extends BuildGetColorDotFieldObjectInput {
  sampleSourcePath?: string;
}

export const buildGetColorDotFieldObject = ({
  id,
  projectWidth,
  projectHeight,
  startTime,
  layer,
}: BuildGetColorDotFieldObjectInput): GetColorDotFieldObject => {
  const width = Math.max(320, Math.round(projectWidth * 0.4167));
  const height = Math.max(180, Math.round(projectHeight * 0.4167));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return {
    id,
    type: 'getcolor_dot_field',
    name: 'GetColor V2R ドットフィールド',
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
    columns: 32,
    rows: 18,
    dotSize: 14,
    sizeInfluence: 0.65,
    luminanceInfluence: 0.7,
    hueShiftDegrees: 0,
    alternateRows: true,
    foregroundColour: '#ffffff',
    secondaryColour: '#36c2ff',
    backgroundColour: '#000000',
    seed: 93,
  };
};

export const buildGetColorDiamondDotFieldObject = (input: BuildGetColorDotFieldObjectInput): GetColorDotFieldObject => ({
  ...buildGetColorDotFieldObject(input),
  name: 'GetColor V2R 菱形ドットフィールド',
  dotSize: 18,
  dotShape: 'diamond',
  strokeWidth: 0,
});

export const buildGetColorOutlinedSquareDotFieldObject = (input: BuildGetColorDotFieldObjectInput): GetColorDotFieldObject => ({
  ...buildGetColorDotFieldObject(input),
  name: 'GetColor V2R 枠線四角ドットフィールド',
  columns: 28,
  rows: 16,
  dotSize: 22,
  dotShape: 'square',
  strokeWidth: 5,
});

export const buildGetColorSampledDotFieldObject = (input: BuildGetColorSampledDotFieldObjectInput): GetColorDotFieldObject => ({
  ...buildGetColorDotFieldObject(input),
  name: 'GetColor V2R 画像サンプリングドット',
  dotSize: 16,
  dotShape: 'circle',
  strokeWidth: 0,
  sampleSourcePath: input.sampleSourcePath,
  sampleStrength: 1,
});
