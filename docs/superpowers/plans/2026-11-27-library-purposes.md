# Library and Purposes (stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The library becomes purposes shown like folders, an outline and one open section. Bullets and entries carry purpose labels, and a new CV starts from a purpose with only what fits ticked.

**Architecture:** Labels are rows in `cv_labels`. A template maps item and entry ids to label ids in `item_labels`, which only the labels endpoint writes, under the template's lock. The fit rule exists twice: in Ruby to tick CVs and in TypeScript for library counts and filters. Both are tested against the same cases. Ticking a CV by purpose is a server action. The client flushes drafts before it.

**Tech Stack:** Rails 8, RSpec; Next.js, TipTap 3, dnd-kit, Vitest with jsdom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-23-library-and-cv-checklist-design.md` (sections Labels, Library, New CV, CV page's purpose rules, Small screens, Data). Stage 1 is `docs/superpowers/plans/2026-11-23-cv-checklist.md` and is done.

## Global Constraints

- Branch `feature/library-purposes` from the tip of `feature/cv-checklist`. Commit the spec change and this plan first.
- Fit rule, exactly: an item fits a purpose when it has no labels, its own or its entry's, or has that purpose's label. Everything fits "Everything" (`cv_label_id` null). An entry fits when one of its items fits. An entry with no items fits by its own labels. A section fits when one of its entries does.
- An entry's summary (`$summary`) has no labels of its own. It follows its entry's labels. (Builder call: summary ids repeat across entries.)
- Label names are unique per user, ignoring case, at most 40 characters, stripped, and not blank.
- Label edits never change `updated_at`, `item_added_at`, entry text or any CV.
- Deleting a label removes it from every template. CVs that used it become Everything, and their ticks don't change.
- Leaving out never deletes text. A CV's ticks change only through actions on that CV.
- New CV title: "`<name>` CV" for a purpose, "New CV" for Everything, via `Curriculum.free_title`.
- Job editing and the job page are untouched. The welcome page keeps creating "My CV" from Everything.
- Pages stay responsive with 40 sections and 400 items. Counts and filtering are memoised per templates and labels.
- UI copy, sentence case: **Purposes**, **All content**, **Not labelled**, **New purpose**, **Rename**, **Delete**, **Every purpose**, **Labels**, **Add label**, **Remove label**, **Purpose**, **Everything**, **Move up**, **Move down**, **Profile**.
- Server tests: `./run rspec`. Client: `./run npm test -- <file>`, `./run npm run lint`, `./run npx tsc --noEmit`.

## Review Focus

1. **Labelling a bullet while its text is still waiting to save, or saving text while a label is applied.** Both survive. Tasks 1 and 5.
2. **Labelling a bullet typed seconds ago, which the server hasn't seen.** The label sticks and isn't dropped as unknown. Task 5.
3. **Editing a labelled bullet's text, or moving it within its list.** It keeps its labels. A new bullet made by Enter has none. Task 1.
4. **Deleting a purpose that a CV uses.** The CV shows Everything and nothing in it is ticked or unticked. Task 1.
5. **Changing a CV's purpose while ticking or typing is waiting to save.** Nothing is lost, and the confirmation compares against saved ticks. Task 6.

---

### Task 1: Labels and library order on the server

**Files:**
- Create: `backend/db/migrate/20261127100000_add_labels_and_library_order.rb`, `backend/app/models/cv_label.rb`, `backend/app/controllers/cv_labels_controller.rb`, `backend/app/blueprints/cv_label_blueprint.rb`, `backend/spec/requests/cv_labels_spec.rb`
- Modify: `backend/app/models/{user,section_template,curriculum}.rb`, `backend/app/controllers/section_templates_controller.rb`, `backend/app/blueprints/{section_template,curriculum}_blueprint.rb`, `backend/config/routes.rb`, `backend/db/schema.rb`
- Test: also `backend/spec/requests/section_templates_spec.rb`, `backend/spec/requests/cv_imports_spec.rb`

**Interfaces:**
- Produces:
  - Table `cv_labels` (`user_id` fk, `name` string not null, timestamps). Unique index on `user_id, lower(name)`.
  - `section_templates.item_labels` jsonb `{}` not null: item or entry id to an array of label ids. `section_templates.position` integer not null, backfilled per user in `(created_at, id)` order.
  - `curriculums.cv_label_id` nullable fk with `on_delete: :nullify`.
  - `SectionTemplate.in_library_order` is `order(:position, :id)`. New templates, including imported ones, get `max + 1` in a `before_create`.
  - `GET/POST /cv_labels`, `PUT/DELETE /cv_labels/:id` returning `{ cv_label }` or `{ cv_labels }` (`id, name`). Name taken: 422 `"You already have a purpose called <name>"`.
  - `PUT /cv_labels/:id/items` with `on` (bool) and `targets: [{ section_template_id, id }]`. It returns `{ section_templates }` for the templates it touched. Ids not in their template give 422 and change nothing.
  - `PUT /section_templates/order` with `ids`, the user's complete set. Otherwise 422.
  - Blueprints: templates add `item_labels, position`. Curriculums add `cv_label_id`.

- [ ] **Step 1: Write failing request specs** in `cv_labels_spec.rb`:
  - create, rename, list in name order. "backend" when "Backend" exists returns 422. Another user's label returns 403 on update, delete and items.
  - `items` with `on: true` adds the id once even if sent twice. `on: false` removes it. Neither changes the template's `updated_at` or `item_added_at`.
  - `items` with an unknown item id returns 422, and no template in the request changes.
  - delete removes the id from every template's `item_labels` (keys left with `[]` are dropped). It nulls `cv_label_id` on CVs and leaves their `curriculum_sections.entries` byte-for-byte equal.

  In `section_templates_spec.rb`:
  - index is in `position` order. A new template goes last. `order` reorders. `order` with a missing or foreign id returns 422.
  - saving text changes for a labelled bullet keeps its labels. Removing a bullet drops its key. Splitting a bullet so the new half gets a new id leaves the new id unlabelled. Clients can't set `item_labels` or `position` through `update`.

  In `cv_imports_spec.rb`: imported sections come after existing ones.
- [ ] **Step 2: Run** `./run rspec`. Expected: new examples fail.
- [ ] **Step 3: Write the migration.** Backfill `position` with a `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id)` update, then `null: false`. Run `./run rails db:migrate`.
- [ ] **Step 4: Implement.** `SectionTemplate` prunes `item_labels` to the present ids in the same `before_save` as `note_added`. `update` and `items` both run under `template.with_lock` (reload first), so a text save never writes back stale labels. `items` uses `update_columns`. `CvLabel` `has_many :curriculums, dependent: :nullify`, and its `before_destroy` strips its id from the user's templates with `update_columns`.
- [ ] **Step 5: Run** `./run rspec`. Expected: 0 failures.
- [ ] **Step 6: Commit** `feat: add purpose labels and library order`.

### Task 2: Purposes on CVs (server)

**Files:**
- Create: `backend/app/models/cv_purpose.rb`, `backend/spec/models/cv_purpose_spec.rb`, `backend/spec/fixtures/purpose_fit_cases.json`
- Modify: `backend/app/models/{curriculum,curriculum_section}.rb`, `backend/app/controllers/curriculums_controller.rb`, `backend/config/routes.rb`
- Test: `backend/spec/requests/curriculums_spec.rb`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces:
  - `CvPurpose.new(template, label_id)` with `item_fits?(entry, item_id)`, `entry_fits?(entry)`, `section_fits?`. `label_id` nil means Everything.
  - `CurriculumSection#apply_purpose(template, purpose)`, which sets ticks in place for every entry and item that is in both. It sets `hidden` on entries and the section, `data-cv-off` through `CvItems.set_off`, and `description_off`. Content that is only in the CV is left alone.
  - `POST /curriculums` with `whole_library: true, cv_label_id`: copies everything and applies the purpose. The title follows Global Constraints.
  - `PUT /curriculums/:id/purpose` with `cv_label_id` (null for Everything) and `force` (bool). First it copies in library sections and entries the CV lacks, as stage 1's `add_missing_entries` does. Then it applies the purpose and renders the full curriculum. If any shared tick differs from what the CV's current purpose gives and `force` isn't true, it returns 409 `{ error: "ticks_differ" }` and changes nothing.
  - `Curriculum#duplicate_for_job!` copies `cv_label_id`.
  - `purpose_fit_cases.json`: an array of `{ name, template: { entries, item_labels }, label_id, items: { "<entry>/<item>": bool }, entries: { "<entry>": bool }, section: bool }`. Task 3 reads the same file.

