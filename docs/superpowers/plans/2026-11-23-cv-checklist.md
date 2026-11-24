# CV Checklist (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every CV holds the whole library and shows what its checklist ticks, down to a bullet, and text can pass between a CV and the library.

**Architecture:** Entry content stays sanitised HTML; top-level blocks carry `data-cv-item` and, in CVs, `data-cv-off`. The page editor only ever receives ticked blocks; a pure merge puts unticked ones back before saving, so editing can't touch them. One client hook owns a page's sections for both typing and ticking. Each CV section stores the library text it was last matched with, so changes can be compared three ways.

**Tech Stack:** Rails 8, Nokogiri, RSpec; Next.js, TipTap 3, dnd-kit, Vitest with jsdom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-23-library-and-cv-checklist-design.md`

## Global Constraints

- Branch `feature/cv-checklist` from the tip of `feature/get-started`. Commit the spec and this plan first.
- Stage 2 (outline, search in the library, order, labels, purposes) is a separate plan. In stage 1 every new CV starts from Everything.
- An item is a top-level `p`, `h1`–`h6`, `blockquote`, or a direct `li` of a top-level `ul`/`ol` (nested content belongs to it). Blank blocks are not items.
- Leaving out never deletes text. A CV's text and ticks change only through actions on that CV.
- `hidden` on sections and entries stays their tick. Unticking the last item keeps the entry's title line.
- Digests in the spec are stored as the raw library text itself (`base_items`, `base_fields`); comparison is normalised on the client only.
- Exports of existing CVs must be identical before and after the backfill.
- Job editing and the job page are untouched.
- UI copy, sentence case: **What to include**, **Leave out**, **New**, **Update library too**, **Add to library**, **Use library version**, **Keep both as they are**, **Left out**, **Add section**.
- Server tests: `./run rspec`. Client: `./run npm test -- <file>`, `./run npm run lint`, `./run npx tsc --noEmit`.

## Review Focus

1. **Select all and delete in an entry with unticked bullets**: unticked bullets survive. Task 4.
2. **Enter in the middle of a bullet, or pasting a copied bullet**: two different ids. Tasks 1 and 5.
3. **Ticking while typing is still waiting to save**: both are saved. Task 6.
4. **A page opened before release saves content without ids**: ids and ticks come back, nothing left out reappears. Task 1.
5. **Library changed in another tab before "Update library too"**: refused, current text shown, nothing overwritten. Task 3.

---

### Task 1: Items on the server

**Files:**
- Create: `backend/app/models/cv_items.rb`, `backend/spec/models/cv_items_spec.rb`
- Modify: `backend/app/models/concerns/section_content.rb`, `backend/app/services/cv_tailorings/cv_text.rb`
- Test: also `backend/spec/services/cv_tailorings/cv_text_spec.rb`, `backend/spec/requests/curriculum_sections_spec.rb`

**Interfaces:**
- Produces, on module `CvItems`:
  - `list(html) -> [{ id:, text:, html:, off: }]` in order. `html` is the item's outer HTML without `data-cv-off`; `text` is squished.
  - `assign(html, previous: nil) -> String`
  - `set_off(html, ids, off) -> String`
  - `visible(html) -> String`: drops off items, then empty lists.
  - `upsert(html, item_html, neighbours:) -> String`: replaces the item with that id in place, keeping its off state, or inserts it after the last id of `neighbours` (ids that precede it at the source) that is present, else first. List items join an adjacent list of the same kind, else get their own list; inserting a non-list item mid-list splits the list.
  - `strip_ticks(html) -> String`: removes off attributes and unwraps `span[data-cv-hidden]`.

- [ ] **Step 1: Write failing specs** in `cv_items_spec.rb`:

```ruby
it "gives each top-level block and list item an id, not nested ones" do
  html = CvItems.assign("<p>A</p><ul><li><p>B</p><ul><li><p>C</p></li></ul></li></ul><p></p>")
  expect(CvItems.list(html).pluck(:text)).to eq([ "A", "B C" ])
  expect(html.scan("data-cv-item").size).to eq(2)
end
it "keeps existing ids and gives a repeated id's second use a new ticked one" do
  html = CvItems.assign('<p data-cv-item="a" data-cv-off="true">A</p><p data-cv-item="a" data-cv-off="true">A2</p>')
  first, second = CvItems.list(html)
  expect(first).to include(id: "a", off: true)
  expect(second[:id]).not_to eq("a")
  expect(second[:off]).to be(false)
