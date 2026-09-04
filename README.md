# ReachInbox Email Scheduler

Production-style full-stack email outreach scheduler built for the ReachInbox hiring assignment.

## Overview

ReachInbox Email Scheduler lets authenticated users compose outreach, upload CSV leads, schedule sends with delay and hourly limits, search indexed emails, and receive Slack alerts when a sender hits its hourly rate limit.

## Features

- Google OAuth authentication (session cookies)
- Compose + CSV lead upload and bulk scheduling
- Persistent BullMQ delayed jobs (survives API/worker restarts)
- Separate email worker with configurable concurrency
- Multiple senders per user
- Ethereal SMTP delivery (dev)
- Redis Lua hourly rate limiting + min-delay send slots
- Rate-limit reschedule to next UTC hour (emails stay `SCHEDULED`)
- Slack OAuth + rate-limit notifications (Redis NX dedupe)
- Elasticsearch indexing and search
- Bull Board queue UI
- React dashboard (scheduled/sent, search, Slack, compose)

## Architecture

```
React (Vite + Tailwind)
        ↓
Express API (TypeScript)
        ↓
┌───────────────┬────────────────┬────────────────┐
│  PostgreSQL   │ Redis / BullMQ │ Elasticsearch  │
│  (Prisma)     │ (jobs + limits)│ (search index) │
└───────────────┴────────────────┴────────────────┘
        ↓
 Email Worker → Ethereal SMTP
        ↓
 Slack chat.postMessage (rate-limit alerts)
 Google OAuth | Slack OAuth
```

## Local Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (or Docker Engine + Compose)

### 1. Start infrastructure

```bash
docker compose up -d
```

Starts PostgreSQL (`5432`), Redis (`6379`), Elasticsearch (`9200`).

### 2. Configure environment

```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill Google, Slack, and Ethereal credentials in `backend/.env` only. Never commit real secrets.

### 3. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

API: `http://localhost:3001`

### 4. Worker (separate process)

```bash
cd backend
npm run worker
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:5173`

### Root convenience scripts

```bash
npm run docker:up
npm run dev:backend
npm run dev:frontend
npm run build
```

## Docker Setup

`docker-compose.yml` runs **dependencies only** (Postgres, Redis, Elasticsearch) for local development.

Application processes run on the host:

| Process | Command |
| --- | --- |
| API | `npm run dev --prefix backend` |
| Worker | `npm run worker --prefix backend` |
| Frontend | `npm run dev --prefix frontend` |

Production still needs those three app processes plus the three infra services.

## Environment Variables

See `.env.example`. Important keys:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` or `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ + rate limits |
| `ELASTICSEARCH_URL` | Search cluster |
| `PORT` / `FRONTEND_URL` | API port and CORS/session frontend origin |
| `SESSION_SECRET` | Express session signing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_REDIRECT_URI` / `SLACK_CHANNEL_ID` | Slack OAuth + notify channel |
| `ETHEREAL_*` | Dev SMTP |
| `WORKER_CONCURRENCY` | BullMQ worker concurrency |
| `EMAIL_MIN_DELAY_MS` / `MAX_EMAILS_PER_HOUR` | Default throttle / hourly limit |

Frontend:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend base URL (default `http://localhost:3001`) |

## Google OAuth Setup

1. Create a Google Cloud OAuth client (Web).
2. Authorized redirect URI: `http://localhost:3001/api/auth/google/callback` (or your deployed callback).
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in `backend/.env`.
4. Set `FRONTEND_URL` to the React origin so CORS + post-login redirect work.

## Slack OAuth Setup

1. Create a Slack app with Bot Token Scope: **`chat:write`**.
2. Redirect URL: `http://localhost:3001/api/slack/oauth/callback`.
3. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_CHANNEL_ID` in `backend/.env`.
4. Connect Slack from the dashboard.
5. **Invite the bot into the target channel** (e.g. `#new-channel`). Without membership, Slack returns `not_in_channel`.

Notifications resolve ownership via:

`Email.senderId → Sender.userId → SlackConnection` → `chat.postMessage`

Deduped once per sender per UTC hour with Redis key:

`slack-rate-limit-notified:{senderId}:{YYYYMMDDHH}`

## CSV Format

```csv
email,first_name,company
alice@example.com,Alice,Acme
bob@example.com,Bob,Globex
```

If an `email` column exists, it is used. Otherwise the parser scans cells for valid addresses, normalizes, and deduplicates.

## Scheduling Behavior

- Each lead becomes a `SCHEDULED` email with staggered `scheduledAt` (start + index × delay).
- BullMQ delayed jobs use deterministic IDs (`email-{emailId}`).
- Workers claim `SCHEDULED → PROCESSING`, then send via Ethereal.
- **Minimum delay:** Redis send-slot reservation per sender (`EMAIL_MIN_DELAY_MS` / per-email `sendDelayMs`).
- **Hourly limit:** Redis Lua counter per sender per UTC hour. When denied:
  - email returns to `SCHEDULED`
  - `scheduledAt` moves to next UTC hour
  - same BullMQ job is delayed (not dropped)
  - Slack notify is best-effort and never fails the job
- Multiple workers are safe via Redis Lua + DB claim (`updateMany` status guard).

## Elasticsearch

Emails are indexed best-effort on schedule/send. Search:

`GET /api/emails/search?q=...&status=SENT`

If Elasticsearch is down, scheduling/sending still works; index repair:

```bash
cd backend
npm run elasticsearch:reindex
```

## Bull Board

Development queue UI: `http://localhost:3001/admin/queues`

Protect this path in production (currently open for assignment demos).

## Worker

