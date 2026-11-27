export interface NativeOverlayViewportRect {
  left: number
  top: number
  width: number
  height: number
}

export interface NativeOverlayAttachRectInput {
  viewportRect: NativeOverlayViewportRect
  contentHeight: number
  backingScaleFactor?: number
  devicePixelRatio?: number
  viewportOffsetLeft?: number
  viewportOffsetTop?: number
}

export interface NativeOverlayAttachRect {
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
}

const finiteOrFallback = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback

const positiveOrOne = (value: number): number => {
  const finite = finiteOrFallback(value, 1)
  return finite > 0 ? finite : 1
}

export const buildNativeOverlayAttachRect = ({
  viewportRect,
  contentHeight,
  backingScaleFactor,
  devicePixelRatio,
  viewportOffsetLeft = 0,
  viewportOffsetTop = 0,
}: NativeOverlayAttachRectInput): NativeOverlayAttachRect => {
  const width = positiveOrOne(viewportRect.width)
  const height = positiveOrOne(viewportRect.height)
  const finiteContentHeight = finiteOrFallback(contentHeight, height)
  const viewportLeft = finiteOrFallback(viewportOffsetLeft, 0)
  const viewportTop = finiteOrFallback(viewportOffsetTop, 0)
  // x/y は native-overlay 側（macos_overlay.rs）で通常の convertRect: 変換に
  // 渡されるだけで非負であることは前提にしていない。preview ペインがウィンドウ
  // 原点よりはみ出す（top/left が負、または preview がウィンドウ下端を超えて
  // 伸びる）ケースでは、負の x/y が本来の attach 位置であり、0へクランプすると
  // overlay がウィンドウ端に張り付いてずれる。
  return {
    x: finiteOrFallback(viewportRect.left + viewportLeft, 0),
    y: finiteOrFallback(finiteContentHeight - viewportRect.top - viewportTop - height, 0),
    width,
    height,
    scaleFactor: positiveOrOne(backingScaleFactor ?? devicePixelRatio ?? 1),
  }
}
