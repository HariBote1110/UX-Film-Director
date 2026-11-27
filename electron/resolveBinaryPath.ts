export interface ResolveBinaryPathInput {
  requestedPath: string | undefined;
  requestedPathLabel: string;
  candidates: readonly string[];
  exists: (candidate: string) => boolean;
}

export const resolveBinaryPath = ({
  requestedPath,
  requestedPathLabel,
  candidates,
  exists,
}: ResolveBinaryPathInput): string | null => {
  if (requestedPath) {
    if (!exists(requestedPath)) {
      throw new Error(`${requestedPathLabel} points to a missing binary: ${requestedPath}`);
    }
    return requestedPath;
  }

  return candidates.find(exists) ?? null;
};
