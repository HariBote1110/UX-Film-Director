import { describe, expect, it } from 'vitest';
import { measureTextBoxSize } from './textBoxMeasurement';

describe('measureTextBoxSize', () => {
  it('単一行テキストの幅は計測値、高さはフォントサイズ×1.2で返す', () => {
    const size = measureTextBoxSize(
      { text: 'Hello', fontFamily: 'Arial', fontSize: 20 },
      (line, font) => {
        expect(font).toBe('20px Arial');
        return { width: line.length * 10 };
      }
    );

    expect(size).toEqual({ width: 50, height: 24 });
  });

  it('複数行テキストは最長行の幅と行数×行高を返す', () => {
    const size = measureTextBoxSize(
      { text: 'ab\nabcd\nc', fontFamily: 'Arial', fontSize: 10 },
      (line) => ({ width: line.length * 7 })
    );

    expect(size).toEqual({ width: 28, height: 36 });
  });

  it('fontFamily 未指定時は Arial を使う（旧 PIXI.Text スタイルと同じ既定）', () => {
    const fonts: string[] = [];
    measureTextBoxSize(
      { text: 'x', fontSize: 16 },
      (_line, font) => {
        fonts.push(font);
        return { width: 1 };
      }
    );
    expect(fonts).toEqual(['16px Arial']);
  });

  it('計測手段が利用できないときは null を返す（呼び出し側がヒューリスティックへ退避）', () => {
    const size = measureTextBoxSize(
      { text: 'Hello', fontFamily: 'Arial', fontSize: 20 },
      () => null
    );
    expect(size).toBeNull();
  });
});
