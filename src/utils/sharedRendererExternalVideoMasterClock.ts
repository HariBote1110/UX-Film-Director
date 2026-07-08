/**
 * 二重クロック問題（調査 2026-07-08 発見1）への対策 — 再生中の external-video
 * 経路では、タイムラインヘッド（rAF 差分積算）ではなく HTMLVideoElement 自身の
 * メディアクロックを「マスター」とし、ヘッドをそこへ従属させる。
 *
 * - マスターは「再生中（playbackState.mode === 'playing'）の video クリップの
 *   うち z_index 最小」を決定的に選ぶ。
 * - マスターのメディア時刻からタイムライン時刻を逆算し、ヘッドとの差が
 *   閾値（既定 1 プレビューフレーム）を超えたときだけ吸着させる。
 * - 吸着後のヘッドはマスター時刻そのものになるため、setTime → 再 publish →
 *   再判定のループは即座に閾値内へ収束し、発振しない。
 * - video クリップが在圏しない区間では null を返し、従来の rAF 積算
 *   （useAppLogic の advanceTime）がそのままヘッドを駆動する。
 */
export interface SharedRendererExternalVideoMasterClockCandidate {
  clipId: string;
  zIndex: number;
  /** HTMLVideoElement.currentTime（メディア秒）。 */
  elementCurrentTimeSeconds: number;
  /** クリップのタイムライン開始秒。 */
  clipStartTimeSeconds: number;
  /** クリップのメディアオフセット秒（VideoObject.offset）。 */
  clipOffsetSeconds: number;
  /** 同期側 playbackState.mode === 'playing' のとき true。 */
  isElementPlaying: boolean;
}

export const DEFAULT_EXTERNAL_VIDEO_MASTER_CLOCK_SNAP_THRESHOLD_FRAMES = 1;

export const selectSharedRendererExternalVideoMasterClockCandidate = (
  candidates: readonly SharedRendererExternalVideoMasterClockCandidate[],
): SharedRendererExternalVideoMasterClockCandidate | null => {
  let selected: SharedRendererExternalVideoMasterClockCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate.isElementPlaying) continue;
    if (!Number.isFinite(candidate.elementCurrentTimeSeconds)) continue;
    if (!Number.isFinite(candidate.clipStartTimeSeconds)) continue;
    if (selected === null || candidate.zIndex < selected.zIndex) {
      selected = candidate;
    }
  }
  return selected;
};

export const resolveTimelineTimeFromExternalVideoMasterClock = (
  candidate: SharedRendererExternalVideoMasterClockCandidate,
): number => {
  const offset = Number.isFinite(candidate.clipOffsetSeconds) ? candidate.clipOffsetSeconds : 0;
  const localSeconds = Math.max(0, candidate.elementCurrentTimeSeconds - offset);
  return candidate.clipStartTimeSeconds + localSeconds;
};

export const resolveSharedRendererExternalVideoMasterClockSnapTime = ({
  candidates,
  headTimeSeconds,
  previewFps,
  snapThresholdFrames = DEFAULT_EXTERNAL_VIDEO_MASTER_CLOCK_SNAP_THRESHOLD_FRAMES,
}: {
  candidates: readonly SharedRendererExternalVideoMasterClockCandidate[];
  headTimeSeconds: number;
  previewFps: number;
  snapThresholdFrames?: number;
}): number | null => {
  if (!Number.isFinite(headTimeSeconds)) return null;
  const master = selectSharedRendererExternalVideoMasterClockCandidate(candidates);
  if (!master) return null;
  const safePreviewFps = Number.isFinite(previewFps) && previewFps > 0 ? previewFps : 60;
  const safeSnapThresholdFrames = Number.isFinite(snapThresholdFrames) && snapThresholdFrames > 0
    ? snapThresholdFrames
    : DEFAULT_EXTERNAL_VIDEO_MASTER_CLOCK_SNAP_THRESHOLD_FRAMES;
  const masterTimelineTimeSeconds = resolveTimelineTimeFromExternalVideoMasterClock(master);
  const thresholdSeconds = safeSnapThresholdFrames / safePreviewFps;
  if (Math.abs(masterTimelineTimeSeconds - headTimeSeconds) <= thresholdSeconds) return null;
  return masterTimelineTimeSeconds;
};
