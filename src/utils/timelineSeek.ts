import { HEADER_WIDTH, PX_PER_SEC } from '../components/timelineConstants';

/** Content-space X inside the scrollable timeline (includes scrollLeft; 0 = far left of inner canvas). */
export function timeFromTimelineContentX(contentX: number): number {
  return Math.max(0, (contentX - HEADER_WIDTH) / PX_PER_SEC);
}

export function isPointerInTimelineTrackColumn(contentX: number): boolean {
  return contentX >= HEADER_WIDTH;
}
