# Resume Design Customisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each resume have its own look (font, text size, spacing, accent colour, heading style, date position), and let users save designs to reuse, one of which can be the default for new resumes.

**Architecture:** A resume's design is a small set of validated keys stored in `curriculums.styles`, next to the existing `paper` key. The Classic template turns those keys into CSS custom properties and data attributes, so one stylesheet covers every combination. Saved designs live in a new `resume_designs` table. Applying a saved design copies its settings into the resume (a snapshot, like library sections), and the default design is copied into new resumes. The controls live in a Design panel beside the live sheet on the print page.

**Tech Stack:** Rails 8 + RSpec; Next.js, `next/font/google`, Vitest.

**Spec:** No separate spec file. These are the decisions agreed in the session that produced this plan:
1. Controls: font, text size, accent colour, spacing, section heading style, date position.
2. Designs are per resume.
3. A design can be saved for reuse, and one saved design can be the base for new resumes.
4. Controls sit beside the live sheet on the print page and save automatically.
5. Two-column layout and extra templates are out of scope.

## Global Constraints

- Branch: `feature/resume-design`, from `main`.
- **Design keys and allowed values.** The first value is the default and matches today's Classic look.

  | Key | Allowed values |
  |---|---|
  | `font` | `source_sans`, `plex_sans`, `source_serif`, `lora` |
  | `size` | `medium`, `small`, `large` |
  | `spacing` | `normal`, `compact`, `relaxed` |
  | `accent` | `#RRGGBB` (default `#1a1a1a`) |
  | `heading_style` | `caps_rule`, `bold`, `accent_bar` |
  | `date_position` | `right`, `below` |

- **Accent swatches:** `#1a1a1a`, `#1f4e79`, `#2f6f4f`, `#8a3b12`, `#6b2d5c`, `#4a5568`, plus a custom colour input.
- **Base text size:** small 9.5pt, medium 10.5pt, large 11.5pt.
- **Spacing:** each option sets a gap multiplier and a line height. Compact is 0.7 and 1.25, normal 1 and 1.35, relaxed 1.35 and 1.45.
- **Fonts** via `next/font/google`, subsets `["latin", "latin-ext"]`: Source Sans 3 (400/600/700), IBM Plex Sans (400/600/700), Source Serif 4 (400/600/700), Lora (400/600/700).
- **Limits:** a saved design's name is 1–60 characters, and each user can save at most 20 designs.
- **Copy:** sentence case. The panel title is **Design**.

## Review Focus

