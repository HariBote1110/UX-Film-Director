export interface NativeOverlayViewportRect {
  left: number
  top: number
  width: number
  height: number
}

export interface NativeOverlayAttachRectInput {
  viewportRect: NativeOverlayViewportRect
  contentHeight: number
  devicePixelRatio: number
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
  devicePixelRatio,
}: NativeOverlayAttachRectInput): NativeOverlayAttachRect => {
  const width = positiveOrOne(viewportRect.width)
  const height = positiveOrOne(viewportRect.height)
  const finiteContentHeight = finiteOrFallback(contentHeight, height)
  return {
    x: nonNegativeOrZero(viewportRect.left),
    y: nonNegativeOrZero(finiteContentHeight - viewportRect.top - height),
    width,
    height,
    scaleFactor: positiveOrOne(devicePixelRatio),
  }
}
