export interface WritableErrorLike {
  message?: string;
}

export type StdinWriteCallback = (error: Error | null | undefined) => void;

export interface WritableStdinLike {
  write(chunk: string, callback?: StdinWriteCallback): boolean;
  on(event: 'error', listener: (error: WritableErrorLike) => void): unknown;
}

const toError = (error: WritableErrorLike | Error | unknown): Error =>
  error instanceof Error ? error : new Error(String((error as WritableErrorLike)?.message ?? error));

// stdin ごとに「現在の onError へ転送するだけの」ガードリスナーを1本だけ登録する。
// このリスナー自体は stdin の寿命の間ずっと張り続けるが、呼び出しのたびに
// 積み上がることはない。転送先の onError だけを WeakMap で差し替える。
const currentOnErrorByStdin = new WeakMap<WritableStdinLike, (error: Error) => void>();

/**
 * rust-backend sidecar の stdin へ安全に書き込む。
 *
 * Node の Writable は write() のコールバックへエラーを渡すのに加えて、
 * 同じエラーで 'error' イベントも発火する。'error' イベントに listener が
 * 一つも登録されていない場合、Node はそれを Uncaught Exception として
 * スローし、Electron の main プロセスごとクラッシュさせる
 * （実測ログ: `Uncaught Exception: Error: write EPIPE`。
 * wgpu の panic で sidecar が死んだ直後の stdin.write で発生していた）。
 *
 * この関数は書き込み前に 'error' listener を登録し、EPIPE 等の書き込み
 * エラーを例外ではなく onError コールバックへ伝播させることで、
 * プロセスが落ちずに済むようにする。
 *
 * 書き込みは（プレビュー更新など）高頻度に発生しうるため、呼び出しの
 * たびに 'error' listener を追加すると同じ stdin に listener が無制限に
 * 積み上がり、Node の MaxListenersExceededWarning を引き起こす。
 * そのため 'error' listener は stdin ごとに1本だけ登録し、以降の呼び出しは
 * 転送先の onError を差し替えるだけにする。
 */
export const writeToRustBackendStdin = (
  stdin: WritableStdinLike,
  payload: string,
  onError: (error: Error) => void
): void => {
  if (!currentOnErrorByStdin.has(stdin)) {
    stdin.on('error', (error) => {
      const latestOnError = currentOnErrorByStdin.get(stdin);
      latestOnError?.(toError(error));
    });
  }
  currentOnErrorByStdin.set(stdin, onError);

  try {
    stdin.write(payload, (error) => {
      if (error) {
        onError(toError(error));
      }
    });
  } catch (error) {
    onError(toError(error));
  }
};
