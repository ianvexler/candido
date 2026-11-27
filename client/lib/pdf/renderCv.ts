import { withBrowser } from "./browser";

/** Why a PDF wasn't made, as the route answers it. */
export class PdfError extends Error {
  constructor(
    readonly status: 404 | 422 | 500 | 504,
    message = "Couldn't make the PDF."
  ) {
    super(message);
  }
}

/** Longest a PDF may take, from opening the page to having the file. */
export const PDF_TIMEOUT = 20_000;

type Cookie = { name: string; value: string };

interface RenderOptions {
  id: string;
  /** Where the user has the app: the print page is opened there, as they would see it. */
  origin: string;
  /** The user's own: the page loads the CV as them, so it only gets what they may see. */
  cookies: Cookie[];
}

const STATUSES = [404, 422, 500] as const;

const apiOrigin = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").origin;
  } catch {
    return null;
  }
};

const timedOut = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new PdfError(504))));

/** The CV's print page made into a PDF by the server's Chrome: the same layout, with no browser headers. */
export const renderCv = ({ id, origin, cookies }: RenderOptions): Promise<{ pdf: Uint8Array; name: string }> =>
  withBrowser(async (browser) => {
    const deadline = AbortSignal.timeout(PDF_TIMEOUT);
    const context = await browser.createBrowserContext();
    try {
      const made = (async () => {
        const page = await context.newPage();
        const api = apiOrigin();
        const urls = api && api !== origin ? [origin, api] : [origin];
        await page.setCookie(...urls.flatMap((url) => cookies.map(({ name, value }) => ({ name, value, url }))));
        await page.goto(`${origin}/resume/${encodeURIComponent(id)}/print?pdf=1`, { waitUntil: "domcontentloaded", timeout: 0 });
        await page.waitForSelector("html[data-pdf-ready]", { timeout: 0 });
        const [ready, status, title] = await page.evaluate(() => {
          const { dataset } = document.documentElement;
          return [dataset.pdfReady, dataset.pdfStatus, document.title] as const;
        });
        if (ready !== "true") throw new PdfError(STATUSES.find((each) => String(each) === status) ?? 500);
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
        return { pdf, name: title };
      })();
      // Left behind on a timeout, it fails once its page closes: nothing waits for it then.
      made.catch(() => {});
      return await Promise.race([made, timedOut(deadline)]);
    } catch (error) {
      if (error instanceof PdfError) throw error;
      console.error("PDF", error);
      throw new PdfError(500);
    } finally {
      await context.close().catch(() => {});
    }
  });
