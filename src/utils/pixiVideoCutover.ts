export interface ShouldSkipPixiVideoForSharedRendererInput {
  objectId: string;
  objectType: string;
  isExporting: boolean;
  sharedRendererVideoObjectIds?: ReadonlySet<string>;
  requireSharedRendererVideo?: boolean;
}

export type ResolvePixiVideoRenderPathInput = ShouldSkipPixiVideoForSharedRendererInput;

export type PixiVideoRenderPath =
  | 'sharedRendererOnly';

export const shouldSkipPixiVideoForSharedRenderer = ({
  objectType,
}: ShouldSkipPixiVideoForSharedRendererInput): boolean =>
  objectType === 'video';

export const resolvePixiVideoRenderPath = (
  input: ResolvePixiVideoRenderPathInput
): PixiVideoRenderPath => {
  if (shouldSkipPixiVideoForSharedRenderer(input)) {
    return 'sharedRendererOnly';
  }
  return 'sharedRendererOnly';
};
