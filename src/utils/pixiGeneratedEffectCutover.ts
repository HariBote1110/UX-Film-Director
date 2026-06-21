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
  (objectType === 'audio_visualization' || objectType === 'particle' || objectType === 'barcode' || objectType === 'puzzle_piece' || objectType === 'colour_wheel' || objectType === 'gourd' || objectType === 'gear' || objectType === 'track_bar' || objectType === 'pie_chart' || objectType === 'histogram')
  && sharedRendererGeneratedEffectObjectIds?.has(objectId) === true;
