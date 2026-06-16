export interface ShouldSkipPixiVideoForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererVideoObjectIds?: ReadonlySet<string>;
}

export const shouldSkipPixiVideoForSharedRenderer = ({
  objectId,
  objectType,
  isExporting,
  sharedRendererVideoObjectIds,
}: ShouldSkipPixiVideoForSharedRendererInput): boolean =>
  objectType === 'video'
  && !isExporting
  && sharedRendererVideoObjectIds?.has(objectId) === true;
