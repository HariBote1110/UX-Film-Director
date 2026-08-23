import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { buildPreviewHoleClipPath } from '../utils/previewHoleClipPath';

/**
 * hole-punch方式のバックドロップ。
 *
 * native overlay (child NSWindow) はpreview矩形と同じ大きさの黒いウィンドウ
 * でしかない一方、それを透かすため祖先チェーン（body/.workspace-main/
 * .viewport-container/.preview-canvas-container/...）は全域が透明になって
 * いる。そのため overlay attach 矩形以外の透明領域（letterbox、preview
 * 周囲の余白、ウィンドウ角など）は macOS デスクトップがそのまま透けて見えて
 * しまう。
 *
 * この不透明な全画面div（viewport全体、z-indexで最背面）に
 * `previewHoleRect`（Viewport.tsx の attach() が publish する矩形）と
 * 同じ大きさの穴を clip-path で開けることで、overlay矩形の内側だけが
 * 素通しになり、それ以外は通常のアプリ背景色（--bg-app）で塗りつぶされる。
 */
const PreviewHoleBackdrop: React.FC = () => {
  const previewHoleRect = useStore((state) => state.previewHoleRect);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const clipPath = buildPreviewHoleClipPath(previewHoleRect, viewport);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        background: 'var(--bg-app)',
        pointerEvents: 'none',
        clipPath,
        WebkitClipPath: clipPath,
      }}
    />
  );
};

export default PreviewHoleBackdrop;
