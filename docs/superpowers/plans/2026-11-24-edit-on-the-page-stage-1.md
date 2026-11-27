# Editing on the Real Page (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Page" view of the CV: the exported design, paged, edited in place, with the space left and the design controls beside it.

**Architecture:** The export templates take an optional editing context that swaps each text for an editable inside the same element. One pure function turns measured blocks into page breaks; a generated style sheet, not the CV's DOM, adds the space. Sections, saving and ticks stay with `useSectionDrafts` and the checklist.

**Tech Stack:** Next.js, React 19, TipTap 3, Vitest with jsdom. No new dependencies, no server change.

**Spec:** `docs/superpowers/specs/2026-11-24-edit-on-the-page-design.md`

## Global Constraints

- Branch `feature/edit-on-the-page` from the branch that holds the CV checklist. Commit the spec and this plan first.
- Existing CVs export exactly as before; the templates' markup without the editing context doesn't change.
- Editable text uses `white-space: pre-wrap` and normal ligatures, never TipTap's `break-spaces` or `liga 0`.
- Nothing but the CV takes part in its layout. Tools, marks and breaks never enter saved content, the print page or the clipboard.
- Left-out items are never in the page or its editors. Typing is never lost. Saves don't overlap.
- Typing responds within 50ms with 40 sections and 400 items.
- The cards stay the default; the Page view is offered at 1024px and wider, and below that as a read-only "Page" tab.
- Copy, sentence case: **Cards**, **Page**, **Fits one page, 9 lines spare**, **Fits one page exactly**, **2 pages. Cut about 10 lines to fit one.**, **Design**, **Export PDF**, **Print again**, **Fit**, **100%**, **Show hidden text**.
- Client checks: `docker compose exec -T client npm test -- <file>`, `npm run lint`, `npx tsc --noEmit`. Browser checks use throwaway account 242, never the user's session.

## Decisions on points the spec leaves open

- **Breaks** are rules in a generated style sheet keyed by section and item or entry id, not editor decorations: nothing in the editor changes, so the caret and undo can't be affected. A block without an id never starts a page; the one before it does.
- **The space is padding, not margin** (proof): margins collapse and land up to 27px off; padding lands within 0.02px. A quote, whose border would stretch, gets margin and a measured correction.
- **Partly hidden text** (`data-cv-hidden`) takes no space on the page, as in print. A mark outside the sheet offers **Show hidden text**, which unhides it. Deleting a selection that spans hidden text deletes it too; undo restores it. With nothing selected, Backspace, Delete and word deletes must not take it: the browser does (proof), so an extension puts it back (see `spike/edit-on-the-page`, `hiddenGuard.ts`; its stray `<br>` after a word delete is to be fixed).
- **Empty fields** aren't offered on the page in stage 1; the cards do that. Entry tools come in stage 2.
- **Tailored copies** keep the review in its panel; suggestions stay highlighted and their card opens as it does now. Placement beside the sheet is stage 3.

## Review Focus

1. **Typing, deleting and undoing across a page break**: the caret stays with its text. Tasks 1 and 5.
2. **A paragraph taller than a page**, or a kept-together head near the foot: no endless loop, no blank page. Task 2.
3. **Pasting several lines into a title**: one line results. Task 3.
4. **Switching between Cards and Page while a save is pending**: no edit is lost. Task 8.
5. **A CV with no sections, no name, or a font that loads late**: the count is right after fonts load, and the page isn't broken before. Tasks 5 and 7.

---

### Task 1: Proof

Throwaway. Nothing from it is merged; its findings are.

**Files:** a scratch route on a branch `spike/edit-on-the-page`.

