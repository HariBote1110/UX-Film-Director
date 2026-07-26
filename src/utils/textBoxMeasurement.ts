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
  /** 文字間隔（px）。未指定時は 0 として扱う。 */
  letterSpacing?: number;
}

export type TextLineMeasurer = (
  line: string,
  font: string,
  letterSpacing?: number
) => { width: number } | null;

/**
 * 行送り比率。実描画（rust-backend/src/generated/text.rs の
 * `Metrics::new(text.font_size, text.font_size * 1.25)`）に合わせている。
 * ここを Rust 側と独立に変更すると、計測と実描画がズレて複数行テキストの
 * 下端がクリップされる不整合バグが再発するため、変更時は必ず text.rs 側の
 * 値も確認すること（textBoxMeasurement.test.ts に境界テストあり）。
 */
export const LINE_HEIGHT_RATIO = 1.25;

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

/**
 * Canvas2D の context に letterSpacing を反映してから measureText で計測する。
 *
 * `context.letterSpacing`（Chromium 99+）が使える環境では `'<n>px'` 形式で
 * 設定し、font 設定と同様に measureText 呼び出し前に確定させる。
 * setter を持たない環境（jsdom/node の CanvasRenderingContext2D ポリフィル等）
 * では例外を投げず、letterSpacing を無視して従来どおり幅だけ返す。
 */
export const measureLineWithContext = (
  context: CanvasRenderingContext2D,
  line: string,
  font: string,
  letterSpacing?: number
): { width: number } | null => {
  context.font = font;
  if ('letterSpacing' in context) {
    (context as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${letterSpacing ?? 0}px`;
  }
  const metrics = context.measureText(line);
  if (!metrics || !Number.isFinite(metrics.width)) return null;
  return { width: metrics.width };
};

const canvasLineMeasurer: TextLineMeasurer = (line, font, letterSpacing) => {
  const context = resolveSharedMeasureContext();
  if (!context) return null;
  return measureLineWithContext(context, line, font, letterSpacing);
};

export const measureTextBoxSize = (
  { text, fontFamily, fontSize, letterSpacing }: TextBoxMeasurementInput,
  measureLine: TextLineMeasurer = canvasLineMeasurer
): { width: number; height: number } | null => {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return null;

  const font = `${fontSize}px ${fontFamily || 'Arial'}`;
  const lines = text.split('\n');
  const resolvedLetterSpacing = letterSpacing ?? 0;

  let maxWidth = 0;
  for (const line of lines) {
    const measured = measureLine(line, font, resolvedLetterSpacing);
    if (!measured) return null;
    maxWidth = Math.max(maxWidth, measured.width);
  }

  return {
    width: Math.round(maxWidth),
    height: Math.round(lines.length * fontSize * LINE_HEIGHT_RATIO),
  };
};
