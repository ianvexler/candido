/** Which entries are near the screen. They tell only those that ask about them. */
export const createNearStore = () => {
  const near = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();

  return {
    has: (key: string) => near.has(key),
    set: (key: string, isNear: boolean) => {
      if (near.has(key) === isNear) return;
      if (isNear) near.add(key);
      else near.delete(key);
      listeners.get(key)?.forEach((listener) => listener());
    },
    subscribe: (key: string, listener: () => void) => {
      const all = listeners.get(key) ?? new Set();
      listeners.set(key, all.add(listener));
      return () => void all.delete(listener);
    },
  };
};

export type NearStore = ReturnType<typeof createNearStore>;

export const entryKey = (sectionId: number, entryId: string) => `${sectionId}:${entryId}`;
