import { existsSync as defaultExistsSync } from 'node:fs'
import path from 'node:path'

export interface ResolveSharedVideoFrameNativeBridgeModulePathInput {
  env?: Record<string, string | undefined>
  cwd: string
  resourcesPath?: string
  existsSync?: (candidate: string) => boolean
}

export const resolveSharedVideoFrameNativeBridgeModulePath = ({
  env = process.env,
  cwd,
  resourcesPath,
  existsSync = defaultExistsSync,
}: ResolveSharedVideoFrameNativeBridgeModulePathInput): string | null => {
  const explicitPath = env.UXFD_SHARED_VIDEO_FRAME_BRIDGE_MODULE?.trim()
  if (explicitPath) {
    return explicitPath
  }

  const candidates = [
    path.join(cwd, 'shared-video-frame-bridge-node', 'shared-video-frame-bridge.node'),
    resourcesPath
      ? path.join(resourcesPath, 'shared-video-frame-bridge', 'shared-video-frame-bridge.node')
      : null,
  ].filter((candidate): candidate is string => typeof candidate === 'string')

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}
