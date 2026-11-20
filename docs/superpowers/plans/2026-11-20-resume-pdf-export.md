# Resume PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user export any resume as a properly laid-out PDF, using a print page and the browser's "Save as PDF".

**Architecture:** A pure function, `buildResumeDocument`, turns a resume (header and sections) into an export model. Hidden sections and hidden text are removed and dates are formatted. A print template renders that model on a bare `/resume/[id]/print` page with print CSS: paper size, margins and page-break rules. The editor's preview pane uses the same model, so preview and export can't drift apart. Later, server-side PDF (headless Chrome rendering this page) and `.docx` can both reuse the model and the template without changes here.

**Tech Stack:** Next.js 16 (app router, client components), Tailwind v4 (`print:` variant), TipTap HTML content, `next/font/google`, Vitest + jsdom (new, client unit tests), Rails 8 + RSpec (backend).

**Spec:** No separate spec document. The requirements are the decisions agreed in the session that produced this plan:
1. Export to PDF through a dedicated print page and the browser's print dialog. No new server infrastructure.
2. One CV template ("Classic") to start, built so more templates can be added later.
3. The export matches the preview: no hidden sections, no hidden text, the resolved header, and the "Role · Organisation" / "Mar 2022 – Present · Location" details.
4. A4 and US Letter paper, stored per resume.
5. Server-side PDF, `.docx` and two-column layout are out of scope, but nothing here should block them.

## Global Constraints

- Branch: `feature/resume-export`, cut from `feature/resume-sections`. That branch is still open as ianvexler/candido#5, so the PR targets `feature/resume-sections` until #5 merges, then `main`.
- Paper sizes: `"a4"` (default) and `"letter"`, stored as `curriculums.styles.paper`. No migration; `styles` is an existing jsonb column.
- Template font: Source Sans 3 via `next/font/google`, subsets `["latin", "latin-ext"]`, weights 400/600/700.
- Page margins: `16mm` top and bottom, `18mm` left and right, for both paper sizes.
- PDF file name (the document title while the print page is open): `"<header name> - <resume title>"`, or just `"<resume title>"` when the name is blank.
- User-facing copy is sentence case. The export button reads **Export PDF**.
- Client checks: `npm run lint`, `npx tsc --noEmit`, `npm test` (new), `npm run build`. Backend: `./run rspec`, `./run lint`.

## Review Focus

These are the things most likely to go wrong for a real user that no task's tests would catch on their own. Each has a test or check in the task that owns it.

1. **Long resumes:** a section heading or entry heading must not sit alone at the bottom of a page, with its content on the next page. This is checked with a long fixture in Task 6.
2. **Long unbroken strings** (URLs, emails, long words) must wrap inside the page margins, not overflow off the page. Checked in Task 6.
3. **Exporting right after typing:** the PDF must include the last edit, even when the 600ms autosave hasn't fired yet. Covered by the save-tracker unit test in Task 5 and a manual check in Task 6.
4. **Empty resume** (no sections, everything hidden, or a blank header): the print page shows an on-screen message saying what to add, and doesn't open a print dialog for a blank page. Unit test in Task 2, page behaviour in Task 4.
5. **Another user's resume, or a deleted one:** the print page shows "This resume could not be loaded" with a link back, never a blank sheet. Checked in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `client/vitest.config.ts` (new) | Vitest with jsdom and the `@/` alias |
| `client/lib/resume/exportDocument.ts` (new) | `ResumeDocument` types, `buildResumeDocument`, `isEmptyDocument`, `pdfFileName` |
| `client/lib/resume/saveTracker.ts` (new) | Tracks autosaves still in flight so export can wait for them |
| `client/components/resume/templates/ClassicTemplate.tsx` (new) | Renders a `ResumeDocument` as a printable CV |
| `client/components/resume/templates/classic.css` (new) | The template's typography and page-break rules, scoped to `.resume-classic` |
| `client/app/resume/[id]/print/page.tsx` (new) | Loads the resume, builds the document, shows a screen-only toolbar, prints |
| `client/lib/routes.ts` (new) | `isBareRoute(pathname)`: pages rendered without the app sidebar |
| `client/components/layout/Navbar.tsx`, `MainContent.tsx` | Skip the app chrome on bare routes |
| `client/components/resume/SectionPreview.tsx` | Render from `buildResumeDocument` |
| `client/app/resume/[id]/page.tsx` | Export PDF button |
| `client/components/resume/SectionDocument.tsx`, `HeaderDocument.tsx` | Report pending saves to the save tracker |
| `backend/app/models/curriculum.rb`, `backend/app/controllers/curriculums_controller.rb` | `styles.paper` validation and update |
| `.github/workflows/ci.yml` | Run `npm test` in the client job |

