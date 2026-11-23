# Dashboard redesign

**Why:** the logged-in dashboard is rows of grey numbers. It should feel alive, with a graph or two and color.

**Non-goals:** status history ("days to interview"), a migration, date-range filters.

**Approaches:** hand-built SVG charts (chosen: no dependency, two simple charts); Recharts (only worth it for many more graphs); color only (can't show activity over time).

## Design
- Dark banner: greeting, active and closing-soon summary, logo.
- Stat tiles: this week, active, response rate, offers; tinted icons.
- Columns: jobs added per week, last 12 weeks (Monday start, UTC, as `this_week` already does).
- Donut: board jobs by status, with a legend that carries counts. Archived jobs are excluded.
- Closing soon: pending jobs closing in the next 14 days (first 5, plus the full count), linking to the board.
- Top tags as horizontal bars.
- Empty state linking to the board when there are no jobs at all.
- Response rate becomes responded ÷ (applied or later); pending and archived jobs don't count.
- Status colors are the board's, stepped until the dataviz palette check passes. `accepted` becomes lime because two greens were indistinguishable.

## Plan
1. Request spec, then `stats_for` and blueprint: `weekly_counts`, `closing_soon`, `closing_soon_count`, `responded_count`, `sent_count`.
2. Types and pure chart helpers (with vitest), then components in `client/components/dashboard/`, then the page.
3. RSpec, vitest, lint, types, and a look in the browser at desktop and phone widths.
