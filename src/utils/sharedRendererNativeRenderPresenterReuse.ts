export interface SharedRendererNativeRenderPresenterReuseInput {
  isExporting: boolean;
  rustVideoOnlyEnabled: boolean;
  sharedRendererVideoCutoverEnabled: boolean;
  externalVideoOnly: boolean;
  nativeRenderOnly: boolean;
  mixedNativeRender: boolean;
}

export const shouldReuseSharedRendererNativeRenderPresenter = ({
  isExporting,
  rustVideoOnlyEnabled,
  sharedRendererVideoCutoverEnabled,
  externalVideoOnly,
  nativeRenderOnly,
  mixedNativeRender,
}: SharedRendererNativeRenderPresenterReuseInput): boolean => {
  if (isExporting) return false;

  if (rustVideoOnlyEnabled) {
    return externalVideoOnly || nativeRenderOnly || mixedNativeRender;
  }

  return sharedRendererVideoCutoverEnabled && nativeRenderOnly;
};