- [x] **Step 1:** Render the real templates with real TipTap editors (the `contentExtensions`) in every `.rc-body`, plain-text editables elsewhere, and breaks from a style sheet.
- [x] **Step 2: Measure in Chrome**, for both templates, A4 and Letter, all four fonts, small and large sizes, 1 to 4 pages. Pass: every block within 0.5px of the print page; count and page starts equal to the PDF (read with PDFKit).
- [x] **Step 3: Type, delete, undo, select and paste across a break**, and beside hidden text set to `display: none`. Pass: the caret stays with its text and no text is lost.
- [x] **Step 4: Measure typing** with 40 sections and 400 items. Pass: under 50ms per key.
- [ ] **Step 5: Firefox and Safari.** Give the user a link and a list of three CVs to print in each, and compare their counts with the page's. Pass: equal, or differences explained; unconfirmed browsers say "about".
- [ ] **Step 6: Report.** If 2 to 4 fail with no fix, stop and take the spec's fallback to the user.

**Result (2026-11-24), Chrome:** 48 of 48 cases had 0.00px difference, equal counts and equal page starts. Page tops land within 0.02px. 30 lines typed across a break kept the caret; undo and redo were exact; copied text carried no layout. Typing with 400 items: median 10ms, worst 25ms; paging 4ms. Firefox and Safari: waiting on the user (`.superpowers/mockups/print-check-*.html`); until then only Chrome counts as exact.

### Task 2: Paging

**Files:** Create `client/lib/resume/paging.ts`, `paging.test.ts`.

**Interfaces, produced:**
- `Block = { key: string | null; top: number; bottom: number; keepWithNext: boolean }`, positions without any breaks.
- `paginate(blocks: Block[], pageHeight: number): { breaks: { key: string; top: number; page: number }[]; pages: number; used: number }`: `page` counts from 0; `used` is the height taken on the last page.
- `combineColumns(columns: Paging[]): Paging` with the most pages, and the larger `used` among columns that reach the last page.
- `spaceBefore(breakTop: number, breakPage: number, earlier: number, metrics: PageMetrics): number`, `PageMetrics = { pageHeight, sheetHeight, marginTop, gap }`; `earlier` is the space already added above.
- `fitMessage(paging: { pages; used }, metrics, lineHeight, exact: boolean): string`.

- [ ] **Step 1: Write failing tests:**

```ts
it("starts a page with the block that doesn't fit", () =>
  expect(paginate([b("a", 0, 60), b("b", 60, 110)], 100)).toMatchObject({ pages: 2, used: 50, breaks: [{ key: "b", top: 60, page: 1 }] }));
it("takes the head along with what follows", () =>
  expect(paginate([b("a", 0, 60), head("h", 60, 80), b("b", 80, 130)], 100).breaks[0].key).toBe("h"));
it("ends with a block taller than a page", () =>
  expect(paginate([b("a", 0, 250)], 100)).toMatchObject({ pages: 3, used: 50, breaks: [] }));
it("drops the gap before a block that starts a page", () =>
  expect(paginate([b("a", 0, 90), b("b", 110, 130)], 100)).toMatchObject({ pages: 2, used: 20 }));
it("allows for rounding", () => expect(paginate([b("a", 0, 100.4)], 100).pages).toBe(1));
it("has one page when empty", () => expect(paginate([], 100)).toEqual({ breaks: [], pages: 1, used: 0 }));
```

  Also: a chain of heads longer than a page still ends; a head first on the page that can't keep its block; a null-key block breaking at the nearest keyed one before it on that page; `combineColumns` for side longer, main longer and equal; `spaceBefore` on pages 2 and 3; `fitMessage`: 9 lines spare, exactly full, 2 pages with 10 lines over, 3 pages naming two, last page at least half full giving only "2 pages", 1 line singular, spare rounded down and cut rounded up, "about" when not exact.
- [ ] **Step 2: Run** `npm test -- paging`. Expected: FAIL.
- [ ] **Step 3: Implement** with a 0.5 tolerance.
- [ ] **Step 4: Run** again. Expected: PASS. **Commit** `feat: work out a CV's page breaks`.

### Task 3: Templates that can be edited

