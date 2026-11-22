# CV tailoring from a job board entry — design

## Intent

A user keeps a **master CV** and makes **one version per application**. From a
job on their board, they pick a saved CV, get a copy made for that job, and
Claude reviews the copy against the job: a short report on fit, plus specific
suggested edits shown on the CV itself. The user accepts, edits or rejects each
suggestion. The master is never changed.

The value is speed and focus: seeing in a minute what to emphasise for this
job, without rewriting the CV by hand or pasting it into a chatbot.

## Goals

- Start tailoring from a job entry, choosing any of the user's saved CVs.
- A copy of that CV, linked to the job, is what gets reviewed and edited.
- A concise report: overall fit, the job's key requirements and whether the CV
  covers them, and the main gaps.
- Suggestions pinned to exact text in the CV, each with accept / edit / reject.
- Claude reads the posting at the job's URL in addition to the stored
  description and tags.
- The review is saved, so leaving and coming back costs nothing.

## Non-goals (v1)

- Company research via web search (possible later option).
- Suggestions that add or delete whole sections, reorder sections, or change
  the header, dates, role/organisation fields or design.
- Cover letters.
- "Accept all".

## Anti-goals

- **Invented experience.** Claude may reword, re-emphasise, tighten, or
  surface what the CV already says. Anything that would need facts the CV
  doesn't contain is a *note* ("If you've used Kafka, mention it here"), never
  replacement text.
- **Walls of text.** Everything shown must be scannable. Long explanations
  or bloated rewrites make the feature a failure even if it technically works.
- Touching the master CV.

## Constraints

- Backend: Rails, `anthropic` gem; LLM calls follow the `CvImports::Extractor`
  pattern (one class owns model/provider details, structured JSON output,
  mapped error messages, no CV content in logs).
- Long-running work runs as an ActiveJob that the client polls (`pollUntil`),
  like `CvImportJob`, including stale-expiry for jobs dropped by a restart.
- Each run is a paid call: a per-user daily limit (10/24h, separate from CV
  imports).
- The job posting page is untrusted input. The prompt treats it as data; the
  only output is suggestions the user reviews, so injected text can at worst
  produce bad suggestions.
- Section content is sanitised HTML edited in TipTap (`SectionDocument`).

## Approaches considered

- **A. Quote-anchored suggestions (chosen).** Claude returns section id, the
  exact text it refers to, a replacement and a reason. The editor finds and
  highlights that text; accept swaps it in. Precise, per-change control. If the
  text was edited before review, the suggestion goes stale and falls back to a
  note.
- B. Bullet-anchored: "section 3, bullet 2" + full replacement bullet. Simpler
  matching but coarse, and reordering breaks anchors.
- C. Whole-section rewrite shown as a diff. Natural rewrites, but noisy diffs
  make per-change accept/reject messy.

The user picked A and asked that the UI/UX be good, with short answers and
concise explanations.

## Concision rules (enforced, not just requested)

Stated in the prompt, and checked server-side; items over the limit are
truncated at a word boundary (report text) or dropped (suggestions):

| Field | Limit |
|---|---|
| Summary | ≤ 240 characters, 1–2 sentences |
| Requirements | ≤ 8 items, each ≤ 60 characters |
| Gaps | ≤ 4 items, each ≤ 90 characters |
| Suggestion reason | ≤ 120 characters, one sentence |
| Suggestion replacement | ≤ original length × 1.3 + 40 characters |
| Suggestions | ≤ 12 total, most impactful first |

## Design

### Flow

1. Job entry page (`/board/[id]`): a **Tailor a CV** action (in the doc area,
   alongside CV / Cover Letter) opens a dialog listing the user's CVs. Tailored
   copies already made for this job are listed there too, with "Open".
2. Choosing a CV: the backend copies it (title "<CV title> – <Company>"), links
   the copy to the job and to its source CV, creates a tailoring run, and
   enqueues the job. The client navigates to the copy in the resume editor in
   review mode.
3. While the run is in progress (~30–90s), the review panel shows progress
   ("Reading the posting…", "Comparing with your CV…" — cosmetic) and the CV
   stays editable.
4. When done, the report and suggestions appear.

### Data

- `curriculums.job_board_entry_id` (nullable FK, nullify on job delete) and
  `curriculums.source_curriculum_id` (nullable self-FK, nullify on delete).
  A job can have several tailored copies.
- `cv_tailorings`: user, curriculum (the copy), job_board_entry, status
  (`pending/processing/succeeded/failed`), `report` jsonb, `error_message`,
  `used_posting` boolean (whether the URL was read), timestamps.
