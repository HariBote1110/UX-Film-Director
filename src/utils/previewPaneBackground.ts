// hole-punch 設計（native overlay を常に親ウィンドウの下に配置し、代わりに
// 親ウィンドウ側の preview 矩形を透明にして映像を透過させる方式）向けの
// 純粋ヘルパー。
//
// native overlay が attach 済み（'overlay' state）のときは preview 要素の
// 背景を透明にし、その下にある native child NSWindow の映像をそのまま
// 見せる。attach 前や WebGPU presenter フォールバック時（Windows 暫定や
// UXFD_NATIVE_OVERLAY=0 環境）は、フォールバック canvas の背景として
// 従来どおりのダーク背景を維持する。
export function resolvePreviewPaneBackground(nativeOverlayAttached: boolean): string {
  return nativeOverlayAttached ? 'transparent' : 'var(--bg-app)';
}
