import type {
  SharedRendererVideoCutoverReason,
  SharedRendererVideoOwner,
} from './sharedRendererVideoOwnership';
import type {
  SharedRendererSolidColourCutoverReason,
  SharedRendererSolidColourOwner,
} from './sharedRendererSolidColourOwnership';

export type SharedRendererPresenterDiagnosticState =
  | {
      status: 'idle';
    }
  | {
      status: 'ready';
      format: string;
      swatch: 'solid-srgb' | 'solid-colour-scene' | 'pixi-passthrough';
      geometrySource?: 'rust-wasm' | 'typescript';
      solidColourOwner?: SharedRendererSolidColourOwner;
      solidColourCutoverReason?: SharedRendererSolidColourCutoverReason;
      sharedSolidColourObjectCount?: number;
      videoGeometrySource?: 'rust-wasm' | 'typescript';
      videoDecodeRequestSource?: 'rust-wasm' | 'typescript';
      videoDecodeRequestCount?: number;
      videoOwner?: SharedRendererVideoOwner;
      videoCutoverReason?: SharedRendererVideoCutoverReason;
      sharedVideoObjectCount?: number;
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
  delete dataset.uxfdSharedRendererPresenterFormat;
  delete dataset.uxfdSharedRendererPresenterSwatch;
  delete dataset.uxfdSharedRendererPresenterGeometrySource;
  delete dataset.uxfdSharedRendererPresenterSolidColourOwner;
  delete dataset.uxfdSharedRendererPresenterSolidColourCutoverReason;
  delete dataset.uxfdSharedRendererPresenterSharedSolidColourObjectCount;
  delete dataset.uxfdSharedRendererPresenterVideoGeometrySource;
  delete dataset.uxfdSharedRendererPresenterVideoDecodeRequestSource;
  delete dataset.uxfdSharedRendererPresenterVideoDecodeRequestCount;
  delete dataset.uxfdSharedRendererPresenterVideoOwner;
  delete dataset.uxfdSharedRendererPresenterVideoCutoverReason;
  delete dataset.uxfdSharedRendererPresenterSharedVideoObjectCount;
  delete dataset.uxfdSharedRendererPresenterFailureReason;
  delete dataset.uxfdSharedRendererPresenterStaleSharedFrameAllowed;

  if (state.status === 'ready') {
    dataset.uxfdSharedRendererPresenterFormat = state.format;
    dataset.uxfdSharedRendererPresenterSwatch = state.swatch;
    if (state.geometrySource) {
      dataset.uxfdSharedRendererPresenterGeometrySource = state.geometrySource;
    }
    if (state.solidColourOwner) {
      dataset.uxfdSharedRendererPresenterSolidColourOwner = state.solidColourOwner;
    }
    if (state.solidColourCutoverReason) {
      dataset.uxfdSharedRendererPresenterSolidColourCutoverReason = state.solidColourCutoverReason;
    }
    if (typeof state.sharedSolidColourObjectCount === 'number') {
      dataset.uxfdSharedRendererPresenterSharedSolidColourObjectCount = String(state.sharedSolidColourObjectCount);
    }
    if (state.videoGeometrySource) {
      dataset.uxfdSharedRendererPresenterVideoGeometrySource = state.videoGeometrySource;
    }
    if (state.videoDecodeRequestSource) {
      dataset.uxfdSharedRendererPresenterVideoDecodeRequestSource = state.videoDecodeRequestSource;
    }
    if (typeof state.videoDecodeRequestCount === 'number') {
      dataset.uxfdSharedRendererPresenterVideoDecodeRequestCount = String(state.videoDecodeRequestCount);
    }
    if (state.videoOwner) {
      dataset.uxfdSharedRendererPresenterVideoOwner = state.videoOwner;
    }
    if (state.videoCutoverReason) {
      dataset.uxfdSharedRendererPresenterVideoCutoverReason = state.videoCutoverReason;
    }
    if (typeof state.sharedVideoObjectCount === 'number') {
      dataset.uxfdSharedRendererPresenterSharedVideoObjectCount = String(state.sharedVideoObjectCount);
    }
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
