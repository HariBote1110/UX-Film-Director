import { describe, expect, it } from 'vitest';
import {
  classifySharedRendererPreviewComparison,
  type SharedRendererPreviewComparisonReport,
} from './sharedRendererPreviewDiagnostics';

const zeroDiff = {
  maxChannelDelta: 0,
  meanAbsoluteError: 0,
};

const visibleDiff = {
  maxChannelDelta: 12,
  meanAbsoluteError: 1.5,
};

describe('classifySharedRendererPreviewComparison', () => {
  it('does not make Pixi equality a correctness oracle', () => {
    const report = classifySharedRendererPreviewComparison({
      frameIndex: 120,
      candidateToReference: { status: 'notRun' },
      nativeParity: { status: 'notRun' },
      pixiToCandidate: { status: 'passed', metrics: zeroDiff },
    });

    expect(report).toEqual({
      frameIndex: 120,
      decision: 'triageOnly',
      cause: 'referenceGateMissing',
      metrics: {
        pixiToCandidate: zeroDiff,
      },
    });
  });

  it('rejects the candidate when reference correctness fails even if Pixi matches', () => {
    const report = classifySharedRendererPreviewComparison({
      frameIndex: 121,
      candidateToReference: {
        status: 'failed',
        metrics: visibleDiff,
        cause: 'PixelValueDelta',
      },
      nativeParity: { status: 'passed', metrics: zeroDiff },
      pixiToCandidate: { status: 'passed', metrics: zeroDiff },
    });

    expect(report).toEqual({
      frameIndex: 121,
      decision: 'rejected',
      cause: 'referenceFailure',
      metrics: {
        candidateToReference: visibleDiff,
        nativeParity: zeroDiff,
        pixiToCandidate: zeroDiff,
      },
      failures: [
        {
          gate: 'candidateToReference',
          cause: 'PixelValueDelta',
        },
      ],
    });
  });

  it('classifies Pixi-only drift as legacy triage when reference gates pass', () => {
    const report = classifySharedRendererPreviewComparison({
      frameIndex: 122,
      candidateToReference: { status: 'passed', metrics: zeroDiff },
      nativeParity: { status: 'passed', metrics: zeroDiff },
      pixiToCandidate: {
        status: 'failed',
        metrics: visibleDiff,
        cause: 'PixelValueDelta',
      },
    });

    expect(report).toEqual({
      frameIndex: 122,
      decision: 'needsLegacyTriage',
      cause: 'legacyPixiDrift',
      metrics: {
        candidateToReference: zeroDiff,
        nativeParity: zeroDiff,
        pixiToCandidate: visibleDiff,
      },
      failures: [
        {
          gate: 'pixiToCandidate',
          cause: 'PixelValueDelta',
        },
      ],
    });
  });

  it('keeps comparison reports metric-only and never includes frame payloads', () => {
    const report: SharedRendererPreviewComparisonReport = classifySharedRendererPreviewComparison({
      frameIndex: 123,
      candidateToReference: { status: 'passed', metrics: zeroDiff },
      nativeParity: { status: 'passed', metrics: zeroDiff },
      pixiToCandidate: { status: 'passed', metrics: zeroDiff },
    });

    expect(report).toEqual({
      frameIndex: 123,
      decision: 'accepted',
      cause: 'referenceAndNativeParityPassed',
      metrics: {
        candidateToReference: zeroDiff,
        nativeParity: zeroDiff,
        pixiToCandidate: zeroDiff,
      },
    });

    const encoded = JSON.stringify(report).toLowerCase();
    expect(encoded).not.toContain('pixelarray');
    expect(encoded).not.toContain('framebytes');
    expect(encoded).not.toContain('base64');
    expect(encoded).not.toContain('rgba');
  });
});