end
it "restores ids and ticks by text when the saved content has no ids" do
  before = '<ul><li data-cv-item="a"><p>A</p></li><li data-cv-item="b" data-cv-off="true"><p>B</p></li></ul>'
  after = CvItems.assign("<ul><li><p>A</p></li><li><p>B</p></li><li><p>New</p></li></ul>", previous: before)
  expect(CvItems.list(after).map { |i| i.values_at(:id, :off) }.first(2)).to eq([ [ "a", false ], [ "b", true ] ])
end
it "drops unticked items and the lists they leave empty" do
  html = '<p data-cv-item="a">A</p><ul><li data-cv-item="b" data-cv-off="true"><p>B</p></li></ul>'
  expect(CvItems.visible(html)).to eq('<p data-cv-item="a">A</p>')
end
it "inserts after the nearest earlier neighbour and keeps the off state on replace" do
  html = '<ul><li data-cv-item="a"><p>A</p></li><li data-cv-item="c" data-cv-off="true"><p>C</p></li></ul>'
  added = CvItems.upsert(html, '<li data-cv-item="b"><p>B</p></li>', neighbours: %w[x a])
  expect(CvItems.list(added).pluck(:id)).to eq(%w[a b c])
  replaced = CvItems.upsert(html, '<li data-cv-item="c"><p>C2</p></li>', neighbours: [])
  expect(CvItems.list(replaced).last).to include(text: "C2", off: true)
end
```

  Also: `upsert` into empty content, and a paragraph inserted mid-list. In `cv_text_spec`: unticked items don't reach the model. In the section request spec: saving content without ids keeps an earlier unticked item unticked, and a `data-cv-item` over 64 characters is replaced.
- [ ] **Step 2: Run** `./run rspec`. Expected: the new examples fail (`uninitialized constant CvItems`).
- [ ] **Step 3: Implement `CvItems`** with `Nokogiri::HTML5.fragment`. Ids must match `SectionContent::ENTRY_ID`; new ones are `SecureRandom.uuid`. Text restore applies only when `html` has no ids, pairing equal text in order.
- [ ] **Step 4: Use it.** Add both attributes to `ALLOWED_ATTRIBUTES`. In `normalize_entry`, after sanitising, `CvItems.assign(content, previous:)` where `previous` is the same entry's content in `entries_was`. `SectionTemplate` also removes `data-cv-off`. `CvText.blocks_for` starts from `CvItems.visible(html)`. Update existing specs that compare exact content to compare text or allow ids.
- [ ] **Step 5: Run** `./run rspec`. Expected: 0 failures.
- [ ] **Step 6: Commit** `feat: give CV items ids and ticks`.

### Task 2: Columns, whole-library CVs, including library content

**Files:**
- Create: `backend/db/migrate/20261124100000_add_base_to_sections.rb`
- Modify: `backend/app/models/{curriculum,curriculum_section,section_template}.rb`, `backend/app/controllers/{curriculums,curriculum_sections}_controller.rb`, blueprints for section, template and curriculum, `backend/config/routes.rb`, `backend/db/schema.rb`
- Test: `backend/spec/requests/{curriculums,curriculum_sections,section_templates,cv_imports}_spec.rb`

**Interfaces:**
- Consumes: `CvItems`.
- Produces:
  - `curriculum_sections.base_items` jsonb `{}` (item id to library item html), `base_fields` jsonb `{}` (entry id to `SectionContent::FIELD_KEYS` hash: title, role, organization, location, start_date, end_date, current, description). `section_templates.item_added_at` jsonb `{}` (item or entry id to ISO time). All serialised.
  - `CurriculumSection#rebase!(template, entry_id:, item_id: nil)` updates one base value.
  - `POST /curriculums` with `whole_library: true`; title optional then.
  - `POST /curriculums/:curriculum_id/include` with `section_template_id`, optional `entry_id`, `item_id`; renders the full curriculum.
  - `section_count` counts sections that aren't hidden.

