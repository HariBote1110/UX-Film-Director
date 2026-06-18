export interface ShouldSkipPixiPsdForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererPsdObjectIds?: ReadonlySet<string>;
}

export const shouldSkipPixiPsdForSharedRenderer = ({
  objectId,
  objectType,
  isExporting,
  sharedRendererPsdObjectIds,
}: ShouldSkipPixiPsdForSharedRendererInput): boolean =>
  objectType === 'psd'
  && !isExporting
  && sharedRendererPsdObjectIds?.has(objectId) === true;
