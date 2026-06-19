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

export const normaliseRustFrameSourceBlockedFallback = <
  T extends RustFrameSourceBlockedFallbackInput
>(blocked: T): T => ({
  ...blocked,
  legacyCanvasFallbackAllowed: isRustFrameSourceLegacyCanvasFallbackAllowed(blocked),
});
