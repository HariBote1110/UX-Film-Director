import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForNativeOverlayAttachGate } from './nativeOverlayAttachGateWait';

describe('waitForNativeOverlayAttachGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onReady synchronously when the gate is already satisfied (no polling started)', () => {
    const onReady = vi.fn();
    const setIntervalFn = vi.fn();
    waitForNativeOverlayAttachGate({
      isReady: () => true,
      onReady,
      intervalMs: 250,
      setIntervalFn: setIntervalFn as unknown as typeof setInterval,
    });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(setIntervalFn).not.toHaveBeenCalled();
  });

  it('element-late: retries until the container mounts, then fires onReady once', () => {
    const onReady = vi.fn();
    let containerMounted = false;
    waitForNativeOverlayAttachGate({
      isReady: () => containerMounted,
      onReady,
      intervalMs: 250,
    });

    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onReady).not.toHaveBeenCalled();

    containerMounted = true;
    vi.advanceTimersByTime(250);
    expect(onReady).toHaveBeenCalledTimes(1);

    // 追加のtickが来てもonReadyは1回だけ（ポーリングは自動停止している）。
    vi.advanceTimersByTime(250 * 3);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('bridge-late: retries until window.nativeOverlay is injected, then fires onReady once', () => {
    const onReady = vi.fn();
    let bridgeInjected = false;
    waitForNativeOverlayAttachGate({
      isReady: () => bridgeInjected,
      onReady,
      intervalMs: 100,
    });

    vi.advanceTimersByTime(300);
    expect(onReady).not.toHaveBeenCalled();

    bridgeInjected = true;
    vi.advanceTimersByTime(100);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('both-late: waits for both the container and the bridge before firing onReady', () => {
    const onReady = vi.fn();
    let containerMounted = false;
    let bridgeInjected = false;
    waitForNativeOverlayAttachGate({
      isReady: () => containerMounted && bridgeInjected,
      onReady,
      intervalMs: 100,
    });

    vi.advanceTimersByTime(200);
    expect(onReady).not.toHaveBeenCalled();

    containerMounted = true;
    vi.advanceTimersByTime(100);
    expect(onReady).not.toHaveBeenCalled();

    bridgeInjected = true;
    vi.advanceTimersByTime(100);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('cancel() before the gate is satisfied stops polling and suppresses onReady forever', () => {
    const onReady = vi.fn();
    let ready = false;
    const handle = waitForNativeOverlayAttachGate({
      isReady: () => ready,
      onReady,
      intervalMs: 100,
    });

    vi.advanceTimersByTime(100);
    handle.cancel();
    ready = true;
    vi.advanceTimersByTime(1000);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('cancel() after onReady already fired is a harmless no-op', () => {
    const onReady = vi.fn();
    const handle = waitForNativeOverlayAttachGate({
      isReady: () => true,
      onReady,
      intervalMs: 100,
    });

    expect(() => handle.cancel()).not.toThrow();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
