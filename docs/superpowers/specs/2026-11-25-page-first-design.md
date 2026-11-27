# Page first: every decision on the page

Builds on "Edit on the page" (2026-11-24, stage 1, PR #22). That spec's stages 2
(margins) and 3 (tailoring beside the text) are replaced by this one.

Mockup: `.superpowers/mockups/page-first.html` in the main checkout (not
committed). It shows the agreed look; its data and wording are made up.

## Why

Candido exists so people can build a CV per application quickly from saved
material. Stage 1 made the CV editable on a page that looks exactly like its
export, but the decisions (what to include, what to add, what the review
suggests) still mostly live in the checklist and the Review tab. The user wants:

- the page to be the main view and the focus;
- every decision possible on the page: leave out and put back, add, edit, act
  on suggestions;
- feedback that is obvious and on the nose, so nobody misses it.

The checklist stays as an optional side view of the same choices.

## Goals

1. **Page is the default** at 1024px and wider. The Cards view stays one click
   away. Below 1024px nothing changes (cards, checklist, read-only Page tab).
2. **Margin ticks.** Hovering a block on the page shows a tick in the left
   margin that leaves it out. Blocks: a section (on its heading), an entry (on
   its title), a bullet or paragraph, an entry's summary.
3. **Folded marks.** Where left-out items were, the page shows a small dashed
   mark, "2 left out", between the blocks around them. Clicking it lists the
   items with ticks to put each back. On a tailored CV an item whose text
   matches a requirement the review says is not or partly covered says so:
   "matches API testing".
4. **Add points.** Overlays that take no room: the page's layout never moves.
   - **"+ Add"**, a small pill in the left margin with a hairline across the
     gap. Where: between any two blocks of a section, under a section's
     heading, and right under a section's last block. Its menu: Bullet,
     Paragraph, Entry (title, role, dates), and "Put back a left-out bullet (n)"
     when that entry has some. No search.
   - **"+ Section"**, a dark, centred pill on a dashed line across the page,
     in the lower half of the gap just above a section heading, and after the
     last section. Its menu: a search box over the library's sections (each
     with its entry count), "New section 'text'" when nothing matches, and
     "Blank section" always.
   - In the gap between two sections, the upper half is the "+ Add" for the
     section above, the lower half is "+ Section".
   - What is added goes exactly where the point was.
5. **Suggestions in the margin** (tailored CVs). Each pending suggestion is a
   card in a rail right of the page, level with its highlighted text, Docs
   style: cards stack downwards when they would overlap. A card has what
   changes (old struck through, new marked), why, and Accept / Edit /
   Dismiss. Clicking a highlight or its card makes both active. Summary
   suggestions are highlighted on the page too. Suggestions on left-out text
   are counted on the folded mark ("2 left out · 1 suggestion").
6. **Pins when there is no room.** When the rail doesn't fit beside the page
   (window width, the checklist open, zoom), each line with suggestions gets a
   numbered pin in the right margin; clicking it opens that line's cards as a
   popover.
7. **Gaps banner.** Above the first page, on a tailored CV with gaps: "N things
   Acme asks for aren't on this CV", one row per uncovered requirement or
   missing section, each with:
   - "Add 'bullet…' from your library" when a library item matches;
   - "Write a bullet", which adds an empty bullet where it fits and puts the
     caret in it;
   - "Not relevant", which hides that row for this review.
8. **The to-do count.** The bar shows "3 suggestions · 2 gaps" beside the job
   and its fit. It counts down as they are handled; clicking it goes to the
   next one.

## Non-goals

- Reordering by drag. A later stage.
- A "/" menu on an empty line. Proposed, not agreed.
- Editing on screens under 1024px.
- AI matching of gaps to the library; matching is plain text (see below).
- Changing the templates, the print page or the export.
- Library editing on the page: the library keeps its cards.

## Anti-goals

These would make it a failure even if it works:

- anything that moves or resizes the page's text: the page must stay an exact
  preview of the PDF, on hover too;
- any tool, mark or highlight that reaches the PDF, the print page or the
  clipboard;
- feedback that can be missed: a suggestion or gap that is only in a closed
  panel;
- menus that guess on the user's behalf ("best matches").

## Constraints

- Everything new is drawn outside the template root, as stage 1's marks and
  cards are. `client/scripts/page-parity.mjs` must still pass.
- Typing stays within stage 1's limit: p95 of a key to its paint at most 50ms
  on a development build with 40 sections and 400 items. Re-placing the
  overlay must not run on every keystroke synchronously.
- Left-out state is the same data the checklist uses (`data-cv-off`,
  `description_off`, section and entry inclusion via `lib/resume/checklist.ts`
  tick functions). The margin and checklist are two views of it.
- Adding reuses stage 1's flows (`useCvEdits`, `useAdded`): a new blank thing
  added into a left-out place puts it back, and is left out again if the
  user goes without writing anything.
- Suggestions use the existing review API (`useCvReview`: resolve, dismiss,
  rerun). No new backend for this design.
- Keyboard: every tick, mark and add point can be reached and used without a
  mouse.

## Approaches

- **A: an overlay layer (chosen).** One layer beside the page, outside the CV's
  markup, draws ticks, marks, add points, cards and pins, placed from where
  the blocks really are. It matches how stage 1 already places break spacing
  and cards, and parity keeps proving nothing leaks. Its cost is re-placing on
  typing, paging and resizing, and the card stacking.
- **B: inside the templates.** Each template renders its own tools hidden in
  print. Placing is free, but both templates and every future one carry
  editing markup, and one slip shifts the layout or prints a tool. Rejected
  for that risk.
