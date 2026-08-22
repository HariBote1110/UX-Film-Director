// cargo 実行ファイルをプラットフォームごとに解決するロジック。
// src/utils/ffmpegResolve.ts (W1) と同じ方針: 明示的な override → 既知のインストール先 → PATH 解決委譲。
//
// Windows では対話コンソールの PATH が rustup インストール直後の変更を反映しておらず、
// 素の 'cargo' が ENOENT になるケースが確認されている。ここでは既存の spawn 呼び出しを
// もう一度試す(= 二重に spawn する)コストを避けるため、rustup の既定インストール先
// (~/.cargo/bin) を existsSync で安価に確認し、存在すればそれを優先的に返す。
// bare 'cargo' は「rustup の既定パスが見当たらない」場合のフォールバックとして残し、
// 最終的な解決は呼び出し側の spawn/spawnSync が PATH 上で行う。

import path from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

const winPath = path.win32
const posixPath = path.posix

/**
 * @param {{
 *   platform?: NodeJS.Platform,
 *   env?: Record<string, string | undefined>,
 *   existsSync?: (candidate: string) => boolean,
 *   homedir?: () => string,
 * }} [deps]
 * @returns {string}
 */
export const resolveCargoBin = (deps = {}) => {
  const platform = deps.platform ?? process.platform
  const env = deps.env ?? process.env
  const exists = deps.existsSync ?? existsSync
  const home = deps.homedir ?? homedir

  const override = env.UXFD_CARGO_BIN
  if (override) {
    return override
  }

  const rustupCargoPath = platform === 'win32'
    ? winPath.join(home(), '.cargo', 'bin', 'cargo.exe')
    : posixPath.join(home(), '.cargo', 'bin', 'cargo')

  if (exists(rustupCargoPath)) {
    return rustupCargoPath
  }

  return 'cargo'
}

/**
 * ENOENT 等で cargo の起動に失敗したときの案内メッセージを組み立てる。
 * @param {string} scriptLabel - `[label] ...` の label 部分
 * @returns {string}
 */
export const buildCargoNotFoundHint = (scriptLabel) =>
  `[${scriptLabel}] cargo was not found on PATH nor in ~/.cargo/bin. ` +
  'Install Rust via rustup (https://rustup.rs), or open a new terminal so PATH updates apply.'
