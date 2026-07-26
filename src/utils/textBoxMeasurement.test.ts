import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LINE_HEIGHT_RATIO, measureLineWithContext, measureTextBoxSize } from './textBoxMeasurement';

describe('measureTextBoxSize', () => {
  // バグ1修正: 行送り比率を Rust 側 cosmic-text の実描画値（1.25）に合わせる。
  // 旧テストは旧 PIXI.Text の既定値 1.2 を前提にしていたが、実描画を担う
  // rust-backend/src/generated/text.rs は
  // `Metrics::new(text.font_size, text.font_size * 1.25)` で行送りしており、
  // 計測側が 1.2 のままだと複数行テキストで高さが不足しクリップされる
  // 不整合バグがあった。Rust 側は触らず、計測側を実描画値へ合わせる。
  it('単一行テキストの幅は計測値、高さはフォントサイズ×1.25で返す（Rust cosmic-text の行送りに合わせる）', () => {
    const size = measureTextBoxSize(
      { text: 'Hello', fontFamily: 'Arial', fontSize: 20 },
      (line, font) => {
        expect(font).toBe('20px Arial');
        return { width: line.length * 10 };
      }
    );

    expect(size).toEqual({ width: 50, height: 25 });
  });

  it('複数行テキストは最長行の幅と行数×行高（×1.25）を返す', () => {
    const size = measureTextBoxSize(
      { text: 'ab\nabcd\nc', fontFamily: 'Arial', fontSize: 10 },
      (line) => ({ width: line.length * 7 })
    );

    expect(size).toEqual({ width: 28, height: 38 });
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

  // 境界テスト: TS 側の行送り係数と Rust 側の実装値が将来ズレたら検知する。
  // text.rs のソース文字列から `Metrics::new(text.font_size, text.font_size * N)`
  // の N を正規表現で読み取り、TS 側の LINE_HEIGHT_RATIO と突き合わせる。
  it('LINE_HEIGHT_RATIO は rust-backend/src/generated/text.rs の行送り係数と一致する', () => {
    const rustSourcePath = path.resolve(__dirname, '../../rust-backend/src/generated/text.rs');
    const rustSource = readFileSync(rustSourcePath, 'utf-8');
    const match = rustSource.match(
      /Metrics::new\(\s*text\.font_size\s*,\s*text\.font_size\s*\*\s*([\d.]+)\s*\)/
    );

    expect(
      match,
      'text.rs から Metrics::new(text.font_size, text.font_size * N) パターンを検出できなかった（実装が変わった可能性）'
    ).not.toBeNull();

    const rustLineHeightRatio = Number.parseFloat(match![1]);
    expect(LINE_HEIGHT_RATIO).toBe(rustLineHeightRatio);
  });

  // バグ2修正: letterSpacing がボックス計測に反映されていなかった。
  it('letterSpacing が計測器へ渡される', () => {
    const calls: Array<{ line: string; font: string; letterSpacing: number | undefined }> = [];
    measureTextBoxSize(
      { text: 'Hi', fontFamily: 'Arial', fontSize: 12, letterSpacing: 3 },
      (line, font, letterSpacing) => {
        calls.push({ line, font, letterSpacing });
        return { width: 1 };
      }
    );
    expect(calls).toEqual([{ line: 'Hi', font: '12px Arial', letterSpacing: 3 }]);
  });

  it('letterSpacing 未指定なら 0 として計測器へ渡す', () => {
    const calls: Array<number | undefined> = [];
    measureTextBoxSize(
      { text: 'Hi', fontFamily: 'Arial', fontSize: 12 },
      (_line, _font, letterSpacing) => {
        calls.push(letterSpacing);
        return { width: 1 };
      }
    );
    expect(calls).toEqual([0]);
  });
});

describe('measureLineWithContext（Canvas2D letterSpacing の反映）', () => {
  const createFakeContext = () => {
    const calls: string[] = [];
    const context = {
      _font: '',
      _letterSpacing: '',
      set font(value: string) {
        calls.push(`font:${value}`);
        this._font = value;
      },
      get font() {
        return this._font;
      },
      set letterSpacing(value: string) {
        calls.push(`letterSpacing:${value}`);
        this._letterSpacing = value;
      },
      get letterSpacing() {
        return this._letterSpacing;
      },
      measureText(text: string) {
        calls.push(`measureText:${text}`);
        return { width: text.length * 5 };
      },
    };
    return { context: context as unknown as CanvasRenderingContext2D, calls };
  };

  it('letterSpacing を "<n>px" 形式で context に設定し、measureText 呼び出し前に font と letterSpacing を設定する', () => {
    const { context, calls } = createFakeContext();
    const result = measureLineWithContext(context, 'Hello', '20px Arial', 4);

    expect(result).toEqual({ width: 25 });
    expect(calls).toEqual(['font:20px Arial', 'letterSpacing:4px', 'measureText:Hello']);
  });

  it('letterSpacing 未指定なら "0px" を設定する', () => {
    const { context, calls } = createFakeContext();
    measureLineWithContext(context, 'Hi', '12px Arial');

    expect(calls).toEqual(['font:12px Arial', 'letterSpacing:0px', 'measureText:Hi']);
  });

  it('letterSpacing setter を持たない context でも例外を投げない（jsdom/node 等の未対応環境向け）', () => {
    const calls: string[] = [];
    const context = {
      set font(value: string) {
        calls.push(`font:${value}`);
      },
      measureText(text: string) {
        calls.push(`measureText:${text}`);
        return { width: text.length * 5 };
      },
    };

    expect(() =>
      measureLineWithContext(context as unknown as CanvasRenderingContext2D, 'Hi', '12px Arial', 2)
    ).not.toThrow();
    expect(calls).toEqual(['font:12px Arial', 'measureText:Hi']);
  });
});
