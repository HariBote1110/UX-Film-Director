// ffmpeg / ffprobe の実行ファイルをプラットフォームごとに解決するロジック。
// macOS(Homebrew) / Windows(winget) の代表的なインストール先を優先的に確認し、
// どれも見つからなければ PATH 解決に委ねる。
//
// 同梱(バンドル)は行わない方針（windows_port_research 側の判断を参照）。
// 見つからなかった場合に備えて buildFfmpegNotFoundMessage() で
// 実行可能なエラーメッセージを組み立てる。

import path from 'node:path';

// Windows パスの組み立ては、実行中の OS が macOS/Linux（テスト実行環境）でも
// 正しく `\` 区切りになるよう常に path.win32 を使う。
const winPath = path.win32;

export interface FfmpegResolveDeps {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  existsSync: (candidate: string) => boolean;
  homedir: () => string;
}

type BinaryKind = 'ffmpeg' | 'ffprobe';

const resolveBinary = (kind: BinaryKind, deps: FfmpegResolveDeps): string => {
  const overrideEnvKey = kind === 'ffmpeg' ? 'UXFD_FFMPEG_BIN' : 'UXFD_FFPROBE_BIN';
  const override = deps.env[overrideEnvKey];
  if (override) {
    return override;
  }

  if (deps.platform === 'win32') {
    // winget でインストールした CLI は
    // %LOCALAPPDATA%\Microsoft\WinGet\Links\ に実行ファイルへのシムを作る。
    // winget 自体が PATH に追加した変更は既存シェルセッションに反映されないことがあるため、
    // ここを直接確認しておくと「winget でインストール直後」でも解決できる。
    const wingetLinkDir = winPath.join(
      deps.homedir(),
      'AppData',
      'Local',
      'Microsoft',
      'WinGet',
      'Links',
    );
    const wingetCandidate = winPath.join(wingetLinkDir, `${kind}.exe`);
    if (deps.existsSync(wingetCandidate)) {
      return wingetCandidate;
    }
    return `${kind}.exe`;
  }

  const candidates = [
    `/opt/homebrew/bin/${kind}`,
    `/usr/local/bin/${kind}`,
  ];

  for (const candidate of candidates) {
    if (deps.existsSync(candidate)) {
      return candidate;
    }
  }

  return kind;
};

export const resolveFfmpegPath = (deps: FfmpegResolveDeps): string => resolveBinary('ffmpeg', deps);

export const resolveFfprobePath = (deps: FfmpegResolveDeps): string => resolveBinary('ffprobe', deps);

export interface FfmpegNotFoundMessageOptions {
  platform: NodeJS.Platform;
  binaryLabel: BinaryKind;
}

export const buildFfmpegNotFoundMessage = ({
  platform,
  binaryLabel,
}: FfmpegNotFoundMessageOptions): string => {
  if (platform === 'win32') {
    return (
      `${binaryLabel} が見つかりませんでした。Windows では ${binaryLabel} を同梱していないため、` +
      `事前にインストールしてください。` +
      `winget install ffmpeg -e --id=Gyan.FFmpeg でインストールしたのち、` +
      `新しいターミナル（または PowerShell）を開き直して PATH に ffmpeg が反映されているか` +
      `確認してください（winget が追加した PATH の変更は、既に開いているセッションには反映されません）。`
    );
  }

  return (
    `${binaryLabel} が見つかりませんでした。` +
    `brew install ffmpeg でインストールするか、` +
    `UXFD_${binaryLabel.toUpperCase()}_BIN 環境変数で実行ファイルの場所を指定してください。`
  );
};
