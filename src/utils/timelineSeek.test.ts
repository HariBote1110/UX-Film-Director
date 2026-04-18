import { describe, expect, it } from 'vitest';
import { HEADER_WIDTH, PX_PER_SEC } from '../components/timelineConstants';
import {
  isPointerInTimelineTrackColumn,
  timeFromTimelineContentX,
  timeFromTimelineViewportClientX,
} from './timelineSeek';

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

describe('timeFromTimelineViewportClientX', () => {
  it('maps the sticky gutter to t = 0 even when the track is scrolled', () => {
    const scrollLeft = 300;
    const gutterClientX = 40;
    const viewportLeft = 0;
    expect(timeFromTimelineViewportClientX(gutterClientX, viewportLeft, scrollLeft)).toBe(0);
  });

  it('adds scrollLeft only for hits on the track column', () => {
    expect(timeFromTimelineViewportClientX(HEADER_WIDTH + PX_PER_SEC, 0, 0)).toBe(1);
    const scrollLeft = 150;
    const clientX = HEADER_WIDTH + PX_PER_SEC;
    expect(timeFromTimelineViewportClientX(clientX, 0, scrollLeft)).toBe((PX_PER_SEC + scrollLeft) / PX_PER_SEC);
  });
});
