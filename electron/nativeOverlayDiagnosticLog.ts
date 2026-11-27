export const formatNativeOverlayDiagnosticLog = (
  eventName: string,
  payload: unknown,
): string => {
  const jsonPayload = JSON.stringify(payload);
  return `[NativeOverlay] ${eventName} ${jsonPayload ?? 'null'}`;
};
