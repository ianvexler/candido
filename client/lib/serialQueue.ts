/**
 * Runs async tasks one at a time, in the order they were queued. Used for
 * saves that would otherwise race, where the last one sent must also be the
 * last one applied. A failed task doesn't block the ones after it.
 */
export const createSerialQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.catch(() => undefined);
      return result;
    },
  };
};