1. **Bad or partial style values** (unknown key, `accent: "red"`, `font: "comic_sans"`) are rejected with a 422 by the API. The client falls back to defaults for anything missing or invalid, so an old resume renders exactly as today. Tests in Task 1 and Task 3.
2. **Applying a saved design** must not touch the resume's `paper` setting, and later edits to that saved design must not change resumes already using it. Tests in Task 2.
3. **The default design:** at most one per user (setting a new default clears the old one), and deleting it leaves no default. New resumes start with it. Tests in Task 2.
4. **Accent colours that are too light** for text or rules on white: the panel warns when the colour's contrast with white is under 3:1. Test in Task 3.
5. **Print matches the screen** for every font, size and heading style, with no change to page breaks or wrapping. Checked in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/models/resume_design_settings.rb` | Allowed keys and values; `normalize!` raises 422 on anything invalid |
| `backend/db/migrate/*_create_resume_designs.rb`, `backend/app/models/resume_design.rb` | Saved designs: name, settings, default flag |
| `backend/app/controllers/resume_designs_controller.rb`, `backend/app/blueprints/resume_design_blueprint.rb` | CRUD for saved designs |
| `backend/app/controllers/curriculums_controller.rb`, `backend/app/models/curriculum.rb` | Accept design keys in `styles`; new resumes copy the default design |
| `client/lib/resume/design.ts` (+ test) | Types, defaults, option lists, `resolveDesign`, `designStyle`, `contrastWithWhite` |
| `client/components/resume/templates/ClassicTemplate.tsx`, `classic.css` | Read the design through CSS variables and data attributes |
| `client/components/resume/DesignPanel.tsx` | The controls and saved designs |
| `client/app/resume/[id]/print/page.tsx` | Panel beside the sheet; autosave |
| `client/api/resources/resumeDesigns/*.ts`, `client/lib/types.ts` | API calls and types |

---

### Task 1: Validate design settings on resumes

**Files:** create `backend/app/models/resume_design_settings.rb`; modify `curriculum.rb`, `curriculums_controller.rb`; test `spec/models/resume_design_settings_spec.rb`, `spec/requests/curriculums_spec.rb`.

**Interfaces:**
- Produces: `ResumeDesignSettings::KEYS` (the six design keys), `ResumeDesignSettings::DEFAULTS` (a Hash), and `ResumeDesignSettings.normalize!(raw) -> Hash`. `normalize!` returns only the design keys that were given, stringified. It raises `ApiError` (422) for an unknown key or a disallowed value.
- `PUT /curriculums/:id` accepts any design key inside `styles` alongside `paper`. It merges into the existing styles, as `paper` already does.

- [ ] **Step 1: Failing specs.**
  - `normalize!` keeps valid keys.
  - It accepts `#AABBCC` and lowercases it.
  - It rejects `accent: "red"`, `font: "comic_sans"` and `unknown: 1`, each with a message naming the key.
  - `PUT` with `styles: { font: "lora", accent: "#1F4E79" }` stores both and keeps `paper`.
  - `PUT` with `styles: { size: "huge" }` returns 422.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The controller permits `:paper` plus the design keys. It passes the design keys through `normalize!` before merging. Paper validation is unchanged.
- [ ] **Step 4: Run** `./run rspec` and `./run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Accept design settings on resumes"`

### Task 2: Saved designs and the default for new resumes

**Files:** create the migration, `resume_design.rb`, `resume_designs_controller.rb`, `resume_design_blueprint.rb`, and `spec/factories/resume_designs.rb`; modify `user.rb`, `routes.rb`, `curriculums_controller.rb` (create); test `spec/requests/resume_designs_spec.rb` and `curriculums_spec.rb`.

**Interfaces:**
- **Routes:** `GET/POST /api/v1/resume_designs`, `PUT/DELETE /api/v1/resume_designs/:id`.
- **Body:** `{ name, settings, is_default }`.
- **Blueprint:** `id, name, settings, is_default, created_at, updated_at`.
- **Model:** `ResumeDesign` validates the name length, normalises `settings` with `ResumeDesignSettings.normalize!`, and caps each user at 20 designs. `before_save` clears any other default for the user.
- **Create:** `POST /curriculums` copies the default design's settings into the new resume's `styles`.

- [ ] **Step 1: Failing specs.**
  - Create, list (own only) and rename.
  - Invalid settings return 422.
  - A 21st design returns 422.
  - Setting `is_default` on one design clears the previous default.
  - Deleting the default leaves none.
  - Another user's design returns 403.
  - A new resume gets the default's settings, and `paper` isn't added.
  - Editing a saved design after applying it doesn't change the resume, since applying is a client `PUT` of `styles`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite and lint. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add saved resume designs with a default for new resumes"`

### Task 3: Design model on the client and the template reading it

**Files:** create `client/lib/resume/design.ts` and `design.test.ts`; modify `ClassicTemplate.tsx`, `classic.css`, `lib/types.ts`.

**Interfaces:**
- Produces:
  - `type DesignSettings = { font; size; spacing; accent; heading_style; date_position }`
  - `DESIGN_DEFAULTS`
  - option arrays with labels: `FONT_OPTIONS`, `SIZE_OPTIONS`, `SPACING_OPTIONS`, `HEADING_OPTIONS`, `DATE_OPTIONS`, `ACCENT_SWATCHES`
  - `resolveDesign(styles: Record<string, unknown>) -> DesignSettings`: fills defaults and drops invalid values
  - `designStyle(design, fontFamilies: Record<Font, string>) -> CSSProperties`: sets `--rc-font`, `--rc-size`, `--rc-gap`, `--rc-line` and `--rc-accent`
  - `contrastWithWhite(hex) -> number`: the WCAG contrast ratio
- `ClassicTemplate` takes `design: DesignSettings`. It sets the `style` attribute and `data-heading-style` / `data-date-position` on the root.

- [ ] **Step 1: Failing tests.**
  - `resolveDesign({})` equals the defaults.
  - Invalid values fall back per key.
  - `designStyle` maps `size: "large"` to `--rc-size: 11.5pt` and `spacing: "compact"` to gap `0.7` and line `1.25`.
  - `contrastWithWhite("#1a1a1a")` is above 15, `contrastWithWhite("#ffff00")` is under 1.1, and white returns 1.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`classic.css`:** replace the fixed font sizes with multiples of `var(--rc-size)`, using today's ratios (name 22/10.5, headline 11.5/10.5, contact 9.5/10.5, heading 9/10.5, title 11.5/10.5). Replace the vertical margins with `calc(<today's pt> * var(--rc-gap))`. Colour the name, section heading, rule or bar, and links with `--rc-accent`.
  - **`heading_style`:** `caps_rule` keeps today's look. `bold` drops the caps and the rule. `accent_bar` adds a 3pt left bar in the accent colour and drops the rule.
  - **`date_position`:** `below` stacks the meta line under the subtitle.
  - **Fonts:** load all four with `next/font`, and pass each one's `.style.fontFamily`.
- [ ] **Step 4: Run** the tests, typecheck and lint. Expected: PASS. The default design must look identical to today's.
- [ ] **Step 5: Commit.** `git commit -m "Drive the Classic template from design settings"`

### Task 4: Design panel on the print page

**Files:** create `client/components/resume/DesignPanel.tsx` and `client/api/resources/resumeDesigns/{getResumeDesigns,createResumeDesign,updateResumeDesign,deleteResumeDesign}.ts`; modify `client/app/resume/[id]/print/page.tsx`.

**Interfaces:**
- Consumes: Task 3's design model, Task 1's `PUT styles`, Task 2's routes.
- Produces: `<DesignPanel design onChange={(next: DesignSettings) => void} />`. The panel loads and manages saved designs itself.

- [ ] **Step 1: Build the panel.** It is screen-only (`print:hidden`) and collapsible, and sits on the right of the sheet; on narrow screens it goes below. Sections:
  - **Saved designs:** a list. Each design has **Apply**, a star to make it the default, and delete (with a tooltip).
  - **Save as new design:** an inline name field.
  - **Font:** a select, with each label shown in its own font.
  - **Text size and spacing:** segmented buttons.
  - **Accent:** swatches and a custom colour input. When contrast with white is under 3:1, show "This colour may be hard to read when printed."
  - **Headings and dates:** segmented buttons.
  - **Reset to default look.**
- [ ] **Step 2: Wire the print page.** Keep `design` in state, so the preview updates instantly. Save to the resume, debounced at 500ms, through `updateCurriculum(id, { styles: <design keys> })`. Applying a saved design sets every design key and leaves `paper` alone.
- [ ] **Step 3: Check.** Typecheck, lint and test.
- [ ] **Step 4: Commit.** `git commit -m "Add the Design panel to the resume print view"`

### Task 5: Verification

- [ ] **Step 1: Browser pass.**
  - Change each control and confirm the sheet updates and the change survives a reload.
  - Save a design and apply it to a second resume.
  - Make a design the default, then create a new resume and confirm it starts with that design.
  - Apply a light accent and confirm the warning appears.
- [ ] **Step 2: PDFs.** Generate PDFs for three contrasting designs (serif / large / relaxed / accent bar; compact / small; dates below). Check the fonts are embedded, the colours appear, and page breaks still keep headings with their content.
- [ ] **Step 3: Open the PR** with screenshots. Base it on `main`.