- [ ] **Step 1: Write the fit cases** (at least): unlabelled item fits every purpose; item labelled A fits A, not B; entry labelled A makes its unlabelled items fit A only; item B in entry A fits A and B; entry with no items fits by its own labels; summary follows its entry; entry whose items are all B doesn't fit A; section with no fitting entry doesn't fit; empty section doesn't fit; label id null fits all.
- [ ] **Step 2: Write failing specs.** `cv_purpose_spec.rb` iterates the JSON. In `curriculums_spec.rb`:
  - create with a purpose ticks per fit, title "Backend CV", then "Backend CV 2".
  - create with a foreign `cv_label_id` returns 404.
  - `purpose` with ticks matching the old purpose switches without `force`.
  - after a hand-made untick, `purpose` returns 409 and the CV is unchanged. With `force` it switches.
  - CV-only items keep their ticks.
  - a library section the CV lacks is copied in and ticked by fit.
  - text never changes.
  - a tailored copy keeps `cv_label_id`.
- [ ] **Step 3: Run** `./run rspec`. Expected: new examples fail.
- [ ] **Step 4: Implement.** The differs check builds the ticks the current purpose would give and compares them to the stored ones. It runs inside the same transaction and `with_lock` as `include_from_library!`.
- [ ] **Step 5: Run** `./run rspec`. Expected: 0 failures.
- [ ] **Step 6: Commit** `feat: start and re-tick CVs by purpose`.