- [ ] **Step 1: Write failing request specs:**
  - `whole_library: true` copies all the user's templates in order, everything ticked, titled "New CV"; a second one is "New CV 2"; with an empty library it has no sections.
  - copies store each library item in `base_items` and each entry in `base_fields`.
  - `include` with only a template: the section is appended, all ticked.
  - `include` with an entry not in the CV: the entry lands after its nearest earlier library neighbour, all items ticked; other existing ticks are unchanged.
  - `include` with an item whose section and entry aren't in the CV: both are copied; only that item is ticked; other entries are `hidden`.
  - `include` with an item already in the CV: ticks it, un-hides its entry and section, text unchanged.
  - `include` with another user's template or an unknown entry or item: 404; another user's CV: 403.
  - saving a template with a new bullet sets its `item_added_at`; editing existing text doesn't change it; removing a bullet drops it; clients can't set it.
- [ ] **Step 2: Run** `./run rspec`. Expected: new examples fail.
- [ ] **Step 3: Write the migration** (three columns, all `null: false, default: {}`), run `./run rails db:migrate`.
- [ ] **Step 4: Implement.** `import_section_templates!` fills both bases. `Curriculum#include_from_library!(template, entry_id: nil, item_id: nil)` runs in a transaction with `with_lock`. Extract `CvImport#new_cv_title` into `Curriculum.free_title(user, base)` and use it in both. `item_added_at` is kept by a `before_save` on `SectionTemplate`.
- [ ] **Step 5: Run** `./run rspec`. Expected: 0 failures.
- [ ] **Step 6: Commit** `feat: build CVs from the whole library`.

### Task 3: Passing text both ways

**Files:**
- Create: `backend/app/models/library_transfer.rb`, `backend/app/controllers/library_transfers_controller.rb`, `backend/spec/requests/library_transfers_spec.rb`
- Modify: `backend/config/routes.rb`, `backend/app/models/curriculum_section.rb`; remove `sync` (route, action, `sync_from_template!`, `library_updated?`, its serialised field and specs)

