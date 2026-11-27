import puppeteer, { Browser } from "puppeteer-core";

/** How many PDFs are made at once: each is a page in Chrome, and Chrome is the server's memory. */
const AT_ONCE = 2;

let launching: Promise<Browser> | null = null;
let running = 0;
const waiting: (() => void)[] = [];

const launch = () =>
  puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    args: [
      // Containers have no user namespaces for Chrome's sandbox; it only opens our own pages.
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      // Lets the server's Chrome reach the user's own address, e.g. localhost from inside Docker.
      ...(process.env.PDF_HOST_RESOLVER_RULES ? [`--host-resolver-rules=${process.env.PDF_HOST_RESOLVER_RULES}`] : []),
    ],
  });

/** One Chrome for every PDF, started when first needed and again if it has gone. */
const browser = async (): Promise<Browser> => {
  const current = launching && (await launching.catch(() => null));
  if (current?.connected) return current;
  launching = launch();
  return launching;
};

const take = () =>
  running < AT_ONCE
    ? Promise.resolve(void running++)
    : new Promise<void>((done) => waiting.push(() => done(void running++)));

const give = () => {
  running--;
  waiting.shift()?.();
};

/** Runs `use` with the shared Chrome, at most AT_ONCE at a time; the rest wait their turn. */
export const withBrowser = async <T>(use: (browser: Browser) => Promise<T>): Promise<T> => {
  await take();
  try {
    return await use(await browser());
  } finally {
    give();
  }
};
