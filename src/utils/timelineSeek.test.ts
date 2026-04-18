import { describe, expect, it } from 'vitest';
import { HEADER_WIDTH, PX_PER_SEC } from '../components/timelineConstants';
import { isPointerInTimelineTrackColumn, timeFromTimelineContentX } from './timelineSeek';

describe('timelineSeek', () => {
  it('maps the left edge of the track column to t = 0', () => {
    expect(timeFromTimelineContentX(HEADER_WIDTH)).toBe(0);
  });

  it('does not yield negative time when the pointer is in the gutter', () => {
    expect(timeFromTimelineContentX(HEADER_WIDTH - 1)).toBe(0);
    expect(timeFromTimelineContentX(0)).toBe(0);
  });

  it('converts pixels past the gutter into seconds', () => {
    expect(timeFromTimelineContentX(HEADER_WIDTH + PX_PER_SEC)).toBe(1);
  });

  it('treats the gutter as non-scrubbable', () => {
    expect(isPointerInTimelineTrackColumn(HEADER_WIDTH - 0.5)).toBe(false);
    expect(isPointerInTimelineTrackColumn(HEADER_WIDTH)).toBe(true);
  });
});
