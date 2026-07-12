import { describe, expect, it } from 'vitest';
import { buildRemoteDeckQrDataUrl } from './remoteDeckQr';

describe('buildRemoteDeckQrDataUrl', () => {
  it('generates a PNG data URL for a connection URL', async () => {
    const dataUrl = await buildRemoteDeckQrDataUrl('http://192.168.1.20:45678/?token=abc123');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
