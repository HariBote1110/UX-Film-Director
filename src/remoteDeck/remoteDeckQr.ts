import QRCode from 'qrcode';

/** Renders a connection URL as a PNG data URL for on-screen QR display. */
export const buildRemoteDeckQrDataUrl = (url: string): Promise<string> =>
  QRCode.toDataURL(url, { margin: 1, width: 220 });
