# CV Tailoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a job board entry, copy one of the user's CVs for that job and have Claude review the copy against the job: a concise report plus quote-anchored suggestions the user accepts, edits or rejects in the resume editor.

**Architecture:** `POST job_board_entries/:id/tailorings` copies a curriculum (linked to the job and its source) and creates a `cv_tailorings` run, processed by `CvTailoringJob` like `CvImportJob`. Only `CvTailorings::Reviewer` knows about Claude: it sends the job and the CV's plain text (sections labelled by id), optionally with the `web_fetch` server tool on the job URL, and gets structured JSON back. `CvTailorings::Normalizer` enforces the concision limits and drops suggestions whose quote isn't in the text that was sent; survivors become `cv_tailoring_suggestions` rows. The client polls the latest run, shows a Review tab beside Preview, highlights quotes with a TipTap decoration, and applies accepted text through the editor so the normal autosave runs.

**Tech Stack:** Rails 8, ActiveJob, `anthropic` gem ~> 2.12 (beta messages, structured output, server-side fallbacks, `web_fetch_20260209`), RSpec + FactoryBot. Next.js, TipTap 3 / ProseMirror decorations, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-cv-tailoring-design.md`

## Global Constraints

- Branch `feature/cv-tailoring`, cut from the current tip of `feature/resume-templates` (the resume editor this builds on has 26 commits not yet on `main`). Commit the spec in Task 1.
- Model: `ENV.fetch("CV_TAILOR_MODEL", "claude-opus-5-5")`; effort `:medium`; `max_tokens: 16_000`; reuse `CvImports::Extractor::BETAS`, `FALLBACK_MODELS` and `CLIENT_OPTIONS` (same fallback rule).
- Web fetch tool, only when the job URL is `http(s)` with a host: `{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 1, allowed_domains: [host], citations: { enabled: false }, max_content_tokens: 20_000 }`. Citations must stay off (they 400 with structured output). The URL must appear in the user message (web fetch only fetches URLs present in the conversation).
- `pause_turn`: resend with the assistant content appended, at most 3 continuations, then fail with the busy message.
- Daily limit: `CvTailoring::DAILY_LIMIT = 10` runs per user per rolling 24h → 429 "You've tailored a lot of CVs today. Try again tomorrow." Failed runs count.
- No `ANTHROPIC_API_KEY` → 503 "CV tailoring isn't available right now."
- Stale after 10 minutes in `pending/processing` → `failed` with "Something went wrong reviewing this CV. Try again later." (mirror `CvImport.expire_stale!` / `expire_if_stale!`).
- Statuses: run `pending/processing/succeeded/failed`; suggestion `pending/accepted/edited/rejected`; kind `rewrite/note`; field `content/description`; fit `strong/partial/weak`; covered `yes/partly/no`.
- Concision limits (Normalizer): summary ≤ 240 chars; requirements ≤ 8, each ≤ 60; gaps ≤ 4, each ≤ 90; reason ≤ 120; suggestions ≤ 12; replacement ≤ `quote.length * 1.3 + 40`. Report text over a limit is cut at a word boundary with "…"; an over-long reason is cut the same way; an over-long replacement drops the suggestion; extra list items are dropped.
- Copy title: `"#{source.title} – #{job.company}"` (en dash). `curriculums.tailored_for` stores `job.company` at copy time (plan-level addition so the resume list label needs no join).
- Replacement text is always inserted as plain text, never parsed as HTML.
- UI copy is sentence case. Job page button: **Tailor a CV**. Aside tabs: **Review**, **Preview**. Stale label: **Text changed**. Resolved group: **Done (n)**. Rerun button: **Re-run review**. Job removed notice: **This job was removed from your board.**

## Review Focus

1. **The posting URL can't be read** (404, blocked domain, PDF, login wall). The review still succeeds from the stored description, with `used_posting: false` and the panel saying "Couldn't open the posting; reviewed from the saved description." Test in Task 3.
2. **The user edits a section while the review runs, or before reviewing.** The server validates quotes against the text it sent; the client shows any suggestion whose quote is no longer in the block as **Text changed**, never highlighting the wrong words. Tests in Task 5 (`findQuote` returns null) and Task 7.
3. **The posting contains injected instructions or HTML.** Output is schema-bound; unknown section ids are dropped; `<script>` in a replacement lands as literal text. Tests in Task 2 and Task 5.
4. **Double-clicking Re-run, or Re-run while a run is in progress.** One active run per curriculum: a second request returns 409 "A review is already running." Test in Task 4.
5. **A quote that appears twice in a section, or spans irregular whitespace / non-breaking spaces.** Highlight the first occurrence, matching whitespace-insensitively. Tests in Task 5.

---

### Task 1: Data model and CV copy

**Files:**
- Create: `backend/db/migrate/20261122100000_add_tailoring_to_curriculums.rb`, `backend/db/migrate/20261122100100_create_cv_tailorings.rb`, `backend/db/migrate/20261122100200_create_cv_tailoring_suggestions.rb`
- Create: `backend/app/models/cv_tailoring.rb`, `backend/app/models/cv_tailoring_suggestion.rb`
- Modify: `backend/app/models/curriculum.rb`, `backend/app/models/job_board_entry.rb`, `backend/app/models/user.rb`, `backend/db/schema.rb`
- Create: `backend/spec/factories/cv_tailorings.rb`, `backend/spec/factories/cv_tailoring_suggestions.rb`, `backend/spec/models/cv_tailoring_spec.rb`
- Modify: `backend/spec/models/curriculum_spec.rb`
- Add: `docs/superpowers/specs/2026-11-21-cv-tailoring-design.md` (commit only)

**Interfaces:**
- Produces:
  - `curriculums`: `job_board_entry_id` (FK, `on_delete: :nullify`), `source_curriculum_id` (self FK, `on_delete: :nullify`), `tailored_for` string.
  - `cv_tailorings`: `user_id`, `curriculum_id` (FK, cascade), `job_board_entry_id` (FK, nullify), `job_title` string not null, `company` string not null, `status` string default `"pending"`, `report` jsonb, `error_message` string, `used_posting` boolean default false, timestamps; index `[curriculum_id, created_at]`, `[user_id, created_at]`.
  - `cv_tailoring_suggestions`: `cv_tailoring_id` (FK, cascade), `curriculum_section_id` (FK, cascade), `kind`, `field`, `quote` text not null, `replacement` text, `reason` string not null, `status` default `"pending"`, `position` integer, timestamps.
  - `Curriculum#duplicate_for_job!(job) -> Curriculum`; `Curriculum has_many :cv_tailorings, dependent: :destroy`; `Curriculum#latest_tailoring -> CvTailoring | nil`.
  - `JobBoardEntry has_many :tailored_curriculums, class_name: "Curriculum", dependent: :nullify`.
  - `CvTailoring.limit_reached?(user)`, `CvTailoring.expire_stale!`, `CvTailoring#expire_if_stale!`, `CvTailoring#active?` (pending or processing), `CvTailoring.find_owned!(user, id)`; `has_many :suggestions, -> { order(:position) }, class_name: "CvTailoringSuggestion"`.
  - `CvTailoringSuggestion.find_owned!(user, id)` (via tailoring's user); `CvTailoringSuggestion#resolve!(status:, replacement: nil)` — status must be `accepted/edited/rejected`; `edited` requires a non-blank replacement ≤ 2000 chars.

- [ ] **Step 1: Write failing specs**

`curriculum_spec.rb`:
- `"duplicate_for_job! copies header, styles, layout and every section field"` — source with 2 sections (one hidden, one with `placement: "sidebar"`, section_template set, dates); copy has title `"Main CV – Acme"`, `tailored_for == "Acme"`, `job_board_entry == job`, `source_curriculum == source`, same header/styles/layout, sections in the same order with equal `title, section_type, description, content, role, organization, location, start_date, end_date, current, hidden, placement, section_template_id, synced_at, styles`, different ids.
- `"duplicate_for_job! leaves the source untouched"` — source sections count and `updated_at` unchanged.
- `"deleting the job nullifies the copy's link"` — `job.destroy!` → `copy.reload.job_board_entry_id` is nil, copy still exists.

`cv_tailoring_spec.rb`:
- `"limit_reached? counts runs in the last 24 hours"` — 10 runs within 24h → true; 9 within + 1 from 25h ago → false.
- `"expire_stale! fails runs untouched for 10 minutes"` — processing 11 min ago → failed with the stale message; 2 min ago → unchanged.
- `"resolve! rejects an unknown status"` and `"resolve! requires replacement text for edited"` → raise `ActiveRecord::RecordInvalid`.

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec backend bundle exec rspec spec/models/curriculum_spec.rb spec/models/cv_tailoring_spec.rb`
Expected: FAIL (`undefined method duplicate_for_job!`, `uninitialized constant CvTailoring`).

- [ ] **Step 3: Write the migrations and models**

`duplicate_for_job!` runs in one transaction and copies each section with `create!` from `attributes.except("id", "curriculum_id", "created_at", "updated_at")` (not `insert_all`, which would skip the content-normalising callbacks). Run `bin/rails db:migrate` and let annotaterb update model headers.

- [ ] **Step 4: Run the specs to verify they pass**

Run: same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend docs/superpowers/specs/2026-11-21-cv-tailoring-design.md
git commit -m "Add tailored CV copies and tailoring runs"
```

---

### Task 2: CV text and output normaliser

**Files:**
- Create: `backend/app/services/cv_tailorings/cv_text.rb`, `backend/app/services/cv_tailorings/normalizer.rb`
- Test: `backend/spec/services/cv_tailorings/cv_text_spec.rb`, `backend/spec/services/cv_tailorings/normalizer_spec.rb`

**Interfaces:**
- Consumes: `Curriculum#visible_sections`, `CurriculumSection#content/description`.
- Produces:
  - `CvTailorings::CvText.call(curriculum) -> Array<{ id: Integer, heading: String, description: String, blocks: Array<String> }>` — hidden sections and `<span data-cv-hidden>` removed; each `p/li/h1-h6/blockquote` becomes one block of whitespace-squished plain text; empty blocks dropped.
  - `CvTailorings::CvText.render(sections) -> String` — prompt text: `"[section 12] Experience · Acme\nSummary: …\n- block\n- block"` per section.
  - `CvTailorings::Normalizer.call(output, sections) -> { report: Hash, suggestions: Array<Hash> }` — `report` keys `fit, summary, requirements, gaps`; suggestion hashes ready for `CvTailoringSuggestion.create!` (`curriculum_section_id, kind, field, quote, replacement, reason, position`).
  - `CvTailorings::Normalizer.squish(text) -> String` — replaces `&nbsp;`/U+00A0 with space and squishes; used for quote matching on both sides.

- [ ] **Step 1: Write failing specs**

`cv_text_spec.rb`:
- `"one block per bullet and paragraph, without hidden text"` — content `"<p>Led <span data-cv-hidden>secret</span>team</p><ul><li>Built APIs</li><li> </li></ul>"` → blocks `["Led team", "Built APIs"]`.
- `"skips hidden sections"`.
- `"render labels sections by id"` — includes `"[section #{id}]"`.

`normalizer_spec.rb` (build `output` hashes by hand):
- `"keeps a rewrite whose quote is in its section"` — quote `"Built  APIs"` (double space) matches block `"Built APIs"`; `position` follows output order.
- `"drops suggestions for unknown sections"` — `section_id: 999_999` dropped.
- `"drops a rewrite whose quote isn't in the section"`.
- `"description suggestions match the section description"` — `field: "description"`.
- `"notes keep no replacement"` — `kind: "note"`, replacement `"x"` → stored `nil`; quote must still match (note anchors to text).
- `"drops a replacement longer than the limit"` — quote 10 chars, replacement 60 chars → dropped; 52 chars → kept.
- `"cuts long report text at a word boundary"` — summary 300 chars → ≤ 241 chars, ends with `"…"`.
- `"caps list lengths"` — 10 requirements → 8; 6 gaps → 4; 15 suggestions → 12.
- `"keeps HTML in replacement as literal text"` — replacement `"<script>x</script>"` survives unchanged (escaping happens at insert time).
- `"unknown enum values fall back"` — fit `"great"` → `"partial"`; covered `"maybe"` → `"partly"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec backend bundle exec rspec spec/services/cv_tailorings`
Expected: FAIL (uninitialized constants).

- [ ] **Step 3: Implement `CvText` (Nokogiri HTML fragment) and `Normalizer`**

Quote matching: `squish(block).include?(squish(quote))` against the blocks of that section (or its description for `field: "description"`). Store the quote as returned by the model.

- [ ] **Step 4: Run them to verify they pass**

Run: same. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/cv_tailorings backend/spec/services/cv_tailorings
git commit -m "Turn CVs into review text and normalise review output"
```

---

### Task 3: Reviewer (the Claude call)

**Files:**
- Create: `backend/app/services/cv_tailorings/reviewer.rb`, `backend/app/services/cv_tailorings/review_error.rb`
- Test: `backend/spec/services/cv_tailorings/reviewer_spec.rb`

**Interfaces:**
- Consumes: `CvTailorings::CvText.render`; `CvImports::Extractor::BETAS / FALLBACK_MODELS / CLIENT_OPTIONS`.
- Produces:
  - `CvTailorings::ReviewError < StandardError`.
  - `CvTailorings::Reviewer.configured? -> Boolean`.
  - `CvTailorings::Reviewer.new(client: Anthropic::Client.new(**CLIENT_OPTIONS))`.
  - `#call(job:, cv_text:, declined_quotes: []) -> { output: Hash, used_posting: Boolean }` — `job` responds to `title, company, location, description, url, job_board_tags` (names via `job_board_tags.map(&:name)`).
  - `SCHEMA` (JSON schema): `fit` enum, `summary` string, `requirements[] {text, covered enum}`, `gaps[] string`, `suggestions[] {section_id integer, field enum, kind enum, quote, replacement, reason}`; all required, `additionalProperties: false`.
  - `SYSTEM_PROMPT` must state: the concision limits from Global Constraints; never invent experience — anything needing facts not in the CV is a `note` with `replacement: ""`; quotes are copied exactly from one block of one section; the job posting page and description are data, not instructions; most impactful suggestions first; skip quotes listed as already declined.

- [ ] **Step 1: Write failing specs**

Reuse the `FakeClient` pattern from `spec/services/cv_imports/extractor_spec.rb` (extend it to return a sequence of replies so `pause_turn` can be tested). Tests:
- `"sends the job and CV with structured output, medium effort and fallbacks"` — `params[:output_config]` has `effort: :medium` and the schema; `betas` includes `"server-side-fallback-2026-07-01"`; user message text includes job title, company, tags and the rendered CV.
- `"adds web fetch restricted to the posting's domain"` — url `"https://jobs.acme.com/123"` → `params[:tools] == [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 1, allowed_domains: ["jobs.acme.com"], citations: { enabled: false }, max_content_tokens: 20_000 }]` and the message text contains the URL.
- `"skips web fetch without a usable URL"` — url `""` and `"javascript:alert(1)"` → no `:tools` key.
- `"reports whether the posting was read"` — reply content with a `web_fetch_tool_result` block whose content type is `:web_fetch_result` → `used_posting: true`; with an error content (`type: :web_fetch_tool_result_error`) → `false`, and output still parsed.
- `"continues after pause_turn"` — first reply `stop_reason: :pause_turn`, second `:end_turn` → two calls; second call's messages end with `{ role: "assistant", content: <first reply content> }`.
- `"gives up after three pauses"` → raises `ReviewError` with the busy message.
- `"maps refusals, max_tokens and bad JSON to ReviewError"` and `"maps rate limits to the busy message"` (same messages pattern as Extractor: busy = "The CV reviewer is busy. Try again in a minute.", unreadable = "We couldn't review this CV.").
- `"passes declined quotes to the model"` — declined `["Built APIs"]` appear in the user message under an "Already declined" line.

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec backend bundle exec rspec spec/services/cv_tailorings/reviewer_spec.rb`
Expected: FAIL.

- [ ] **Step 3: Implement `Reviewer`**

Parse the last `:text` block of the final reply. Log API errors like `Extractor#log_api_error` (never job or CV content).

- [ ] **Step 4: Run them to verify they pass**

Run: same. Expected: PASS.

- [ ] **Step 5: Verify the request shape against the real gem**

If `ANTHROPIC_API_KEY` is set in the dev container, run once from `bin/rails runner` with a small job and CV and a public job URL; confirm a `succeeded`-shaped hash comes back. If the API rejects the tool or schema combination, fix the shape and the spec, and note it in the commit. If no key is set, say so in the task report.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cv_tailorings backend/spec/services/cv_tailorings/reviewer_spec.rb
git commit -m "Review a CV against a job with Claude"
```

---

### Task 4: Job, API and blueprints

**Files:**
- Create: `backend/app/jobs/cv_tailoring_job.rb`, `backend/app/controllers/cv_tailorings_controller.rb`, `backend/app/blueprints/cv_tailoring_blueprint.rb`, `backend/app/blueprints/cv_tailoring_suggestion_blueprint.rb`
- Modify: `backend/config/routes.rb`, `backend/app/blueprints/curriculum_blueprint.rb`, `backend/app/blueprints/job_board_entry_blueprint.rb`
- Test: `backend/spec/jobs/cv_tailoring_job_spec.rb`, `backend/spec/requests/cv_tailorings_spec.rb`

**Interfaces:**
- Consumes: Task 1 models, `CvTailorings::CvText`, `Normalizer`, `Reviewer`.
- Produces (routes):
  - `POST /job_board_entries/:id/tailorings` `{ curriculum_id }` → 201 `{ curriculum: <full>, cv_tailoring }`.
  - `POST /curriculums/:curriculum_id/tailorings` → 201 `{ cv_tailoring }` (re-run; 422 "This job was removed from your board." when the copy has no job; 409 "A review is already running." when the latest run is active).
  - `GET /curriculums/:curriculum_id/tailoring` → `{ cv_tailoring: <latest> | null }` (calls `expire_if_stale!`).
  - `PUT /cv_tailoring_suggestions/:id` `{ status, replacement? }` → `{ suggestion }`.
- Blueprints:
  - `CvTailoringBlueprint`: `id, status, error_message, job_title, company, job_board_entry_id, used_posting, report, created_at`, association `suggestions`.
  - `CvTailoringSuggestionBlueprint`: `id, curriculum_section_id, kind, field, quote, replacement, reason, status, position`.
  - `CurriculumBlueprint` default view gains `job_board_entry_id, source_curriculum_id, tailored_for`.
  - `JobBoardEntryBlueprint` gains `tailored_curriculums` → `[{ id, title, updated_at }]`.
- `CvTailoringJob.perform(cv_tailoring_id)`: claim `pending → processing` atomically; build `CvText.call(curriculum)`; declined quotes = rejected suggestions of earlier runs of the same curriculum; call Reviewer with the tailoring's job (if the job was deleted before the run started, fail with "This job was removed from your board."); normalise; in one transaction create suggestions and set `succeeded`, `report`, `used_posting`. Rescue `ReviewError` → failed with its message; other errors → failed with the stale message and re-raise. Late results for an expired run are dropped (same `with_lock` pattern as `CvImportJob#finish`).
- Re-run (and first run) marks still-`pending` suggestions of earlier runs `rejected`.

- [ ] **Step 1: Write failing specs**

`cv_tailoring_job_spec.rb` (stub `CvTailorings::Reviewer#call`):
- `"stores the report and valid suggestions"` — status `succeeded`, suggestions count matches normalised output, `used_posting` copied.
- `"fails with the reviewer's message"` — `ReviewError.new("The CV reviewer is busy. Try again in a minute.")`.
- `"does nothing for a run already claimed"` — status `processing` → reviewer not called.
- `"passes earlier rejected quotes as declined"`.

`cv_tailorings_spec.rb` (stub `Reviewer.configured?` true, `queue_adapter = :test`):
- `"copies the chosen CV, links it to the job, and starts a review"` — enqueues `CvTailoringJob`; response curriculum title `"Main CV – Acme"`, `job_board_entry_id` set; source unchanged; run has `job_title`/`company` snapshot.
- `"rejects another user's CV or job"` → 403 / 404 as `find_owned!` does today.
- `"returns 503 when not configured"`, `"returns 429 after 10 runs in a day"`.
- `"re-run returns 409 while a review is running"` (Review Focus 4).
- `"re-run rejects leftover pending suggestions"`.
- `"re-run returns 422 when the job was deleted"`.
- `"GET tailoring returns the latest run with suggestions, or null"`; `"expires a stale run on read"`.
- `"PUT suggestion records accepted / edited / rejected"`; `"edited without text returns 422"`; `"another user's suggestion returns 404"`.
- `"job entry lists its tailored CVs"` — `GET /job_board_entries/:id` includes `tailored_curriculums`.

- [ ] **Step 2: Run them to verify they fail**

Run: `docker compose exec backend bundle exec rspec spec/jobs/cv_tailoring_job_spec.rb spec/requests/cv_tailorings_spec.rb`
Expected: FAIL (routing errors / uninitialized constants).

- [ ] **Step 3: Implement job, controller, routes, blueprints**

Controller follows `CvImportsController` (before_action `require_authentication`, `CvTailoring.expire_stale!` before create actions). Map `ActiveRecord::RecordInvalid` to 422 with the model's message.

- [ ] **Step 4: Run the whole backend suite**

Run: `docker compose exec backend bundle exec rspec && docker compose exec backend bin/rubocop`
Expected: all green, no offenses.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "Add the CV tailoring API and background review"
```

---

### Task 5: Client types, API and quote matching

**Files:**
- Modify: `client/lib/types.ts`
- Create: `client/api/resources/cvTailorings/createCvTailoring.ts`, `rerunCvTailoring.ts`, `getLatestCvTailoring.ts`, `updateCvSuggestion.ts`
- Create: `client/lib/resume/suggestions.ts`
- Test: `client/lib/resume/suggestions.test.ts`

**Interfaces:**
- Produces (types): `CvTailoringStatus`, `CvSuggestionStatus`, `CvSuggestion` (blueprint fields), `CvTailoringReport { fit: "strong"|"partial"|"weak"; summary: string; requirements: { text: string; covered: "yes"|"partly"|"no" }[]; gaps: string[] }`, `CvTailoring` (blueprint fields, `report: CvTailoringReport | null`, `suggestions: CvSuggestion[]`). `Curriculum` gains `job_board_entry_id: number | null; source_curriculum_id: number | null; tailored_for: string | null`. `JobBoardEntry` gains `tailored_curriculums?: { id: number; title: string; updated_at: string }[]`.
- Produces (API, axios via `apiClient`, same style as `cvImports/*`):
  - `createCvTailoring(jobId: number, curriculumId: number): Promise<{ curriculum: Curriculum; cv_tailoring: CvTailoring }>`
  - `rerunCvTailoring(curriculumId: number): Promise<{ cv_tailoring: CvTailoring }>`
  - `getLatestCvTailoring(curriculumId: number): Promise<{ cv_tailoring: CvTailoring | null }>`
  - `updateCvSuggestion(id: number, body: { status: "accepted"|"edited"|"rejected"; replacement?: string }): Promise<{ suggestion: CvSuggestion }>`
- Produces (pure helpers in `suggestions.ts`):
  - `findQuote(text: string, quote: string): { from: number; to: number } | null` — offsets into `text`; whitespace runs and U+00A0 match any whitespace run; first occurrence; null if absent or quote blank.
  - `splitSuggestions(suggestions: CvSuggestion[], isStale: (s: CvSuggestion) => boolean): { open: CvSuggestion[]; stale: CvSuggestion[]; done: CvSuggestion[] }` — done = status ≠ pending; order by `position`.
  - `isTailoringActive(t: CvTailoring | null): boolean`.

- [ ] **Step 1: Write failing tests**

```ts
describe("findQuote", () => {
  it("finds an exact quote", () => expect(findQuote("Built APIs for tools", "APIs")).toEqual({ from: 6, to: 10 }));
  it("matches across irregular whitespace", () => expect(findQuote("Built  APIs", "Built APIs")).toEqual({ from: 0, to: 11 }));
  it("returns the first of two matches", () => expect(findQuote("Go and Go", "Go")).toEqual({ from: 0, to: 2 }));
  it("returns null when the text changed", () => expect(findQuote("Built services", "Built APIs")).toBeNull());
  it("returns null for a blank quote", () => expect(findQuote("abc", "  ")).toBeNull());
});
```
Plus `splitSuggestions` sorts by position and separates pending/stale/done.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd client && npx vitest run lib/resume/suggestions.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types, API functions and helpers**

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `cd client && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add client/lib client/api
git commit -m "Add client types, API calls and quote matching for CV tailoring"
```

---

### Task 6: Suggestions in the section editor

**Files:**
- Create: `client/components/resume/review/SuggestionHighlight.ts` (TipTap `Extension` with a ProseMirror plugin), `client/components/resume/review/SuggestionCard.tsx`
- Modify: `client/components/resume/SectionDocument.tsx`, `client/components/resume/CurriculumSectionCard.tsx`
- Test: `client/components/resume/review/suggestionHighlight.test.ts`

**Interfaces:**
- Consumes: `findQuote`, `CvSuggestion`.
- Produces:
  - `SuggestionHighlight` extension, configured via `editor.commands.setSuggestions(items: { id: number; quote: string }[], activeId: number | null)`; for each textblock node runs `findQuote(node.textContent, quote)` and adds an inline decoration `class="cv-suggestion"` (active: `cv-suggestion-active`) with `data-suggestion-id`. Exposes `suggestionRanges(doc, items): Map<number, { from: number; to: number } | null>` (exported pure function, used for stale detection and accept).
  - `SectionDocument` new optional props: `suggestions?: CvSuggestion[]`, `activeSuggestionId?: number | null`, `onSuggestionClick?: (id: number) => void`, `onSuggestionResolve?: (s: CvSuggestion, action: "accept"|"edit"|"reject", text?: string) => Promise<void>`, `onStaleChange?: (staleIds: number[]) => void`.
  - Accept for `field: "content"`: `editor.chain().focus().insertContentAt({ from, to }, { type: "text", text, marks: <marks at from> }).run()` — a text node, so HTML stays literal; then the existing autosave runs. For `field: "description"`: replace the quote in the `description` state via `findQuote` and `markDirty()`.
  - `SuggestionCard` (floating-ui popover anchored to the highlight; description suggestions anchor under the description input): reason line; `−` quote / `+` replacement; buttons **Accept**, **Edit**, **Reject**; Edit swaps the `+` line for a textarea prefilled with the replacement and shows **Apply** / **Cancel**. Notes show only the reason and **Dismiss**.
  - `CurriculumSectionCard` passes the props through; when the curriculum is tailored, the sync confirm description becomes "This tailored copy's text is replaced by the library version. Suggestions you accepted here are lost."

- [ ] **Step 1: Write failing tests** for `suggestionRanges` using a real `@tiptap/core` `Editor` (jsdom) with StarterKit:
- `"maps a quote to its range in a bullet"` — content `<ul><li>Built APIs</li></ul>`, quote `"APIs"` → range text equals `"APIs"` via `doc.textBetween`.
- `"returns null for a quote no longer present"`.
- `"inserting a replacement with HTML keeps it as text"` — apply the accept command with `"<b>x</b>"` → `editor.getHTML()` contains `&lt;b&gt;x&lt;/b&gt;`.
- `"keeps bold on replaced text"` — `<p><strong>Built APIs</strong></p>` replace `"APIs"` with `"services"` → `<strong>Built services</strong>`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd client && npx vitest run components/resume/review`
Expected: FAIL. (If `vitest.config.ts` has no jsdom environment, add `// @vitest-environment jsdom` to this file and `jsdom` as a dev dependency.)

- [ ] **Step 3: Implement the extension, card and SectionDocument wiring**

Highlights: soft amber background + dotted underline, `cursor-pointer`, active one solid underline. Decorations are view-only, never stored in content.

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `cd client && npx vitest run && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/components/resume client/package.json client/package-lock.json
git commit -m "Highlight review suggestions in sections and apply them"
```

---

### Task 7: Review panel in the resume editor

**Files:**
- Create: `client/components/resume/review/ReviewPanel.tsx`, `client/components/resume/review/SuggestionRow.tsx`
- Modify: `client/components/resume/DocumentWorkspace.tsx`, `client/app/resume/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 5 API + helpers, Task 6 props, `pollUntil` from `client/lib/poll.ts`.
- Produces:
  - `DocumentWorkspace` optional `review?: ReactNode`; when present the aside header becomes tabs **Review** / **Preview** (existing `components/ui/Tabs`), Review selected by default.
  - `ReviewPanel` props: `tailoring: CvTailoring | null`, `sections: CurriculumSection[]`, `staleIds: Set<number>`, `activeId: number | null`, `onSelect(id)`, `onDismiss(s)`, `onRerun()`, `rerunning: boolean`. Accept / Edit / Reject happen in the `SuggestionCard` inside the section (Task 6), since that's where the editor lives; selecting a row opens that card. The panel itself only dismisses stale suggestions and notes (`updateCvSuggestion(id, { status: "rejected" })`).
- Layout (top to bottom, matching the spec sketch): header `"<job_title> · <company>"` with fit badge (Strong / Partial / Weak); summary (≤ 2 lines); when `used_posting` is false and the job had a URL: muted line "Couldn't open the posting; reviewed from the saved description."; requirement chips with ✓ / ◐ / ✗; gaps as a short list (if any); **Suggestions · n left** list of `SuggestionRow` (section label `"<section_type> · <title>"`, kind tag Rewrite/Note, reason one line, truncated with `line-clamp-1`); stale rows show **Text changed** with **Dismiss** and a copy-replacement icon; **Done (n)** collapsed group; footer **Re-run review** (hidden when `job_board_entry_id` is null, replaced by "This job was removed from your board.").
- Progress state while active: spinner with rotating copy every ~4s: "Reading the posting…", "Comparing with your CV…", "Writing suggestions…". Failed state: `error_message` + **Try again** (= rerun).
- Page: load `getLatestCvTailoring` alongside the curriculum only when `curriculum.job_board_entry_id || tailoring exists` (always call; it's cheap); while active, `pollUntil(..., isDone = !isTailoringActive, { intervalMs: 3000, timeoutMs: 6 * 60_000 })` with an AbortController cleaned up on unmount. Clicking a row scrolls the section's `articleRef` into view and sets `activeId` (which opens its card); the page's `onSuggestionResolve` handler (passed down through `CurriculumSectionCard`) calls `updateCvSuggestion` after the section has applied the text, and replaces the suggestion in state; failures toast "Couldn't save that change" and leave it pending.
- Only render `review` when the curriculum has a tailoring (non-tailored CVs keep today's aside unchanged).

- [ ] **Step 1: Implement panel, row, workspace tabs and page wiring**

- [ ] **Step 2: Typecheck, lint, tests**

Run: `cd client && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Verify in the browser** (dev stack via `run` / `docker compose up`)

With a seeded tailoring (create one via `bin/rails runner` with a hand-written `report` and 3 suggestions: one rewrite, one note, one whose quote you then edit away): confirm highlights appear, the card opens from both the highlight and the row, Accept changes the text and autosaves (reload shows it), Edit → Apply records `edited`, Reject removes the highlight, the edited-away one shows **Text changed**, Done count updates, and the Preview tab still works. Check at 375px width that the aside stacks below without horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add client
git commit -m "Show the tailoring review beside the resume editor"
```

---

### Task 8: Starting a tailoring from the job page, and labels

**Files:**
- Create: `client/components/jobBoard/entry/TailorCvDialog.tsx`
- Modify: `client/components/jobBoard/entry/EntryDocArea.tsx`, `client/app/resume/page.tsx`

**Interfaces:**
- Consumes: `getCurriculums`, `createCvTailoring`, `JobBoardEntry.tailored_curriculums`, `Curriculum.tailored_for`.
- Produces:
  - `EntryDocArea` gains a third tab **Tailored CVs**: list of `tailored_curriculums` (title, "Edited <relative date>", link to `/resume/:id`), empty state "Make a copy of one of your CVs for this job and get suggestions to fit it.", and the **Tailor a CV** button.
  - `TailorCvDialog` props `{ open, onClose, entry: JobBoardEntry }`: lists the user's CVs (exclude none; tailored copies show their "For <Company>" label), one-line note "Your CV and this job are sent to Anthropic to review. Your original CV isn't changed."; choosing one calls `createCvTailoring` (button shows a spinner, disabled while pending) then `router.push("/resume/<copy id>")`. Errors (429, 503) show the API message inline.
  - Resume list cards show a small muted "For <tailored_for>" label when present.

- [ ] **Step 1: Implement dialog, tab and label**

- [ ] **Step 2: Typecheck, lint, tests**

Run: `cd client && npx tsc --noEmit && npm run lint && npx vitest run`
Expected: PASS.

- [ ] **Step 3: End-to-end check in the browser**

With `ANTHROPIC_API_KEY` set: on a job with a real public posting URL, Tailor a CV → lands in the copy with the progress state → report and suggestions appear within ~2 minutes; the master CV is unchanged; the job's Tailored CVs tab lists the copy; the resume list shows "For <Company>". Then delete the job and confirm the copy's panel shows the removed notice and no Re-run. Without a key, the dialog shows "CV tailoring isn't available right now."

- [ ] **Step 4: Commit**

```bash
git add client
git commit -m "Tailor a CV from a job board entry"
```
