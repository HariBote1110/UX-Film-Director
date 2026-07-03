/**
 * テキストオブジェクトの描画寸法計測（Pixi 非依存）。
 *
 * PixiJS 排除計画 Phase 4 で、旧 `PIXI.Text` の実測（textObj.width/height）
 * による measuredWidth/measuredHeight 書き戻しを置き換える。Canvas 2D の
 * measureText による近似計測で、rustSceneSnapshot の textMediaBox が使う
 * 実測値を供給する。計測不能な環境（canvas 2D が使えない）では null を
 * 返し、呼び出し側は textMediaBox のヒューリスティックに任せる。
 */

export interface TextBoxMeasurementInput {
  text: string;
  fontFamily?: string;
  fontSize: number;
}

export type TextLineMeasurer = (line: string, font: string) => { width: number } | null;

/** 旧 PIXI.Text の既定行高に合わせた近似（fontSize × 1.2）。 */
const LINE_HEIGHT_RATIO = 1.2;

let sharedMeasureContext: CanvasRenderingContext2D | null | undefined;

const resolveSharedMeasureContext = (): CanvasRenderingContext2D | null => {
  if (sharedMeasureContext !== undefined) return sharedMeasureContext;
  if (typeof document === 'undefined') {
    sharedMeasureContext = null;
    return sharedMeasureContext;
  }
  try {
    const canvas = document.createElement('canvas');
    sharedMeasureContext = canvas.getContext('2d');
  } catch {
    sharedMeasureContext = null;
  }
  return sharedMeasureContext ?? null;
};

const canvasLineMeasurer: TextLineMeasurer = (line, font) => {
  const context = resolveSharedMeasureContext();
  if (!context) return null;
  context.font = font;
  const metrics = context.measureText(line);
  if (!metrics || !Number.isFinite(metrics.width)) return null;
  return { width: metrics.width };
};

export const measureTextBoxSize = (
  { text, fontFamily, fontSize }: TextBoxMeasurementInput,
  measureLine: TextLineMeasurer = canvasLineMeasurer
): { width: number; height: number } | null => {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;

  const font = `${fontSize}px ${fontFamily || 'Arial'}`;
  const lines = text.split('\n');

  let maxWidth = 0;
  for (const line of lines) {
    const measured = measureLine(line, font);
    if (!measured) return null;
    maxWidth = Math.max(maxWidth, measured.width);
  }

  return {
    width: Math.round(maxWidth),
    height: Math.round(lines.length * fontSize * LINE_HEIGHT_RATIO),
  };
};
