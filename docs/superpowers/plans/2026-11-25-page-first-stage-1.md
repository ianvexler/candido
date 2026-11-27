# Page First, Stage 1: Page Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Page view the default and let users leave out, put back and add anything directly on the page, without the page's text ever moving.

**Architecture:** Everything new is an overlay drawn beside the template root inside `PagedCv`'s scaled container, as `HiddenTextMarks` and `CardMarks` already are. Ticks and add points are found on pointer movement only (`pagePlaces.ts`), folds are found after layout (`findFolds`, called from `onLaidOut`). Leaving out and putting back use the checklist's own `ChecklistActions.tick`; adding inside an entry goes through the edit channel as a new `EditTarget`, so the editor inserts the blank block and watches it as stage 1's `addBullet` does.

**Tech Stack:** Next.js 16, React 19, TipTap 3, Tailwind, Radix (Popover/DropdownMenu via `components/ui`), Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-25-page-first-design.md` (stage 1 of its "Stages"). Earlier: `docs/superpowers/specs/2026-11-24-edit-on-the-page-design.md`.

## Global Constraints

- Nothing new inside the template root (`[data-cv-page]`): the page markup is what prints. `client/scripts/page-parity.mjs` must pass (16 of 16 cases).
- Nothing moves or resizes on hover, focus or menu opening: tools are absolutely positioned overlays.
- Typing: p95 of a key to its paint at most 50ms (`page-parity.mjs --typing`). No overlay work runs synchronously per keystroke; hover work runs only on pointer movement.
- Left-out state is the checklist's data (`data-cv-off`, `description_off`, `hidden` on entries and sections) changed only through `ChecklistActions.tick` or `lib/resume/checklist.ts`.
- Adding into a left-out place puts it back, and is put back as it was if left without writing (stage 1's `useAdded` put-back).
- Copy: the pills say exactly `+ Add` and `+ Section`. Inside menu: `Bullet`, `Paragraph`, `Entry`, `Put back a left-out bullet` (with its count). Section menu search placeholder `Search your sections…`, a no-match row `New section “<text>”`, and `Blank section` always last. A fold says `<n> left out`.
- No search inside the "+ Add" menu.
- Below 1024px nothing changes.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Sidebar template's two columns:** a tick or pill for the main column must not cover the sidebar's text, and gaps in one column must not be found from the other column's blocks. Test in Task 3 (`gapAt` ignores the other column) and a browser check in Task 7.
2. **Zoom "Fit" (scaled page):** hover positions are in viewport pixels, overlay positions in sheet units. A wrong division puts pills off their gap at any zoom but 100%. Test in Task 3 with scale 0.75.
3. **A gap across a page break:** the gap between the last block of one page and the first of the next spans the sheet gap. The pill must sit at the top of the next page's block, not in the grey between sheets. Test in Task 3.
4. **Adding into a left-out entry or section, then leaving without typing:** ticks must come back exactly as before, in both views. Test in Task 2.
5. **Many left-out items in a row and a fold next to hidden-text marks:** folds and hidden-text marks must not overlap. Test in Task 5 (`mergeMarks` with both kinds).

---

### Task 1: Page by default

**Files:**
- Modify: `client/components/resume/useCvView.ts`
- Test: `client/components/resume/useCvView.test.ts` (create if missing)

**Interfaces:**
- Produces: `useCvView()` unchanged in shape; key `candido:cv-view-2`; default `"page"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("starts on the page when nothing is stored", () => {
  localStorage.clear();
  expect(renderHook(() => useCvView()).result.current[0]).toBe("page");
});
it("ignores the first stage's stored choice", () => {
  localStorage.setItem("candido:cv-view", "cards");
  expect(renderHook(() => useCvView()).result.current[0]).toBe("page");
});
it("remembers cards once chosen", () => {
  const { result } = renderHook(() => useCvView());
  act(() => result.current[1]("cards"));
  expect(localStorage.getItem("candido:cv-view-2")).toBe("cards");
});
```

Use the hook's real return shape; adjust the destructuring to it.

- [ ] **Step 2: Run and see them fail:** `docker exec candido-page-client npm test -- components/resume/useCvView.test.ts` → the first two FAIL (gives "cards").
- [ ] **Step 3: Change `KEY` to `"candido:cv-view-2"` and the default (server and nothing stored) to `"page"`; stored `"cards"` stays cards.** Server render still returns the same value as the first client render (no hydration mismatch): read storage in the existing lazy initialiser as now.
- [ ] **Step 4: Run them and the CV page tests:** `... npm test -- components/resume/useCvView.test.ts components/resume/cvPage.test.tsx` → PASS. Fix `cvPage.test.tsx` cases that assumed Cards by setting the key to `"cards"` first.
- [ ] **Step 5: Commit** `feat: open CVs on the page by default`.

---

### Task 2: Insert a bullet or paragraph at a place

**Files:**
- Modify: `client/components/resume/editChannel.ts` (EditTarget), `client/components/resume/addBullet.ts`, `client/components/resume/placeCaret.ts`, `client/components/resume/useCvEdits.ts`, `client/lib/resume/checklist.ts`
- Test: `client/components/resume/addBullet.test.ts`, `client/components/resume/useCvEdits.test.tsx`, `client/lib/resume/checklist.test.ts`

**Interfaces:**
- Produces:
  - `EditTarget` gains `{ sectionId: number; what: "insert"; entryId: string; after: string | null; kind: "bullet" | "paragraph" }`. `after` is the id of the item it goes after; `null` is the top of the entry's body.
  - `insertBlock(editor: Editor, after: string | null, kind: "bullet" | "paragraph", onLost: () => void): boolean` in `addBullet.ts`. False when `after` isn't found.
  - `CvEdits` gains `addAt(place: AddPlace, what: "bullet" | "paragraph" | "entry"): void`, with `export type AddPlace = { sectionId: number; entryId: string | null; after: string | null }` exported from `useCvEdits.ts`. `entryId: null` means under the section's heading.
  - `insertEntry(section: SectionDraft, afterEntryId: string | null, entry: SectionEntry): SectionPatch` in `checklist.ts` (null = first).

Rules, from the spec's "Add points inside a section are per entry":
- `bullet` after a list item: a new item right after it in the same list. After a paragraph, or at the top: a new one-item list there (at the top, before the first block).
- `paragraph` after a list item in the middle of a list: the list splits around the new paragraph. After the last item: after the list. At the top: before the first block.
- `entry` with `entryId` set: `insertEntry` after that entry. With `entryId: null`: a new first entry.
- `bullet`/`paragraph` with `entryId: null`: into the first entry, at its top (`after: null`).
- The new block has no `data-cv-item` (the server gives it one, as now); left empty when the editor is left, it is dropped (reuse `dropIfLeftEmpty`).
- Put-back: as `useCvEdits`' existing `add`; the `Added.what` is `"bullet"` for both kinds, `"entry"` for an entry.

- [ ] **Step 1: Failing tests in `addBullet.test.ts`** (with the TipTap editor the file already builds):
  - `insertBlock(editor, "b1", "bullet")` on `<ul><li data-cv-item="b1"><p>One</p></li><li data-cv-item="b2"><p>Two</p></li></ul>` → caret in an empty `li` between One and Two; `getHTML()` has three `li`.
  - `insertBlock(editor, "b1", "paragraph")` on the same → `<ul>…One…</ul><p></p><ul>…Two…</ul>` with the caret in the `p`.
  - `insertBlock(editor, null, "bullet")` on `<p data-cv-item="p1">Intro</p>` → a `ul` with one empty `li` before Intro.
  - `insertBlock(editor, "missing", "bullet")` → `false`, document unchanged.
  - Leaving the editor (blur) with the new block still empty removes it (same assertion style as the file's existing `addBullet` drop test).
- [ ] **Step 2: Failing test in `checklist.test.ts`:** `insertEntry(section with entries [a, b], "a", e)` → entries `[a, e, b]`; with `null` → `[e, a, b]`; with a hidden section → section shown and the others hidden (as `addEntry` does).
- [ ] **Step 3: Failing tests in `useCvEdits.test.tsx`** (follow its existing setup):
  - `addAt({ sectionId, entryId: "a", after: "b1" }, "bullet")` asks the channel for `{ what: "insert", entryId: "a", after: "b1", kind: "bullet" }`.
  - On a left-out entry: the patch shows it; leaving without writing puts its ticks back exactly.
  - `addAt({ sectionId, entryId: null, after: null }, "entry")` adds the entry first and asks for its title.
- [ ] **Step 4: Run:** `docker exec candido-page-client npm test -- components/resume/addBullet.test.ts lib/resume/checklist.test.ts components/resume/useCvEdits.test.tsx` → the new ones FAIL.
- [ ] **Step 5: Implement** `insertBlock` (beside `addBullet`, sharing `dropIfLeftEmpty` and `caretAtItem`'s way of finding an item), the `insert` case in `editInEditor`, `insertEntry`, and `addAt` (built on `add`, with `showForBullet` for a hidden entry or section). Cards view: `SectionEntryEditor` already routes `EditTarget` to `editInEditor`, so it works there too; confirm with one Cards test.
- [ ] **Step 6: Run** the three files → PASS; then the full suite once.
- [ ] **Step 7: Commit** `feat: add a bullet, paragraph or entry at any place`.

---

### Task 3: Find the place under the pointer

**Files:**
- Create: `client/components/resume/page/pagePlaces.ts`
- Test: `client/components/resume/page/pagePlaces.test.ts`

**Interfaces:**
- Consumes: `measureColumns(root, scale)` (`measureBlocks.ts`) for columns; the template's `data-section-id`, `data-entry-id`, `data-cv-item`, `data-block` attributes.
- Produces:
  - `export type BlockRef = { sectionId: number } & ({ kind: "heading" } | { kind: "entry"; entryId: string } | { kind: "item"; entryId: string; itemId: string } | { kind: "summary"; entryId: string })`
  - `export type Gap = { kind: "add"; place: AddPlace } | { kind: "section"; afterSectionId: number | null }` with `top` (sheet units, the hairline's y), `left`, `right` (the column's content edges, sheet units) and `side: "left" | "right"`.
  - `blockAt(root: HTMLElement, target: Element): (BlockRef & { top: number; side: "left" | "right" }) | null`: the innermost block containing `target`. The header has none.
  - `gapAt(root: HTMLElement, scale: number, clientX: number, clientY: number): Gap | null`.

Rules:
- A gap is the boundary between two neighbouring blocks of the same column. Hit when the pointer is within 6 sheet px of the boundary (`HIT = 6`), and only in the column whose x range contains the pointer.
- Between two blocks of one section: `kind: "add"`. Its place is the entry above with `after` = the item above (`null` right under an entry's title line, `after` = last item under its last item). Right under a section heading: `entryId: null, after: null`.
- Between a section's last block and the next section's heading: the upper half is `"add"` for the section above (after its last item); the lower half is `"section"` with `afterSectionId` = the section above. After the column's last section: both, the same way, ending 24 sheet px below it.
- Between the header and the first section: `"section"` with `afterSectionId: null`.
- `top` across a page break: the top of the next block minus half the normal gap (never in the space between sheets).
- `side`: the edge the column is nearest, as `HiddenMarkAt.side`.

- [ ] **Step 1: Failing tests**, stubbing `getBoundingClientRect` on a small DOM in each template's markup (copy the pattern from `measureBlocks.test.ts`):
  - two bullets 20px apart: pointer 3px under the first → `{ kind: "add", place: { entryId: "e1", after: "b1" } }`; 10px under → null.
  - under a heading → `place.entryId === null`.
  - between sections: upper half → `"add"` after the last item; lower half → `{ kind: "section", afterSectionId: 1 }`.
  - scale 0.75: the same gaps from client coordinates multiplied by 0.75, same results, `top` in sheet units.
  - sidebar DOM: a pointer over the main column never returns the sidebar's places.
  - page break: the gap's `top` sits on the next page, not between sheets.
- [ ] **Step 2: Run** `... npm test -- components/resume/page/pagePlaces.test.ts` → FAIL.
- [ ] **Step 3: Implement** `blockAt` and `gapAt` as pure functions of the DOM and its rects.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: find the block and gap under the pointer on the page`.

