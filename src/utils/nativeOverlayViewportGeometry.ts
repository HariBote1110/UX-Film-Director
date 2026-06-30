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

const nonNegativeOrZero = (value: number): number => {
  const finite = finiteOrFallback(value, 0)
  return finite >= 0 ? finite : 0
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
  return {
    x: nonNegativeOrZero(viewportRect.left + viewportLeft),
    y: nonNegativeOrZero(finiteContentHeight - viewportRect.top - viewportTop - height),
    width,
    height,
    scaleFactor: positiveOrOne(backingScaleFactor ?? devicePixelRatio ?? 1),
  }
}
