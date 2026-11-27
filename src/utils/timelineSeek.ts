import { HEADER_WIDTH, PX_PER_SEC } from '../components/timelineConstants';

/** Content-space X inside the scrollable timeline (includes scrollLeft; 0 = far left of inner canvas). */
export function timeFromTimelineContentX(contentX: number): number {
  return Math.max(0, (contentX - HEADER_WIDTH) / PX_PER_SEC);
}

export function isPointerInTimelineTrackColumn(contentX: number): boolean {
  return contentX >= HEADER_WIDTH;
}

/**
 * Converts a client X to timeline time when the point is inside the timeline scroll viewport.
 * The layer gutter is `position: sticky` on the left of the viewport; hits there must not add
 * `scrollLeft` (otherwise t=0 appears to sit “under” the gutter after horizontal scroll).
 */
export function timeFromTimelineViewportClientX(
  clientX: number,
  timelineViewportLeft: number,
  scrollLeft: number
): number {
  const viewportX = clientX - timelineViewportLeft;
  if (viewportX < HEADER_WIDTH) {
    return 0;
  }
  const contentX = viewportX + scrollLeft;
  return timeFromTimelineContentX(contentX);
}
