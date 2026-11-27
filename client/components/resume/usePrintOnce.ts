import { useEffect } from "react";

// By document: a page restored from the browser's cache, or come back to inside the
// app, was printed by the load it is from.
const printed = new Set<string>();

const frames = (count: number): Promise<void> =>
  count === 0 ? Promise.resolve() : new Promise((done) => requestAnimationFrame(() => void frames(count - 1).then(done)));

/** Once what is shown is laid out and has its fonts. */
const laidOut = async () => {
  // Fonts are asked for by what is laid out.
  await frames(2);
  await document.fonts.ready;
  await frames(1);
};

/** What the server's browser waits for before making the PDF: on `<html>`, as data-pdf-ready and data-pdf-status. */
export type PdfState = { ready: false } | { ready: true } | { ready: "error"; status: 404 | 422 | 500 };

/** Says on `<html>` when the page can be made into a PDF, or why it can't. */
export const usePdfReady = (enabled: boolean, state: PdfState) => {
  const key = state.ready === "error" ? `error:${state.status}` : String(state.ready);
  useEffect(() => {
    if (!enabled || key === "false") return;
    const html = document.documentElement;
    let cancelled = false;
    void (async () => {
      if (key === "true") await laidOut();
      if (cancelled) return;
      const [ready, status] = key.split(":");
      html.dataset.pdfReady = ready;
      if (status) html.dataset.pdfStatus = status;
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);
};

/** Prints once `ready`, laid out and with its fonts. Once for each load of the page. */
export const usePrintOnce = (id: string, ready: boolean) => {
  useEffect(() => {
    if (!ready || printed.has(id)) return;
    let cancelled = false;
    void (async () => {
      await laidOut();
      if (cancelled || printed.has(id)) return;
      printed.add(id);
      window.print();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, ready]);
};
