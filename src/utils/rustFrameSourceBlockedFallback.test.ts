import { describe, expect, it } from 'vitest';
import {
  isRustFrameSourceLegacyCanvasFallbackAllowed,
  normaliseRustFrameSourceBlockedFallback,
} from './rustFrameSourceBlockedFallback';

describe('isRustFrameSourceLegacyCanvasFallbackAllowed', () => {
  it('forbids the legacy canvas fallback for rust-required video reasons', () => {
    expect(isRustFrameSourceLegacyCanvasFallbackAllowed({
      reason: 'videoOwnershipUnavailable',
      legacyCanvasFallbackAllowed: true,
    })).toBe(false);
    expect(isRustFrameSourceLegacyCanvasFallbackAllowed({
      reason: 'videoUploadFailed',
      legacyCanvasFallbackAllowed: true,
    })).toBe(false);
  });

  it('preserves the caller flag for every other reason', () => {
    expect(isRustFrameSourceLegacyCanvasFallbackAllowed({
      reason: 'sharedFrameUnavailable',
      legacyCanvasFallbackAllowed: true,
    })).toBe(true);
    expect(isRustFrameSourceLegacyCanvasFallbackAllowed({
      reason: 'sharedFrameUnavailable',
      legacyCanvasFallbackAllowed: false,
    })).toBe(false);
  });

  it('also overrides an already-disabled flag to false for rust-required reasons', () => {
    expect(isRustFrameSourceLegacyCanvasFallbackAllowed({
      reason: 'videoOwnershipUnavailable',
      legacyCanvasFallbackAllowed: false,
    })).toBe(false);
  });
});

describe('normaliseRustFrameSourceBlockedFallback', () => {
  it('rewrites legacyCanvasFallbackAllowed via the decision and keeps other fields', () => {
    const blocked = {
      reason: 'videoUploadFailed',
      legacyCanvasFallbackAllowed: true,
      detail: 'upload failed',
    };
    expect(normaliseRustFrameSourceBlockedFallback(blocked)).toEqual({
      reason: 'videoUploadFailed',
      legacyCanvasFallbackAllowed: false,
      detail: 'upload failed',
    });
  });

  it('is idempotent', () => {
    const once = normaliseRustFrameSourceBlockedFallback({
      reason: 'sharedFrameUnavailable',
      legacyCanvasFallbackAllowed: true,
    });
    expect(normaliseRustFrameSourceBlockedFallback(once)).toEqual(once);
  });
});
