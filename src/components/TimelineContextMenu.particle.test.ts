import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(new URL('./TimelineContextMenu.tsx', import.meta.url), 'utf8');

describe('TimelineContextMenu particle insertion boundary', () => {
  it('exposes the AviUtlPackV4 standard particle insertion command', () => {
    const code = source();

    expect(code).toContain('buildAviUtlBarcodeObject');
    expect(code).toContain('buildAviUtlColourWheelObject');
    expect(code).toContain('buildAviUtlPuzzlePieceObject');
    expect(code).toContain('buildAviUtlAuraEmissionObject');
    expect(code).toContain('buildAviUtlBubbleObject');
    expect(code).toContain('buildAviUtlFocusLinesObject');
    expect(code).toContain('buildAviUtlInkSplashObject');
    expect(code).toContain('buildDefaultStandardParticleObject');
    expect(code).toContain('handleAddBarcode');
    expect(code).toContain('handleAddColourWheel');
    expect(code).toContain('handleAddPuzzlePiece');
    expect(code).toContain('handleAddParticle');
    expect(code).toContain('handleAddAuraEmission');
    expect(code).toContain('handleAddBubble');
    expect(code).toContain('handleAddFocusLines');
    expect(code).toContain('handleAddInkSplash');
    expect(code).toContain('Add Barcode');
    expect(code).toContain('Add Colour Wheel');
    expect(code).toContain('Add Puzzle Piece');
    expect(code).toContain('Add Standard Particle');
    expect(code).toContain('Add Aura Emission');
    expect(code).toContain('Add Bubbles');
    expect(code).toContain('Add Focus Lines');
    expect(code).toContain('Add Ink Splash');
    expect(code).toContain('バーコードを追加');
    expect(code).toContain('色相環を追加');
    expect(code).toContain('パズルピースを追加');
    expect(code).toContain('標準パーティクルを追加');
    expect(code).toContain('オーラ放出を追加');
    expect(code).toContain('泡を追加');
    expect(code).toContain('集中線を追加');
    expect(code).toContain('インクを追加');
  });
});