---

### Task 1: Client unit-test harness

**Files:**
- Create: `client/vitest.config.ts`
- Modify: `client/package.json` (devDependencies `vitest`, `jsdom`; script `"test": "vitest run"`), `.github/workflows/ci.yml` (client job: `- run: npm test` after lint)
- Test: `client/components/resume/documentContent.test.ts`, `client/components/resume/sectionDetails.test.ts`

**Interfaces:**
- Produces: `npm test`, which runs every `*.test.ts` file under `client/` in a jsdom environment, with `@/` resolving to `client/`.

- [ ] **Step 1: Add Vitest.** Run `./run npm install -D vitest jsdom` and add the `test` script. In `vitest.config.ts` set `environment: "jsdom"` and `resolve.alias: { "@": <client dir> }`.
- [ ] **Step 2: Write tests for existing helpers** (these pin current behaviour, so they should pass right away):
  - `documentContent.test.ts`
    - `stripHiddenHtml` removes a hidden span and keeps the rest: `'<p>Led <span data-cv-hidden="true">quietly</span> work</p>'` → contains `"Led"` and `"work"`, not `"quietly"`.
    - Drops a bullet that is empty once hidden text is gone, and the `<ul>` when no bullets are left: `'<ul><li><p><span data-cv-hidden="true">x</span></p></li></ul><p>Kept</p>'` → `'<p>Kept</p>'`.
    - `hasVisibleText('<p><span data-cv-hidden="true">x</span></p>')` → `false`.
  - `sectionDetails.test.ts`
    - `formatDateRange({ start_date: "2022-03-01", end_date: null, current: true, … })` → `"Mar 2022 – Present"`.
    - Start and end → `"Mar 2022 – Jan 2024"`; same month for both → `"Mar 2022"`; no dates → `""`.
    - `fromMonthInput("2022-03")` → `"2022-03-01"`; `fromMonthInput("")` → `null`.
- [ ] **Step 3: Run.** `./run npm test`. Expected: every test passes.
- [ ] **Step 4: Commit.** `git commit -m "Add Vitest for client unit tests"`

### Task 2: Export document model, used by the preview

**Files:**
- Create: `client/lib/resume/exportDocument.ts`
- Test: `client/lib/resume/exportDocument.test.ts`
- Modify: `client/components/resume/SectionPreview.tsx`

**Interfaces:**
- Consumes: `stripHiddenHtml`, `hasVisibleText` (`components/resume/documentContent.ts`), `formatDateRange` (`components/resume/sectionDetails.ts`), `ResumeHeader`, `SectionFields` (`lib/types.ts`).
- Produces:
  ```ts
  export type ExportSection = {
    id: number;
    heading: string;   // section_type, trimmed
    title: string;
    subtitle: string;  // "Role · Organisation", or ""
    meta: string;      // "Mar 2022 – Present · Lisbon", or ""
    summary: string;   // description, trimmed
    html: string;      // content after stripHiddenHtml
  };
  export type ResumeDocument = { title: string; header: ResumeHeader; sections: ExportSection[] };
  export function buildResumeDocument(input: {
    title: string;
    header: ResumeHeader;  // already resolved (profile + overrides)
    sections: (SectionFields & { id: number; hidden?: boolean })[];
  }): ResumeDocument;
  export function isEmptyDocument(doc: ResumeDocument): boolean;
  export function pdfFileName(doc: ResumeDocument): string;
  ```

- [ ] **Step 1: Write failing tests** in `exportDocument.test.ts`:
  - Drops sections with `hidden: true`.
  - Drops hidden text from `html`.
  - Drops a section with no heading, title, summary, details or visible text. Keeps a section that only has a title.
  - `subtitle` is `"Senior engineer · Acme"` when both are set, `"Acme"` when there's no role, and `""` when neither is set.
  - `meta` is `"Mar 2022 – Present · Lisbon"`. With no dates it's `"Lisbon"`; with nothing it's `""`.
  - The header's text fields are trimmed, and links with a blank `url` are removed.
  - `isEmptyDocument` is `true` when there are no sections and the header has no name, headline, contact details or links.
  - `pdfFileName` is `"Alex Rivera - Platform roles"`, and just `"Platform roles"` when the name is blank.