### Task 3: Purpose logic on the client

**Files:**
- Create: `client/lib/resume/purposes.ts`, `purposes.test.ts`, `client/api/resources/cvLabels/{getCvLabels,createCvLabel,updateCvLabel,deleteCvLabel,setLabelOnItems}.ts`, `client/api/resources/sectionTemplates/reorderSectionTemplates.ts`, `client/api/resources/curriculums/setCurriculumPurpose.ts`
- Modify: `client/lib/types.ts`, `client/api/resources/curriculums/createCurriculum.ts`

**Interfaces:**
- Consumes: Task 1 and 2 endpoints, `listItems`.
- Produces:
  - Types: `CvLabel = { id: number; name: string }`. `SectionTemplate` gains `item_labels: Record<string, number[]>` and `position`. `Curriculum` gains `cv_label_id: number | null`.
  - `PurposeFilter = { kind: "all" } | { kind: "label"; id: number } | { kind: "none" }`.
  - `labelsOf(template, entryId, itemId?): { own: number[]; inherited: number[] }`.
  - `itemFits(template, entryId, itemId, labelId: number | null): boolean`, `entryFits`, `sectionFits`. Same rule as Task 2.
  - `inFilter(template, entryId, itemId, filter)`: `none` means no own or inherited labels.
  - `purposeCounts(templates, labels): Map<"all" | "none" | number, number>`, counting items (entries with no items count as one).
  - `outline(templates, filter, query): OutlineSection[]`, where `OutlineSection = { id, name, count, entries: { id, title, count }[] }`. It keeps only what's in the filter and matches the query in section, entry or item text.
  - `setLabelOnItems(labelId, on, targets: { section_template_id: number; id: string }[]): Promise<{ section_templates: SectionTemplate[] }>`. `setCurriculumPurpose(id, cvLabelId, force)` resolves `{ curriculum }` and throws an `ApiError` with status 409 on `ticks_differ`.

- [ ] **Step 1: Write failing tests.** `purposes.test.ts` imports `backend/spec/fixtures/purpose_fit_cases.json` and checks every case. Add a `vitest.config.ts` alias if the relative import fails. Plus:
  - `purposeCounts` for all, none and two labels.
  - `outline` filtered by label hides non-fitting entries and sections, and keeps section order by `position`.
  - query matches item text and keeps its entry.
  - an entry title falls back as in `checklist.ts`'s `entryTitle` (export it from there).
