import { describe, expect, it } from 'vitest';
import {
  compensateTextOriginForExpandedPlane,
  getTextDecorationInsets,
} from './textDecorationBounds';

describe('text decoration bounds', () => {
  it('reserves stroke and signed shadow offset plus the full three-pass blur spread', () => {
    const insets = getTextDecorationInsets({
      strokeWidth: 3.2,
      shadow: { offsetX: -4, offsetY: 6, blur: 8 },
    });

    expect(insets).toEqual({ left: 16, top: 6, right: 8, bottom: 18 });
  });

  it('keeps the original text origin fixed under rotation and positive or negative scale', () => {
    const insets = { left: 11, top: 7, right: 4, bottom: 5 };

    for (const [scaleX, scaleY, rotationDegrees] of [
      [1.5, 0.75, 37],
      [-2, 0.5, -121],
    ]) {
      const position = { x: 128, y: -42 };
      const compensation = compensateTextOriginForExpandedPlane(
        insets,
        scaleX,
        scaleY,
        rotationDegrees,
      );
      const angle = rotationDegrees * Math.PI / 180;
      const glyphX = (insets.left * scaleX) * Math.cos(angle)
        - (insets.top * scaleY) * Math.sin(angle);
      const glyphY = (insets.left * scaleX) * Math.sin(angle)
        + (insets.top * scaleY) * Math.cos(angle);

      expect({
        x: position.x + compensation.x + glyphX,
        y: position.y + compensation.y + glyphY,
      }).toEqual(position);
    }
  });

  it('leaves undecorated text bounds and origin unchanged', () => {
    expect(getTextDecorationInsets({})).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(compensateTextOriginForExpandedPlane(
      { left: 0, top: 0 }, 1, 1, 0,
    )).toEqual({ x: 0, y: 0 });
  });
});
