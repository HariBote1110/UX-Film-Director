import { existsSync as defaultExistsSync } from 'node:fs'
import path from 'node:path'

export interface ResolveNativeOverlayBridgeModulePathInput {
  env?: Record<string, string | undefined>
  cwd: string
  resourcesPath?: string
  existsSync?: (candidate: string) => boolean
}

export const resolveNativeOverlayBridgeModulePath = ({
  env = process.env,
  cwd,
  resourcesPath,
  existsSync = defaultExistsSync,
}: ResolveNativeOverlayBridgeModulePathInput): string | null => {
  const explicitPath = env.UXFD_NATIVE_OVERLAY_MODULE?.trim()
  if (explicitPath) {
    return explicitPath
  }

  const candidates = [
    path.join(cwd, 'native-overlay', 'native-overlay.node'),
    resourcesPath
      ? path.join(resourcesPath, 'native-overlay', 'native-overlay.node')
      : null,
  ].filter((candidate): candidate is string => typeof candidate === 'string')

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
