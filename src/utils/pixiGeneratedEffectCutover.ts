export interface ShouldSkipPixiGeneratedEffectForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererGeneratedEffectObjectIds?: ReadonlySet<string>;
}

export const shouldSkipPixiGeneratedEffectForSharedRenderer = ({
  objectId,
  objectType,
  sharedRendererGeneratedEffectObjectIds,
}: ShouldSkipPixiGeneratedEffectForSharedRendererInput): boolean =>
  (objectType === 'audio_visualization' || objectType === 'particle' || objectType === 'barcode' || objectType === 'puzzle_piece' || objectType === 'colour_wheel' || objectType === 'gourd' || objectType === 'gear' || objectType === 'track_bar' || objectType === 'pie_chart' || objectType === 'histogram' || objectType === 'sunburst' || objectType === 'circular_arrow' || objectType === 'triangle_bracket' || objectType === 'tartan_check' || objectType === 'houndstooth' || objectType === 'yagasuri' || objectType === 'paper_airplane' || objectType === 'asanoha_pattern' || objectType === 'focus_lines_plus' || objectType === 'random_line_ex' || objectType === 'hologram' || objectType === 'protractor' || objectType === 'shaking_polygon')
  && sharedRendererGeneratedEffectObjectIds?.has(objectId) === true;
