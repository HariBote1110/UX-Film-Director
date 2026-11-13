import { describe, expect, it } from 'vitest';
import type { TextObject } from '../types';
import { textMediaBox, textMediaContentBox, textMediaInsets } from './textMediaGeometry';

const text = (overrides: Partial<TextObject> = {}): TextObject => ({
  id: 'text-1',
  type: 'text',
  name: 'Text',
  layer: 0,
  startTime: 0,
  duration: 10,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  enableAnimation: false,
  endX: 0,
  endY: 0,
  easing: 'linear',
  text: 'Alize',
  fontSize: 20,
  fontFamily: 'Arial',
  fill: '#ffffff',
  ...overrides,
});

describe('textMediaContentBox', () => {
  it('uses positive measured dimensions verbatim', () => {
    expect(textMediaContentBox(text({ measuredWidth: 80, measuredHeight: 25 })))
      .toEqual({ width: 80, height: 25 });
  });

  it('falls back to the glyph heuristic when measured dimensions are unusable', () => {
    const object = text({ text: 'Alize', fontSize: 20 });
    expect(textMediaContentBox(object)).toEqual({
      width: Math.ceil(5 * 20 * 0.6),
      height: Math.ceil(1 * 20 * 1.25),
    });

    expect(textMediaContentBox(text({ measuredWidth: 0, measuredHeight: 25 })))
      .toEqual(textMediaContentBox(text()));
    expect(textMediaContentBox(text({ measuredWidth: Number.NaN, measuredHeight: 25 })))
      .toEqual(textMediaContentBox(text()));
  });

  it('sizes the fallback box by the longest line and the line count', () => {
    const object = text({ text: 'ab\nwxyz\nc', fontSize: 16 });
    expect(textMediaContentBox(object)).toEqual({
      width: Math.ceil(4 * 16 * 0.6),
      height: Math.ceil(3 * 16 * 1.25),
    });
  });

  it('falls back to a 16px font for unusable sizes and keeps an empty line at one line', () => {
    expect(textMediaContentBox(text({ text: '', fontSize: 0 }))).toEqual({
      width: Math.ceil(1 * 16 * 0.6),
      height: Math.ceil(1 * 16 * 1.25),
    });
    expect(textMediaContentBox(text({ text: '', fontSize: Number.NaN })))
      .toEqual(textMediaContentBox(text({ text: '', fontSize: 0 })));
  });
});

describe('textMediaInsets', () => {
  it('reserves nothing for undecorated text', () => {
    expect(textMediaInsets(text())).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });

  it('mirrors the stroke width on every edge', () => {
    expect(textMediaInsets(text({ textStroke: { colour: '#000000', width: 3 } })))
      .toEqual({ left: 3, top: 3, right: 3, bottom: 3 });
  });
});

describe('textMediaBox', () => {
  it('adds decoration insets to the content box', () => {
    const object = text({
      measuredWidth: 100,
      measuredHeight: 40,
      textStroke: { colour: '#000000', width: 2 },
    });
    const content = textMediaContentBox(object);
    const insets = textMediaInsets(object);
    expect(textMediaBox(object)).toEqual({
      width: content.width + insets.left + insets.right,
      height: content.height + insets.top + insets.bottom,
    });
  });

  it('equals the content box when there are no decorations', () => {
    const object = text({ measuredWidth: 100, measuredHeight: 40 });
    expect(textMediaBox(object)).toEqual(textMediaContentBox(object));
  });
});