- [ ] **Step 2: Run** `./run npm test -- exportDocument`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `exportDocument.ts` with the signatures above. Sections keep their input order.
- [ ] **Step 4: Run** `./run npm test`. Expected: PASS.
- [ ] **Step 5: Switch the preview to the model.** `SectionPreview` takes `document: ResumeDocument` in place of `header` and `sections`. Its callers build the document: the library page from `{ title: "Library", header: profile, sections: templates }`, and the resume page from `{ title: curriculum.title, header: resolveHeader(profile, curriculum.header), sections }`. The empty message stays as it is now. Check that the preview shows the same thing as before on both pages.
- [ ] **Step 6: Typecheck, lint, commit.** `git commit -m "Build resume preview from a shared export model"`

### Task 3: Paper size per resume

**Files:**
- Modify: `backend/app/models/curriculum.rb`, `backend/app/controllers/curriculums_controller.rb`, `client/lib/types.ts`, `client/api/resources/curriculums/updateCurriculum.ts`
- Test: `backend/spec/requests/curriculums_spec.rb`

**Interfaces:**
- Produces: `Curriculum::PAPER_SIZES = %w[a4 letter]`. `PUT /api/v1/curriculums/:id` accepts `styles: { paper: "a4" | "letter" }` and merges it into the existing `styles`, so future keys survive. Client: `export type PaperSize = "a4" | "letter"`, `Curriculum.styles: { paper?: PaperSize } & Record<string, unknown>`, and `UpdateCurriculumPayload.styles?: { paper?: PaperSize }`.

- [ ] **Step 1: Write failing request specs:**
  - `PUT` with `styles: { paper: "letter" }` → 200, and `curriculum.reload.styles["paper"] == "letter"`.
  - A curriculum with `styles: { "accent" => "x" }` keeps `"accent"` after the paper update.
  - `styles: { paper: "a3" }` → 422, with an error mentioning "Paper".
- [ ] **Step 2: Run** `./run rspec spec/requests/curriculums_spec.rb`. Expected: the new examples fail.
- [ ] **Step 3: Implement.** Add a validation that `styles["paper"]` is nil or in `PAPER_SIZES`. In the controller, `params.permit(styles: [:paper])`, merged into `@curriculum.styles` inside the existing update transaction. Update the client types.
- [ ] **Step 4: Run** `./run rspec` and `./run lint`. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "Store paper size on resumes"`

### Task 4: Classic template and print page

**Files:**
- Create: `client/components/resume/templates/ClassicTemplate.tsx`, `client/components/resume/templates/classic.css`, `client/app/resume/[id]/print/page.tsx`, `client/lib/routes.ts`
- Modify: `client/components/layout/Navbar.tsx`, `client/components/layout/MainContent.tsx`

**Interfaces:**
- Consumes: `buildResumeDocument`, `isEmptyDocument`, `pdfFileName` (Task 2). `PaperSize`, `updateCurriculum` with `styles` (Task 3). `getCurriculum`, `getResumeProfile`, `resolveHeader`.
- Produces: `export const ClassicTemplate = ({ document, paper }: { document: ResumeDocument; paper: PaperSize }) => JSX`. `export const isBareRoute = (pathname: string) => /^\/resume\/[^/]+\/print$/.test(pathname)`. Route `/resume/[id]/print`, which accepts the query `?print=1`.

- [ ] **Step 1: Bare route chrome.** When `isBareRoute(pathname)`, `Navbar` returns `null` and `MainContent` renders its children with no padding and no fixed height. Add a unit test in `client/lib/routes.test.ts`: `/resume/12/print` → true; `/resume/12`, `/resume/sections` and `/resume/12/print/x` → false.
- [ ] **Step 2: Template markup.** Render this structure:
  - A `<header>` with the name (`<h1>`), headline, a contact line (email, phone and location joined with `" · "`, blanks skipped), and links as `<a href>`. The link text is the label, or the URL without `https://` / `mailto:`.
  - For each section, a `<section>` containing:
    - a heading row (`heading`),
    - an entry head (`title`; then `subtitle` on the left and `meta` on the right),
    - `summary`,
    - the `html` body, inserted directly into the page.
- [ ] **Step 3: Template CSS** in `classic.css`, everything under `.resume-classic`:
  - Base text: 10.5pt, line-height 1.35, in the Source Sans 3 font from Global Constraints. Name 22pt/700, headline 11.5pt, contact line 9.5pt in grey `#555`.
  - Section headings: 9pt, uppercase, letter-spacing `0.12em`, with a `1px solid #ccc` line below.
  - Page breaks: section heading and entry head get `break-after: avoid` and `break-inside: avoid`; `li` and `p` get `break-inside: avoid`.
  - Wrapping: header, links and body get `overflow-wrap: anywhere`.
  - Links keep the text colour, with no underline.
