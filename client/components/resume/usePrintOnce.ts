import { useEffect } from "react";

// By document: a page restored from the browser's cache, or come back to inside the
// app, was printed by the load it is from.
const printed = new Set<string>();

const frames = (count: number): Promise<void> =>
  count === 0 ? Promise.resolve() : new Promise((done) => requestAnimationFrame(() => void frames(count - 1).then(done)));

/** Prints once `ready`, laid out and with its fonts. Once for each load of the page. */
export const usePrintOnce = (id: string, ready: boolean) => {
  useEffect(() => {
    if (!ready || printed.has(id)) return;
    let cancelled = false;
    void (async () => {
      // Fonts are asked for by what is laid out.
      await frames(2);
      await document.fonts.ready;
      await frames(1);
      if (cancelled || printed.has(id)) return;
      printed.add(id);
      window.print();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, ready]);
};
