import React from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from '../i18n';
import type { ExportDiagnostics, ExportPhase, ExportProgress } from '../store/useStore';
import type { RustBackendNativeRenderOutputReleaseEvent } from '../utils/rustBackendVideoEncodeExport';
import { isRustFrameSourceLegacyCanvasFallbackAllowed } from '../utils/rustFrameSourceBlockedFallback';

const phaseLabelKey: Record<ExportPhase, 'exportPhasePreparing' | 'exportPhaseTranscoding' | 'exportPhaseRendering' | 'exportPhaseSaving' | 'exportPhaseCancelling'> = {
  preparing: 'exportPhasePreparing',
  transcoding: 'exportPhaseTranscoding',
  rendering: 'exportPhaseRendering',
  saving: 'exportPhaseSaving',
  cancelling: 'exportPhaseCancelling',
};

export interface ExportProgressPresentation {
  isDeterminate: boolean;
  ratio: number;
  percent: number;
  statsLines: string[];
}

export const getExportProgressPresentation = (
  progress: ExportProgress,
  language: 'ja' | 'en',
  nowMs = Date.now()
): ExportProgressPresentation => {
  const totalFrames = progress.totalFrames;
  const currentFrame = progress.currentFrame;
  const isDeterminate = (
    progress.phase === 'transcoding'
    || progress.phase === 'rendering'
    || progress.phase === 'saving'
  ) && totalFrames > 0;
  const ratio = isDeterminate ? Math.min(1, Math.max(0, currentFrame / totalFrames)) : 0;
  const percent = Math.round(ratio * 100);
  const frameLabel = language === 'ja' ? 'フレーム' : 'Frame';
  const statsLines: string[] = [];

  if (isDeterminate) {
    statsLines.push(`${frameLabel} ${currentFrame} / ${totalFrames}`);
    statsLines.push(`${language === 'ja' ? '進捗' : 'Progress'} ${percent}%`);
    if (progress.phase === 'transcoding' && typeof progress.startedAtMs === 'number') {
      const elapsedSeconds = Math.max(0, (nowMs - progress.startedAtMs) / 1000);
      const elapsedLabel = language === 'ja' ? '経過' : 'Elapsed';
      const secondsLabel = language === 'ja' ? '秒' : 's';
      statsLines.push(`${elapsedLabel} ${elapsedSeconds.toFixed(1)} ${secondsLabel}`);
    }
  } else if (progress.phase === 'transcoding' && totalFrames > 0) {
    const targetLabel = language === 'ja' ? '処理対象' : 'Target';
    statsLines.push(`${targetLabel} ${totalFrames} ${frameLabel.toLowerCase()}`);
    if (typeof progress.startedAtMs === 'number') {
      const elapsedSeconds = Math.max(0, (nowMs - progress.startedAtMs) / 1000);
      const elapsedLabel = language === 'ja' ? '経過' : 'Elapsed';
      const secondsLabel = language === 'ja' ? '秒' : 's';
      statsLines.push(`${elapsedLabel} ${elapsedSeconds.toFixed(1)} ${secondsLabel}`);
    }
  }

  return {
    isDeterminate,
    ratio,
    percent,
    statsLines,
  };
};

export const formatNativeRenderOutputReleaseDiagnostic = (
  event: RustBackendNativeRenderOutputReleaseEvent,
  language: 'ja' | 'en'
): string => {
  if (event.status === 'released') {
    const status = language === 'ja' ? '解放済み' : 'released';
    return `Native render output: ${status} (${event.memoryId})`;
  }
  if (event.status === 'missingBridge') {
    const status = language === 'ja' ? 'release bridge未接続' : 'missing release bridge';
    return `Native render output: ${status} (${event.memoryId})`;
  }
  if (event.status === 'failed') {
    const status = language === 'ja' ? '解放失敗' : 'release failed';
    const suffix = event.error ? ` ${event.error}` : '';
    return `Native render output: ${status} (${event.memoryId})${suffix}`;
  }
  return language === 'ja'
    ? 'Native render output: 対象外'
    : 'Native render output: skipped';
};

export const formatRustFrameSourceBlockedDiagnostic = (
  event: NonNullable<ExportProgress['rustFrameSourceBlocked']>,
  language: 'ja' | 'en'
): string => {
  const status = language === 'ja' ? '停止' : 'blocked';
  const fallback = isRustFrameSourceLegacyCanvasFallbackAllowed(event)
    ? (language === 'ja' ? 'legacy fallback可' : 'legacy fallback allowed')
    : (language === 'ja' ? 'legacy fallback不可' : 'legacy fallback disabled');
  const detail = event.detail ? `: ${event.detail}` : '';
  return `Rust frame source: ${status} ${formatRustFrameSourceBlockedReason(event.reason, language)} frame=${event.frameIndex} ${fallback}${detail}`;
};

export const formatLastExportDiagnosticsSummary = (
  diagnostics: ExportDiagnostics | null,
  language: 'ja' | 'en'
): string[] => {
  if (!diagnostics) return [];
  const lines: string[] = [];
  if (diagnostics.exportFrameSourcePlanFailure) {
    const failure = diagnostics.exportFrameSourcePlanFailure;
    lines.push(`Rust frame source plan: ${formatExportFrameSourcePlanFailureReason(failure.reason, language)}: ${failure.detail}`);
  }
  if (diagnostics.rustFrameSourceBlocked) {
    lines.push(formatRustFrameSourceBlockedDiagnostic(diagnostics.rustFrameSourceBlocked, language));
  }
  if (diagnostics.nativeRenderOutputRelease) {
    lines.push(formatNativeRenderOutputReleaseDiagnostic(diagnostics.nativeRenderOutputRelease, language));
  }
  return lines;
};

