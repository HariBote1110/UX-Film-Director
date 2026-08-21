import { describe, expect, it } from 'vitest';
import {
  buildFfmpegNotFoundMessage,
  resolveFfmpegPath,
  resolveFfprobePath,
} from './ffmpegResolve';

describe('ffmpegResolve', () => {
  describe('resolveFfmpegPath', () => {
    it('環境変数 UXFD_FFMPEG_BIN が設定されていれば最優先で使う', () => {
      const result = resolveFfmpegPath({
        platform: 'darwin',
        env: { UXFD_FFMPEG_BIN: '/custom/ffmpeg' },
        existsSync: () => false,
        homedir: () => '/Users/tester',
      });
      expect(result).toBe('/custom/ffmpeg');
    });

    it('macOS では homebrew の候補パスを existsSync 順に確認する', () => {
      const seen: string[] = [];
      const result = resolveFfmpegPath({
        platform: 'darwin',
        env: {},
        existsSync: (p) => {
          seen.push(p);
          return p === '/usr/local/bin/ffmpeg';
        },
        homedir: () => '/Users/tester',
      });
      expect(result).toBe('/usr/local/bin/ffmpeg');
      expect(seen[0]).toBe('/opt/homebrew/bin/ffmpeg');
    });

    it('macOS でどの固定パスにも存在しなければ PATH 頼みの ffmpeg を返す', () => {
      const result = resolveFfmpegPath({
        platform: 'darwin',
        env: {},
        existsSync: () => false,
        homedir: () => '/Users/tester',
      });
      expect(result).toBe('ffmpeg');
    });

    it('Windows では winget のシムディレクトリを確認する', () => {
      const wingetPath =
        'C:\\Users\\tester\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe';
      const result = resolveFfmpegPath({
        platform: 'win32',
        env: {},
        existsSync: (p) => p === wingetPath,
        homedir: () => 'C:\\Users\\tester',
      });
      expect(result).toBe(wingetPath);
    });

    it('Windows で winget シムも見つからなければ PATH 頼みの ffmpeg.exe を返す', () => {
      const result = resolveFfmpegPath({
        platform: 'win32',
        env: {},
        existsSync: () => false,
        homedir: () => 'C:\\Users\\tester',
      });
      expect(result).toBe('ffmpeg.exe');
    });
  });

  describe('resolveFfprobePath', () => {
    it('環境変数 UXFD_FFPROBE_BIN が設定されていれば最優先で使う', () => {
      const result = resolveFfprobePath({
        platform: 'darwin',
        env: { UXFD_FFPROBE_BIN: '/custom/ffprobe' },
        existsSync: () => false,
        homedir: () => '/Users/tester',
      });
      expect(result).toBe('/custom/ffprobe');
    });

    it('Windows で winget シムも見つからなければ PATH 頼みの ffprobe.exe を返す', () => {
      const result = resolveFfprobePath({
        platform: 'win32',
        env: {},
        existsSync: () => false,
        homedir: () => 'C:\\Users\\tester',
      });
      expect(result).toBe('ffprobe.exe');
    });
  });

  describe('buildFfmpegNotFoundMessage', () => {
    it('Windows 向けには winget での導入方法と PATH の案内を含む', () => {
      const message = buildFfmpegNotFoundMessage({
        platform: 'win32',
        binaryLabel: 'ffmpeg',
      });
      expect(message).toContain('ffmpeg');
      expect(message).toContain('winget');
      expect(message).toContain('PATH');
    });

    it('macOS 向けには brew での導入方法を含む', () => {
      const message = buildFfmpegNotFoundMessage({
        platform: 'darwin',
        binaryLabel: 'ffmpeg',
      });
      expect(message).toContain('brew');
    });
  });
});
