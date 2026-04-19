import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import type { VideoObject } from '../types';
import {
  invokeCoreMlDetectSubjects,
  invokeCoreMlTrackObjectSupported,
  type CoreMlAnimalObservation
} from '../utils/coremlTrackIpc';
import { resolveVideoFsPath } from '../utils/resolveVideoFsPath';
import { mediaTimeInClipForPlayhead } from '../utils/videoMediaTime';

const PLAY_INTERVAL_MS = 240;
const SCRUB_DEBOUNCE_MS = 320;

const toOverlayPayload = (video: VideoObject, mediaT: number, animals: CoreMlAnimalObservation[]) => (
  animals.length === 0
    ? null
    : {
        videoId: video.id,
        mediaTimeSec: mediaT,
        observations: animals.map((a) => ({
          identifier: a.identifier,
          confidence: a.confidence,
          boundingBox: { ...a.boundingBox }
        }))
      }
);

/**
 * 動画が選択され、検出枠プレビュー＋リアルタイムが有効なとき、再生中は一定間隔で Vision 検出を実行し、
 * 停止中はスクラブにデバウンスして追従する。
 */
export const useVisionRealtimeDetection = (): void => {
  const selectedId = useStore((s) => s.selectedId);
  const selectedIds = useStore((s) => s.selectedIds);
  const objects = useStore((s) => s.objects);
  const currentTime = useStore((s) => s.currentTime);
  const isPlaying = useStore((s) => s.isPlaying);
  const isExporting = useStore((s) => s.isExporting);
  const previewOn = useStore((s) => s.visionDetectionPreviewEnabled);
  const realtimeOn = useStore((s) => s.visionDetectionRealtimeEnabled);
  const setVisionDetectionOverlay = useStore((s) => s.setVisionDetectionOverlay);

  const [coreMlSupported, setCoreMlSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    invokeCoreMlTrackObjectSupported()
      .then((ok) => {
        if (!cancelled) setCoreMlSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setCoreMlSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedVideo = useMemo((): VideoObject | null => {
    const ids = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    const obj = objects.find((o) => o.id === selectedId) ?? objects.find((o) => ids.includes(o.id));
    return obj?.type === 'video' ? (obj as VideoObject) : null;
  }, [objects, selectedId, selectedIds]);

  const diskPath = useMemo(
    () => (selectedVideo ? resolveVideoFsPath(selectedVideo) : null),
    [selectedVideo]
  );

  const inFlightRef = useRef(false);

  const runDetect = useCallback(
    async (mediaT: number) => {
      if (!selectedVideo || !diskPath || !coreMlSupported) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await invokeCoreMlDetectSubjects(diskPath, mediaT);
        if (!res.ok) return;
        setVisionDetectionOverlay(toOverlayPayload(selectedVideo, mediaT, res.animals));
      } finally {
        inFlightRef.current = false;
      }
    },
    [selectedVideo, diskPath, coreMlSupported, setVisionDetectionOverlay]
  );

  // 再生中: インターバル（最新の currentTime を都度読む）
  useEffect(() => {
    if (!previewOn || !realtimeOn || !coreMlSupported || isExporting) return;
    if (!selectedVideo || !diskPath) return;
    if (!isPlaying) return;

    const tick = () => {
      const t = useStore.getState().currentTime;
      const mediaT = mediaTimeInClipForPlayhead(selectedVideo, t);
      if (mediaT === null) return;
      void runDetect(mediaT);
    };

    tick();
    const id = window.setInterval(tick, PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    previewOn,
    realtimeOn,
    coreMlSupported,
    isExporting,
    selectedVideo,
    diskPath,
    isPlaying,
    runDetect
  ]);

  // 停止中: スクラブにデバウンス
  useEffect(() => {
    if (!previewOn || !realtimeOn || !coreMlSupported || isExporting) return;
    if (!selectedVideo || !diskPath) return;
    if (isPlaying) return;

    const mediaT = mediaTimeInClipForPlayhead(selectedVideo, currentTime);
    if (mediaT === null) return;

    const h = window.setTimeout(() => {
      void runDetect(mediaT);
    }, SCRUB_DEBOUNCE_MS);
    return () => window.clearTimeout(h);
  }, [
    previewOn,
    realtimeOn,
    coreMlSupported,
    isExporting,
    selectedVideo,
    diskPath,
    isPlaying,
    currentTime,
    runDetect
  ]);
};
