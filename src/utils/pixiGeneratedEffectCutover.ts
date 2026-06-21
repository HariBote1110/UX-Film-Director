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
  (objectType === 'audio_visualization' || objectType === 'particle' || objectType === 'barcode' || objectType === 'puzzle_piece')
  && sharedRendererGeneratedEffectObjectIds?.has(objectId) === true;