**Interfaces:**
- Consumes: `CvItems.upsert`, `CvItems.strip_ticks`, `rebase!`.
- Produces: `POST /curriculums/:curriculum_id/sections/:id/transfer` with `direction` (`to_library`, `to_cv`, `keep`), `entry_id`, `item_id` (absent means the entry's fields), `expected_cv`, `expected_library` (the item html or fields hash the client has, or null when absent). Returns `{ section, section_template }`. A mismatch returns 409 with `{ error, section, section_template }` and changes nothing.

- [ ] **Step 1: Write failing specs:**
  - `to_library` replaces the library item, keeps the item's CV tick, sets the base, strips `data-cv-off` and unwraps hidden text in the library, and leaves every other CV's `entries` byte-for-byte equal.
  - `to_library` for an item or entry the library lacks inserts it after its nearest earlier neighbour; for a section without a template it creates one and links it.
  - `to_cv` replaces the CV item and keeps it unticked if it was.
  - fields move as one unit and don't change `content` or `hidden`.
  - `keep` changes only the base.
  - the library changed since `expected_library`: 409, both records unchanged. Same for `expected_cv`.
  - other users' CVs: 403; unknown direction or entry: 422 / 404.
- [ ] **Step 2: Run** `./run rspec`. Expected: new examples fail with routing errors.
- [ ] **Step 3: Implement `LibraryTransfer.new(section:, direction:, entry_id:, item_id:, expected_cv:, expected_library:).call`**, locking the template, then the section, in a transaction. Compare expected item html with `CvItems.list`'s `html`.
- [ ] **Step 4: Run** `./run rspec`. Expected: 0 failures.
- [ ] **Step 5: Commit** `feat: pass text between a CV and the library`.

### Task 4: Client item functions

**Files:**
- Create: `client/lib/resume/items.ts`, `items.test.ts`, `itemState.ts`, `itemState.test.ts`
- Modify: `client/components/resume/documentContent.ts`, `client/lib/types.ts`, `client/lib/resume/exportDocument.test.ts`

**Interfaces:**
- Produces:
  - `listItems(html): Item[]`, `Item = { id: string; text: string; html: string; off: boolean }`, `html` without the off attribute
  - `setItemsOff(html, ids: string[], off: boolean): string`
  - `visibleContent(html): string`
  - `mergeVisible(full: string, visible: string): string`
  - `itemState(cv: string | null, library: string | null, base: string | null): ItemState`, `ItemState = "same" | "cv_changed" | "library_changed" | "both_changed" | "differs" | "cv_only" | "library_only"`
  - `fieldsState(cv, library, base): ItemState` for `EntryFields` (Task 2's field keys)
  - Types: `CurriculumSection` gains `base_items`, `base_fields`, loses `library_updated`; `SectionTemplate` gains `item_added_at`.

- [ ] **Step 1: Write failing tests** (jsdom). Let `li = (id, off = false) => <li data-cv-item=id …><p>id</p></li>`:

```ts
it.each(fixtures)("puts unticked items back where they were", (full) =>
  expect(mergeVisible(full, visibleContent(full))).toBe(full));
it("keeps unticked items when all visible text is deleted", () =>
  expect(listItems(mergeVisible(ul(li("a"), li("b", true), li("c")), "<p></p>")).map((i) => i.id)).toEqual(["b"]));
it("keeps an unticked item's place when the one before it is deleted", () =>
  expect(ids(mergeVisible(ul(li("a"), li("b"), li("c", true), li("d")), ul(li("a"), li("d"))))).toEqual(["a", "c", "d"]));
it("ignores formatting whitespace, ids and ticks when comparing", () =>
  expect(itemState('<li data-cv-item="a" data-cv-off="true"><p>A  b</p></li>', '<li data-cv-item="a"><p>A b</p></li>', null)).toBe("same"));
```

  `fixtures`: unticked first, middle and last in a list; a fully unticked list between paragraphs; an unticked paragraph between two lists; ul beside ol; nested list; unticked quote and heading. Cover all seven `ItemState` values; an equal CV and library is `same` whatever the base. In `exportDocument.test.ts`: an unticked item and its empty list aren't exported; an entry whose items are all unticked keeps its title.
- [ ] **Step 2: Run** `./run npm test -- lib/resume`. Expected: new tests fail.
- [ ] **Step 3: Implement.** In `mergeVisible`, each unticked item goes after its nearest preceding item in `full` that is present in the result (already restored ones count), else first. Join an adjacent list of the same kind, else make a list; split a list when a non-list item lands inside it. `visibleContent` never joins lists. `stripHiddenHtml` also removes `[data-cv-off]`. These functions need a DOM: without `window`, `stripHiddenHtml` throws if the content has `data-cv-off`, so left-out text can never leak through the regex branch.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add CV item helpers`.

### Task 5: Item ids in the editor

**Files:**
- Create: `client/components/resume/CvItem.ts`, `CvItem.test.ts`
- Modify: `client/components/resume/SectionEntryEditor.tsx`

**Interfaces:**
- Consumes: `visibleContent`, `mergeVisible`.
- Produces: TipTap extension `CvItem`, adding `cvItem` to paragraph, heading, blockquote and listItem. `SectionEntryEditor` loads `visibleContent(entry.content)` and reports `mergeVisible(latest entry content, editor html)`.

- [ ] **Step 1: Write failing tests** with a headless `Editor`: splitting a list item gives two distinct ids, the first keeping its own; pasting a copy of an item gives the copy a new id; a new top-level paragraph gets an id; nested items and paragraphs inside list items get none; undoing a split restores the original id; loading content with ids dispatches no document change.
- [ ] **Step 2: Run** `./run npm test -- CvItem`. Expected: FAIL.
- [ ] **Step 3: Implement** with `keepOnSplit: false` and an `appendTransaction` that runs only when the document changed. Id format as `newEntryId` (export it from `sectionEntries.ts`).
- [ ] **Step 4: Wire the editor**, then run `./run npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: keep item ids while editing`.

### Task 6: One owner for a page's sections

**Files:**
- Create: `client/lib/resume/useSectionDrafts.ts`, `sectionDrafts.ts`, `sectionDrafts.test.ts`
- Modify: `client/components/resume/SectionDocument.tsx`, `client/app/resume/sections/page.tsx`, `client/app/resume/[id]/page.tsx`, `CurriculumSectionCard.tsx`

**Interfaces:**
- Produces:
  - `createDrafts<T extends SectionFields & { id: number }>({ save, onChange, onError, delayMs = 600 })` returning `{ load(sections), change(id, patch), replace(section), remove(id), flush(): Promise<boolean>, dispose() }`. `patch` is `Partial<SectionFields & { hidden; placement }>`.
  - `useSectionDrafts(...)` wraps it as `{ sections, change, replace, remove, flush }`.
  - `SectionDocument` becomes controlled: `section`, `onChange(patch)`; it no longer saves. Remount an entry's editor only when its ticks change outside it or its text is replaced.

- [ ] **Step 1: Write failing tests** with fake timers:
  - two changes within the delay make one save with both.
  - a tick after unsaved typing saves both.
  - a save response never replaces edits made after it was sent, but does bring `base_items`, `base_fields` and `updated_at`.
  - saves for one section never overlap: a change during a request is sent after it settles.
  - a failed save keeps the edits, calls `onError`, and `flush` resolves false.
  - changes with no real difference aren't saved; an end date before its start isn't saved.
  - `dispose` sends pending changes.
  - `waitForSaves` waits for the pause and the request.
- [ ] **Step 2: Run** `./run npm test -- sectionDrafts`. Expected: FAIL.
- [ ] **Step 3: Implement** using `markPending`/`trackSave`, `cleanFields` and `sameFields` as `SectionDocument` does now, then convert both pages.
- [ ] **Step 4: Run** `./run npm test`, lint and tsc. Expected: PASS, no errors. In the browser, edit a section in the library and in a CV, reload, and see both edits.
- [ ] **Step 5: Commit** `refactor: let one hook own a page's sections`.

### Task 7: Checklist logic

**Files:**
- Create: `client/lib/resume/checklist.ts`, `checklist.test.ts`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `buildChecklist(sections, templates, cvCreatedAt): ChecklistSection[]`; each section `{ key, sectionId, templateId, name, hidden, isNew, total, included, entries }`; each entry `{ id, inCv, title, hidden, isNew, total, included, items }`; each item `{ id, text, inCv, off, isNew, state }`. `included` counts what exports.
  - `tickSection(section, on)`, `tickEntry(section, entryId, on)`, `tickItem(section, entryId, itemId, on)`: each returns a patch for `change`.
  - `moveSection(ids, id, by)`, reusing `moveEntry` for entries.
  - `filterChecklist(list, query)`: matches section, entry and item text, keeping parents.
  - `suggestionPlace(section, suggestion): "visible" | "left_out" | "stale"`.

- [ ] **Step 1: Write failing tests:** counts for hidden section, hidden entry, unticked item; unticking then ticking an entry restores its item ticks; ticking an entry whose items are all off ticks all; unticking the last item leaves the entry's `hidden` false; ticking an item un-hides its entry and section; ticking a section whose entries are all hidden shows all; library-only content sits after its earlier neighbour; "New" only when added after the CV was made; entries with no items count as one; CV-only sections appear; a library section in no CV section appears once; filter keeps parents; `suggestionPlace` in all three outcomes, including a hidden entry.
- [ ] **Step 2: Run** `./run npm test -- checklist`. Expected: FAIL.
- [ ] **Step 3: Implement** as pure functions. Section `isNew` means all its entries are new.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add checklist logic`.

### Task 8: CV page

**Files:**
- Create: `client/components/resume/CvChecklist.tsx`, `CvWorkspace.tsx`, `client/api/resources/curriculums/includeFromLibrary.ts`
- Modify: `client/app/resume/[id]/page.tsx`, `CurriculumSectionCard.tsx`, `SectionDocument.tsx`, `SectionEntryEditor.tsx`, `review/ReviewPanel.tsx`, `review/SuggestionRow.tsx`, `client/lib/resume/reviewPanel.ts` and its test, `client/app/resume/page.tsx`, `createCurriculum.ts`
- Delete: `SectionPickerDialog.tsx`, `AddSheetButton` use for the picker, `syncCurriculumSection.ts`

**Interfaces:**
- Consumes: Tasks 2, 6, 7.
- Produces: `CvWorkspace({ header, checklist, children, review })`: checklist 390px, CV, optional review 448px; below 1024px these are tabs (Include, CV, Review). `reviewGroups` takes a `leftOutIds: Set<number>` and returns those rows separately.

- [ ] **Step 1: Write failing `reviewGroups` tests:** a left-out suggestion is in the left-out group, not the stale or open ones, and isn't counted as left to do.
- [ ] **Step 2: Build the checklist.** Native checkboxes with `indeterminate` set from counts, so partial state is announced; labels clamp to two lines; "2 of 5"; search; "New" badge. Section and entry rows drag (dnd-kit) and have a menu: Move up, Move down; sections also Move to sidebar/main when the template has two columns, and Remove from this CV (existing confirmation). Dragging and moving are off while searching. Ticking library-only content flushes drafts, then calls `include`.
- [ ] **Step 3: Build the page.** Render only ticked sections and entries. Hover, focus or tap on an item shows **Leave out** beside it. On-page drag, move and hide controls go; add entry, details and delete stay. **Add section** adds an empty CV-only section called "Section" and focuses its heading. With nothing in the CV, show a link to the library. Remove the preview.
- [ ] **Step 4: Review panel.** Selecting a **Left out** suggestion offers to tick its content again, then opens its card.
- [ ] **Step 5: New CV** on `/resume` creates with `whole_library: true` and opens it.
- [ ] **Step 6: Run** `./run npm test`, lint, tsc. Expected: PASS. In the browser at 1440px, 1024px and 375px, by mouse and by keyboard: make a CV, untick a bullet, an entry and a section, type and tick within 600ms, reload, export; a tailored copy keeps ticks. Load 40 sections with 400 items: ticking shows within 100ms.
- [ ] **Step 7: Commit** `feat: pick CV content from a checklist`.

### Task 9: Change notices

**Files:**
- Create: `client/components/resume/ItemChangeMenu.tsx`, `client/api/resources/curriculums/transferWithLibrary.ts`
- Modify: `CvChecklist.tsx`, `client/app/resume/[id]/page.tsx`
- Test: `client/lib/resume/itemState.test.ts`

**Interfaces:**
- Consumes: Task 3's endpoint, `itemState`, `fieldsState`.
- Produces: `actionsFor(state: ItemState): ("to_library" | "to_cv" | "keep")[]` in `itemState.ts`.

- [ ] **Step 1: Write failing tests** for `actionsFor`: `same` and `library_only` none; `cv_changed` and `cv_only` `to_library`; `library_changed` `to_cv`; `both_changed` and `differs` all three.
- [ ] **Step 2: Implement** a small "Changed" button on rows with actions. One action: a menu item with that copy (`cv_only` says **Add to library**). Three: a popover showing both texts with the three choices. Flush drafts first; if that fails, stop and say the latest edit isn't saved. On 409, reload both records into the page and show "This changed elsewhere. Check it and try again."
- [ ] **Step 3: Run** tests, lint, tsc, then check in two browser tabs: typo fixed in the CV and sent to the library; library edit pulled while unticked; both edited, each choice; stale tab refused.
- [ ] **Step 4: Commit** `feat: offer changes between a CV and the library`.

### Task 10: Existing data

**Files:**
- Create: `backend/app/models/cv_items_backfill.rb`, `backend/lib/tasks/cv_items.rake`, `backend/spec/models/cv_items_backfill_spec.rb`
- Modify: `README.md` (release note with the command)

**Interfaces:**
- Produces: `CvItemsBackfill.run!(user)`, `rake cv_items:backfill` (every user, one transaction each, prints counts and failures, exits 1 on any failure), safe to repeat.

- [ ] **Step 1: Write failing specs:** library items get ids; copies take matching ids by entry id and text, repeats in order; a copy already given its own id takes the library's when the text matches; unmatched items keep their own; wholly hidden items become unticked and partly hidden ones are unchanged; bases are set when `synced_at >= template.updated_at` and otherwise only where texts match; `updated_at` and `item_added_at` don't change; a second run changes nothing; a CV whose visible content would differ raises and rolls back that user.
- [ ] **Step 2: Run** `./run rspec`. Expected: new examples fail.
- [ ] **Step 3: Implement** with `update_columns`. The check compares each CV's `CvText.call` and each entry's visible HTML (ids removed, hidden text and blocks it empties removed) before and after.
- [ ] **Step 4: Run** `./run rspec`. Expected: 0 failures.
- [ ] **Step 5: Try it on real data.** Copy the local database (`CREATE DATABASE candido_check TEMPLATE …`, or `pg_dump` if it is in use), run the task against the copy twice. Expected: 0 failures, second run 0 changes. Print one existing CV before and after and compare the PDFs' text. Don't run it on the main local database without asking the user.
- [ ] **Step 6: Commit** `feat: add ids to existing CV content`.

Release order: deploy with the column migration, then `rake cv_items:backfill`.
