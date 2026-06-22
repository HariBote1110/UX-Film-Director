import type { TimelineObject } from '../../types';

export interface AviUtlBackgroundColourPaletteEntry {
  colour: string;
  sourceObjectId: string | null;
  sourceField: string;
}

export interface AviUtlBackgroundColourEyedropperOptions {
  maxColours?: number;
  fallbackColours?: string[];
}

const colourFieldNames = [
  'fill',
  'foregroundColour',
  'fieldColour',
  'secondaryColour',
  'backgroundColour',
  'frameColour',
  'colour',
  'curveColour',
  'gridColour',
  'fogColour'
];

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const toHexByte = (value: number): string => clampByte(value).toString(16).padStart(2, '0');

export const normaliseAviUtlPaletteColour = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const colour = value.trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(colour);
  if (shortHex) {
    return `#${shortHex[1].split('').map((channel) => `${channel}${channel}`).join('').toLowerCase()}`;
  }

  const longHex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (longHex) {
    return `#${longHex[1].toLowerCase()}`;
  }

  const rgb = /^rgba?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s*,\s*([+-]?\d+(?:\.\d+)?))?\s*\)$/i.exec(colour);
  if (rgb) {
    return `#${toHexByte(Number(rgb[1]))}${toHexByte(Number(rgb[2]))}${toHexByte(Number(rgb[3]))}`;
  }

  return null;
};

const pushUniqueColour = (
  palette: AviUtlBackgroundColourPaletteEntry[],
  seen: Set<string>,
  colour: unknown,
  sourceObjectId: string | null,
  sourceField: string,
  maxColours: number
): void => {
  if (palette.length >= maxColours) {
    return;
  }

  const normalised = normaliseAviUtlPaletteColour(colour);
  if (!normalised || seen.has(normalised)) {
    return;
  }

  seen.add(normalised);
  palette.push({ colour: normalised, sourceObjectId, sourceField });
};

export const extractAviUtlBackgroundColourPalette = (
  objects: TimelineObject[],
  options: AviUtlBackgroundColourEyedropperOptions = {}
): AviUtlBackgroundColourPaletteEntry[] => {
  const maxColours = Math.max(1, Math.floor(options.maxColours ?? 16));
  const palette: AviUtlBackgroundColourPaletteEntry[] = [];
  const seen = new Set<string>();

  for (const object of objects) {
    if (object.opacity <= 0) {
      continue;
    }

    const record = object as unknown as Record<string, unknown>;
    for (const fieldName of colourFieldNames) {
      pushUniqueColour(palette, seen, record[fieldName], object.id, fieldName, maxColours);
    }

    if (palette.length >= maxColours) {
      return palette;
    }
  }

  for (const fallbackColour of options.fallbackColours ?? []) {
    pushUniqueColour(palette, seen, fallbackColour, null, 'fallbackColours', maxColours);
  }

  return palette;
};
