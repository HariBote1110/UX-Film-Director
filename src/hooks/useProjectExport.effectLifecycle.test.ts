import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal React hook harness.
//
// Faithfully implements the subset of React semantics that useProjectExport
// relies on: useRef (stable identity across renders) and useEffect (deps
// comparison with Object.is, cleanup-before-next-effect, cleanup-on-unmount).
// This lets the test exercise the hook's REAL dependency arrays, which is the
// whole point of this regression test — the bug lives in the deps array, not
// in the effect body.
// ---------------------------------------------------------------------------

type EffectRecord = {
  deps: unknown[] | undefined;
  cleanup: (() => void) | void;
};

let currentRenderSlots: unknown[] = [];
let currentSlotIndex = 0;
let previousEffects: EffectRecord[] = [];
let pendingEffects: Array<{ effect: () => void | (() => void); deps: unknown[] | undefined; index: number }> = [];

function resetRenderCursor() {
  currentSlotIndex = 0;
  pendingEffects = [];
}

function useRefImpl<T>(initial: T): { current: T } {
  const index = currentSlotIndex++;
  if (currentRenderSlots[index] === undefined) {
    currentRenderSlots[index] = { current: initial };
  }
  return currentRenderSlots[index] as { current: T };
}

function depsEqual(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  return a.every((value, i) => Object.is(value, b[i]));
}

function useEffectImpl(effect: () => void | (() => void), deps?: unknown[]): void {
  const index = currentSlotIndex++;
  pendingEffects.push({ effect, deps, index });
}

function flushEffects(): void {
  const nextEffects: EffectRecord[] = [];
  for (const { effect, deps, index } of pendingEffects) {
    const prior = previousEffects[index];
    const shouldRun = !prior || !depsEqual(prior.deps, deps);
    if (shouldRun) {
      if (prior?.cleanup) {
        prior.cleanup();
      }
      const cleanup = effect();
      nextEffects[index] = { deps, cleanup: cleanup ?? undefined };
    } else {
      nextEffects[index] = prior;
    }
  }
  previousEffects = nextEffects;
}

function unmountEffects(): void {
  for (const record of previousEffects) {
    if (record?.cleanup) {
      record.cleanup();
    }
  }
  previousEffects = [];
}

vi.mock('react', () => ({
  useEffect: useEffectImpl,
  useRef: useRefImpl,
}));

function renderHook<Args extends unknown[]>(hookFn: (...args: Args) => void, args: Args) {
  currentRenderSlots = [];
  const rerender = (nextArgs: Args) => {
    resetRenderCursor();
    hookFn(...nextArgs);
    flushEffects();
  };
  rerender(args);
  return {
    rerender,
    unmount: () => unmountEffects(),
  };
}

// ---------------------------------------------------------------------------
// Fake store
// ---------------------------------------------------------------------------

type FakeState = {
  isExporting: boolean;
  exportCancelRequested: boolean;
  projectSettings: { fps: number; width: number; height: number; sampleRate: number };
  objects: unknown[];
  layers: Record<string, unknown>;
  exportProgress: unknown;
  lastExportDiagnostics: unknown;
  setExporting: (value: boolean) => void;
  setTime: (value: number) => void;
  setExportProgress: (value: unknown) => void;
};

const state: FakeState = {
  isExporting: false,
  exportCancelRequested: false,
  projectSettings: { fps: 30, width: 640, height: 360, sampleRate: 44100 },
  objects: [],
  layers: {},
  exportProgress: undefined,
  lastExportDiagnostics: undefined,
  setExporting: vi.fn((value: boolean) => {
    state.isExporting = value;
  }),
  setTime: vi.fn(),
  setExportProgress: vi.fn((value: unknown) => {
    state.exportProgress = value;
  }),
};

const useStoreMock = Object.assign(
  (selector: (s: FakeState) => unknown, _shallow?: unknown) => selector(state),
  { getState: () => state },
);

vi.mock('../store/useStore', () => ({
  useStore: useStoreMock,
}));

