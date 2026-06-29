export interface NativeOverlayViewportRect {
  left: number
  top: number
  width: number
  height: number
}

export interface NativeOverlayAttachRectInput {
  viewportRect: NativeOverlayViewportRect
  windowRect: Pick<NativeOverlayViewportRect, 'left' | 'top'>
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

export const buildNativeOverlayAttachRect = ({
  viewportRect,
  windowRect,
  devicePixelRatio,
}: NativeOverlayAttachRectInput): NativeOverlayAttachRect => ({
  x: finiteOrFallback(viewportRect.left - windowRect.left, 0),
  y: finiteOrFallback(viewportRect.top - windowRect.top, 0),
  width: positiveOrOne(viewportRect.width),
  height: positiveOrOne(viewportRect.height),
  scaleFactor: positiveOrOne(devicePixelRatio),
})