- `cv_tailoring_suggestions`: tailoring, curriculum_section, `kind`
  (`rewrite` | `note`), `field` (`content` | `description`), `quote`,
  `replacement` (null for notes), `reason`, `status`
  (`pending/accepted/edited/rejected`), position.
- Copying a CV duplicates its header overrides, styles, layout and sections
  (all fields incl. hidden, placement, section_template link and synced_at).
- *(Builder-check call)* Each run snapshots the job's `job_title` and
  `company` when created, so the panel header and the "For <Company>" label
  survive the job being deleted. `cv_tailorings.job_board_entry_id` is
  nullified on job delete; with no job, **Re-run** is hidden and the panel
  says the job was removed.
- *(Builder-check call)* Runs are kept as history, but the panel shows only
  the **latest** run: its report and its suggestions (open and Done). A
  re-run marks the previous run's pending suggestions `rejected`, and sends
  the quotes of rejected suggestions from earlier runs to the model as
  "already declined, don't repeat".
- *(Builder-check call)* On a tailored copy, "Update from library" on a
  section asks for confirmation first, since it would overwrite tailored text.

### Model call

- New `CvTailorings::Reviewer`, modelled on `CvImports::Extractor` (same model
  env pattern, e.g. `CV_TAILOR_MODEL`, default `claude-opus-5-5`; same
  fallbacks/error handling).
- Input: job title, company, location, description, tags; the CV as plain text
  per section, each section labelled with its id, with hidden text removed.
- If the job has a URL, the request enables the Anthropic `web_fetch` server
  tool, restricted to that URL's domain and one use. If fetching fails, the
  review continues from the stored description and the report says so
  (`used_posting: false`).
- Output (JSON schema): `fit` (`strong` | `partial` | `weak`), `summary`,
  `requirements[] {text, covered: yes|partly|no}`, `gaps[]`,
  `suggestions[] {section_id, field, kind, quote, replacement, reason}`.
- Server validation: drop suggestions whose section id isn't in this CV or
  whose quote doesn't occur in that section's plain text; apply the concision
  limits above.

### Review UI (resume editor, review mode)

The right-hand aside gets two tabs, **Review** and **Preview**; Review is
open by default when the CV has a tailoring run.

```
┌ Review ─ Preview ───────────────────────┐
│ Acme · Backend Engineer       ● Partial │
│ Strong on APIs and Postgres; Kubernetes │
│ and on-call experience are underplayed. │
│                                         │
│ Requirements                            │
│ ✓ Go or Rust   ◐ Kubernetes   ✗ On-call │
│                                         │
│ Suggestions  5 left                     │
│ ▸ Experience · Acme       Rewrite       │
│   Name the scale; the role stresses it. │
│ ▸ Skills                  Note          │
│   Add Terraform if you've used it.      │
└─────────────────────────────────────────┘
```

- In the section documents, each suggestion's quoted text gets a soft
  highlight and underline (TipTap decoration, not stored in the content).
  Clicking it or its panel row opens a small card:
  ```
  Name the scale; the role stresses it.
  − Built APIs for internal tools
  + Built APIs serving 2M requests/day
  [Accept] [Edit] [Reject]
  ```
- **Accept** replaces the quoted range with the replacement, then the normal
  autosave runs. **Edit** turns the "+" line into an inline text field;
  Apply saves it as `edited`. **Reject** dismisses it. Status is saved to
  the backend so it persists.
- **Notes** have no replacement: they show the reason with Dismiss.
- **Stale** (quote no longer found because the user edited it): the row stays
  in the panel, marked "Text changed", with Dismiss and a copy button for the
  replacement.
- Clicking a panel row scrolls the section into view and opens its card.
- Resolved suggestions collapse into a "Done (n)" group.
- **Re-run review** button at the bottom: starts a new run on the copy's
  current text; pending suggestions from the old run are discarded.
- Errors and the daily limit appear inline in the panel with a retry.

### Elsewhere

- Resume list: tailored copies show a small "For <Company>" label.
- Job entry page: lists tailored CVs linked to the job, each linking to its
  editor.

## Left to the builder

- Exact component structure and file names, API route naming (following
  existing `routes.rb` style), blueprint shapes.
- Matching strategy for quotes inside TipTap (e.g. normalised whitespace,
  search within one block's text nodes) and how marks are kept on replaced
  text.
- Polling interval/timeout (mirror CV import), progress copy, empty states.
- Prompt wording, within the rules above.
