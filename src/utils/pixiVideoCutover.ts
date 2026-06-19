export type PixiVideoRenderPath =
  | 'sharedRendererOnly';

export const shouldSkipPixiVideoForSharedRenderer = (): boolean => true;

export const resolvePixiVideoRenderPath = (): PixiVideoRenderPath => {
  shouldSkipPixiVideoForSharedRenderer();
  return 'sharedRendererOnly';
};
