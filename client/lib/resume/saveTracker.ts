/**
 * Tracks resume edits that haven't finished saving (autosave debounce plus
 * the request), so export can wait until the server has the latest text.
 */
const pending = new Set<string>();
let waiters: (() => void)[] = [];

const notifyIfIdle = () => {
  if (pending.size > 0) return;
  const ready = waiters;
  waiters = [];
  ready.forEach((resolve) => resolve());
};

export const markPending = (key: string) => {
  pending.add(key);
};

export const markSettled = (key: string) => {
  if (!pending.delete(key)) return;
  notifyIfIdle();
};

/** Resolves true once nothing is pending, or false if `timeoutMs` passes first. */
export const waitForSaves = (timeoutMs = 3000): Promise<boolean> => {
  if (pending.size === 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    const onIdle = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      waiters = waiters.filter((waiter) => waiter !== onIdle);
      resolve(false);
    }, timeoutMs);
    waiters.push(onIdle);
  });
};