- [ ] **Step 2: Run** `./run npm test -- purposes`. Expected: FAIL.
- [ ] **Step 3: Implement** as pure functions over `listItems`, and add the API wrappers.
- [ ] **Step 4: Run** the same command, then tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add purpose logic to the client`.

### Task 4: Library layout

**Files:**
- Create: `client/components/resume/library/{LibraryWorkspace,PurposeList,LibraryOutline}.tsx`, `client/lib/resume/useLibraryLabels.ts`
- Modify: `client/app/resume/sections/page.tsx`, `client/components/resume/LibrarySection.tsx`
- Delete from the page: `LibraryPreview` and its `DocumentWorkspace` use (keep `DocumentWorkspace` if other pages use it)

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `LibraryWorkspace({ header, side, children, detailOpen, onBack })`. The side column is 320px and the section fills the rest. Below 1024px it shows the side as one screen and the section as a detail screen with a back button.
  - `useLibraryLabels()` returns `{ labels, create, rename, remove, apply }`. `apply(labelId, on, targets)` updates local templates' `item_labels` from the response through a `setItemLabels(templateId, map)` the page passes. It is not routed through drafts, so text saves never overwrite labels.
  - `PurposeList({ labels, counts, filter, onFilter })`. Inline create and rename go through `InlineInput`. Delete confirms with "<n> items carry this purpose. CVs keep their ticks." The filter is stored in `localStorage["library-purpose"]` inside try/catch. A stored label that no longer exists falls back to all.
  - `LibraryOutline({ sections: OutlineSection[], selected, onSelect, onReorderSections, onReorderEntries, query, onQuery })`. The profile is the first row. Sections and entries drag with dnd-kit as in `CvChecklist.tsx`. Each row has a `RowMenu` with Move up and Move down. Dragging is off while searching or filtered. Selecting an entry opens its section and scrolls to the entry.

- [ ] **Step 1: Build the page.**
  - It loads labels with templates.
  - Section order is saved with `reorderSectionTemplates`, optimistic, reverted with a toast on failure.
  - Entry order goes through `change` with `moveEntry`/`arrayMove`.
  - Add section and Import put new sections last and select the first new one.
  - Deleting the selected section selects its neighbour.
  - Selection is the profile by default.
- [ ] **Step 2: Run** `./run npm test`, lint, tsc. Expected: PASS.
- [ ] **Step 3: Check in the browser** at 1440px, 1024px and 375px, by mouse and keyboard:
  - pick a purpose, reload, and it's still picked.
  - reorder sections and an entry, reload, and the order is kept.
  - search finds a bullet in another section.
  - import adds sections at the end.
  - with 40 sections and 400 items, switching purpose updates within 100ms.
- [ ] **Step 4: Commit** `feat: show the library as purposes, an outline and one section`.

### Task 5: Labelling in the library editor

**Files:**
- Create: `client/components/resume/library/LabelArea.tsx`, `LabelPicker.tsx`, `SelectionBar.tsx`, `LabelArea.test.ts`
- Modify: `client/components/resume/{SectionDocument,SectionEntryEditor}.tsx`, `client/components/resume/LibrarySection.tsx`, `client/app/resume/sections/page.tsx`

**Interfaces:**
- Consumes: `labelsOf`, `inFilter`, `useLibraryLabels().apply`, and `offerableItem` from `LeaveOutArea.tsx`.
- Produces:
  - `SectionDocument` gains an optional `library?: { labels: CvLabel[]; itemLabels: Record<string, number[]>; filter: PurposeFilter; selected: ReadonlySet<string>; onToggleSelect(entryId, itemId): void; onLabel(labelId, on, targets): Promise<void> }`. When it's set, `SectionEntryEditor` wraps its editor in `LabelArea` instead of `LeaveOutArea`.
  - `LabelArea` follows `LeaveOutArea`'s hover, focus and tap placement. Beside the item it shows the item's label chips, or "Every purpose" when it has none (inherited ones are marked "from entry"), a select checkbox, and a **Labels** button that opens `LabelPicker`. The picker is a checkbox list of labels plus "New purpose", with the chosen filter's label first.
  - Items not in the filter get reduced opacity through a `<style>` rule built from their ids, scoped to the section's root. The editor's content stays the same.
  - The entry header gets the same `LabelPicker` for the entry's own labels.
  - `SelectionBar` is fixed at the bottom of the section column: "<n> selected", **Add label**, **Remove label**, Clear. The selection clears when the section changes.

- [ ] **Step 1: Write failing tests** in `LabelArea.test.ts`:
  - the chips text for own, inherited and none.
  - the dimming rule includes exactly the ids not in the filter.
  - `onLabel` is called with all selected targets.
- [ ] **Step 2: Run** `./run npm test -- LabelArea`. Expected: FAIL.
- [ ] **Step 3: Implement.** Before `onLabel`, the page awaits `flush()`. If it returns false, it stops with "Your latest edit isn't saved yet, so it can't be labelled." This is how a just-typed bullet's id reaches the server first.
- [ ] **Step 4: Run** `./run npm test`, lint, tsc. Expected: PASS.
- [ ] **Step 5: Check in the browser** by mouse, keyboard and touch (375px):
  - label one bullet.
  - type a bullet and label it within 600ms, reload, and the label is kept.
  - select three bullets and add a label at once.
  - label an entry, and its bullets show "from entry".
  - delete a purpose, and the chips go.
- [ ] **Step 6: Commit** `feat: label bullets and entries in the library`.

### Task 6: New CV and a CV's purpose

**Files:**
- Create: `client/components/resume/NewCvDialog.tsx`, `client/components/resume/PurposeSelect.tsx`
- Modify: `client/app/resume/page.tsx`, `client/components/resume/CvPageHeader.tsx`, `client/app/resume/[id]/page.tsx`, `client/lib/resume/checklist.ts`, `client/lib/resume/useCvChecklist.ts`
- Test: `client/lib/resume/checklist.test.ts`

**Interfaces:**
- Consumes: `getCvLabels`, `purposeCounts`, `itemFits`, `createCurriculum({ whole_library: true, cv_label_id })`, `setCurriculumPurpose`.
- Changes: `tickSection(section, on, fits?)` and `tickEntry(section, entryId, on, fits?)`, where `fits?: (entryId: string, itemId: string) => boolean`. When ticking something whose items are all off, they tick the items `fits` accepts, or all of them if it accepts none. Without `fits` they behave as now. `useCvChecklist` passes `itemFits` for the CV's purpose and linked template, and nothing for Everything or CV-only sections.
- Produces:
  - `NewCvDialog`: a list of Everything and each label with its item count. Choosing one creates the CV and opens it with its title field focused for renaming. Users with no labels skip the dialog. Both "New CV" buttons on `/resume` use it.
  - `PurposeSelect({ labels, value, onChange })` sits in `CvPageHeader` next to the title.
  - Changing the purpose:
    1. `await flush()` and stop if it fails.
    2. Call `setCurriculumPurpose(id, next, false)`.
    3. On 409, confirm "Some ticks here were changed by hand. Changing the purpose resets them to fit <name>. Text doesn't change." On yes, call again with `force: true`.
    4. Load the returned sections into drafts with `replace`, and the checklist follows.

- [ ] **Step 1: Write failing tests** in `checklist.test.ts`:
  - ticking an all-off entry with `fits` accepting one of three items ticks only that one.
  - with `fits` accepting none, all are ticked.
  - an entry with some items still on restores those, ignoring `fits`.
- [ ] **Step 2: Run** `./run npm test -- checklist`. Expected: FAIL. Implement, then run it again. Expected: PASS.
- [ ] **Step 3: Implement** both components and wire them in.
- [ ] **Step 4: Run** `./run npm test`, lint, tsc. Expected: PASS.
- [ ] **Step 5: Check in the browser:**
  - with no labels, New CV opens straight away.
  - with labels, pick Backend, and only fitting content is ticked and the title is "Backend CV".
  - switch to Data with no hand edits, and there's no question.
  - untick a bullet, switch, and get asked. Cancel and nothing changes. Confirm and it is re-ticked.
  - untick and switch within 600ms, and the untick is saved first, so you're asked.
  - tailor the CV for a job, and the copy shows the same purpose.
- [ ] **Step 6: Commit** `feat: start a CV from a purpose and change it later`.

Release order: deploy with the migration. No data task is needed, since `position` is backfilled in the migration and everything else starts empty.
