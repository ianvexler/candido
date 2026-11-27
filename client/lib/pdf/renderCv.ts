import { dropBrowser, NoTurn, withBrowser } from "./browser";

/** Why a PDF wasn't made, as the route answers it. */
export class PdfError extends Error {
  constructor(
    readonly status: 401 | 404 | 422 | 500 | 503 | 504,
    message = "Couldn't make the PDF."
  ) {
    super(message);
  }
}

/** Longest an export may take, from asking (waiting for a turn included) to having the file. */
export const PDF_TIMEOUT = 20_000;
/** Longest closing a page may take before Chrome is taken to be stuck. */
const CLOSE_TIMEOUT = 3_000;

/** The sign-in cookie: the only one the server's Chrome is given. */
export const AUTH_COOKIE = "auth_token";

interface RenderOptions {
  id: string;
  /** Where the user has the app: the print page is opened there, as they would see it. */
  origin: string;
  /** The user's sign-in: the page loads the CV as them, so it only gets what they may see. */
  token: string;
  /** Aborts when the user has gone. */
  signal?: AbortSignal;
}

const STATUSES = [401, 404, 422, 500] as const;

const apiOrigin = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").origin;
  } catch {
    return null;
  }
};

const within = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new PdfError(504)), ms))]);

/** The CV's print page made into a PDF by the server's Chrome: the same layout, with no browser headers. */
export const renderCv = async ({ id, origin, token, signal }: RenderOptions): Promise<{ pdf: Uint8Array; name: string }> => {
  const deadline = Date.now() + PDF_TIMEOUT;
  const left = () => Math.max(0, deadline - Date.now());
  // Waiting for a turn counts too: past the deadline, nobody is waiting for the answer.
  const waitOver = AbortSignal.any([AbortSignal.timeout(PDF_TIMEOUT), ...(signal ? [signal] : [])]);
  try {
    return await withBrowser(async (browser) => {
      const context = await within(browser.createBrowserContext(), left());
      let stuck = false;
      try {
        const made = (async () => {
          const page = await context.newPage();
          const api = apiOrigin();
          const urls = api && api !== origin ? [origin, api] : [origin];
          await page.setCookie(...urls.map((url) => ({ name: AUTH_COOKIE, value: token, url })));
          await page.goto(`${origin}/resume/${encodeURIComponent(id)}/print?pdf=1`, { waitUntil: "domcontentloaded", timeout: 0 });
          // Ready, failed, or sent to sign in (the session has ended).
          await page.waitForFunction(
            () => document.documentElement.dataset.pdfReady !== undefined || location.pathname.startsWith("/login"),
            { timeout: 0, polling: 100 }
          );
          const [ready, status, title, path] = await page.evaluate(() => {
            const { dataset } = document.documentElement;
            return [dataset.pdfReady, dataset.pdfStatus, document.title, location.pathname] as const;
          });
          if (path.startsWith("/login")) throw new PdfError(401);
          if (ready !== "true") throw new PdfError(STATUSES.find((each) => String(each) === status) ?? 500);
          const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
          return { pdf, name: title };
        })();
        // Left behind on a timeout, it fails once its page closes: nothing waits for it then.
        made.catch(() => {});
        return await within(made, left());
      } catch (error) {
        stuck = error instanceof PdfError && error.status === 504;
        throw error;
      } finally {
        await within(context.close(), CLOSE_TIMEOUT).catch(() => (stuck = true));
        if (stuck) await dropBrowser(browser);
      }
    }, waitOver);
  } catch (error) {
    if (error instanceof PdfError) throw error;
    if (error instanceof NoTurn || waitOver.aborted) throw new PdfError(waitOver.aborted && !signal?.aborted ? 504 : 503);
    console.error("PDF", error);
    throw new PdfError(500);
  }
};
