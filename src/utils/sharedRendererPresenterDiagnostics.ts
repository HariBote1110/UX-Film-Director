export type SharedRendererPresenterDiagnosticState =
  | {
      status: 'idle';
    }
  | {
      status: 'ready';
      format: string;
      swatch: 'solid-srgb';
    }
  | {
      status: 'fallback';
      reason: string;
    }
  | {
      status: 'deviceLost';
      reason: 'deviceLost';
      staleSharedFrameAllowed: false;
    };

type SharedRendererPresenterDataset = Record<string, string | undefined>;

export const writeSharedRendererPresenterDiagnostics = (
  dataset: SharedRendererPresenterDataset,
  state: SharedRendererPresenterDiagnosticState
): void => {
  dataset.uxfdSharedRendererPresenterStatus = state.status;
  dataset.uxfdSharedRendererPresenterFormat = undefined;
  dataset.uxfdSharedRendererPresenterSwatch = undefined;
  dataset.uxfdSharedRendererPresenterFailureReason = undefined;
  dataset.uxfdSharedRendererPresenterStaleSharedFrameAllowed = undefined;

  if (state.status === 'ready') {
    dataset.uxfdSharedRendererPresenterFormat = state.format;
    dataset.uxfdSharedRendererPresenterSwatch = state.swatch;
    return;
  }

  if (state.status === 'fallback') {
    dataset.uxfdSharedRendererPresenterFailureReason = state.reason;
    return;
  }

  if (state.status === 'deviceLost') {
    dataset.uxfdSharedRendererPresenterFailureReason = state.reason;
    dataset.uxfdSharedRendererPresenterStaleSharedFrameAllowed = String(state.staleSharedFrameAllowed);
  }
};
