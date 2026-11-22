# Application CV slot — design

Builds on `2026-11-21-cv-tailoring-design.md` (PR #10, branch `feature/cv-tailoring`).

## Intent

People use Candido in two ways, often mixed: some only **track** applications,
others want to **work on** an application in the app (a copy of a CV, reviewed
with AI). Both must feel native. Tracking must never look like it is missing
something, and the AI help must not feel like a separate app.

Today a job has an upload slot for "the CV I sent" (file or pasted text, on
the job page only) and, separately, any number of tailored copies. That gives
a job two unrelated "CVs" and needs a feature name the user disliked.

**Decision:** each application has **one CV slot**. Tailoring is just one way
to fill it, so it needs no feature name of its own.

## Goals

- One CV slot per job, filled by: **uploading a file**, **pasting text**, or
  **using one of my CVs** (which makes a copy for this job).
- When using one of my CVs, a checkbox **"Review it against this job"**
  (ticked by default) runs the existing AI review on the copy. Unticked, the
  copy is plain, and the review can still be run later from the editor.
- The slot is in the **job sheet** (what opens when you click a card on the
  board) and on the job page's CV tab, using the same component.
- **Master CVs and per-job copies are distinct.** The Resumes page shows
  masters; copies sit in a collapsed "Tailored for jobs (n)" group.
- Replacing the slot's content never deletes a copy: it just stops being that
  job's CV and stays in the "Tailored for jobs" group.

## Non-goals

- Cover letters in the app (the slot is built so a cover letter slot can follow
  the same shape later; the existing cover letter upload stays as is).
- Several CVs per job.
- Snapshotting a PDF of what was sent.

## Anti-goals

- AI wording or prompts shown to someone who only uploads files.
- Master CVs buried under per-job copies.
- Losing user work silently (copies, unsaved sheet edits).

## Approaches considered

- **A. Link the copy from the job (chosen).** `job_board_entries.cv_curriculum_id`
  next to the existing upload fields; the slot is empty, upload/text, or linked
  copy, and filling it one way clears the others. Least churn; cover letters
  can follow later.
- B. A general `application_documents` table (type, source, file/text/CV),
  migrating the CV and cover letter columns. Cleanest for many document types,
  but rewrites working upload code now for no visible gain.
- C. Derive the job's CV (newest copy, else upload). No schema change, but
  "replace" and choosing an older copy become special cases.

## Design

### Data

- `job_board_entries.cv_curriculum_id` — nullable FK to `curriculums`,
  `on_delete: :nullify`. At most one of: `cv_curriculum_id`, `cv_key`,
  `cv_text` is set.
- A **copy** is any curriculum with `tailored_for` present (set when the copy is
  made and never cleared, so a copy stays a copy if its job or master is
  deleted). A **master** is everything else. *(Builder-facing call; an explicit
  column is fine if it reads better.)*
- Existing data: for each job with no upload and at least one copy linked by
  `curriculums.job_board_entry_id`, set `cv_curriculum_id` to its newest copy.

### Backend behaviour

- `POST /job_board_entries/:id/tailorings` gains `review` (boolean, default
  true). It always makes the copy and links it as the job's CV (clearing and
  deleting any uploaded file). With `review: true` it also starts a run, and
  only then do the API key check (503) and daily limit (429) apply. Response:
  `{ curriculum, cv_tailoring | null }`.
- Uploading a file or pasting text for the CV (existing endpoints) clears
  `cv_curriculum_id`. Clearing the slot clears all three.
- `JobBoardEntryBlueprint` (all views) includes `cv_curriculum: { id, title,
  updated_at } | null` — one belongs_to, preloaded in `index` to avoid N+1. The
  `with_tailored` view and the client's "Tailored CVs" tab are removed.
- `CurriculumBlueprint` exposes enough for the Resumes page to group (`tailored_for`
  is already there).
- `POST /curriculums/:id/tailorings` (Re-run) also works for a plain copy that has
  never been reviewed (it already needs only a linked job).

### The slot (shared client component)

Empty:
```
CV
[Upload file]  [Paste text]  [Use one of my CVs]
```
Filled with an upload: filename (or "Pasted text"), View, Replace ▾, Remove —
as today's job page card. Filled with a copy:
```
CV
Main CV – Acme              ● Partial fit
Edited 2h ago        [Open]  [Replace ▾]
```
The fit badge appears only when the copy has a succeeded review. "Replace"
offers the other two ways to fill it. Replacing an uploaded file asks first
(the file is deleted); replacing a copy doesn't (the copy is kept).

### "Use one of my CVs" dialog

The existing CV picker, listing **master CVs only**, plus:
`☑ Review it against this job` with a one-line note ("Your CV and this job are
sent to Anthropic. Your original CV isn't changed."), shown only when ticked.
If the server answers 503 (no key), the dialog shows that message and unticks
the box, so the user can carry on with a plain copy. After it's made, open the
copy in the editor (reviewed or not).

### Where the slot appears

- **Job sheet**: below the job fields, only for existing jobs (not in create
  mode). If the sheet has unsaved changes when the user picks "Open" or makes a
  copy, show the sheet's existing discard-changes prompt first.
- **Job page**: replaces the "CV" tab's card; the "Tailored CVs" tab is removed.

### Resumes page

Masters in the main grid. Below, a collapsed **"Tailored for jobs (n)"** group
listing copies with "For <Company>" and a link. Creating a resume creates a
master. A tailored copy's editor keeps its Review tab.

## Calls made after the builder check

- A copy **keeps its `job_board_entry_id`** when it stops being the job's CV: it
  was still made for that job, so "For <Company>" and Re-run keep working
  against that job. Only `job_board_entries.cv_curriculum_id` says which copy
  is the job's CV.
- **Deleting the job's current CV copy** from the Resumes page warns in the
  delete confirmation ("This is the CV for your <Company> application; its CV
  slot will be empty.") and then empties the slot (nullify). The curriculum
  blueprint exposes whether it is a job's current CV.
- In the sheet, the **discard-changes prompt** comes before anything happens:
  before the picker opens and before "Open" navigates. Nothing is created
  while unsaved edits are pending.
- `POST /job_board_entries/:id/tailorings` checks the key (503) and the daily
  limit (429) **before** creating anything, so a refused request leaves no copy.
  The dialog treats **429 like 503**: show the message, untick the review box,
  and let the user continue with a plain copy.
- Clearing `cv_curriculum_id` on upload is **CV-only** (in `upload_cv!`), never
  in the shared `apply_upload!` used by cover letters.
- Existing jobs that have both an upload and copies keep the upload as their
  CV; their copies just appear in the "Tailored for jobs" group.

## Left to the builder

- Component and file names, how the sheet and job page share the slot.
- Exact migration code, preloading, blueprint shapes.
- Copy for empty states and confirmations, within the rules above.
