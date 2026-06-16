export interface ShouldSkipPixiSolidColourForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererSolidColourObjectIds?: ReadonlySet<string>;
}

export const shouldSkipPixiSolidColourForSharedRenderer = ({
  objectId,
  objectType,
  isExporting,
  sharedRendererSolidColourObjectIds,
}: ShouldSkipPixiSolidColourForSharedRendererInput): boolean =>
  objectType === 'shape'
  && !isExporting
  && sharedRendererSolidColourObjectIds?.has(objectId) === true;