const formatExportFrameSourcePlanFailureReason = (
  reason: string,
  language: 'ja' | 'en'
): string => {
  if (reason === 'rustFrameSourceRequired') {
    return language === 'ja'
      ? 'Rust frame source必須'
      : 'Rust frame source required';
  }
  if (reason === 'exportFrameSourceUnavailable') {
    return language === 'ja'
      ? 'export frame sourceなし'
      : 'export frame source unavailable';
  }
  return reason;
};

const formatRustFrameSourceBlockedReason = (
  reason: string,
  language: 'ja' | 'en'
): string => {
  if (reason === 'nativeRenderFailed') {
    return language === 'ja'
      ? 'Rust native render失敗'
      : 'native render failed';
  }
  if (reason === 'nativeRenderOutputReleaseFailed') {
    return language === 'ja'
      ? 'native render output解放失敗'
      : 'native render output release failed';
  }
  if (reason === 'nativeRenderSourceReleaseFailed') {
    return language === 'ja'
      ? 'native render source解放失敗'
      : 'native render source release failed';
  }
  if (reason === 'presentedSharedFrameHandoffFailed') {
    return language === 'ja'
      ? 'presented shared-frame受け渡し失敗'
      : 'presented shared-frame handoff failed';
  }
  if (reason === 'videoOwnershipUnavailable') {
    return language === 'ja'
      ? '動画所有権未移管'
      : 'video ownership unavailable';
  }
  if (reason === 'sharedRendererOutputUnavailable') {
    return language === 'ja'
      ? 'shared renderer実出力なし'
      : 'shared renderer output unavailable';
  }
  if (reason === 'webGpuDrawUnavailable') {
    return language === 'ja'
      ? 'WebGPU描画不可'
      : 'WebGPU draw unavailable';
  }
  if (reason === 'nativeRenderTextureViewUnavailable') {
    return language === 'ja'
      ? 'native render texture viewなし'
      : 'native render texture view unavailable';
  }
  return reason;
};

/**
 * 動画書き出し中に進捗とキャンセルボタンを表示するモーダル。
 * `isExporting` が true のあいだだけ表示される。
 */
const ExportProgressModal: React.FC = () => {
  const {
    isExporting, exportProgress, lastExportDiagnostics, exportCancelRequested, requestExportCancel, language,
  } = useStore((state) => ({
    isExporting: state.isExporting,
    exportProgress: state.exportProgress,
    lastExportDiagnostics: state.lastExportDiagnostics,
    exportCancelRequested: state.exportCancelRequested,
    requestExportCancel: state.requestExportCancel,
    language: state.language,
  }), shallow);

  const t = useTranslation(language);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!isExporting) return undefined;
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(intervalId);
  }, [isExporting]);

  if (!isExporting) {
    const lastDiagnostics = formatLastExportDiagnosticsSummary(lastExportDiagnostics, language);
    if (lastDiagnostics.length === 0) return null;
    return (
      <div className="export-diagnostics-toast" role="status" aria-live="polite">
        {lastDiagnostics.map((line) => (
          <div key={line} className="export-diagnostics-toast-line">{line}</div>
        ))}
      </div>
    );
  }

  const phase: ExportPhase = exportProgress?.phase ?? 'preparing';
  const stepDetail = exportProgress?.stepDetail ?? null;
  const progressPresentation = getExportProgressPresentation(
    exportProgress ?? { phase, currentFrame: 0, totalFrames: 0 },
    language,
    nowMs
  );
  const nativeRenderOutputReleaseDiagnostic = exportProgress?.nativeRenderOutputRelease
    ? formatNativeRenderOutputReleaseDiagnostic(exportProgress.nativeRenderOutputRelease, language)
    : null;
  const rustFrameSourceBlockedDiagnostic = exportProgress?.rustFrameSourceBlocked
    ? formatRustFrameSourceBlockedDiagnostic(exportProgress.rustFrameSourceBlocked, language)
    : null;

  return (
    <div className="export-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('exportingVideo')}>
      <div className="export-modal glass">
        <div className="export-modal-title">
          <div className="export-dot" />
          {t('exportingVideo')}
        </div>

        <div className="export-modal-phase">{t(phaseLabelKey[phase])}</div>

        {stepDetail && (
          <div className="export-modal-step-detail">
            {stepDetail}
          </div>
        )}

        <div className="export-modal-bar">
          <div
            className={`export-modal-bar-fill${progressPresentation.isDeterminate ? '' : ' export-modal-bar-indeterminate'}`}
            style={progressPresentation.isDeterminate ? { width: `${progressPresentation.percent}%` } : undefined}
          />
        </div>

        {progressPresentation.statsLines.length > 0 && (
          <div className="export-modal-stats">
            {progressPresentation.statsLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        )}

        {nativeRenderOutputReleaseDiagnostic && (
          <div className="export-modal-native-release">
            {nativeRenderOutputReleaseDiagnostic}
          </div>
        )}

        {rustFrameSourceBlockedDiagnostic && (
          <div className="export-modal-frame-source-blocked">
            {rustFrameSourceBlockedDiagnostic}
          </div>
        )}

        <div className="export-modal-actions">
          <button
            type="button"
            className="export-modal-cancel"
            onClick={requestExportCancel}
            disabled={exportCancelRequested}
          >
            {exportCancelRequested ? t('exportPhaseCancelling') : t('exportCancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportProgressModal;