```bash
cd backend
npm run worker
```

Uses `WORKER_CONCURRENCY`. Must run alongside the API for emails to send.

## Restart Persistence

- Jobs live in Redis (BullMQ).
- Email state lives in PostgreSQL.
- Restarting API or worker does not drop scheduled jobs.
- **Sessions** use MemoryStore in development — logging in again is required after API restart. Use a persistent session store for production.

## Testing

```bash
# Builds
npm run build --prefix backend
npm run build --prefix frontend

# Health
curl http://localhost:3001/api/health

# Prisma
cd backend && npx prisma validate
```

Suggested manual smoke:

1. Google login → dashboard
2. Slack connected + channel configured
3. Schedule a few leads with a low hourly limit
4. Confirm sends, reschedule, Slack notify (once/hour)
5. Search via Elasticsearch
6. Open Bull Board
7. Logout → unauthenticated APIs return `401`

## Deployment

Required services:

- PostgreSQL
- Redis
- Elasticsearch
- Backend API process
- Email worker process
- Frontend (static hosting or Vite preview / CDN)

Configure all env vars for production hosts. Set:

- `NODE_ENV=production` (secure cookies)
- Strong `SESSION_SECRET`
- Matching `FRONTEND_URL`, Google/Slack callback URLs
- CORS already allows `FRONTEND_URL` with credentials

On Render, production cookies use `SameSite=None` + `Secure` (with `trust proxy`) so the static frontend can call the API with credentials across `*.onrender.com` subdomains.

## Render Deployment

This repo includes a Render Blueprint at `render.yaml`.

### Services created by the Blueprint

| Resource | Render type | Role |
| --- | --- | --- |
| `reachinbox-db` | PostgreSQL | Prisma / app data |
| `reachinbox-redis` | Key Value (Redis) | BullMQ + rate limits (`noeviction`) |
| `reachinbox-elasticsearch` | Private Docker service | Search index (persistent disk) |
| `reachinbox-api` | Web (Node) | Express API + Prisma migrate on deploy |
| `reachinbox-worker` | Background Worker (Node) | BullMQ email worker (`npm run worker:start`) |
| `reachinbox-frontend` | Static site | Vite `dist/` build |

Local `docker-compose.yml` is unchanged and still used for local Postgres/Redis/Elasticsearch.

### Required secrets (Dashboard prompts / `sync: false`)

Set these in Render when the Blueprint asks (never commit them):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_CHANNEL_ID`
- `ETHEREAL_USER`
- `ETHEREAL_PASSWORD`

`SESSION_SECRET` is auto-generated for the API. `DATABASE_URL` and `REDIS_URL` are wired from managed services. `ELASTICSEARCH_URL` uses the private service hostname `http://reachinbox-elasticsearch:9200`.

### Public URLs (defaults from service names)

After deploy, Render assigns:

- Frontend: `https://reachinbox-frontend.onrender.com`
- API: `https://reachinbox-api.onrender.com`
- Bull Board: `https://reachinbox-api.onrender.com/admin/queues`

If Render appends a suffix to a service URL, update:

- API env: `FRONTEND_URL`, `GOOGLE_CALLBACK_URL`, `SLACK_REDIRECT_URI`
- Frontend build env: `VITE_API_URL`
- Then **clear build cache / redeploy frontend** so Vite rebuilds with the correct API URL.

### OAuth callback URLs to configure after deploy

**Google Cloud Console** authorized redirect URI:

`https://reachinbox-api.onrender.com/api/auth/google/callback`

**Slack app** redirect URL:

`https://reachinbox-api.onrender.com/api/slack/oauth/callback`

Also invite the Slack bot into your notify channel.

### Deploy steps (in order)

1. Push this repo to GitHub (if not already).
2. In Render: **New → Blueprint** → select the repo → confirm `render.yaml`.
3. Enter the `sync: false` secrets when prompted.
4. Apply the Blueprint and wait for Postgres, Redis, Elasticsearch, API, worker, and frontend to become healthy.
5. Copy the live API and frontend URLs from the Render dashboard.
6. If URLs differ from the defaults above, update env vars and redeploy API + frontend.
7. Update Google and Slack OAuth redirect URLs to the live API callbacks.
8. Open the frontend URL, sign in with Google, connect Slack, and run a small schedule smoke test.
9. Confirm the worker is running (emails leave `SCHEDULED`) and Bull Board is reachable on the API service.

### Notes

- Only the **API** runs `prisma migrate deploy` (`preDeployCommand`). The worker does not migrate.
- Frontend `VITE_API_URL` is a **build-time** variable.
- Elasticsearch private service needs a plan with enough RAM (Blueprint uses `standard` + 512MB JVM heap).
- Keep the Slack bot invited to the configured channel so rate-limit notifications deliver.

## Security

- Secrets stay in gitignored `backend/.env` / `frontend/.env`
- `.env.example` has placeholders only
- Slack tokens, Google secrets, and Ethereal passwords never leave the backend
- Frontend only receives Slack status (connected / team / channel id), never tokens
- Auth is session-based; email APIs require `requireAuth`
- `render.yaml` contains no credential values (`sync: false` / `generateValue` / service references only)

## Known Limitations

- Ethereal is for development previews, not production deliverability
- Session MemoryStore loses logins on API restart
- Bull Board is not auth-gated in this assignment build
- Strict global send ordering across distributed workers is best-effort, not guaranteed
- Slack bot must be invited to the notify channel (`chat:write` alone cannot join without extra scopes)
- Elasticsearch failures do not block scheduling/sending
- Render Elasticsearch is a self-managed Docker private service (not a managed ES product)
