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

## Deployment (Railway — preferred)

Config files:

- `backend/railway.toml` — API + Prisma migrate + in-process poller
- `frontend/railway.toml` — Vite build + `serve` static host

### Steps

1. Create a Railway project from this GitHub repo (or `railway login` + `railway init`)
2. Add a **PostgreSQL** plugin; link `DATABASE_URL` to the API service
3. Create two services from the same repo:
   - **API** — Root Directory `/backend`
   - **Frontend** — Root Directory `/frontend`
4. API variables:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `FRONTEND_URL` | `https://${{Frontend.RAILWAY_PUBLIC_DOMAIN}}` |
   | `GOOGLE_CALLBACK_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}/api/auth/google/callback` |
   | `SLACK_REDIRECT_URI` | `https://${{RAILWAY_PUBLIC_DOMAIN}}/api/slack/oauth/callback` |
   | `SESSION_SECRET` | long random string |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud |
   | `NODE_ENV` | `production` |

5. Frontend build variable:

   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://${{API.RAILWAY_PUBLIC_DOMAIN}}` |

6. Generate public domains for both services
7. Update Google (and Slack) OAuth redirect URLs to the live API callbacks

`render.yaml` remains as an alternate free Render Blueprint (API sleeps when idle).

**Notes**

- Railway uses trial/usage credits (not forever-$0)
- If SMTP port 587 is blocked, the API uses **simulated sends** (status still `SENT`)

## Security

- Secrets stay in gitignored env files / Render dashboard
- Slack tokens never leave the backend
- Auth is session-based; email APIs require `requireAuth`
