# Section library and CV checklist

Status: approved 2026-11-23.

## Intent

A user writes everything once, then puts together the right CV for each
application in a minute or two by picking, not rewriting. Today the library is
one long scroll of open editors, adding to a CV works on whole sections, hiding
one bullet takes a text selection, and a selection can't be reused.

## Goals

- Include or leave out any section, entry or bullet in one click.
- Choose a purpose ("Backend") and get a CV that is ready to adjust.
- A library that stays easy to scan and search with many sections.
- Fix something once: CVs and library can pass a correction to each other.

## Non-goals

AI pre-ticking for a job, alternative wordings of a bullet, folders, cover
letters, moving an entry between sections, page-length estimates.

## Anti-goals

- Duplicates of the same entry as the way to organise the library.
- Labelling as a chore: a library with no labels must work fully.
- A CV that changes without the user acting on that CV.
- Losing text. Leaving something out never deletes it.

## Approaches

1. **Purpose labels on bullets and entries (chosen by the user).** One choice
   pre-ticks a whole CV; new bullets join future CVs; labels also filter the
   library. Cost: some labelling.
2. Saved selections per section. Chosen again for every section, and every new
   bullet must be added to each selection.
3. Remember nothing; copy an existing CV. Simplest, but needs a CV first and
   new bullets are missed.

Layout: **checklist beside the CV (chosen by the user)** over ticks on the page,
which keeps left-out text on the page and gets longer as the library grows.

The rules below were proposed to the user, who called them a good start. Points
marked † were added while writing this document; points marked ‡ were added on
2026-11-27 as builder calls the user can still change.

## Terms

- **Item:** a top-level block of an entry's content: one top-level list item
  (with anything nested in it), paragraph, subheading or quote. †
- **Ticked:** included in the CV.
- **Purpose:** the label a CV starts from, or Everything.

## Behaviour

### Labels
- The user creates, renames and deletes labels. Names are unique per user,
  ignoring case. Deleting one removes it everywhere; CV ticks don't change.
- Labels go on items and entries. An entry's labels also apply to its items.
- An item fits a purpose when it has no labels (own or from its entry) or has
  that purpose's label. Everything fits "Everything".
- An entry fits when at least one of its items fits. An entry with no items fits
  by its own labels. A section fits when one of its entries does.

### Library
Revised 2026-11-27: purposes are shown like folders (the user considered real,
nested folders and chose this instead, as it never copies content).

- Left column, top: **Purposes**, listed like folders: "All content", each
  purpose by name, then "Not labelled", each with the number of items in it.
  "New purpose" adds one inline; each purpose's menu has Rename and Delete.
  The choice is remembered per browser.
- Left column, below: outline of sections and their entries, with counts, search
  and drag to reorder sections and entries. Right: the chosen section, editable.
- Choosing a purpose narrows the outline to the sections and entries that fit it,
  as a CV for it would start. In the chosen section, items that don't fit are
  dimmed, not hidden, and stay editable. Unlabelled items show "Every purpose". ‡
- Search shows matches from all sections within the chosen purpose. Clearing it
  returns to the chosen section.
- Hover or focus a bullet to see its labels and add or remove one. Selecting
  several shows a bar that labels them together. Entries have the same label
  control. Adding a label while a purpose is chosen offers that purpose first. ‡
- Deleting a purpose says how many items carry it; nothing else changes.
- The profile header is the first row of the outline. †
- New sections go last. Import works as now; its sections also go last.
- No CV preview on this page.

### New CV
- New CV asks for a purpose, then opens a CV named "Backend CV" (or "New CV"),
  with a number added if taken, ready to rename. It skips the question when
  the user has no labels. †
- It holds copies of every library section in library order, ticked by purpose.

### CV page
- Left: checklist. Middle: the CV, showing only ticked content, editable in
  place. Right: review panel, only for tailored copies. The preview is removed.
  The page keeps today's plain look; design stays on the export screen.
- The checklist shows sections, entries and items with "2 of 5" counts and
  partial states, and search. † Sections and entries reorder by drag; today's
  section controls (sidebar column, remove) stay.
- Unticking a section or entry leaves it out. Ticking it again restores the
  earlier item ticks; if none were ticked, it ticks the items that fit the
  purpose, or all if none fit. †
- Unticking an entry's last item keeps its title line, since old jobs are often
  listed that way. The entry's own tick removes it. †
- Hovering an item on the page also offers "Leave out".
- Changing purpose re-ticks everything that is also in the library. It asks
  first if any ticks differ from what the current purpose gives. Content that
  exists only in this CV keeps its ticks. † Text never changes.

