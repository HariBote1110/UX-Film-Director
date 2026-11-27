import { describe, expect, it } from 'vitest';
import { validateProxyDuration } from './proxyValidation';

describe('validateProxyDuration', () => {
  it('accepts a proxy whose duration matches the original exactly', () => {
    const result = validateProxyDuration({ originalDurationSeconds: 536.5, proxyDurationSeconds: 536.5 });
    expect(result.valid).toBe(true);
  });

  it('rejects a proxy whose timeline is compressed (foreign proxy case, ~2.39x)', () => {
    // 実際の不正プロキシ事例: perf/heavy-media/GX010052.proxy.mp4
    // オリジナル 536.5s に対しプロキシが 224.6s（2.388倍圧縮）
    const result = validateProxyDuration({ originalDurationSeconds: 536.5, proxyDurationSeconds: 224.6 });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/duration/i);
  });

  it('accepts a proxy within the 2% relative tolerance', () => {
    // 100s の 2% = 2s 以内
    const result = validateProxyDuration({ originalDurationSeconds: 100, proxyDurationSeconds: 101.5 });
    expect(result.valid).toBe(true);
  });

  it('rejects a proxy just outside the 2% relative tolerance', () => {
    // 100s の 2% = 2s、これを超える差
    const result = validateProxyDuration({ originalDurationSeconds: 100, proxyDurationSeconds: 103 });
    expect(result.valid).toBe(false);
  });

  it('accepts very short clips within the 0.5s absolute tolerance even though 2% would be stricter', () => {
    // 2s の 2% = 0.04s だが、絶対許容 0.5s の方が大きいのでこちらが優先される
    const result = validateProxyDuration({ originalDurationSeconds: 2, proxyDurationSeconds: 2.4 });
    expect(result.valid).toBe(true);
  });

  it('rejects very short clips outside the 0.5s absolute tolerance', () => {
    const result = validateProxyDuration({ originalDurationSeconds: 2, proxyDurationSeconds: 2.6 });
    expect(result.valid).toBe(false);
  });

  it('rejects when the original duration is missing', () => {
    const result = validateProxyDuration({ originalDurationSeconds: undefined, proxyDurationSeconds: 10 });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/original/i);
  });

  it('rejects when the proxy duration is missing', () => {
    const result = validateProxyDuration({ originalDurationSeconds: 10, proxyDurationSeconds: null });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/proxy/i);
  });

  it('rejects when the original duration is zero', () => {
    const result = validateProxyDuration({ originalDurationSeconds: 0, proxyDurationSeconds: 0 });
    expect(result.valid).toBe(false);
  });

  it('rejects when the proxy duration is zero but the original is not', () => {
    const result = validateProxyDuration({ originalDurationSeconds: 10, proxyDurationSeconds: 0 });
    expect(result.valid).toBe(false);
  });
});
