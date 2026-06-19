import type {
  SharedRendererVideoCutoverReason,
  SharedRendererVideoOwner,
} from './sharedRendererVideoOwnership';
import type {
  SharedRendererSolidColourCutoverReason,
  SharedRendererSolidColourOwner,
} from './sharedRendererSolidColourOwnership';
import type {
  SharedRendererImageCutoverReason,
  SharedRendererImageOwner,
} from './sharedRendererImageOwnership';
import type {
  SharedRendererPsdCutoverReason,
  SharedRendererPsdOwner,
} from './sharedRendererPsdOwnership';

export type SharedRendererPresenterDiagnosticState =
  | {
      status: 'idle';
    }
  | {
      status: 'ready';
      format: string;
      swatch: 'solid-srgb' | 'solid-colour-scene' | 'pixi-passthrough' | 'native-render-frame';
      nativeRenderFrameReady?: boolean;
      nativeRenderMediaCount?: number;
      nativeRenderMediaKinds?: string;
      nativeRenderSourceCount?: number;
      nativeRenderSourceMediaIds?: string;
      nativeRenderFailureReason?: string;
      nativeRenderFailureDetail?: string;
      geometrySource?: 'rust-wasm' | 'typescript';
      solidColourOwner?: SharedRendererSolidColourOwner;
      solidColourCutoverReason?: SharedRendererSolidColourCutoverReason;
      sharedSolidColourObjectCount?: number;
      imageOwner?: SharedRendererImageOwner;
      imageCutoverReason?: SharedRendererImageCutoverReason;
      sharedImageObjectCount?: number;
      psdOwner?: SharedRendererPsdOwner;
      psdCutoverReason?: SharedRendererPsdCutoverReason;
      sharedPsdObjectCount?: number;
      videoGeometrySource?: 'rust-wasm' | 'typescript';
      videoDecodeRequestSource?: 'rust-wasm' | 'typescript';
      videoDecodeRequestCount?: number;
      videoFrameUploadReady?: boolean;
      videoUploadFailureReason?: string;
      videoUploadFailureDetail?: string;
      videoOwner?: SharedRendererVideoOwner;
      videoCutoverReason?: SharedRendererVideoCutoverReason;
      sharedVideoObjectCount?: number;
    }
  | {
      status: 'fallback';
      reason: string;
      swatch?: 'solid-srgb' | 'solid-colour-scene' | 'pixi-passthrough' | 'native-render-frame';
      nativeRenderFailureReason?: string;
      nativeRenderFailureDetail?: string;
      videoUploadFailureReason?: string;
      videoUploadFailureDetail?: string;
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
  delete dataset.uxfdSharedRendererPresenterImageOwner;
  delete dataset.uxfdSharedRendererPresenterImageCutoverReason;
  delete dataset.uxfdSharedRendererPresenterSharedImageObjectCount;
  delete dataset.uxfdSharedRendererPresenterPsdOwner;
  delete dataset.uxfdSharedRendererPresenterPsdCutoverReason;
  delete dataset.uxfdSharedRendererPresenterSharedPsdObjectCount;
  delete dataset.uxfdSharedRendererPresenterVideoGeometrySource;
  delete dataset.uxfdSharedRendererPresenterVideoDecodeRequestSource;
  delete dataset.uxfdSharedRendererPresenterVideoDecodeRequestCount;
  delete dataset.uxfdSharedRendererPresenterVideoFrameUploadReady;
  delete dataset.uxfdSharedRendererPresenterVideoUploadFailureReason;
  delete dataset.uxfdSharedRendererPresenterVideoUploadFailureDetail;
  delete dataset.uxfdSharedRendererPresenterNativeRenderFrameReady;
  delete dataset.uxfdSharedRendererPresenterNativeRenderMediaCount;
  delete dataset.uxfdSharedRendererPresenterNativeRenderMediaKinds;
  delete dataset.uxfdSharedRendererPresenterNativeRenderSourceCount;
  delete dataset.uxfdSharedRendererPresenterNativeRenderSourceMediaIds;
  delete dataset.uxfdSharedRendererPresenterNativeRenderFailureReason;
  delete dataset.uxfdSharedRendererPresenterNativeRenderFailureLabel;
  delete dataset.uxfdSharedRendererPresenterNativeRenderFailureDetail;
  delete dataset.uxfdSharedRendererPresenterNativeRenderSourceReleaseRequired;
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
    if (state.imageOwner) {
      dataset.uxfdSharedRendererPresenterImageOwner = state.imageOwner;
    }
    if (state.imageCutoverReason) {
      dataset.uxfdSharedRendererPresenterImageCutoverReason = state.imageCutoverReason;
    }
    if (typeof state.sharedImageObjectCount === 'number') {
      dataset.uxfdSharedRendererPresenterSharedImageObjectCount = String(state.sharedImageObjectCount);
    }
    if (state.psdOwner) {
      dataset.uxfdSharedRendererPresenterPsdOwner = state.psdOwner;
    }
    if (state.psdCutoverReason) {
      dataset.uxfdSharedRendererPresenterPsdCutoverReason = state.psdCutoverReason;
    }
    if (typeof state.sharedPsdObjectCount === 'number') {
      dataset.uxfdSharedRendererPresenterSharedPsdObjectCount = String(state.sharedPsdObjectCount);
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
    if (typeof state.videoFrameUploadReady === 'boolean') {
      dataset.uxfdSharedRendererPresenterVideoFrameUploadReady = String(state.videoFrameUploadReady);
    }
    if (state.videoUploadFailureReason) {
      dataset.uxfdSharedRendererPresenterVideoUploadFailureReason = state.videoUploadFailureReason;
    }
    if (state.videoUploadFailureDetail) {
      dataset.uxfdSharedRendererPresenterVideoUploadFailureDetail = state.videoUploadFailureDetail;
    }
    if (typeof state.nativeRenderFrameReady === 'boolean') {
      dataset.uxfdSharedRendererPresenterNativeRenderFrameReady = String(state.nativeRenderFrameReady);
    }
    if (typeof state.nativeRenderMediaCount === 'number') {
      dataset.uxfdSharedRendererPresenterNativeRenderMediaCount = String(state.nativeRenderMediaCount);
    }
    if (state.nativeRenderMediaKinds) {
      dataset.uxfdSharedRendererPresenterNativeRenderMediaKinds = state.nativeRenderMediaKinds;
    }
    if (typeof state.nativeRenderSourceCount === 'number') {
      dataset.uxfdSharedRendererPresenterNativeRenderSourceCount = String(state.nativeRenderSourceCount);
    }
    if (state.nativeRenderSourceMediaIds !== undefined) {
      dataset.uxfdSharedRendererPresenterNativeRenderSourceMediaIds = state.nativeRenderSourceMediaIds;
    }
    if (state.nativeRenderFailureReason) {
      dataset.uxfdSharedRendererPresenterNativeRenderFailureReason = state.nativeRenderFailureReason;
      dataset.uxfdSharedRendererPresenterNativeRenderFailureLabel = formatNativeRenderFailureLabel(state.nativeRenderFailureReason);
    }
    if (state.nativeRenderFailureDetail) {
      dataset.uxfdSharedRendererPresenterNativeRenderFailureDetail = state.nativeRenderFailureDetail;
    }
    if (state.videoUploadFailureReason) {
      dataset.uxfdSharedRendererPresenterVideoUploadFailureReason = state.videoUploadFailureReason;
    }
    if (state.videoUploadFailureDetail) {
      dataset.uxfdSharedRendererPresenterVideoUploadFailureDetail = state.videoUploadFailureDetail;
    }
    if (state.nativeRenderFailureReason === 'nativeRenderSourceReleaseUnavailable') {
      dataset.uxfdSharedRendererPresenterNativeRenderSourceReleaseRequired = 'true';
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
    if (state.swatch) {
      dataset.uxfdSharedRendererPresenterSwatch = state.swatch;
    }
    if (state.nativeRenderFailureReason) {
      dataset.uxfdSharedRendererPresenterNativeRenderFailureReason = state.nativeRenderFailureReason;
      dataset.uxfdSharedRendererPresenterNativeRenderFailureLabel = formatNativeRenderFailureLabel(state.nativeRenderFailureReason);
    }
    if (state.nativeRenderFailureDetail) {
      dataset.uxfdSharedRendererPresenterNativeRenderFailureDetail = state.nativeRenderFailureDetail;
    }
    if (state.nativeRenderFailureReason === 'nativeRenderSourceReleaseUnavailable') {
      dataset.uxfdSharedRendererPresenterNativeRenderSourceReleaseRequired = 'true';
    }
    return;
  }

  if (state.status === 'deviceLost') {
    dataset.uxfdSharedRendererPresenterFailureReason = state.reason;
    dataset.uxfdSharedRendererPresenterStaleSharedFrameAllowed = String(state.staleSharedFrameAllowed);
  }
};

const formatNativeRenderFailureLabel = (reason: string): string => {
  if (reason === 'nativeRenderFailed') {
    return 'native render failed';
  }
  if (reason === 'nativeRenderOutputReleaseFailed') {
    return 'native render output release failed';
  }
  if (reason === 'nativeRenderSourceReleaseFailed') {
    return 'native render source release failed';
  }
  if (reason === 'nativeRenderSourceReleaseUnavailable') {
    return 'native render source release callback missing';
  }
  return reason;
};
