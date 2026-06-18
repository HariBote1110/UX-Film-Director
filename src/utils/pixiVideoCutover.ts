export interface ShouldSkipPixiVideoForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererVideoObjectIds?: ReadonlySet<string>;
  requireSharedRendererVideo?: boolean;
}

export interface ResolvePixiVideoRenderPathInput extends ShouldSkipPixiVideoForSharedRendererInput {
  hasExportFrameOverride?: boolean;
}

export type PixiVideoRenderPath =
  | 'sharedRendererOnly'
  | 'exportFrameOverride';

export const shouldSkipPixiVideoForSharedRenderer = ({
  objectType,
  isExporting,
  requireSharedRendererVideo = false,
}: ShouldSkipPixiVideoForSharedRendererInput): boolean =>
  objectType === 'video'
  && (
    requireSharedRendererVideo
    || !isExporting
  );

export const resolvePixiVideoRenderPath = (
  input: ResolvePixiVideoRenderPathInput
): PixiVideoRenderPath => {
  if (shouldSkipPixiVideoForSharedRenderer(input)) {
    return 'sharedRendererOnly';
  }
  if (input.objectType === 'video' && input.isExporting && input.hasExportFrameOverride === true) {
    return 'exportFrameOverride';
  }
  return 'sharedRendererOnly';
};