### Library changes in an existing CV
- Library content the CV doesn't have appears in the checklist, unticked, marked
  "New" if it was added to the library after the CV was made. Ticking it copies
  it in, after the nearest earlier library neighbour the CV has.
- An item edited in the CV offers "Update library too". If it was removed from
  the library, or written in the CV, it offers "Add to library". †
- If the library version changed, the item offers "Use library version". If both
  changed, it shows both texts and the user picks either or keeps them apart. †
- The same applies to an entry's own fields (title, role, dates, summary) as one
  unit. †
- None of these change ticks. The whole-section "Newer version in library" and
  "Reset" controls are replaced by these.

### Tailoring
- A tailored copy starts with the original's text, ticks and purpose.
- The review reads ticked content only. Suggestions on content unticked later
  stay in the panel as "Left out" with a way to tick it again. †

### Small screens
Checklist, CV and (if tailored) review become tabs. Library purposes and outline
become one list screen, the section a detail screen.

### Accessibility
Everything on hover is also available by keyboard focus and on touch. Reordering
has move up/down actions besides dragging. Partial ticks are announced.

## Data †

- Items stay inside the existing sanitised entry HTML. Each item element has
  `data-cv-item` (an id shared by the library and every copy) and, in a CV,
  `data-cv-off` when unticked. The sanitiser allows both. The server gives an
  id to items without one, and a new id to the second use of a duplicated id.
  On the client, splitting or pasting an item must also give a new id.
- `hidden` on sections and entries remains their tick.
- New `cv_labels` table (user, name). `section_templates` gets `item_labels`
  (item or entry id to label ids), `item_added_at` (id to time, set by the
  server) and `position`. Foreign label ids are rejected; ids of removed content
  are dropped on save.
- `curriculums` gets a nullable `cv_label_id`, cleared if the label is deleted.
  Null means Everything.
- `curriculum_sections` gets `base_digests` (item or entry id to a digest of the
  library text it was last matched with). Comparing CV, library and base tells
  which side changed. Digests ignore ids, ticks and formatting-only whitespace.
- Label edits never count as library text changes.
- Creating a CV, changing purpose, and passing content between CV and library
  are server actions in a transaction. Passing content carries the digest the
  client saw; if the target changed since, it is refused with the current text.
- Everything that reads visible content must drop unticked items: the export,
  the print page, the review's CV text and any suggestion matching. Empty lists
  left behind are dropped too.

## Existing data †

- Migrate without changing `updated_at`. Give library items ids. In each copy,
  match items by entry id and identical text, in order for repeats; unmatched
  items get their own id and count as written in that CV.
- Base digests: use the library's current text where the copy is up to date.
  Otherwise leave empty; with no base and different text, offer both directions
  without saying which side changed.
- Items whose whole text is hidden become unticked. Partly hidden text keeps
  its hidden part, and hiding selected text still works.
- Existing CVs keep their sections only; other library sections show unticked
  and not "New". Purpose is Everything.
- Library position follows today's order (created_at, id).
- Every existing CV must export the same before and after. Verify this on a
  copy of real data before release.
- The migration must be safe while old containers still run. Migrate data
  after the new code is live. A page left open from before drops the new
  attributes when saving, so the server restores both ids and ticks by matching
  text when saved content has no ids.

## Constraints

- Keep the current stack: Rails jsonb entries, TipTap, dnd-kit, saveTracker.
- The page and checklist change the same stored entries. They need one owner of
  that state, so a tick never overwrites unsaved typing or the reverse.
- Editing, deleting or undoing visible text must never alter unticked content.
- Export waits for pending ticks as it already waits for edits.
- Job editing and the job page are untouched.
- Library and CV pages stay responsive with 40 sections and 400 items.

## Stages

1. **CV checklist:** item ids, migration, ticks, whole-library CVs, CV page and
   passing changes both ways. New CVs start from Everything.
2. **Library and labels:** outline, search, order, labels, purposes.

Each stage ships on its own.

## Testing

- Server: fit rules, id assignment, migration matching, three-way comparison,
  ownership, refused stale updates, copies for jobs.
- Client: tick states and restoring them, export and review excluding unticked
  items, typing and ticking at once, id handling on split, paste and undo.
- By hand: both stages at desktop and phone width, by mouse and keyboard.

## Left to the builder

Component and route names, wording of small labels, how unticked content is
kept out of the editor, digest format, and drag details.
