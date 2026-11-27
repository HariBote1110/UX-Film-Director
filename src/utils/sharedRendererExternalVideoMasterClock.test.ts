import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTERNAL_VIDEO_MASTER_CLOCK_SNAP_THRESHOLD_FRAMES,
  resolveSharedRendererExternalVideoMasterClockSnapTime,
  resolveTimelineTimeFromExternalVideoMasterClock,
  selectSharedRendererExternalVideoMasterClockCandidate,
  type SharedRendererExternalVideoMasterClockCandidate,
} from './sharedRendererExternalVideoMasterClock';

const candidate = (
  patch: Partial<SharedRendererExternalVideoMasterClockCandidate> = {}
): SharedRendererExternalVideoMasterClockCandidate => ({
  clipId: 'video-1',
  zIndex: 0,
  elementCurrentTimeSeconds: 4.5,
  clipStartTimeSeconds: 2,
  clipOffsetSeconds: 1.5,
  isElementPlaying: true,
  ...patch,
});

describe('sharedRendererExternalVideoMasterClock', () => {
  describe('selectSharedRendererExternalVideoMasterClockCandidate', () => {
    it('selects the playing candidate with the smallest z_index deterministically', () => {
      const selected = selectSharedRendererExternalVideoMasterClockCandidate([
        candidate({ clipId: 'video-b', zIndex: 3 }),
        candidate({ clipId: 'video-a', zIndex: 1 }),
        candidate({ clipId: 'video-c', zIndex: 2 }),
      ]);

      expect(selected?.clipId).toBe('video-a');
    });

    it('ignores candidates whose element is not in playing mode', () => {
      const selected = selectSharedRendererExternalVideoMasterClockCandidate([
        candidate({ clipId: 'video-paused', zIndex: 0, isElementPlaying: false }),
        candidate({ clipId: 'video-playing', zIndex: 5 }),
      ]);

      expect(selected?.clipId).toBe('video-playing');
    });

    it('prefers the first candidate on a z_index tie (stable selection)', () => {
      const selected = selectSharedRendererExternalVideoMasterClockCandidate([
        candidate({ clipId: 'video-first', zIndex: 1 }),
        candidate({ clipId: 'video-second', zIndex: 1 }),
      ]);

      expect(selected?.clipId).toBe('video-first');
    });

    it('returns null when no playing candidate exists (rAF advanceTime fallback)', () => {
      expect(selectSharedRendererExternalVideoMasterClockCandidate([])).toBeNull();
      expect(selectSharedRendererExternalVideoMasterClockCandidate([
        candidate({ isElementPlaying: false }),
      ])).toBeNull();
    });

    it('skips candidates with non-finite element clock or clip start', () => {
      const selected = selectSharedRendererExternalVideoMasterClockCandidate([
        candidate({ clipId: 'video-nan', zIndex: 0, elementCurrentTimeSeconds: Number.NaN }),
        candidate({ clipId: 'video-ok', zIndex: 1 }),
      ]);

      expect(selected?.clipId).toBe('video-ok');
    });
  });

  describe('resolveTimelineTimeFromExternalVideoMasterClock', () => {
    it('inverts the media clock into a timeline time (start + currentTime - offset)', () => {
      expect(resolveTimelineTimeFromExternalVideoMasterClock(candidate({
        clipStartTimeSeconds: 2,
        clipOffsetSeconds: 1.5,
        elementCurrentTimeSeconds: 4.5,
      }))).toBeCloseTo(5, 9);
    });

    it('treats a missing (non-finite) offset as zero and clamps a pre-offset clock to clip start', () => {
      expect(resolveTimelineTimeFromExternalVideoMasterClock(candidate({
        clipStartTimeSeconds: 3,
        clipOffsetSeconds: Number.NaN,
        elementCurrentTimeSeconds: 1,
      }))).toBeCloseTo(4, 9);
      expect(resolveTimelineTimeFromExternalVideoMasterClock(candidate({
        clipStartTimeSeconds: 3,
        clipOffsetSeconds: 2,
        elementCurrentTimeSeconds: 1,
      }))).toBeCloseTo(3, 9);
    });
  });

  describe('resolveSharedRendererExternalVideoMasterClockSnapTime', () => {
    it('snaps the head onto the master clock once the drift exceeds one preview frame', () => {
      const snapped = resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates: [candidate({
          clipStartTimeSeconds: 0,
          clipOffsetSeconds: 0,
          elementCurrentTimeSeconds: 5,
        })],
        headTimeSeconds: 5.05,
        previewFps: 60,
      });

      expect(snapped).toBeCloseTo(5, 9);
    });

    it('leaves the head alone while the drift stays within the snap threshold', () => {
      const snapped = resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates: [candidate({
          clipStartTimeSeconds: 0,
          clipOffsetSeconds: 0,
          elementCurrentTimeSeconds: 5,
        })],
        headTimeSeconds: 5.01,
        previewFps: 60,
      });

      expect(snapped).toBeNull();
    });

    it('does not oscillate: applying the snapped time immediately converges to no further snap', () => {
      // setTime → 再publish → 再吸着のフィードバックループが発振しない契約。
      // 吸着後のヘッドはマスター時刻そのものなので、要素クロックが同一の
      // うちは次tickの判定が必ず null（閾値内）になる。
      const candidates = [candidate({
        clipStartTimeSeconds: 0,
        clipOffsetSeconds: 0,
        elementCurrentTimeSeconds: 7.2,
      })];
      const first = resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates,
        headTimeSeconds: 7.5,
        previewFps: 60,
      });

      expect(first).toBeCloseTo(7.2, 9);

      const second = resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates,
        headTimeSeconds: first as number,
        previewFps: 60,
      });

      expect(second).toBeNull();
    });

    it('returns null when no playing video clip is in range so rAF keeps driving the head', () => {
      expect(resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates: [],
        headTimeSeconds: 5,
        previewFps: 60,
      })).toBeNull();
    });

    it('falls back to safe defaults for invalid fps and threshold inputs', () => {
      const snapped = resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates: [candidate({
          clipStartTimeSeconds: 0,
          clipOffsetSeconds: 0,
          elementCurrentTimeSeconds: 5,
        })],
        headTimeSeconds: 5.05,
        previewFps: Number.NaN,
        snapThresholdFrames: Number.NaN,
      });

      expect(snapped).toBeCloseTo(5, 9);
      expect(DEFAULT_EXTERNAL_VIDEO_MASTER_CLOCK_SNAP_THRESHOLD_FRAMES).toBeGreaterThan(0);
    });

    it('returns null for a non-finite head time', () => {
      expect(resolveSharedRendererExternalVideoMasterClockSnapTime({
        candidates: [candidate()],
        headTimeSeconds: Number.NaN,
        previewFps: 60,
      })).toBeNull();
    });
  });

  describe('Viewport wiring boundary', () => {
    const viewportSource = () =>
      readFileSync(new URL('../components/Viewport.tsx', import.meta.url), 'utf8');

    it('feeds the master clock snap through syncSharedRendererExternalVideoSources during playback', () => {
      const code = viewportSource();
      const start = code.indexOf('const syncSharedRendererExternalVideoSources = ({');
      const end = code.indexOf('const copySharedRendererPresenterDiagnostics', start);
      const syncBlock = code.slice(start, end);

      expect(syncBlock).toContain('resolveSharedRendererExternalVideoMasterClockSnapTime({');
      expect(syncBlock).toContain('onMasterClockSnap');
      expect(syncBlock).toContain('masterClockHeadTimeSeconds');
    });

    it('snaps the timeline head via setTime at the external video reuse call site with an env opt-out', () => {
      const code = viewportSource();

      expect(code).toContain(
        "const externalVideoMasterClockEnabled = import.meta.env.VITE_UXFD_EXTERNAL_VIDEO_MASTER_CLOCK !== '0';"
      );
      const start = code.indexOf('const sourcesByClipId = syncSharedRendererExternalVideoSources({');
      const end = code.indexOf('const presentation = control.presentExternalVideoFrameScene?.({', start);
      const reuseCallSiteBlock = code.slice(start, end);

      expect(reuseCallSiteBlock).toContain('onMasterClockSnap:');
      expect(reuseCallSiteBlock).toContain('setTime(');
      expect(reuseCallSiteBlock).toContain('externalVideoMasterClockEnabled');
    });

    it('keeps the rAF advanceTime loop as the fallback clock for video-less sections', () => {
      const appLogicSource = readFileSync(
        new URL('../hooks/useAppLogic.ts', import.meta.url),
        'utf8'
      );

      expect(appLogicSource).toContain('advanceTime(deltaTime);');
      expect(appLogicSource).toContain('requestAnimationFrame(animate)');
    });
  });
});
