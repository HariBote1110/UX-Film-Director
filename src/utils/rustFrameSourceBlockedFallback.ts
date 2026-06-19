export interface RustFrameSourceBlockedFallbackInput {
  reason: string;
  legacyCanvasFallbackAllowed: boolean;
}

const rustVideoRequiredBlockedReasons = new Set([
  'videoOwnershipUnavailable',
  'videoUploadFailed',
]);

export const isRustFrameSourceLegacyCanvasFallbackAllowed = ({
  reason,
  legacyCanvasFallbackAllowed,
}: RustFrameSourceBlockedFallbackInput): boolean => (
  rustVideoRequiredBlockedReasons.has(reason)
    ? false
    : legacyCanvasFallbackAllowed
);
