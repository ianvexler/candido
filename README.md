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

## Production

Live deploys client + Rails via `docker-compose.prod.yml` and **Deploy to Production**. The API image is `ghcr.io/<owner>/candido-backend`. Each deploy runs `db:migrate` before replacing the running containers, and stops there if a migration fails. Boot runs it again, which does nothing if it is up to date. Do not run `db:prepare` or `db:schema:load` on production.

The Next.js API origin is baked in at image build (`NEXT_PUBLIC_API_URL`). Keep that secret equal to the public API URL the browser already uses. The client calls `{NEXT_PUBLIC_API_URL}/api/v1`.

### CV checklist release

Existing CVs and library sections need item ids. Deploy first, which adds the columns, then run this on the server once the new version is live. Back up the database before.

```bash
docker-compose -f docker-compose.prod.yml --env-file backend/.env run --rm -T --no-deps backend ./bin/rails cv_items:backfill
```

It checks that every CV still shows the same, and leaves a user's data as it was if one doesn't. It prints counts and user ids only, exits 1 if any user failed, and is safe to repeat.

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
