import React from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { useTranslation } from '../i18n';
import type { ExportPhase, ExportProgress } from '../store/useStore';
import type { RustBackendNativeRenderOutputReleaseEvent } from '../utils/rustBackendVideoEncodeExport';

const phaseLabelKey: Record<ExportPhase, 'exportPhasePreparing' | 'exportPhaseTranscoding' | 'exportPhaseRendering' | 'exportPhaseSaving' | 'exportPhaseCancelling'> = {
  preparing: 'exportPhasePreparing',
  transcoding: 'exportPhaseTranscoding',
  rendering: 'exportPhaseRendering',
  saving: 'exportPhaseSaving',
  cancelling: 'exportPhaseCancelling',
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
  const fallback = event.legacyCanvasFallbackAllowed
    ? (language === 'ja' ? 'legacy fallback可' : 'legacy fallback allowed')
    : (language === 'ja' ? 'legacy fallback不可' : 'legacy fallback disabled');
  const detail = event.detail ? `: ${event.detail}` : '';
  return `Rust frame source: ${status} ${formatRustFrameSourceBlockedReason(event.reason, language)} frame=${event.frameIndex} ${fallback}${detail}`;
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
  return reason;
};

/**
 * 動画書き出し中に進捗とキャンセルボタンを表示するモーダル。
 * `isExporting` が true のあいだだけ表示される。
 */
const ExportProgressModal: React.FC = () => {
  const { isExporting, exportProgress, exportCancelRequested, requestExportCancel, language } = useStore((state) => ({
    isExporting: state.isExporting,
    exportProgress: state.exportProgress,
    exportCancelRequested: state.exportCancelRequested,
    requestExportCancel: state.requestExportCancel,
    language: state.language,
  }), shallow);

  const t = useTranslation(language);

  if (!isExporting) return null;

  const phase: ExportPhase = exportProgress?.phase ?? 'preparing';
  const totalFrames = exportProgress?.totalFrames ?? 0;
  const currentFrame = exportProgress?.currentFrame ?? 0;
  // レンダリング中かつ総フレーム数が判明しているときだけ確定プログレスを出す。
  const isDeterminate = phase === 'rendering' && totalFrames > 0;
  const ratio = isDeterminate ? Math.min(1, currentFrame / totalFrames) : 0;
  const percent = Math.round(ratio * 100);
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

        <div className="export-modal-bar">
          <div
            className={`export-modal-bar-fill${isDeterminate ? '' : ' export-modal-bar-indeterminate'}`}
            style={isDeterminate ? { width: `${percent}%` } : undefined}
          />
        </div>

        {isDeterminate && (
          <div className="export-modal-stats">
            <span>{t('exportFrameProgress')} {currentFrame} / {totalFrames}</span>
            <span>{percent}%</span>
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
