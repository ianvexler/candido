# Application CV Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each job one CV slot — upload a file, paste text, or use one of my CVs (a copy for this job, optionally reviewed by AI) — in the job sheet and job page, and separate master CVs from per-job copies on the Resumes page.

**Architecture:** `job_board_entries.cv_curriculum_id` links the job to the copy that is its CV; the existing `cv_key`/`cv_text` upload fields stay, and filling the slot one way clears the others. `POST /job_board_entries/:id/tailorings` gains `review` (default true): it always makes and links a copy, and only starts an AI run when asked. A shared client `CvSlot` component renders the slot in `JobFormSheet` and on the job page; the Resumes page groups copies (curriculums with `tailored_for`) apart from masters.

**Tech Stack:** Rails 8, RSpec, Blueprinter; Next.js, Vitest, existing UI components (`components/ui`, `ConfirmationModal`, Radix Dialog).

**Spec:** `docs/superpowers/specs/2026-11-22-application-cv-slot-design.md` (builds on `docs/superpowers/specs/2026-11-21-cv-tailoring-design.md`)

## Global Constraints

- Branch: `feature/cv-tailoring` (PR #10, unmerged). This reshapes that feature, so it lands in the same PR. Commit the spec and this plan in Task 1.
- Backend tests: `docker compose exec -T -e RAILS_ENV=test backend bundle exec rspec <paths>`; after migrations run `docker compose exec -T backend bin/rails db:migrate` and `docker compose exec -T backend bin/rails db:schema:dump` (schema isn't auto-dumped). Lint: `docker compose exec -T backend bin/rubocop`.
- Client checks, from `client/`: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`.
- At most one of `cv_curriculum_id`, `cv_key`, `cv_text` is set on a job.
- A **copy** is a curriculum with `tailored_for` present; a **master** is any other curriculum.
- A copy keeps its `job_board_entry_id` after it stops being the job's CV.
- `review` defaults to true. Key check (503 "CV tailoring isn't available right now.") and daily limit (429 "You've tailored a lot of CVs today. Try again tomorrow.") apply only when `review` is true, and run before anything is created.
- Clearing `cv_curriculum_id` on upload is CV-only, never in the shared `apply_upload!`.
- UI copy, sentence case: slot heading **CV**; actions **Upload file**, **Paste text**, **Use one of my CVs**, **Open**, **Replace**, **Remove**; picker checkbox **Review it against this job**; note shown only when ticked: "Your CV and this job are sent to Anthropic. Your original CV isn't changed."; Resumes group **Tailored for jobs (n)**; delete warning for a job's current CV: "This is the CV for your <Company> application; its CV slot will be empty."
- No AI wording anywhere in the slot unless a copy with a review is shown or the picker is open.

## Review Focus

1. **Replacing an uploaded file deletes it** — the slot asks before replacing an upload; replacing a copy never deletes the copy. Tests in Task 1 (model keeps the copy) and Task 4 (confirmation shown).
2. **A refused review request (503/429) creates nothing** — no copy, no link, no upload deleted. Tests in Task 2.
3. **Unsaved edits in the sheet are never lost silently** — the discard prompt comes before the picker opens or Open navigates. Checked in Task 5's browser step.
4. **Board load stays one query per association** — `cv_curriculum` (with its latest fit) is preloaded in `index` and `bulk_import`. Test in Task 1.
5. **A copy whose job or master is deleted stays a copy** (grouped under Tailored for jobs, not shown as a master). Tests in Task 3.

---

### Task 1: The job's CV link

**Files:**
- Create: `backend/db/migrate/20261122120000_add_cv_curriculum_to_job_board_entries.rb`
- Modify: `backend/app/models/job_board_entry.rb`, `backend/app/models/curriculum.rb`, `backend/app/blueprints/job_board_entry_blueprint.rb`, `backend/app/blueprints/curriculum_blueprint.rb`, `backend/app/controllers/job_board_entries_controller.rb`, `backend/db/schema.rb`
- Test: `backend/spec/models/job_board_entry_spec.rb`, `backend/spec/requests/job_board_entries_spec.rb`, `backend/spec/requests/curriculums_spec.rb`
- Add (commit only): the spec and this plan

**Interfaces:**
- Produces:
  - Column `job_board_entries.cv_curriculum_id` (bigint, FK to curriculums, `on_delete: :nullify`, indexed). Migration backfills: for each job with `cv_key` and `cv_text` both null and at least one curriculum whose `job_board_entry_id` is that job, set it to the newest such curriculum (by `created_at`, then `id`). `down` removes the column.
  - `JobBoardEntry belongs_to :cv_curriculum, class_name: "Curriculum", optional: true`.
  - `JobBoardEntry#use_cv_copy!(curriculum)` — sets `cv_curriculum`, clears `cv_text`/`cv_key`/`cv_filename` and deletes the stored file (`PdfUploader.delete_key`). Never touches cover letter fields.
  - `JobBoardEntry#upload_cv!` additionally clears `cv_curriculum_id` (in `upload_cv!` itself).
  - `Curriculum has_one :cv_for_job, class_name: "JobBoardEntry", foreign_key: :cv_curriculum_id, inverse_of: :cv_curriculum` (no `dependent`; the FK nullifies).
  - `JobBoardEntryBlueprint` (default view) field `cv_curriculum` → `{ id, title, updated_at, fit }` or `null`, where `fit` is the `report["fit"]` of the copy's latest succeeded run or `null`. The `with_tailored` view and its uses in the controller are removed; the `tailored_curriculums` association on JobBoardEntry stays (used for nullify on delete).
  - `JobBoardEntriesController#index` and `#bulk_import` preload `cv_curriculum: :cv_tailorings`.
  - `CurriculumBlueprint` field `cv_for_job` → `{ id, company }` or `null`.

- [ ] **Step 1: Write failing specs**
  - `job_board_entry_spec.rb`:
    - `"use_cv_copy! links the copy and clears an uploaded file"` — entry with `cv_key: "k"` (stub `PdfUploader.delete_key`), `use_cv_copy!(copy)` → `cv_curriculum == copy`, `cv_key`/`cv_text`/`cv_filename` nil, `PdfUploader` received `delete_key("k")`; cover letter fields unchanged.
    - `"upload_cv! clears the linked copy but keeps it"` — linked entry, `upload_cv!(text: "x")` → `cv_curriculum_id` nil, `Curriculum.exists?(copy.id)` true.
    - `"deleting the linked copy empties the slot"` — `copy.destroy!` → `entry.reload.cv_curriculum_id` nil.
  - `job_board_entries_spec.rb`:
    - `"includes the job's CV with its review fit"` — linked copy with a succeeded run (`report: { "fit" => "strong" }`) and a later failed run → `cv_curriculum` == `{ "id", "title", "updated_at", "fit" => "strong" }`.
    - `"lists jobs without a query per job's CV"` — 3 jobs each with a linked copy and a run; count `sql.active_record` SELECTs during `GET /job_board_entries` (ActiveSupport::Notifications) and assert the count doesn't grow when a 4th job is added. Replace the old `tailored_curriculums` assertions in this file.
  - `curriculums_spec.rb`: `"marks the copy a job uses as its CV"` — `GET /curriculums` → the linked copy has `cv_for_job` `{ "id" => job.id, "company" => job.company }`; a master has `null`.

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec -T -e RAILS_ENV=test backend bundle exec rspec spec/models/job_board_entry_spec.rb spec/requests/job_board_entries_spec.rb spec/requests/curriculums_spec.rb`
Expected: FAIL (`undefined method use_cv_copy!`, missing `cv_curriculum` key).

- [ ] **Step 3: Implement the migration, associations, methods, blueprints and preloads**

- [ ] **Step 4: Run the full backend suite and rubocop** — expected all green.

- [ ] **Step 5: Commit**

```bash
git add backend docs/superpowers/specs/2026-11-22-application-cv-slot-design.md docs/superpowers/plans/2026-11-22-application-cv-slot.md
git commit -m "Give each job one CV, linked to a copy or uploaded"
```

---

### Task 2: Make a copy for the job, with or without a review

**Files:**
- Modify: `backend/app/controllers/cv_tailorings_controller.rb`
- Test: `backend/spec/requests/cv_tailorings_spec.rb`

**Interfaces:**
- Consumes: `JobBoardEntry#use_cv_copy!` (Task 1).
- Produces: `POST /job_board_entries/:job_board_entry_id/tailorings` params `{ curriculum_id, review }` (`review` cast with `ActiveModel::Type::Boolean`, absent → true). Response 201 `{ curriculum: <full>, cv_tailoring: <run> | null }`. In one transaction: `duplicate_for_job!`, `job.use_cv_copy!(copy)`, and (when review) `start_run`; job enqueued after commit only when review. `ensure_available!` runs only when review, before the transaction.

- [ ] **Step 1: Write failing specs**
  - `"makes and links a plain copy without a review"` — `review: false`, `configured?` stubbed false → 201, `cv_tailoring` null, no `CvTailoringJob` enqueued, `job.reload.cv_curriculum_id == response curriculum id`, `CvTailoring.count` 0.
  - `"replaces an uploaded CV with the reviewed copy"` — job with `cv_text: "old"` → after create (review true) `cv_text` nil, linked to the copy.
  - `"creates nothing when the review can't start"` — 503 (not configured) and 429 (limit reached) with `review: true`: `Curriculum.count` unchanged, job's `cv_text` unchanged, no link.
  - `"plain copies don't count toward the daily limit"` — limit reached, `review: false` → 201.
  - Keep the existing create-for-job specs passing (default review true).

- [ ] **Step 2: Run to verify they fail** — `rspec spec/requests/cv_tailorings_spec.rb`, expected FAIL on the new examples.

- [ ] **Step 3: Implement** in `create_for_job`.

- [ ] **Step 4: Run the full backend suite and rubocop** — green.

- [ ] **Step 5: Commit** — `git commit -m "Copy a CV for a job with or without an AI review"`

---

### Task 3: Client types, API and grouping helpers

**Files:**
- Modify: `client/lib/types.ts`, `client/api/resources/cvTailorings/createCvTailoring.ts`
- Create: `client/lib/resume/curriculumGroups.ts`
- Test: `client/lib/resume/curriculumGroups.test.ts`

**Interfaces:**
- Produces:
  - `JobBoardEntry.cv_curriculum: { id: number; title: string; updated_at: string; fit: CvTailoringReport["fit"] | null } | null`; remove `tailored_curriculums`.
  - `Curriculum.cv_for_job: { id: number; company: string } | null`.
  - `createCvTailoring(jobId: number, curriculumId: number, options?: { review?: boolean }): Promise<{ curriculum: Curriculum; cv_tailoring: CvTailoring | null }>` (sends `review`, default true).
  - `isCopy(c: Pick<Curriculum, "tailored_for">): boolean` — `Boolean(c.tailored_for?.trim())`.
  - `splitCurriculums(list: Curriculum[]): { masters: Curriculum[]; copies: Curriculum[] }` — order preserved.

- [ ] **Step 1: Write failing tests** — `isCopy` true for `"Acme"`, false for `null` and `"  "`; `splitCurriculums` splits a mixed list preserving order, including a copy whose `job_board_entry_id` is null (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run lib/resume/curriculumGroups.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement types, API option and helpers.** Fix any type errors from the removed `tailored_curriculums` by deleting the "Tailored CVs" tab code in `EntryDocArea.tsx` (its replacement comes in Task 5).
- [ ] **Step 4: Run** vitest, `tsc --noEmit`, lint — green.
- [ ] **Step 5: Commit** — `git commit -m "Add client types for the job's CV and master/copy grouping"`

---

### Task 4: The CV slot and the picker

**Files:**
- Create: `client/components/jobBoard/entry/CvSlot.tsx`
- Modify: `client/components/jobBoard/entry/TailorCvDialog.tsx` (rename to `UseCvDialog.tsx`), `client/components/jobBoard/entry/EntryDocCard.tsx` (only if needed to reuse it for the upload/text state)

**Interfaces:**
- Consumes: Task 3 types, `createCvTailoring`, `splitCurriculums`, existing `uploadCVJobBoardEntry`, `apiErrorMessage`, `FIT_LABELS` (`client/lib/resume/reviewPanel.ts`).
- Produces:
  - `CvSlot` props `{ entry: JobBoardEntry; onUpdateEntry: (entry: JobBoardEntry) => void; beforeLeave?: (action: () => void) => void }`. `beforeLeave` wraps any action that opens the picker or navigates (the sheet uses it for its discard prompt); default runs the action directly.
  - States: **empty** → **Upload file**, **Paste text**, **Use one of my CVs**. **Upload or text** → today's EntryDocCard behaviour (view file / edit text / save) plus **Replace** (menu: Upload file, Paste text, Use one of my CVs) and **Remove**; replacing an upload or text with anything asks first via `ConfirmationModal` ("Replace the uploaded CV?" / "The current file is deleted."). **Copy** → title, "Edited <relative date>" (date-fns `formatDistanceToNow`), fit badge (`FIT_LABELS`) when `fit` is set, **Open** (`/resume/<id>`), **Replace** menu (no confirmation; the copy is kept), **Remove** (unlinks: `uploadCVJobBoardEntry(entry.id)` with no text/file clears all three, per Task 1).
  - `UseCvDialog` props `{ open; onClose; entry: JobBoardEntry; onCreated: (result) => void }`: lists **masters only** (`splitCurriculums`), checkbox **Review it against this job** ticked by default, the Anthropic note only while ticked; choosing a CV calls `createCvTailoring(entry.id, id, { review })`. On 503 or 429: show `apiErrorMessage`, untick the box, keep the dialog open. On success: `onCreated`, then navigate to `/resume/<copy id>`. Empty masters list: "You don't have any CVs yet." with a link to `/resume`.

- [ ] **Step 1: Implement `CvSlot` and `UseCvDialog`** (rename the dialog file with `git mv`).
- [ ] **Step 2: Run** vitest, `tsc --noEmit`, lint — green.
- [ ] **Step 3: Commit** — `git commit -m "Add the CV slot and the use-one-of-my-CVs picker"`

---

### Task 5: Put the slot in the job sheet and the job page

**Files:**
- Modify: `client/components/jobBoard/JobFormSheet.tsx`, `client/components/jobBoard/entry/EntryDocArea.tsx`, `client/app/board/page.tsx` (only to refresh the entry in the board list after the slot changes, if the sheet's entry comes from there)

**Interfaces:**
- Consumes: `CvSlot` (Task 4).
- Produces:
  - In `JobFormSheet` edit mode (not create), a **CV** section below the job fields rendering `CvSlot` with `beforeLeave`: if `hasUpdatedFields`, open the existing discard modal and run the pending action on confirm (store it in a `pendingLeave` ref/state); otherwise run it at once. Cancel keeps the sheet and its edits.
  - `EntryDocArea`: the CV tab renders `CvSlot`; the Cover Letter tab is unchanged; no "Tailored CVs" tab.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** vitest, `tsc --noEmit`, lint — green.
- [ ] **Step 3: Commit** — `git commit -m "Show the job's CV in the sheet and on the job page"`

---

### Task 6: Resumes page groups masters and copies

**Files:**
- Modify: `client/app/resume/page.tsx`

**Interfaces:**
- Consumes: `splitCurriculums`, `Curriculum.cv_for_job`.
- Produces: masters in the main grid; below, a collapsed **Tailored for jobs (n)** group (button with chevron, `aria-expanded`) listing copies as compact rows: title, "For <tailored_for>", edited date, link; hidden when there are no copies. The delete confirmation for a curriculum with `cv_for_job` uses the description "This is the CV for your <company> application; its CV slot will be empty." Empty state ("no resumes") counts masters only.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** vitest, `tsc --noEmit`, lint — green.
- [ ] **Step 3: Commit** — `git commit -m "Keep master CVs apart from copies made for jobs"`

---

### Task 7: Review from the editor for a plain copy, and end-to-end check

**Files:**
- Modify: `client/components/resume/review/ReviewPanel.tsx`

**Interfaces:**
- Produces: when `tailoring` is null and the job still exists, the panel's empty state reads "Get suggestions to fit this CV to <job>." with a **Review against this job** button (calls the existing `onRerun`); the footer's **Re-run review** only shows once a review exists.

- [ ] **Step 1: Implement**, then run vitest, `tsc --noEmit`, lint — green. Commit — `git commit -m "Offer a first review on a plain copy"`.
- [ ] **Step 2: Browser check (controller)** on the running stack: open a job from the board → sheet shows **CV**; upload a PDF → shows the file; **Replace → Use one of my CVs** asks first, picker lists masters only, untick the review → plain copy opens in the editor, the job's slot shows it with no fit badge; back on the board the sheet shows the copy; with unsaved sheet edits, **Use one of my CVs** shows the discard prompt first; Resumes page shows masters and a collapsed **Tailored for jobs (n)**; deleting the job's CV copy shows the warning and empties the slot; with no API key, ticking the review shows the 503 message and unticks the box. Check 375px width for horizontal scroll.
