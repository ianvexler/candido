# Candido as an application companion

Status: approved 2026-11-23. Revised the same day after trying the job page:
the side panel tracks, and the full view prepares.

## Why
The landing page promises help preparing each application ("The right CV for
every job"), but inside, the app presents itself as a tracker. The CV review
starts only from a job's CV slot, behind "Use one of my CVs", and no other
screen points to it.

By the end of their first session, someone should have one CV tailored to one
real job. Success: a new user reaches a review without being told where it is.

## Goals
- Make the job the place where an application is prepared.
- Show the next useful step on the dashboard, the board and the job.
- Get a CV in and tailored from the first run.

## Not included
- Replacing or restyling the kanban or the sheet.
- Writing help for cover letters.
- Filling in a job from its link. The user types or pastes the details.
- Reviewing uploaded or pasted CVs.
- Starting reviews automatically: each costs a Claude call and counts toward
  the limit of 10 a day.

Avoid: a wizard that blocks people who only want to track; steps that look
compulsory; a fit shown for a CV that hasn't been reviewed.

## Approaches
1. **Reorganise around the job (chosen).** The job page leads with preparation
   and other screens link to it. Largest change; fixes the cause.
2. Add entry points only (a "Tailor to a job" button, clearer labels). Cheap,
   but the app still reads as a tracker.
3. A separate "Prepare" area. Clear, but splits one application over two
   places.

## Readiness
One pure function on the client, shared by every screen, from fields on the
job. It applies only to Pending jobs; later stages show no badge or next step.

| State | When | Label | Next step |
|---|---|---|---|
| `no_cv` | CV slot empty | No CV yet | Tailor CV |
| `not_reviewed` | Copy, never reviewed | CV not tailored | Review CV |
| `reviewing` | Run pending or processing | Reviewing… | none |
| `failed` | Latest run failed | Review failed | Try again |
| `suggestions` | Latest run succeeded, some suggestions pending | 6 suggestions left | Review suggestions |
| `ready` | Copy reviewed with none pending, or an uploaded or pasted CV | CV ready, with fit if known | Apply |

The job's `cv_curriculum` already carries `fit`. It gains `review_status` (the
latest run's status, or null) and `pending_suggestions` (a count, for the latest
run only), both preloaded so listing jobs adds no query per job. Fit stays the
latest successful run's. Suggestions whose text has changed count as pending,
because only the editor can tell, and the user can dismiss them there.

When reviews are unavailable (no API key), `not_reviewed` counts as `ready`.
The client learns this from a `reviews_available` flag on the session.

## Screens

### 1. Job
Editing a job is the easiest thing to do, and preparing is one button away.

**Side panel** (from a board card or sheet row): the labelled fields, always
editable and saved as they're typed, with Description, Notes and Documents
tabs. A strip under the title says where the application stands and leads to
the full view: Prepare, Continue, Finish, or View application once applied.
The address holds the open job (`?job=12`). Closing keeps edits, and asks only
if they can't be saved.

**Full view** (`/board/:id`): the same fields in a row at the top; "What they
ask" (the description) beside "What you send" (the CV, what it covers, cover
letter, notes, and the CV's text). Both sides share the window's height, so a
long one scrolls instead of outgrowing the other. A bar at the bottom says
what's left and applies: "Open posting" opens the link and asks "Did you
apply?"; "Mark as applied" works at any time. The bar goes after applying. On a
phone it stacks, with what you send first.

Adding a job keeps its own panel.

### 2. First run
Replaces the welcome modal. Three steps, each skippable, and it can be left and
resumed:
1. Bring in your CV. After the import is reviewed, the app also makes a CV from
   the imported sections. **Today an import only fills the section library, so
   there would be nothing to tailor.** The CV is named "My CV" and can be
   renamed. "Start from scratch" goes to a new, empty CV.
2. Add a job: title, company, link and description. The description matters
   most, since the review works from it.
3. Tailor: shows the CV and the job, and starts the review on request.

"Import a spreadsheet instead" is a link below. Leaving sets `setup_completed`,
as closing the modal does today. Until both a CV and a job exist, the dashboard
shows the missing step.

### 3. Resume page
- "Import a CV" comes first when there are no CVs, then "Start from scratch".
  Importing here also makes a CV. Section library stays as a secondary link.
- Each original CV gets "Tailor to a job". It lists Pending jobs, soonest closing
  first, and can add one. Picking a job does what the job's own button does, and
  asks first if the job already has a CV.
- Tailored copies are shown open, listed by job, with fit and a link to the job.

### 4. Dashboard
"Next up" above the numbers: at most 5 Pending jobs with a next step, soonest
closing first, then newest. Jobs past their closing date are left out. It
replaces "Closing soon", which shows the same jobs with no action. Numbers and
charts stay below.

### 5. Board cards
Pending cards show the readiness label. Other columns don't change.

## Names
One word for the feature everywhere: **Tailor**. "Use one of my CVs" becomes
"Tailor one of my CVs"; "Review it against this job" becomes "Suggest edits for
this job". "CV" is used throughout in place of "resume", including the menu.

## Pull requests
1. Readiness fields and function; side panel and full view; names.
2. First run; Resume page; a CV made on import.
3. Dashboard "Next up"; board badges.

Each works without the next.

## Testing
- Readiness: every row of the table, and stages after Pending.
- Listing jobs: query count doesn't grow with the number of jobs.
- Import: makes the CV once, with the chosen sections in order, and a profile-only
  import makes none.
- In the app: first run from a new account to an open review; the full view at
  phone width; edits kept on close and back; reviews unavailable.

## Left to the builder
Exact spacing and wording within these rules, motion, and how the steps look,
using the app's existing colours and components.
