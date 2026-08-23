/**
 * PreviewHoleBackdrop 用の clip-path を組み立てる純粋関数。
 *
 * hole-punch方式では、祖先チェーン（body/.workspace-main/...）を透明にして
 * native overlay の映像を素通しするが、preview 矩形以外の透明領域
 * （余白・letterboxなど）は macOS デスクトップが透けて見えてしまう。
 * この関数は viewport 全体を覆う不透明バックドロップに、preview 矩形
 * （native overlay の attach rect）と同じ大きさの「穴」を開けるための
 * clip-path 文字列を返す。evenodd fill-rule で外周ポリゴンと穴ポリゴンを
 * 重ねることで、穴の内側だけがクリップされず透明になる。
 */
export interface PreviewHoleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewViewportSize {
  width: number;
  height: number;
}

const round = (value: number): number => Math.round(value);

export const buildPreviewHoleClipPath = (
  hole: PreviewHoleRect | null,
  viewport: PreviewViewportSize
): string => {
  if (hole === null) {
    return 'none';
  }

  const vw = round(viewport.width);
  const vh = round(viewport.height);
  const left = round(hole.x);
  const top = round(hole.y);
  const right = round(hole.x + hole.width);
  const bottom = round(hole.y + hole.height);

  const points = [
    // viewport全体を覆う外周（時計回り）
    `0px 0px`,
    `${vw}px 0px`,
    `${vw}px ${vh}px`,
    `0px ${vh}px`,
    `0px 0px`,
    // hole矩形（穴）
    `${left}px ${top}px`,
    `${left}px ${bottom}px`,
    `${right}px ${bottom}px`,
    `${right}px ${top}px`,
    `${left}px ${top}px`,
  ];

  return `polygon(evenodd, ${points.join(', ')})`;
};