---

### Task 4: Ticks and add points on hover

**Files:**
- Create: `client/components/resume/page/PageTools.tsx`, `client/components/resume/page/AddMenu.tsx`, `client/components/resume/page/SectionMenu.tsx`
- Modify: `client/components/resume/page/PagedCv.tsx` (render `PageTools` in the scaled container beside the marks; pass actions), `client/components/resume/page/PageView.tsx` and `client/app/resume/[id]/page.tsx` (thread `ChecklistActions`, `CvEdits`, library rows and `addNamedSection`), `client/components/resume/page/page.css`
- Test: `client/components/resume/page/pageTools.test.tsx`, `client/components/resume/page/sectionMenu.test.tsx`

**Interfaces:**
- Consumes: `blockAt`, `gapAt` (Task 3); `CvEdits.addAt`, `AddPlace` (Task 2); `ChecklistActions.tick(target: ChecklistTarget, on: boolean)` and `orderSections(ids: number[])`; checklist rows `ChecklistSection[]` from `buildChecklist`; `addNamedSection(name: string): Promise<boolean>` (page.tsx).
- Produces: `PageTools` props `{ rootRef; scale; sections: CurriculumSection[]; rows: ChecklistSection[]; actions: ChecklistActions; edits: CvEdits; addSection: (name: string, afterSectionId: number | null) => Promise<void> }`. Change `addNamedSection` to take an optional `afterSectionId` and place the new section with `orderSections` after it is made.

