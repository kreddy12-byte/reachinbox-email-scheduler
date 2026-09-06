# ReachInbox Email Scheduler

Full-stack email outreach scheduler (ReachInbox assignment) — **frontend + API + Postgres only**.

## Overview

Authenticated users compose outreach, upload CSV leads, schedule sends with delay and hourly limits, search emails, and optionally receive Slack alerts when a sender hits its hourly rate limit.

## Stack (free-deploy friendly)

```
React (Vite + Tailwind)
        ↓
Express API (TypeScript)  ← in-process email poller
        ↓
PostgreSQL (Prisma)
        ↓
Ethereal SMTP (or simulated send if SMTP ports are blocked)
```

No Redis, Elasticsearch, or separate worker process.

## Features

- Google OAuth authentication (session cookies)
- Compose + CSV lead upload and bulk scheduling
- Postgres-backed delayed sends (poller inside the API)
- Multiple senders per user
- Ethereal SMTP delivery (auto-created account; simulated fallback on blocked SMTP)
- Hourly rate limiting + min-delay pacing (Postgres)
- Rate-limit reschedule to next UTC hour
- Slack OAuth + rate-limit notifications (optional)
- Postgres ILIKE search
- React dashboard (scheduled/sent, search, Slack, compose)

## Local Setup

### Prerequisites

- Node.js 20+
- Docker (Postgres only) **or** any Postgres URL (e.g. Neon)

### 1. Start Postgres

```bash
docker compose up -d
```

### 2. Configure environment

```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set Google OAuth (and optional Slack) in `backend/.env`. Ethereal can be left blank.

### 3. Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

API: `http://localhost:3001` (poller starts with the API)

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: `http://localhost:5173`

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `PORT` / `FRONTEND_URL` | API port and CORS/session origin |
| `SESSION_SECRET` | Express session signing |
| `GOOGLE_*` | Google OAuth |
| `SLACK_*` | Slack OAuth + notify channel (optional) |
| `ETHEREAL_*` | Dev SMTP (optional; auto-created if empty) |
| `EMAIL_MIN_DELAY_MS` / `MAX_EMAILS_PER_HOUR` | Default throttle / hourly limit |
| `EMAIL_POLL_INTERVAL_MS` / `EMAIL_POLL_BATCH_SIZE` | In-process poller |

Frontend: `VITE_API_URL` (default `http://localhost:3001`)

## Scheduling Behavior

- Each lead becomes a `SCHEDULED` email with staggered `scheduledAt`
- API poller claims due rows (`SCHEDULED` → `PROCESSING`) then sends
- Hourly limit: count of SENT/PROCESSING in the current UTC hour; denied emails return to `SCHEDULED` at the next UTC hour
- Min delay: per-sender `sender_send_slots` table

## Free Deployment (Render Blueprint)

`render.yaml` creates:

| Resource | Plan | Role |
| --- | --- | --- |
| `reachinbox-db` | Free Postgres | App data (expires after 30 days on free) |
| `reachinbox-api` | Free web | Express + poller |
| `reachinbox-frontend` | Static | Vite `dist/` |

### Steps

1. Push this repo to GitHub
2. Render → **New → Blueprint** → select the repo
3. Enter Google (and optional Slack) secrets when prompted
4. After deploy, set Google redirect URI to:
   `https://<api-host>/api/auth/google/callback`
5. Open the frontend URL and sign in

**Notes**

- Free API sleeps after ~15 minutes idle; the poller pauses until the next request wakes it
- Free hosts often block SMTP port 587 — the API then uses **simulated sends** (status still becomes `SENT`)
- Prefer [Neon](https://neon.tech) free Postgres if you need a DB that does not expire in 30 days (set `DATABASE_URL` manually)

## Security

- Secrets stay in gitignored env files / Render dashboard
- Slack tokens never leave the backend
- Auth is session-based; email APIs require `requireAuth`
