import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { writeToRustBackendStdin, type WritableStdinLike } from '../../electron/rustBackendStdinWrite';

/**
 * rust-backend sidecar が停止した後に stdin へ書き込むと EPIPE が発生する。
 * 実機では Writable の 'error' イベントに listener が無く、Node が
 * それを Uncaught Exception としてスローして Electron main プロセスごと
 * 落としていた（実測ログ: `Uncaught Exception: Error: write EPIPE`）。
 *
 * writeToRustBackendStdin は 'error' イベントを必ず処理し、onError
 * コールバックへエラーを渡すだけで例外を伝播させないことを保証する。
 */
class FakeStdin extends EventEmitter implements WritableStdinLike {
  public writeCalls: string[] = [];
  private readonly writeImplementation: (
    chunk: string,
    callback?: (error: Error | null | undefined) => void
  ) => boolean;

  constructor(
    writeImplementation: (
      chunk: string,
      callback?: (error: Error | null | undefined) => void
    ) => boolean
  ) {
    super();
    this.writeImplementation = writeImplementation;
  }

  write(chunk: string, callback?: (error: Error | null | undefined) => void): boolean {
    this.writeCalls.push(chunk);
    return this.writeImplementation(chunk, callback);
  }
}

describe('writeToRustBackendStdin', () => {
  it('EPIPEのwriteコールバックエラーを例外を投げずにonErrorへ渡す', () => {
    const epipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const stdin = new FakeStdin((_chunk, callback) => {
      callback?.(epipeError);
      return true;
    });
    const onError = vi.fn();

    expect(() => {
      writeToRustBackendStdin(stdin, 'payload', onError);
    }).not.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toContain('EPIPE');
  });

  it("stdinの'error'イベントがEPIPEで発火してもプロセスへ例外が伝播しない", () => {
    const stdin = new FakeStdin(() => true);
    const onError = vi.fn();

    expect(() => {
      writeToRustBackendStdin(stdin, 'payload', onError);
      // Node の実挙動を模して、write() のコールバックとは別に
      // 'error' イベントも発火させる。listener が無い場合はここで
      // Node がプロセスを落とす（EventEmitter の仕様）。
      stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    }).not.toThrow();

    expect(onError).toHaveBeenCalled();
  });

  it('書き込みが成功した場合はonErrorを呼ばない', () => {
    const stdin = new FakeStdin((_chunk, callback) => {
      callback?.(null);
      return true;
    });
    const onError = vi.fn();

    writeToRustBackendStdin(stdin, 'payload', onError);

    expect(onError).not.toHaveBeenCalled();
    expect(stdin.writeCalls).toEqual(['payload']);
  });

  it('write自体が同期的にthrowしてもonErrorへ渡す', () => {
    const stdin = new FakeStdin(() => {
      throw Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    });
    const onError = vi.fn();

    expect(() => {
      writeToRustBackendStdin(stdin, 'payload', onError);
    }).not.toThrow();

    expect(onError).toHaveBeenCalledTimes(1);
  });

  /**
   * writeToRustBackendStdin は呼び出しのたびに 'error' listener を
   * 追加していたため、プレビュー更新など高頻度の書き込みで同じ stdin に
   * listener が無制限に積み上がり、Node の
   * MaxListenersExceededWarning（実測: 11 error listeners on Socket）を
   * 引き起こしていた。同じ stdin に対しては 'error' listener を1本だけ
   * 登録し、以降の書き込みは listener の差し替え（最新の onError への
   * 転送）のみで済ませることを固定する。
   */
  it('同じstdinに複数回writeしてもerrorリスナーは1本しか登録されない', () => {
    const stdin = new FakeStdin(() => true);
    const onError = vi.fn();

    for (let i = 0; i < 20; i += 1) {
      writeToRustBackendStdin(stdin, `payload-${i}`, onError);
    }

    expect(stdin.listenerCount('error')).toBe(1);
  });

  it("複数回writeした後の'error'イベントは最新のonErrorへ転送される", () => {
    const stdin = new FakeStdin(() => true);
    const firstOnError = vi.fn();
    const latestOnError = vi.fn();

    writeToRustBackendStdin(stdin, 'payload-1', firstOnError);
    writeToRustBackendStdin(stdin, 'payload-2', latestOnError);

    const epipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    stdin.emit('error', epipeError);

    expect(latestOnError).toHaveBeenCalledTimes(1);
    expect(latestOnError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(latestOnError.mock.calls[0][0].message).toContain('EPIPE');
    expect(firstOnError).not.toHaveBeenCalled();
  });
});
