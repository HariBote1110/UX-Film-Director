import { describe, expect, it, vi } from 'vitest';
import { resolveBinaryPath } from './resolveBinaryPath';

describe('resolveBinaryPath', () => {
  it('uses an existing explicitly configured binary before default candidates', () => {
    const exists = vi.fn((candidate: string) => candidate === '/configured/backend');

    expect(resolveBinaryPath({
      requestedPath: '/configured/backend',
      requestedPathLabel: 'UXFD_RUST_BACKEND_BIN',
      candidates: ['/app/rust-backend'],
      exists,
    })).toBe('/configured/backend');
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('fails when the explicitly configured binary is missing instead of choosing a fallback', () => {
    const exists = vi.fn((candidate: string) => candidate === '/app/rust-backend');

    expect(() => resolveBinaryPath({
      requestedPath: '/missing/backend',
      requestedPathLabel: 'UXFD_RUST_BACKEND_BIN',
      candidates: ['/app/rust-backend'],
      exists,
    })).toThrow('UXFD_RUST_BACKEND_BIN points to a missing binary: /missing/backend');
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('uses the first existing default candidate when no path was configured', () => {
    const exists = vi.fn((candidate: string) => candidate === '/app/release/backend');

    expect(resolveBinaryPath({
      requestedPath: undefined,
      requestedPathLabel: 'UXFD_RUST_BACKEND_BIN',
      candidates: ['/app/debug/backend', '/app/release/backend'],
      exists,
    })).toBe('/app/release/backend');
  });

  it('returns null when no default candidate exists', () => {
    expect(resolveBinaryPath({
      requestedPath: undefined,
      requestedPathLabel: 'UXFD_RUST_BACKEND_BIN',
      candidates: ['/app/debug/backend'],
      exists: () => false,
    })).toBeNull();
  });
});
