import { describe, expect, it } from 'vitest';
import { normaliseCoreMlTrackObjectResponse } from './coremlTrackIpc';

describe('normaliseCoreMlTrackObjectResponse', () => {
  it('returns samples and optional message', () => {
    const r = normaliseCoreMlTrackObjectResponse({
      ok: true,
      samples: [{ tSec: 0, boundingBox: { x: 0, y: 0, width: 0.2, height: 0.2 } }],
      message: 'partial track',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.samples).toHaveLength(1);
      expect(r.message).toBe('partial track');
    }
  });

  it('omits message when absent', () => {
    const r = normaliseCoreMlTrackObjectResponse({
      ok: true,
      samples: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.message).toBeUndefined();
    }
  });

  it('maps Vision error envelope', () => {
    const r = normaliseCoreMlTrackObjectResponse({ ok: false, error: 'failed' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('failed');
  });
});