**Files:**
- Create `client/components/resume/page/PageEditing.tsx`, `PageText.tsx`, `pageText.test.ts`
- Modify `client/components/resume/templates/{parts,ClassicTemplate,SidebarTemplate}.tsx`, `client/lib/resume/exportDocument.ts`

**Interfaces, produced:**
- `PageEditingContext: Context<PageEditing | null>`, `PageEditing = { text(slot: TextSlot): TextBinding | null; line(entry): ReactNode | null; body(entry): ReactNode | null; contact(): ReactNode | null }`, where `TextSlot = { kind: "name" | "headline" } | { kind: "heading"; sectionId } | { kind: "title" | "summary"; sectionId; entryId }` and `TextBinding = { value: string; label: string; onChange(value): void }`.
- `PageText({ as, className, binding })`: the same element and class as now, editable.
- Template elements carry `data-section-id`, `data-entry-id` and `data-block` only with the context.
- `oneLine(text: string): string` collapses line breaks and tabs to spaces.

- [ ] **Step 1: Write failing tests:** both templates without the context render byte-for-byte what they did (snapshot taken before the change, with header, links, summary, dates, untitled entry, sidebar placement); with it, the same elements and classes; `oneLine`; `PageText` keeps the caret when its own change comes back, takes an outside value only while not focused, ignores Enter, commits composed text once, and pastes as one line of plain text.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement** with `contentEditable="plaintext-only"`, writing `textContent` itself so React never replaces text being typed.
- [ ] **Step 4: Run** tests, tsc, lint. Expected: PASS. **Commit** `feat: let the CV templates be edited`.

### Task 4: Entry content on the page

**Files:**
- Create `client/components/resume/useEntryEditor.ts`, `page/PageEntryBody.tsx`, `page/page.css`, `page/HiddenGuard.ts`, `page/HiddenGuard.test.ts`
- Modify `SectionEntryEditor.tsx` (use the hook, no change in behaviour)

**Interfaces:**
- Consumes: `visibleContent`, `mergeEdited`, `contentExtensions`, `versions`.
- Produces: `useEntryEditor({ entry, version, onChange, editors, placeholder, className }): Editor | null`, holding the load, merge and registration now in `SectionEntryEditor`; suggestion highlighting moves with it as `useEntrySuggestions`.
- `PageEntryBody({ entry, version, onEntryChange, editors, near })`: shows static visible HTML until `near` or pressed, then the editor, with the caret where it was pressed.

