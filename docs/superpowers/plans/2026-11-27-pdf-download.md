# PDF Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export downloads the CV as a PDF made on the server, with no tab, no print dialog and no browser headers or footers.

**Architecture:** A Next.js route handler drives one shared headless Chromium (`puppeteer-core`) to open the existing print page as the user, in a no-print "pdf" mode, and returns `page.pdf()`. The editor fetches that route and saves the file.

**Tech Stack:** Next.js 16 route handlers (Node runtime), puppeteer-core, Alpine `chromium`, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-pdf-download-design.md`

## Global Constraints

- Route: `GET /resume/[id]/pdf`, file `client/app/resume/[id]/pdf/route.ts`, `export const runtime = "nodejs"`.
- Print page pdf mode: query `?pdf=1`; `<html data-pdf-ready="true">` when ready; `data-pdf-ready="error"` with `data-pdf-status="404"` (not found / not theirs), `"422"` (empty), `"500"` (other).
- Response: `Content-Type: application/pdf`; `Content-Disposition: attachment; filename="<name>.pdf"` with the name from `pdfFileName` (also as `filename*=UTF-8''…`).
- Limits: at most 2 renders at once; 20 000 ms per export, then 504; one browser reused, a context per export.
- Settings: `PDF_RENDER_ORIGIN` (default `http://localhost:3000`), `CHROMIUM_PATH` (default `/usr/bin/chromium-browser`).
- `page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false })`.
- Editor copy: button while waiting `Making PDF…`; failure toast `Couldn't make the PDF.` with action `Open print view`.
- Saving rules before export unchanged (a failed save stops the export, as now).
- Only throwaway account 242 for browser checks; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Cookies for the API's origin:** the print page fetches from `NEXT_PUBLIC_API_URL`, not the client origin; cookies must be set for that origin or the render shows "could not be loaded". Task 2 tests the cookie mapping.
2. **A CV that isn't the user's:** must give 404, never another user's PDF. Task 2 test with the page reporting 404.
3. **Fonts not loaded when printing:** the PDF must use the template font, not a fallback. Task 1 waits on `document.fonts.ready`; Task 4's end-to-end check compares the PDF's fonts.
4. **Chromium crashed or slow:** a dead browser is relaunched; a slow render ends at 20s with 504, not a hung request. Task 2 tests both.
5. **Paper size:** Letter CVs must come out Letter. Task 4 checks page size for A4 and Letter.

---

### Task 1: Print page pdf mode

**Files:** Modify `client/app/resume/[id]/print/page.tsx`, `client/components/resume/usePrintOnce.ts`. Test: `client/app/resume/[id]/print/printPage.test.tsx` (create).

- [ ] Failing tests: with `?pdf=1` (mock `useSearchParams` or read `window.location.search`, follow existing patterns) the page never calls `window.print`, renders no toolbar, and sets `data-pdf-ready="true"` on `document.documentElement` after the CV renders and `document.fonts.ready` resolves; a load error sets `data-pdf-ready="error"` and `data-pdf-status="404"` when the API answered 404, else `"500"`; an empty CV sets `"error"`/`"422"`. Without `?pdf=1` behaviour is unchanged (prints once).
- [ ] Implement. `document.title` stays `pdfFileName(resume)`.
- [ ] Tests pass; commit `feat: let the print page be made into a PDF without printing`.

### Task 2: The PDF route

**Files:** Create `client/lib/pdf/browser.ts` (shared browser, concurrency, relaunch), `client/lib/pdf/renderCv.ts` (one export), `client/app/resume/[id]/pdf/route.ts`. Add `puppeteer-core` to `client/package.json`. Modify `client/Dockerfile` dev stage: `apk add --no-cache chromium font-noto`. Tests: `client/lib/pdf/renderCv.test.ts`, `client/app/resume/[id]/pdf/route.test.ts`.

**Interfaces:**
- `renderCv({ id: string; cookies: { name: string; value: string }[]; signal?: AbortSignal }): Promise<{ pdf: Uint8Array; name: string }>`; throws `PdfError` with `status: 404 | 422 | 500 | 504`.
- `withBrowser<T>(use: (browser: Browser) => Promise<T>): Promise<T>` limits to 2 at once and relaunches a disconnected browser.

- [ ] Failing tests (mock puppeteer-core): cookies from the request are set for the API origin (from `NEXT_PUBLIC_API_URL`) and the client origin; it opens `${PDF_RENDER_ORIGIN}/resume/7/print?pdf=1`; on `data-pdf-ready="true"` it calls `page.pdf` with the constraint's options and returns the name from `document.title`; `error`/`404` → `PdfError(404)`; nothing within 20 000 ms → `PdfError(504)` and the context is closed; a third concurrent call waits until one finishes; a disconnected browser is relaunched on the next call. Route: 200 with the headers from Global Constraints; `PdfError` statuses mapped to JSON `{ error }` with that status; no cookies → 401.
- [ ] Implement; `docker restart candido-page-client` after the Dockerfile change needs a rebuild: `docker compose` for the page stack is not in the repo — install chromium in the running dev container with `docker exec -u root candido-page-client apk add --no-cache chromium font-noto` for local checks and note it.
- [ ] Tests, tsc, lint; commit `feat: make a CV's PDF on the server`.

### Task 3: Export downloads it

**Files:** Modify `client/lib/resume/useCv.ts` (`exportPdf`), the Export button(s) (`client/components/resume/CvPageHeader.tsx` and wherever else Export is rendered). Test: `client/components/resume/cvPage.test.tsx`.

- [ ] Failing tests: Export flushes (as now), then `fetch('/resume/<id>/pdf', { credentials: "include" })`; no new window is opened; the button shows `Making PDF…` and is disabled until done; on 200 a link with `download="<name>.pdf"` (name from the response's `Content-Disposition`) is clicked and the object URL revoked; on failure a toast `Couldn't make the PDF.` with action `Open print view` that opens `/resume/<id>/print`; a failed save still stops it.
- [ ] Implement; tests, tsc, lint; commit `feat: download the PDF from Export`.

### Task 4: Production image and an end-to-end check

**Files:** Modify `client/Dockerfile` production stage (`apk add --no-cache chromium font-noto`; run as `node` still; `CHROMIUM_PATH`), `README.md` (settings, production note on `PDF_RENDER_ORIGIN` and reaching the API). Add the check to `client/scripts/page-parity.mjs` or a new `client/scripts/pdf-check.mjs`.

- [ ] Build the production image locally (`docker build --target` final stage) and confirm `chromium-browser --version` runs as `node`.
- [ ] End-to-end on localhost:3001 with account 242: Export downloads a file; it is a PDF; its page count and text match the print page's PDF for an A4 and a Letter CV (use the parity script's PDF text reader); its fonts are the template's (e.g. `pdffonts` or the text reader's font names); no "localhost" or page-title text in it; another user's CV id gives 404.
- [ ] Commit `chore: ship Chromium for PDFs and check them end to end`.
