export interface ShouldSkipPixiImageForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererImageObjectIds?: ReadonlySet<string>;
}

export const shouldSkipPixiImageForSharedRenderer = ({
  objectId,
  objectType,
  isExporting,
  sharedRendererImageObjectIds,
}: ShouldSkipPixiImageForSharedRendererInput): boolean =>
  objectType === 'image'
  && !isExporting
  && sharedRendererImageObjectIds?.has(objectId) === true;
