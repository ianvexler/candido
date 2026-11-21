export class PollTimeoutError extends Error {
  constructor() {
    super("Polling timed out");
    this.name = "PollTimeoutError";
  }
}

const abortError = () => new DOMException("Polling was aborted", "AbortError");

/**
 * Calls `fetcher` now and then every `intervalMs` until `isDone(value)` is true.
 * Rejects with PollTimeoutError after `timeoutMs`, or with an AbortError if
 * `signal` aborts. Errors from `fetcher` stop polling and reject.
 */
export const pollUntil = <T>(
  fetcher: () => Promise<T>,
  isDone: (value: T) => boolean,
  { intervalMs, timeoutMs, signal }: { intervalMs: number; timeoutMs: number; signal?: AbortSignal }
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    if (signal?.aborted) return stop();
    signal?.addEventListener("abort", stop, { once: true });

    const finish = (callback: () => void) => {
      signal?.removeEventListener("abort", stop);
      callback();
    };

    const tick = async () => {
      try {
        const value = await fetcher();
        if (signal?.aborted) return;
        if (isDone(value)) return finish(() => resolve(value));
        if (Date.now() + intervalMs > deadline) return finish(() => reject(new PollTimeoutError()));
        timer = setTimeout(tick, intervalMs);
      } catch (error) {
        finish(() => reject(error));
      }
    };

    void tick();
  });