- **Checklist as the main tool, mirrored on the page.** Rejected: it keeps the
  decisions off the page.

## Decided details

- Hover: the tick and the add points appear only on hover or keyboard focus.
  The add point's hit strip is the gap between two blocks; nothing widens.
- Every add point says just "+ Add" or "+ Section"; the menu decides what is
  added.
- Search is only for sections. Adding inside a section is a plain list.
- Folded marks are dashed, low contrast, and come forward on hover.
- Colours: suggestions blue, gaps orange, tools in the app's neutral ink.
- The checklist panel's open or closed state is remembered as now.
- The Review tab in the right panel stays, with the summary, fit and all
  requirements. The banner and margin are the unmissable part.
- Gap matching: a requirement matches a library item when the item's text
  contains one of the requirement's words of four letters or more (ignoring
  case and common words). Only items not already shown in the CV count. Shown:
  the first match; more are not listed.
- **"Add from library" on a gap only uses entries already on this CV** (the
  user's choice). A match is a left-out item of an entry on the CV, or an item
  of that entry's library copy that this CV's copy lacks. Adding puts the
  item back, or copies it into this CV's entry, shown. A match in an entry
  that isn't on the CV is not offered; the row offers "Write a bullet".
- "Not relevant" on a gap is remembered in the browser, per review.

## Calls made after the builder check

These were open in the first draft; each is the designer's call, not the
user's, and may be corrected.

- **The spec, not the mockup, is the authority.** The mockup's add menu once had
  a library search inside sections; that was removed in discussion.
- **What counts as a gap:** a requirement whose `covered` is "no", plus each
  `missing_sections` row. "Partly" requirements and the review's `gaps`
  strings stay in the Review tab only. The banner count, the bar count and
  the rows all use this one definition.
- **A missing section's row** offers "Add Skills section": from the library
  when it has one of that type, else blank with that heading.
- **Gap cards in the margin:** when a gap has a library match whose entry is
  on the page, an orange card also sits in the rail beside that entry
  (as in the mockup). The banner always lists every gap.
- **"Write a bullet" goes to** the first entry of the section whose title or
  entries share a word with the requirement; otherwise the first entry of the
  first Experience section; otherwise a new bullet in a new Experience entry.
- **Suggestions counted:** pending, not stale. Suggestions on left-out text
  count (putting the text back is one click on the fold). Stale ones stay in
  the Review tab with their "text changed" state and aren't in the rail.
- **A note** (no replacement text) renders as a card with its text and "Got it"
  (which dismisses it); no Accept.
- **No `entry_id`** (older reviews): the suggestion belongs to the section's
  first entry, as the page already does.
- **Next:** the count's click goes through suggestions in page order, then
  gaps in the banner.
- **"Not relevant"** drops the row from both counts. The banner keeps a "n
  hidden · show" link to undo. A rerun is a new review, so hidden rows come
  back; that is fine.
- **Page as default:** a new stored key, so everyone starts on Page once; after
  that, the last choice is remembered as now. It applies to every CV,
  tailored or not.
- **No tick on the header** (name, headline, contact): it always prints.
- **Add points inside a section are per entry.** "+ Add" in a gap belongs to
  the entry above it: Bullet and Paragraph go into that entry at that place,
  Entry inserts a new entry after it. Under the section heading, Entry
  inserts a new first entry and Bullet/Paragraph go to the top of the first
  entry. A section with no entries offers Bullet, Paragraph and Entry the same
  way (bullets go into its one bodyless entry, as now).
- **Fold matches** use the gap matching rule against "no" and "partly"
  requirements. One requirement is shown per item; the fold's own label counts
  them ("2 left out · 1 matches Acme"). This and the fold's suggestion count
  are stage 2.
- **The Review tab keeps its suggestion list.** It, the highlights, the rail
  and the pins all read one review state (`useCvReview`), so resolving in any
  of them updates all.

## Change after testing (26 Nov): a block gutter instead of gap pills

The user tried the gap pills and found "+ Add" hard to reach and the pills
small and badly aligned. They chose a block gutter (Notion / Google Docs
style), which replaces Goal 4's "+ Add" and the margin tick of Goal 2:

- Hovering anywhere on a block (heading, entry title line, summary, bullet or
  paragraph) shows two controls in its column's margin beside its first
  line: **+** (add right after this block) and **✓** (leave it out).
- The hover area is the block plus the margin beside it, so moving to the
  controls never loses them. They linger briefly after the pointer leaves,
  and stay while a menu is open.
- **+** opens the same menu (Bullet, Paragraph, Entry, Put back a left-out
  bullet). After a bullet or paragraph it adds after that item; after an
  entry's title line or summary, at the top of its body; on a section
  heading, at the top of the section. Entry adds after this entry (on a
  heading, a new first entry).
- "+ Section" stays in the gap between sections, with the whole gap as its
  hover area, in a lighter style.
- Controls are drawn at screen size whatever the zoom, in the app's font,
  and never past the sheet's edge; folds likewise.

## Stages

1. **Page tools:** Page as default, margin ticks, folded marks, add points.
2. **Feedback:** margin cards and pins, gaps banner, to-do count.

Each is its own plan. Stage 1 is useful alone; stage 2 needs it.

## Left to the builder

- How the overlay measures and caches block positions, and when it re-places.
- The stacking rule's details (gap between cards, keeping the active card level
  with its text and moving others).
- How keyboard users reach margin tools (for example a shortcut that shows the
  tools for the focused block).
- Where "Write a bullet" puts the new bullet when the requirement doesn't
  point at a section.
- Exact sizes and wording of menus, within the mockup's look.