Behaviour (from the spec's Goals 2 and 4 and Decided details):
- On pointer movement over the sheet (throttled to one animation frame), find `blockAt(event.target)` and `gapAt(...)`. Show only those: one tick at the hovered block's first line in its column's margin, and one pill at the gap. Nothing shows while the pointer is still or off the sheet. Hover never changes layout.
- Tick: leaves the block out via `actions.tick({ sectionId, templateId: null, entryId, itemId, inCv: true }, false)`. Heading ticks the section, an entry title the entry, the summary uses `SUMMARY_ID`. No tick on the header.
- `+ Add` pill (left margin of its column, hairline across the gap in the accent `#f5a524`): opens `AddMenu` at the pill. Items: `Bullet`, `Paragraph`, `Entry`, and `Put back a left-out bullet (<n>)` when the place's entry has left-out items; that last opens a list of them, each ticks it back on.
- `+ Section` pill (dark, centred on a dashed line across the column): opens `SectionMenu`: a focused search input (`Search your sections…`) listing, filtered by the text: the CV's left-out sections first, then library-only sections (rows with `sectionId === null`), each with its entry count (`1 entry`, `3 entries`). Choosing a left-out one ticks it on and orders it after `afterSectionId`; a library one ticks it in (`{ sectionId: null, templateId, inCv: false }`) and orders it; with no match, `New section “<text>”` adds that name; `Blank section` adds `"Section"`. Arrow keys move, Enter chooses, Escape closes and returns focus to the page.
- The pills and ticks are buttons with labels: `Leave out <text>`, `Add here`, `Add a section`.

- [ ] **Step 1: Failing tests in `sectionMenu.test.tsx`:** renders left-out CV sections before library ones; typing filters; no match shows `New section “Talks”`; `Blank section` is always last; Enter on a library row calls `tick` with `inCv: false` then `orderSections` with it after the given section.
- [ ] **Step 2: Failing tests in `pageTools.test.tsx`** (mock `gapAt`/`blockAt` with `vi.mock`): a pointer move shows one tick and one pill; the tick calls `actions.tick(..., false)` with the block's ids; `Bullet` in the add menu calls `edits.addAt(place, "bullet")`; the put-back list ticks an item on; nothing is rendered inside `[data-cv-page]`.
- [ ] **Step 3: Run** both → FAIL.
- [ ] **Step 4: Implement** the three components and the wiring. Popovers use the project's `components/ui` popover (as `PageCards` does); menus are keyboard-operable lists.
- [ ] **Step 5: Run** both, then the full suite, tsc and lint.
- [ ] **Step 6: Commit** `feat: leave out and add things from the page`.

---

### Task 5: Folded marks for left-out content

**Files:**
- Create: `client/components/resume/page/FoldMarks.tsx`, `client/components/resume/page/folds.ts`
- Modify: `client/components/resume/page/PagedCv.tsx` (find folds in `onLaidOut`, render `FoldMarks`), `client/components/resume/page/HiddenTextMarks.tsx` (`mergeMarks` takes both kinds)
- Test: `client/components/resume/page/folds.test.ts`, `client/components/resume/page/foldMarks.test.tsx`

**Interfaces:**
- Consumes: the drafts (`CurriculumSection[]`), `listItems`, `isLeftOut`, `ChecklistActions.tick`; `onLaidOut(root, scale)` in `PagedCv`.
- Produces:
  - `export type Folded = { sectionId: number; entryId?: string; itemId?: string; label: string }`
  - `export type FoldAt = { top: number; side: "left" | "right"; items: Folded[] }`
  - `leftOutRuns(sections: CurriculumSection[]): { after: BlockRef | null; sectionId: number; items: Folded[] }[]`: consecutive left-out items, entries and sections, each run tied to the shown block before it (`null`: the top of its section or column).
  - `findFolds(root: HTMLElement, scale: number, sections: CurriculumSection[]): FoldAt[]`.

Rules:
- A run of left-out bullets/paragraphs in a shown entry folds after the shown item before it. Left-out entries in a shown section fold after the shown entry before them. Left-out sections fold after the shown section before them, in their own column.
- A left-out summary folds after the entry's title line, like an item, labelled `Summary`.
- Not folded: blank items, and sections never in the CV (library-only; those are in the `+ Section` menu).
- The mark sits in the margin, not across the gap: a gap between bullets is too small to hold it without covering text or moving the page.
- A fold sits in the margin at its gap's y, on the column's side, with the hidden-text marks: run both through `mergeMarks` so they stack and never overlap (`MARK_SIZE` apart).
- The mark: dashed, low contrast, `<n> left out`; on hover a dashed hairline across the gap. Click opens a list: each item's text (first 80 characters), its own tick to put it back (`actions.tick(..., true)`). The list stays open until closed, so several can go back.

- [ ] **Step 1: Failing tests in `folds.test.ts`:** an entry `[b1, b2 off, b3 off, b4]` → one run after `b1` with 2 items; a left-out entry between two shown ones → a run after the first entry; a left-out section → a run after the previous section; a blank off item isn't counted; a whole hidden entry counts as one item labelled by its title.
- [ ] **Step 2: Failing tests in `foldMarks.test.tsx`:** renders `2 left out`; opening lists both; ticking one calls `tick` with its ids and `true`; a fold and a hidden-text mark at the same `top` end `MARK_SIZE` apart.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement**, finding folds in `onLaidOut` beside `findHiddenMarks` (same `JSON.stringify` guard against re-renders).
- [ ] **Step 5: Run** both, the full suite, tsc, lint.
- [ ] **Step 6: Commit** `feat: show what is left out where it was`.

---

### Task 6: Keyboard

**Files:**
- Modify: `client/components/resume/page/PageTools.tsx`, `client/components/resume/page/PagedCv.tsx`
- Test: `client/components/resume/page/pageTools.test.tsx`

**Interfaces:**
- Consumes: `blockAt` (Task 3), `AddMenu` (Task 4).

Behaviour (the spec leaves this to the builder; this is the call): with the caret in a block, `Alt+Enter` (Option+Enter on a Mac) opens the `+ Add` menu for the gap right under that block (a section heading: under it). `Alt+Shift+Enter` opens the `+ Section` menu after the caret's section. Escape returns the caret where it was. Fold marks are buttons in tab order after the page. The checklist remains the keyboard path for ticks.

- [ ] **Step 1: Failing tests:** `Alt+Enter` in item `b1` opens `AddMenu` for `{ entryId, after: "b1" }`; `Alt+Shift+Enter` opens `SectionMenu` with that section; Escape restores focus to the editor.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** in one keydown handler on the page root (not in the editors). **Step 4: Run** → PASS, full suite, tsc, lint.
- [ ] **Step 5: Commit** `feat: open the add menus from the keyboard`.

---

### Task 7: Prove the page didn't change

**Files:**
- Modify: `client/scripts/page-parity.mjs` (hover check), `README.md` ("Checking the CV page")

- [ ] **Step 1:** Add to `page-parity.mjs` a `--hover` pass: for each case, move the pointer over every gap and block of the first page (at 40 points) and assert every block's top and the page count are unchanged (0px) and nothing was added inside `[data-cv-page]`. Default runs include it.
- [ ] **Step 2: Run** `node scripts/page-parity.mjs --url http://localhost:3001 --api http://localhost:8001 --state <auth.json> --yes-this-is-a-throwaway-account` → `16 cases, 16 ok`; and `--typing` → p95 ≤ 50ms.
- [ ] **Step 3: Browser checks** (throwaway account 242 only) with screenshots: Classic and Sidebar at Fit and 100%; add a bullet between two bullets, a paragraph mid-list, an entry under a heading, a library section between two sections; leave out and put back via tick and fold; adding into a left-out entry then leaving puts it back; Alt+Enter.
- [ ] **Step 4:** Document `--hover` in the README section.
- [ ] **Step 5: Commit** `test: check the page doesn't move under the tools`.