- [ ] **Step 4: Print page.**
  - **Loading:** fetch the curriculum and profile in parallel, then build the document from the non-hidden sections. Paper is `curriculum.styles.paper ?? "a4"`.
  - **Page size:** render `<style>{`@page { size: ${paper === "letter" ? "letter" : "A4"}; margin: 16mm 18mm; }`}</style>`.
  - **On screen:** the sheet sits on a grey background at the paper's width (210mm or 8.5in), with padding equal to the print margins.
  - **Toolbar** (screen only, `print:hidden`): **Back to editor**, an **A4 / Letter** toggle that saves through `updateCurriculum(id, { styles: { paper } })`, and **Save as PDF**, which calls `window.print()`.
  - **File name:** set `document.title = pdfFileName(doc)` while the page is mounted, and restore it on unmount.
  - **Empty resume:** when `isEmptyDocument(doc)`, show "Nothing to export yet. Add sections or show hidden ones in the editor." with a link back, and disable Save as PDF.
  - **Load failure:** show "This resume could not be loaded." with a link to `/resume`.
- [ ] **Step 5: Auto-print.** With `?print=1` and a document that isn't empty, call `window.print()` once, after the data has rendered and `document.fonts.ready` resolves. Use a ref guard so React's double effects don't print twice.
- [ ] **Step 6: Check it.** Open `/resume/<id>/print` for a seeded resume: no sidebar, the sheet looks like a CV, and print preview has no toolbar. Open another user's resume ID to see the load-failure message. Lint, typecheck, `npm test`.
- [ ] **Step 7: Commit.** `git commit -m "Add printable Classic resume template"`

### Task 5: Export button that waits for pending saves

**Files:**
- Create: `client/lib/resume/saveTracker.ts`
- Test: `client/lib/resume/saveTracker.test.ts`
- Modify: `client/components/resume/SectionDocument.tsx`, `client/components/resume/HeaderDocument.tsx`, `client/app/resume/[id]/page.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function markPending(key: string): void;
  export function markSettled(key: string): void;
  export function waitForSaves(timeoutMs?: number): Promise<boolean>; // true once nothing is pending; false if timeoutMs (default 3000) passes first
  ```

- [ ] **Step 1: Write failing tests:**
  - `waitForSaves` resolves `true` right away when nothing is pending.
  - It resolves `true` after the last pending key settles.
  - It resolves `false` after the timeout when a key never settles (use fake timers).
  - Settling a key that was never marked pending is a no-op.
- [ ] **Step 2: Run** `./run npm test -- saveTracker`. Expected: FAIL.
- [ ] **Step 3: Implement the tracker** with a module-level `Set<string>` and a list of waiters.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Report saves.** `SectionDocument` calls `markPending("section-<id>")` whenever `dirty > 0`, and `markSettled` when the save promise settles, when the save is skipped as unchanged or invalid, or when the component unmounts. `HeaderDocument` does the same with key `"header"`.
- [ ] **Step 6: Export button** in the resume editor header, beside **Section library**: label **Export PDF**, with a tooltip saying it opens a print view where you choose Save as PDF. On click:
  1. Open the tab synchronously with `window.open("", "_blank")`, so popup blockers allow it.
  2. `await waitForSaves()`. If it returns `false`, show a toast saying the latest changes are still saving and the PDF may not include them.
  3. Set that tab's location to `/resume/<id>/print?print=1`.
- [ ] **Step 7: Lint, typecheck, test, commit.** `git commit -m "Add Export PDF that waits for autosaves"`

### Task 6: Print verification

**Files:** no app code, unless a check fails, in which case fix it in the file that owns it.

- [ ] **Step 1: Seed** the demo resume (fictional data), plus one long resume: 8 experience sections with 6 bullets each, a 120-character URL in a link, and a bullet with a 90-character unbroken word.
- [ ] **Step 2: Generate PDFs headlessly.** For each resume, open the print page in Playwright and generate PDFs with `page.pdf({ preferCSSPageSize: true })` for both A4 and Letter.
- [ ] **Step 3: Check the PDFs.** The demo resume is one page, with no sidebar and no toolbar. In the long resume, no page ends with a section or entry heading whose content starts on the next page. Nothing runs past the right margin. Links can be clicked.
- [ ] **Step 4: Stale-edit check.** Type in a bullet and click **Export PDF** within 600ms. The print page must show the new text.
- [ ] **Step 5: Open the PR** with screenshots of the print page and one exported PDF page. Base it on `feature/resume-sections`, or on `main` if ianvexler/candido#5 has merged.
