import type { TextObject } from '../types';
import { getTextDecorationInsets } from './textDecorationBounds';

export interface TextMediaInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Original glyph layout area, before decoration margins are added. */
export const textMediaContentBox = (object: TextObject): { width: number; height: number } => {
  const measuredWidth = object.measuredWidth;
  const measuredHeight = object.measuredHeight;
  if (Number.isFinite(measuredWidth) && (measuredWidth as number) > 0
    && Number.isFinite(measuredHeight) && (measuredHeight as number) > 0) {
    return { width: measuredWidth as number, height: measuredHeight as number };
  }

  const fontSize = Number.isFinite(object.fontSize) && object.fontSize > 0 ? object.fontSize : 16;
  const longestLineLength = Math.max(
    1,
    ...object.text.split('\n').map((line) => line.length)
  );
  const lineCount = Math.max(1, object.text.split('\n').length);
  return {
    width: Math.ceil(longestLineLength * fontSize * 0.6),
    height: Math.ceil(lineCount * fontSize * 1.25),
  };
};

export const textMediaInsets = (object: TextObject): TextMediaInsets => getTextDecorationInsets({
  strokeWidth: object.textStroke?.width,
  shadow: object.textShadow,
});

/** Text plane dimensions include only the margins required by its decorations. */
export const textMediaBox = (object: TextObject): { width: number; height: number } => {
  const content = textMediaContentBox(object);
  const insets = textMediaInsets(object);
  return {
    width: content.width + insets.left + insets.right,
    height: content.height + insets.top + insets.bottom,
  };
};
