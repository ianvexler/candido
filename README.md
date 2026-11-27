<img src="candido.png" alt="Candido" width="200" />

<hr />

Candido is a job application tracker that helps you manage your job search. Add roles you're interested in, move them through stages as you progress, and keep everything organized in one place.

Try it live at [candidohq.com](https://candidohq.com)

### Board

Track your applications at a glance with a drag-and-drop board. Move roles through each stage—from applied to offer—as things progress.

<img src="client/lib/images/BoardScreenshot.png" alt="Board view" width="680" />

### Sheet

View all your applications in one table. Sort, filter, and search by company or status, and use tags to keep everything in order.

<img src="client/lib/images/SheetScreenshot.png" alt="Sheet view" width="680" />

### Manage applications

Add applications easily and upload the description, your CV and cover letter. All the details you need, in one place.

<img src="client/lib/images/EditJobScreenshot.png" alt="Edit job form" width="680" />

<hr />

A full-stack app with a Next.js client and a Rails API, run via Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

## Running the stack

From the project root:

```bash
./run stack
```

This builds and starts the stack in **development mode** with hot reload:

| Service | URL |
|---------|-----|
| **Client** (Next.js) | [http://localhost:3000](http://localhost:3000) |
| **API** (Rails) | [http://localhost:8000](http://localhost:8000) |
| **Database** (PostgreSQL) | localhost:5432 |

The client calls `http://localhost:8000/api/v1`. On first boot Rails runs `db:migrate`, which renames the original Prisma tables in place. Do not run `db:prepare` or `db:schema:load` against a database that already has data.

Stop the stack with `Ctrl+C`, or `./run stop` if it is detached.

### Claude API key (CV import and CV reviews)

These features call Claude and report they're unavailable without a key. Copy `.env.example` to `.env` in the project root and set `ANTHROPIC_API_KEY`. Docker Compose reads that file for the backend, and it's git-ignored. Restart the backend so it picks up the change:

```bash
docker compose up -d --force-recreate backend
```

Each call is billed to that key, and reviews are limited to 10 per user per day. Set `CV_TAILOR_MODEL` / `CV_IMPORT_MODEL` in `.env` to test with a cheaper model. In production, set `ANTHROPIC_API_KEY` as a GitHub secret: each deploy rewrites `backend/.env` on the server, so a key added there by hand is lost.

## Other commands

```bash
./run rspec                    # Rails request/model specs
./run rails <command>         # e.g. ./run rails console
./run bundle:install          # bundle install in the backend container
./run lint                    # RuboCop + ESLint
./run client <command>        # e.g. ./run client npm run build
```

### Checking the CV page against its export

`client/scripts/page-parity.mjs` checks that the Page view of a CV puts every block where the print page and the PDF do. It isn't part of CI and adds no dependency. It makes a CV titled "Parity check" from fixture sections (long and short bullets, links, summaries, subheadings, lists, quotes, left-out and partly hidden text), compares it for both templates, both papers, four fonts, three sizes and one to four pages, and deletes it. For each block it compares its place on the Page view, with the break rules off, with the print page (within 0.5px), and the page it is on, and the number of pages, with the PDF. A sample covers each pair of values at least once (16 cases, about 3 minutes); `--all` runs all 192.

Sign in as a throwaway account: it refuses to run unless the account's CVs are all titled "Parity ...", or `--yes-this-is-a-throwaway-account` is passed.

```bash
cd client
npm install --no-save playwright   # or PLAYWRIGHT_PATH=/path/to/node_modules/playwright
PARITY_EMAIL=... PARITY_PASSWORD=... node scripts/page-parity.mjs --url http://localhost:3000 --api http://localhost:8000
node scripts/page-parity.mjs --state auth.json    # a Playwright storage state, instead of the password
node scripts/page-parity.mjs --typing             # typing with 40 sections and 400 items: median and p95 per key; fails over 50ms at p95 (a development build)
node scripts/page-parity.mjs --no-hover           # without the hover pass
```

Each case also has a hover pass, unless `--no-hover` is passed. With all of the first sheet in the window, it points at every block, the margin beside it and its gutter's "+", and every gap above a section. After each point it checks that every block is where it was (0px), the pages are as many, and nothing in the page's root (`[data-cv-page]`, what prints) was added or changed. It fails if a block shows no gutter, a gap shows no "+ Section", or it pointed at fewer than 40 points.

It prints the differences and a summary, and exits 1 if there are any. Which page each block is on needs `pdftotext` (poppler) or a command in `PARITY_PDF_TEXT` that prints a PDF's text with a form feed after each page; without either it stops, unless `--no-pdf-text` is passed, when only the page counts are compared. Blocks taller than a page are not covered. It refuses a `--url` or `--api` that isn't on this machine unless `--allow-remote` is passed.

### Export's PDF

Export saves the CV, then downloads a PDF the server makes: `GET /resume/<id>/pdf` on the client opens the CV's print page in a headless Chromium (`client/lib/pdf`) as the signed-in user, with their cookies, and returns it with no browser header or footer. One Chromium serves all exports, two at a time, 20 seconds each. If it fails, the editor offers the print view (the browser's own print dialog) instead.

- `PDF_PUBLIC_ORIGIN`: the address the app is used at, where the print page is opened (for example `https://candidohq.com`). Required in production; without it only `localhost` requests are served.
- `PDF_HOST_RESOLVER_RULES`: passed to Chromium as `--host-resolver-rules`. In Docker for development it is `MAP localhost host.docker.internal`, so `localhost` reaches the host's ports.
- `CHROMIUM_PATH`: defaults to `/usr/bin/chromium-browser` (the images install Alpine's `chromium`).

- `PDF_IGNORE_CERT_SPKI`: base64 SHA-256 hashes of certificate keys Chromium trusts though no public authority does (`--ignore-certificate-errors-spki-list`). Production needs it: `docker-compose.prod.yml` sends the client container's Chrome to this host's nginx (`extra_hosts`), which serves Cloudflare's origin certificate. Its hash, on the server:

  ```bash
  openssl x509 -in /etc/ssl/cloudflare/candidohq.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64
  ```

In production the client container must reach `PDF_PUBLIC_ORIGIN` and the API there, as a user's browser does: if the host has a firewall (ufw, iptables), allow the Docker bridge to reach port 443. After deploying, export one CV to check it; a failure shows in the client's logs as `PDF ...`.

Only the `auth_token` cookie is passed to the server's Chrome. Exports wait their turn two at a time, with at most eight waiting (more get 503); each has 20 seconds from the request, waiting included, and an export whose user has gone is dropped. A Chrome that doesn't answer in time is ended and started again for the next export.

`client/scripts/pdf-check.mjs` checks it end to end on a throwaway account: for one CV in A4 and Letter it downloads the PDF from Export and checks the page size, the template's font, the same pages and text as the print page's own PDF, and no URL or title on the page; a CV of another account must give 404. The CV's paper is put back.

```bash
node scripts/pdf-check.mjs --cv <id> --other <someone else's id> --url http://localhost:3000 --api http://localhost:8000 --state auth.json --yes-this-is-a-throwaway-account
```

## Production

Live deploys client + Rails via `docker-compose.prod.yml` and **Deploy to Production**. The API image is `ghcr.io/<owner>/candido-backend`. Each deploy runs `db:migrate` before replacing the running containers, and stops there if a migration fails. Boot runs it again, which does nothing if it is up to date. Do not run `db:prepare` or `db:schema:load` on production.

The Next.js API origin is baked in at image build (`NEXT_PUBLIC_API_URL`). Keep that secret equal to the public API URL the browser already uses. The client calls `{NEXT_PUBLIC_API_URL}/api/v1`.

### CV checklist release

Existing CVs and library sections need item ids. Back up the database, then deploy, which adds the columns. Run this on the server immediately after, as soon as the new version is live: until then, editing a CV or library section gives its items ids that may not match.

```bash
docker-compose -f docker-compose.prod.yml --env-file backend/.env exec -T backend ./bin/rails cv_items:backfill
```

It checks that every CV still shows the same, and leaves a user's data as it was if one doesn't. It prints counts and user ids only, exits 1 if any user failed, and is safe to repeat. Fix the cause for any user that failed and run it again. Also run it again a day later, for pages that were left open from before the release, or opened between the deploy and the first run.

## Applying this cutover

This is not a no-op deploy. Client and API must go out together, and Postgres is renamed in place on boot.

1. Merge to `main` and wait for CI.
2. Confirm a Postgres backup (snapshot or `pg_dump`).
3. Run **Deploy to Production** (release or workflow_dispatch). Expect a few minutes of downtime.
4. The deploy runs `db:migrate` with the new image, then starts it to serve `/api/v1`.
5. Smoke: open candidohq.com, log in, move a card, upload a PDF.

If migrate fails the deploy fails and the old version keeps running. Fix and redeploy; do not run `db:prepare`.

Required GitHub secrets:

| Secret | Notes |
|--------|--------|
| `EC2_HOST`, `EC2_SSH_KEY`, `EC2_APP_PATH` | Existing deploy target |
| `NEXT_PUBLIC_API_URL` | Live API origin, baked into the client image |
| `CORS_ORIGIN` | Live site origin, e.g. `https://candidohq.com` |
| `SECRET_KEY_BASE` | Rails only. Generate with `./run rails secret` |
| `DATABASE_URL` | Live Postgres URL (existing schema) |
| `AWS_BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Existing uploads bucket |
| `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` | Verification / feedback email |
| `ANTHROPIC_API_KEY` | CV import and CV reviews. Without it the deploy still works and both report they're unavailable |

An optional second instance can still use **Deploy Rails (test instance)** (`EC2_RAILS_HOST`, `EC2_RAILS_APP_PATH`, `NEXT_PUBLIC_RAILS_API_URL`).