- [ ] **Step 1: Extract the hooks**; the whole client suite still passes unchanged.
- [ ] **Step 2: Write failing tests** for `HiddenGuard` (a deletion with nothing selected keeps hidden text in place, one with it selected takes it, undo is exact, typing beside it isn't hidden, no stray break) and for `PageEntryBody`'s static HTML equalling the export's `html` for hidden runs, unticked items and empty content.
- [ ] **Step 3: Implement.** `page.css` sets the editable rules from Global Constraints and hides `data-cv-hidden` runs.
- [ ] **Step 4: Browser check:** press in the middle of a word in an editor not loaded yet: the caret is there. Backspace beside hidden text doesn't remove it. **Commit** `feat: edit entry content on the page`.

### Task 5: Sheets

**Files:** Create `client/components/resume/page/PagedCv.tsx`, `usePaging.ts`, `breakRules.ts`, `breakRules.test.ts`.

**Interfaces:**
- Consumes: Tasks 2 to 4, `buildResumeDocument`, `resolveDesign`, `sheetPadding`.
- Produces: `PagedCv({ document, design, paper, editing, zoom, onPaging })`, `breakRules(breaks, metrics): string`, `usePaging(rootRef, deps): { paging, metrics }`. `PagePaging = { pages, used, lineHeight, exact }`.

- [ ] **Step 1: Write failing tests** for `breakRules`: item keys become `[data-section-id="1"] [data-cv-item="x"]`, entries their section head; ids are escaped; space accumulates; no breaks gives an empty string.
- [ ] **Step 2: Implement.** Measure with the rules off and back on in one frame, at zoom 1, after `document.fonts.ready`; again on text, ticks, design, paper, size and font load, at most once a frame. Draw sheets and gaps behind, and the Sidebar tint on each sheet instead of on its column. Zoom is Fit (at most 100%) or 100%.
- [ ] **Step 3: Browser check** against the print page and PDF: 1 and 3 pages, both templates; type across a break; a slow font. **Commit** `feat: show a CV as pages`.

### Task 6: Cards for lines of fields

**Files:**
- Create `page/PageLine.tsx`, `page/PageContact.tsx`, `page/PageCard.tsx`
- Modify `EntryDetails.tsx` (export its fields as `EntryDetailsFields`), `HeaderDocument.tsx` (extract `useHeaderDraft` and `HeaderFields`)

**Interfaces, produced:** `EntryDetailsFields({ entry, onChange, focus })`; `useHeaderDraft({ value, fallback, save })`, used by both views so header edits have one owner; `PageCard({ anchor, label, onClose, children })`.

- [ ] **Step 1: Write failing tests** for `useHeaderDraft`: one save per pause, no overlap, kept on failure, sent on leaving, and a blank override falling back.
- [ ] **Step 2: Implement.** The role line and the contact block are buttons with the export's own text. The card opens below, flips above, closes on Escape or a press outside and returns focus. With an unfinished month or an end before the start, it stays open and says so.
- [ ] **Step 3: Browser check** by mouse and keyboard, in a text-field month browser too (emulate by forcing `type="text"`). **Commit** `feat: edit dates and contact details on the page`.

### Task 7: Fit

**Files:** Create `page/FitMeter.tsx`.

**Interfaces:** `FitMeter({ paging, metrics })`, using `fitMessage`. `exact` is true only for browsers the proof confirmed.

- [ ] **Step 1: Implement** a small bar and the message. `role="status"` changes only with the page count. Nothing shows until fonts and the first measure are ready.
- [ ] **Step 2: Browser check** one page, exactly full, two pages, after undo. **Commit** `feat: say how a CV fits its pages`.

### Task 8: The view, design and export

**Files:**
- Create `page/PageView.tsx`, `lib/resume/useCvDesign.ts`, `useCvDesign.test.ts`
- Modify `app/resume/[id]/page.tsx`, `CvPageHeader.tsx`, `CvWorkspace.tsx`, `app/resume/[id]/print/page.tsx`

**Interfaces, produced:** `useCvDesign(curriculumId): { design, paper, changeDesign, changePaper, flush }`, with the numbered, queued saves now in the print page; `PageView` with the checklist left, sheets in the middle and Design (and Review, as tabs) on the right.

- [ ] **Step 1: Write failing tests** for `useCvDesign` through a plain function: debounce, numbering in order, sent on leaving, paper rolled back on failure.
- [ ] **Step 2: Implement.** **Cards / Page** in the header, remembered per browser. Both views use the same drafts, header draft and design, so switching keeps everything. Below 1024px a read-only **Page** tab. The print page loses its panel and paper switch, prints itself once ready and offers **Print again** and back. Export flushes drafts, header and design first.
- [ ] **Step 3: Browser check** at 1440, 1280, 1024 and 375px: edit, switch, tick, change design, export; a tailored copy's suggestion opens on the page; switching mid-save. **Commit** `feat: offer the CV as its page`.

### Task 9: Parity check

**Files:** Create `client/scripts/page-parity.mjs`; modify `README.md`.

- [ ] **Step 1: Write** a script that signs in to a local throwaway account, and for both templates, both papers, four fonts, three sizes and 1 to 4 pages compares every block's place with the print page and the count and page starts with the PDF. It uses whichever Playwright is installed and says so if none is; it isn't part of CI.
- [ ] **Step 2: Run it.** Expected: no differences over 0.5px, every count and start equal. Measure typing with 400 items: under 50ms.
- [ ] **Step 3: Commit** `test: check the page against the export`.