// ---------------------------------------------------------------------------
// Util mocks
// ---------------------------------------------------------------------------

vi.mock('../utils/projectExportEncodePlan', () => ({
  resolveProjectExportEncodePlanFromBridge: () => ({ ok: true, engine: 'rustBackendVideoEncoder' }),
}));

vi.mock('../utils/projectExportFrameCanvas', () => ({
  hasProjectExportNativeRenderMediaObjects: () => false,
  resolveProjectExportFrameSourcePolicyForEncode: () => ({
    rustFrameSourcePolicy: 'optional',
    rustFrameSourceBlockedFallback: 'canvas',
  }),
  resolveProjectExportRustFrameSourceContext: () => ({}),
  formatProjectExportRustFrameSourceUnavailableDetail: () => '',
  buildProjectExportFrameSourcePlan: () => ({ ok: true, source: 'exportCanvas' }),
  createSingleUseProjectExportFrameSourceCloser: vi.fn(),
}));

vi.mock('../utils/sharedVideoFramePresentedFrameHandoff', () => ({
  createSharedVideoFramePresentedFrameTaker: () => null,
}));

vi.mock('../utils/projectExportVideoTranscodeFastPath', () => ({
  resolveProjectExportVideoTranscodeFastPath: () => null,
}));

vi.mock('../utils/audioMixdown', () => ({
  buildExportAudioMixWav: vi.fn(async () => null),
  buildExportAudioBuffer: vi.fn(async () => null),
}));

const renderProjectExportFrameMock = vi.fn(async (options: { renderScene: unknown }) => {
  return {
    frame: { timestamp: 0, residentSceneEncodeFramePayload: {} },
    rustFrameSourceBlocked: false,
  };
});

vi.mock('../utils/projectExportFrameRenderer', () => ({
  renderProjectExportFrame: (options: { renderScene: unknown }) => renderProjectExportFrameMock(options),
}));

const runRustBackendVideoEncodeExportMock = vi.fn(
  async (options: { frames: AsyncIterable<unknown> }) => {
    const iterator = options.frames[Symbol.asyncIterator]();
    await iterator.next();
    return { encoderPath: 'test', frameCount: 1 };
  },
);

vi.mock('../utils/rustBackendVideoEncodeExport', () => ({
  runRustBackendVideoEncodeExport: (options: { frames: AsyncIterable<unknown> }) =>
    runRustBackendVideoEncodeExportMock(options),
}));

vi.mock('../utils/rustBackendVideoEncodeControl', () => ({
  transcodeRustBackendVideo: vi.fn(async () => ({ success: true, result: {} })),
}));

vi.mock('../utils/projectExportCompatibilityEncoder', () => ({
  encodeProjectExportCompatibilityVideo: vi.fn(async () => ({ codecUsed: 'test', durationMs: 0 })),
}));

vi.mock('../utils/exportDiagnosticsLog', () => ({
  logLastExportDiagnostics: vi.fn(),
}));

vi.mock('../utils/exportProgressDiagnostics', () => ({
  updateExportProgressPhase: (_previous: unknown, next: unknown) => next,
}));

