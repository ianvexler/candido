import puppeteer, { Browser } from "puppeteer-core";

/** How many PDFs are made at once: each is a page in Chrome, and Chrome is the server's memory. */
const AT_ONCE = 2;
/** How many may wait for a turn; more are turned away rather than queued without end. */
const WAITING = 8;
/** Chrome's own limit for any one command, so a stuck Chrome can't hold a turn for minutes. */
const PROTOCOL_TIMEOUT = 25_000;

/** No turn: too many waiting, or the user left first. */
export class NoTurn extends Error {}

let launching: Promise<Browser> | null = null;
let running = 0;
const waiting: { go: () => void; drop: (error: Error) => void }[] = [];

const launch = () =>
  puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    protocolTimeout: PROTOCOL_TIMEOUT,
    args: [
      // Containers have no user namespaces for Chrome's sandbox; it only opens our own pages.
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      // Lets the server's Chrome reach the user's own address, e.g. localhost from inside Docker.
      ...(process.env.PDF_HOST_RESOLVER_RULES ? [`--host-resolver-rules=${process.env.PDF_HOST_RESOLVER_RULES}`] : []),
      // Trusts our own site's certificate where it isn't publicly trusted (e.g. Cloudflare's origin one).
      ...(process.env.PDF_IGNORE_CERT_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.PDF_IGNORE_CERT_SPKI}`] : []),
    ],
  });

/** One Chrome for every PDF, started when first needed and once more each time it has gone. */
export const sharedBrowser = async (): Promise<Browser> => {
  const asked = launching;
  const current = asked && (await asked.catch(() => null));
  if (current?.connected) return current;
  // Whoever finds it gone first starts the next; the rest use that one.
  if (launching === asked) {
    current?.process()?.kill("SIGKILL");
    launching = launch();
    launching.catch(() => {
      // A failed start is tried again by the next export.
    });
  }
  return launching!;
};

/** Ends a Chrome that may be stuck: the next export starts another. */
export const dropBrowser = async (browser: Browser) => {
  browser.process()?.kill("SIGKILL");
  if (launching && (await launching.catch(() => null)) === browser) launching = null;
};

/** Waits for a turn: at most AT_ONCE at a time, WAITING in line, none once `signal` aborts. */
const take = (signal?: AbortSignal) => {
  if (signal?.aborted) return Promise.reject(new NoTurn());
  if (running < AT_ONCE) {
    running++;
    return Promise.resolve();
  }
  if (waiting.length >= WAITING) return Promise.reject(new NoTurn());
  return new Promise<void>((resolve, reject) => {
    const place = {
      go: () => {
        signal?.removeEventListener("abort", leave);
        running++;
        resolve();
      },
      drop: reject,
    };
    const leave = () => {
      const at = waiting.indexOf(place);
      if (at >= 0) waiting.splice(at, 1);
      reject(signal?.reason instanceof Error ? signal.reason : new NoTurn());
    };
    signal?.addEventListener("abort", leave, { once: true });
    waiting.push(place);
  });
};

const give = () => {
  running--;
  waiting.shift()?.go();
};

/** Runs `work` with the shared Chrome in its turn; `signal` ends the wait for one. */
export const withBrowser = async <T>(work: (browser: Browser) => Promise<T>, signal?: AbortSignal): Promise<T> => {
  await take(signal);
  try {
    return await work(await sharedBrowser());
  } finally {
    give();
  }
};
