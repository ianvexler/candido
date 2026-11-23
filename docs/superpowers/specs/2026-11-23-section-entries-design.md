# Sections with entries

Status: approved 2026-11-23.

## Why
Importing a CV made one section per job, degree and project, so "Work
Experience" and "Key Projects" appeared several times, in the import list and
in the exported CV. A section could hold only one title, role, date range and
body.

## Approaches
1. **Entries inside a section (chosen).** Matches how CVs work. Largest change.
2. Group neighbouring sections with the same heading when displaying. Cheap,
   but reordering splits groups and pieces still sync and edit separately.
3. One body with sub-headings. Simple, but loses each entry's role and dates.

## Design
- A section is a heading (`section_type`) plus an ordered `entries` list of at
  least one. An entry has id, title, role, organization, location, start_date,
  end_date, current, description, content and hidden. A plain section such as
  Skills is one entry with no title.
- Entries are a jsonb column on `section_templates` and `curriculum_sections`:
  a section is always saved, copied and synced whole, so one column keeps that
  atomic. `SectionContent` cleans and validates them.
- The same entry keeps its id in the library and in every copy. Pulling the
  library version keeps which entries a resume leaves out.
- Import: the model replies with sections that hold entries; sections with the
  same heading are merged. The user can untick whole sections or entries.
- Editor: one card per section; entries can be added, moved, deleted, and (in a
  resume) left out.
- Export: the heading prints once, then each visible entry. The organisation
  isn't repeated when it is also the entry's title.
- Review: each entry is numbered for the model; suggestions store `entry_id`.

## Existing data
Each section becomes a section with one entry. Existing duplicates are not
merged, because resumes hold linked copies. The old columns stay for now
(ignored by the app), so the migration is safe while old containers still run;
a later migration can drop them.

## Not included
Moving an entry between sections; picking single entries from the library (add
the section, then leave entries out).
