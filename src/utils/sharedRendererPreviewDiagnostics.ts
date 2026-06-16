export interface SharedRendererPreviewMetrics {
  maxChannelDelta: number;
  meanAbsoluteError: number;
}

export type SharedRendererPreviewGateStatus = 'passed' | 'failed' | 'notRun';

export type SharedRendererPreviewFailureCause =
  | 'PixelValueDelta'
  | 'MeanAbsoluteError'
  | 'PsnrBelowThreshold'
  | 'StructuralSimilarity'
  | 'DimensionMismatch'
  | 'MissingReference';

export type SharedRendererPreviewGateResult =
  | {
      status: 'passed';
      metrics: SharedRendererPreviewMetrics;
    }
  | {
      status: 'failed';
      metrics: SharedRendererPreviewMetrics;
      cause: SharedRendererPreviewFailureCause;
    }
  | {
      status: 'notRun';
    };

export type SharedRendererPreviewComparisonDecision =
  | 'accepted'
  | 'rejected'
  | 'needsLegacyTriage'
  | 'triageOnly';

export type SharedRendererPreviewComparisonCause =
  | 'referenceAndNativeParityPassed'
  | 'referenceFailure'
  | 'nativeParityFailure'
  | 'legacyPixiDrift'
  | 'referenceGateMissing';

export interface SharedRendererPreviewComparisonInput {
  frameIndex: number;
  candidateToReference: SharedRendererPreviewGateResult;
  nativeParity: SharedRendererPreviewGateResult;
  pixiToCandidate: SharedRendererPreviewGateResult;
}

export interface SharedRendererPreviewComparisonFailure {
  gate: 'candidateToReference' | 'nativeParity' | 'pixiToCandidate';
  cause: SharedRendererPreviewFailureCause;
}

export interface SharedRendererPreviewComparisonReport {
  frameIndex: number;
  decision: SharedRendererPreviewComparisonDecision;
  cause: SharedRendererPreviewComparisonCause;
  metrics: {
    candidateToReference?: SharedRendererPreviewMetrics;
    nativeParity?: SharedRendererPreviewMetrics;
    pixiToCandidate?: SharedRendererPreviewMetrics;
  };
  failures?: SharedRendererPreviewComparisonFailure[];
}

export const classifySharedRendererPreviewComparison = ({
  frameIndex,
  candidateToReference,
  nativeParity,
  pixiToCandidate,
}: SharedRendererPreviewComparisonInput): SharedRendererPreviewComparisonReport => {
  const metrics = collectMetrics({ candidateToReference, nativeParity, pixiToCandidate });
  const correctnessFailures = collectFailures({ candidateToReference, nativeParity });

  if (candidateToReference.status === 'notRun' || nativeParity.status === 'notRun') {
    return {
      frameIndex,
      decision: 'triageOnly',
      cause: 'referenceGateMissing',
      metrics,
    };
  }

  if (correctnessFailures.length > 0) {
    const cause = correctnessFailures.some((failure) => failure.gate === 'candidateToReference')
      ? 'referenceFailure'
      : 'nativeParityFailure';
    return {
      frameIndex,
      decision: 'rejected',
      cause,
      metrics,
      failures: correctnessFailures,
    };
  }

  if (pixiToCandidate.status === 'failed') {
    return {
      frameIndex,
      decision: 'needsLegacyTriage',
      cause: 'legacyPixiDrift',
      metrics,
      failures: [
        {
          gate: 'pixiToCandidate',
          cause: pixiToCandidate.cause,
        },
      ],
    };
  }

  return {
    frameIndex,
    decision: 'accepted',
    cause: 'referenceAndNativeParityPassed',
    metrics,
  };
};

const collectMetrics = ({
  candidateToReference,
  nativeParity,
  pixiToCandidate,
}: Pick<
  SharedRendererPreviewComparisonInput,
  'candidateToReference' | 'nativeParity' | 'pixiToCandidate'
>): SharedRendererPreviewComparisonReport['metrics'] => ({
  ...(candidateToReference.status !== 'notRun'
    ? { candidateToReference: candidateToReference.metrics }
    : {}),
  ...(nativeParity.status !== 'notRun'
    ? { nativeParity: nativeParity.metrics }
    : {}),
  ...(pixiToCandidate.status !== 'notRun'
    ? { pixiToCandidate: pixiToCandidate.metrics }
    : {}),
});

const collectFailures = ({
  candidateToReference,
  nativeParity,
}: Pick<
  SharedRendererPreviewComparisonInput,
  'candidateToReference' | 'nativeParity'
>): SharedRendererPreviewComparisonFailure[] => {
  const failures: SharedRendererPreviewComparisonFailure[] = [];
  if (candidateToReference.status === 'failed') {
    failures.push({
      gate: 'candidateToReference',
      cause: candidateToReference.cause,
    });
  }
  if (nativeParity.status === 'failed') {
    failures.push({
      gate: 'nativeParity',
      cause: nativeParity.cause,
    });
  }
  return failures;
};
