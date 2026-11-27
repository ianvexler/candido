# Export downloads a PDF

## Why

Export opens a new tab with the print page and Chrome's print dialog. The user
has to pick "Save as PDF", and if "Headers and footers" is ticked, Chrome
prints the page title and URL in the CV's margins (the print page sets the
CV's margins as the page's own `@page` margins, so there is room for them).
The user wants Export to just download the PDF.

## Goals

- Export saves everything (as now), then downloads `<pdfFileName>.pdf` while
  the user stays in the editor: no new tab, no dialog.
- The PDF is laid out exactly as the print page is today: same template,
  fonts, paper and margins, never with browser headers or footers.
- Works the same whatever browser the user has.
- When making the PDF fails, the user is told and offered the print view.

## Non-goals

- Changing the templates or the print page's layout.
- PDFs for anything but CVs (cover letters later, if wanted).
- Queues or background jobs: a PDF is made within the request.

## Anti-goals

- A PDF that differs from what the Page view shows.
- One user getting another user's CV.
- An export that can hang the client server.

## Approaches

- **A: a PDF route in the Next.js app (chosen).** A route handler on the client
  server drives a shared headless Chromium (`puppeteer-core`, Alpine's
  `chromium`) to open the print page as the user and return `page.pdf()`. Same
  stack as the page it renders; only Chromium is added to the client image.
- **B: in Rails with Ferrum.** Works the same, but Ruby drives a page the Next
  app serves, and the backend image grows instead. No gain.
- **C: a Gotenberg container.** Proven, but a third production container
  (~1GB) to run and secure, still needing the user's cookie.

## Design

- **Route:** `GET /resume/[id]/pdf` (`client/app/resume/[id]/pdf/route.ts`,
  Node runtime). It takes the request's cookies and opens
  `<PDF_RENDER_ORIGIN>/resume/<id>/print?pdf=1` in a fresh browser context with
  those cookies set for the API's origin. It waits for the print page to say it
  is ready, calls `page.pdf({ preferCSSPageSize: true, printBackground: true,
  displayHeaderFooter: false })` and returns it with
  `Content-Type: application/pdf` and
  `Content-Disposition: attachment; filename="<pdfFileName>.pdf"`.
- **Print page, pdf mode:** with `?pdf=1` it doesn't call `window.print()`,
  hides its toolbar, and sets `data-pdf-ready="true"` on `<html>` once the CV
  is rendered and fonts are loaded (`document.fonts.ready`), and
  `data-pdf-ready="error"` (with `data-pdf-status` 404 or 500) when loading
  fails or the CV is empty.
- **Who can see what:** the browser carries only the requesting user's
  cookies, so the API decides; a CV they can't open comes back as 404, an empty
  one as 422.
- **Chromium:** one browser launched lazily and reused; a new context per
  export, closed after. At most 2 exports render at once (others wait); each
  has 20s, then 504. The browser is relaunched if it has crashed.
- **Settings:** `PDF_RENDER_ORIGIN` (where the server's Chrome reaches the
  client; default `http://localhost:3000`), `CHROMIUM_PATH` (default
  `/usr/bin/chromium-browser`). The API origin is the one the client already
  builds in (`NEXT_PUBLIC_API_URL`); cookies are set for it.
- **Editor:** `exportPdf` saves first (unchanged rules: a failed save stops
  it), then fetches the route. While it waits, the Export button says "Making
  PDF…" and is disabled. The blob is saved through a temporary link with the
  file name. On failure: an error toast with an "Open print view" action that
  opens the print page as today.
- **Print page:** stays, as the fallback and for the page-match script.
- **Docker:** both client images (dev and production) install `chromium` and
  the fonts the templates use (they are bundled in the repo, so only
  `font-noto` for fallback text). Production: the client container must reach
  the API at its public origin, or `NEXT_PUBLIC_API_URL` must point somewhere
  it can reach; documented in the README.

## Left to the builder

- How the route and the editor share `pdfFileName` (the route can read the
  name from the print page's `document.title`).
- The exact wait and polling for `data-pdf-ready`.
- Tests: unit tests for the route's error mapping and the editor's flow with
  `fetch` mocked; one real end-to-end check in the browser that the downloaded
  file is a PDF with the CV's text and page count.