vi.mock('../utils/videoExportEncodeSettings', () => ({
  resolveVideoExportEncodeSettings: () => ({}),
}));

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let showSaveDialogCallCount = 0;
let showSaveDialogDeferred: Deferred<string | null>;
const ipcInvokeMock = vi.fn((channel: string, ..._args: unknown[]) => {
  if (channel === 'show-save-dialog') {
    showSaveDialogCallCount += 1;
    return showSaveDialogDeferred.promise;
  }
  if (channel === 'delete-temp-file' || channel === 'save-temp-audio') {
    return Promise.resolve({ success: true, path: '/tmp/fake-audio.wav' });
  }
  return Promise.resolve({ success: true });
});

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe('useProjectExport effect lifecycle', () => {
  beforeEach(() => {
    state.isExporting = false;
    state.exportCancelRequested = false;
    state.exportProgress = undefined;
    state.lastExportDiagnostics = undefined;
    showSaveDialogCallCount = 0;
    showSaveDialogDeferred = createDeferred<string | null>();
    ipcInvokeMock.mockClear();
    renderProjectExportFrameMock.mockClear();
    runRustBackendVideoEncodeExportMock.mockClear();
    (globalThis as any).window = { ipcRenderer: { invoke: ipcInvokeMock }, rustVideoEncoder: {} };
    (globalThis as any).alert = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not start a second export session when a callback identity changes mid-export', async () => {
    const { useProjectExport } = await import('./useProjectExport');

    let renderSceneA = () => {};
    let getRustExportFrameSourceA = () => null;

    const { rerender } = renderHook(useProjectExport, [
      renderSceneA,
      undefined,
      getRustExportFrameSourceA,
    ] as const);

    // Rising edge: isExporting becomes true.
    state.isExporting = true;
    rerender([renderSceneA, undefined, getRustExportFrameSourceA] as const);
    await flush();

    expect(showSaveDialogCallCount).toBe(1);

    // Simulate a scene-revision update mid-export: new callback identities,
    // isExporting unchanged.
    const renderSceneB = () => {};
    const getRustExportFrameSourceB = () => null;
    rerender([renderSceneB, undefined, getRustExportFrameSourceB] as const);
    await flush();

    // Regression assertion: the effect must not re-fire just because a
    // callback identity changed while isExporting stayed true.
    expect(showSaveDialogCallCount).toBe(1);

    showSaveDialogDeferred.resolve('/tmp/output.mp4');
    await flush();

    expect(runRustBackendVideoEncodeExportMock).toHaveBeenCalledTimes(1);
  });

  it('uses the latest callback identity via ref, not the one captured at effect start', async () => {
    const { useProjectExport } = await import('./useProjectExport');

    const renderSceneA = () => {};
    const getRustExportFrameSourceA = () => null;

    const { rerender } = renderHook(useProjectExport, [
      renderSceneA,
      undefined,
      getRustExportFrameSourceA,
    ] as const);

    state.isExporting = true;
    rerender([renderSceneA, undefined, getRustExportFrameSourceA] as const);
    await flush();

    const renderSceneB = () => {};
    const getRustExportFrameSourceB = () => null;
    rerender([renderSceneB, undefined, getRustExportFrameSourceB] as const);
    await flush();

    showSaveDialogDeferred.resolve('/tmp/output.mp4');
    await flush();

    expect(renderProjectExportFrameMock).toHaveBeenCalled();
    const callOptions = renderProjectExportFrameMock.mock.calls[0][0] as { renderScene: unknown };
    expect(callOptions.renderScene).toBe(renderSceneB);
    expect(callOptions.renderScene).not.toBe(renderSceneA);
  });

  it('preserves cancellation on unmount / isExporting -> false', async () => {
    const { useProjectExport } = await import('./useProjectExport');

    const renderScene = () => {};

    const { rerender } = renderHook(useProjectExport, [renderScene, undefined, undefined] as const);

    state.isExporting = true;
    rerender([renderScene, undefined, undefined] as const);
    await flush();

    expect(showSaveDialogCallCount).toBe(1);

    // Cleanup fires: isExporting flips back to false.
    state.isExporting = false;
    rerender([renderScene, undefined, undefined] as const);
    await flush();

    showSaveDialogDeferred.resolve('/tmp/output.mp4');
    await flush();

    expect(renderProjectExportFrameMock).not.toHaveBeenCalled();
  });

  it('preserves cancellation via exportCancelRequested', async () => {
    const { useProjectExport } = await import('./useProjectExport');

    const renderScene = () => {};

    const { rerender } = renderHook(useProjectExport, [renderScene, undefined, undefined] as const);

    state.isExporting = true;
    rerender([renderScene, undefined, undefined] as const);
    await flush();

    expect(showSaveDialogCallCount).toBe(1);

    state.exportCancelRequested = true;
    showSaveDialogDeferred.resolve('/tmp/output.mp4');
    await flush();

    expect(renderProjectExportFrameMock).not.toHaveBeenCalled();
  });
});
