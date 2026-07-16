# Technical Decisions

A record of key architectural decisions and the reasoning behind them.

---

## Backend: Python + FastAPI over Node.js + Express

FastAPI was chosen over Node.js/Express because the developer is more comfortable with Python. FastAPI is the modern standard for Python REST APIs, offers automatic API documentation via Swagger UI, and is performant enough for the scale of this project.

---

## Hosting: EC2 over AWS Lambda

Lambda was initially considered due to prior experience with a single-function serverless setup. However, for a real client-facing SaaS:

- Lambda cold starts would make the app feel slow to users
- A 29-second API Gateway timeout is a hard limit
- A single Express/FastAPI app on a persistent server is simpler to maintain and debug
- At 15 users, a t3.small EC2 instance is more than sufficient and costs ~$15-20/month

EC2 with systemd was chosen for simplicity, reliability, and cost-effectiveness at this scale.

---

## Database: PostgreSQL on EC2 (local) over managed DB (RDS/Neon)

Since the backend runs 24/7 on EC2, a local PostgreSQL instance on the same machine was chosen over a managed service like RDS or Neon. This:

- Eliminates external DB dependency and latency
- Reduces cost (no separate DB service fee)
- Keeps the architecture simple at the current scale
- Is backed up via AWS EBS snapshots and pg_dump cron jobs

---

## Auth: Clerk + Google OAuth over AWS Cognito

Clerk was chosen over Cognito because:

- Google OAuth setup is a single toggle in Clerk's dashboard
- Clerk provides a hosted login page out of the box
- JWT tokens are easy to validate in FastAPI
- Free tier covers well beyond 15 users
- Cognito configuration is complex and time-consuming for the same result

Since all 15 users have Google accounts (internal team), Google OAuth is the natural choice — no passwords to manage.

---

## Frontend: React + Vite over plain HTML/CSS/JS

React was chosen despite the developer's prior experience being with plain HTML/CSS/JS because:

- A ticketing app has dynamic UI requirements (live updates, filtering, status changes)
- React components map naturally to the UI (ticket list, ticket card, status badge)
- Vite makes the dev experience fast and the build output clean for S3 deployment
- Claude Code can assist with React code throughout development

---

## CI/CD: GitHub Actions

GitHub Actions was chosen for CI/CD because:

- It's tightly integrated with GitHub (where the repo lives)
- Free for the scale of this project
- Handles both frontend (S3 upload) and backend (SSH deploy) pipelines
- No additional tooling needed

---

## Notifications & live updates: polling over WebSockets

Ticket comments needed some form of notification, and dashboards needed to reflect other
users' changes without a manual refresh. WebSockets (or SSE) would give instant push, but add
a persistent-connection server, reconnect handling, and more moving parts to run on a single
EC2 instance — not worth it for 15 users who already have the board open most of the day.

Instead: the frontend polls `GET /api/tickets` (worker board every 30s, manager board every
10s) and `GET /api/notifications` (every 15s). This reuses plain REST endpoints, needs no new
infrastructure, and the delay is invisible at this team size. Revisit if the team grows large
enough that polling load becomes a real cost, or if truly instant delivery becomes a
requirement.

---

## User profile sync: throttled, not on every request or via webhook

`name`, `email`, and `avatar_url` are copied from Clerk into our own `users` table (so the
manager dashboard can show a worker's picture without the frontend needing per-user Clerk
API access). Two options were considered:

- **A Clerk webhook** (`user.updated`) would push changes immediately, but means standing up a
  public webhook endpoint, verifying Clerk's signature, and handling delivery failures/retries
  — real infrastructure for a field that changes rarely (someone's display name or photo).
- **Re-fetching from Clerk on every request** is simplest to write, but `get_current_user` runs
  on every API call including the frontend's own polling (dashboards refetch every 10-30s) — an
  unthrottled live fetch would multiply Clerk API calls far beyond what 15 users need and risks
  hitting Clerk's rate limits.

Landed on: refresh from Clerk opportunistically inside `get_current_user`, throttled to once an
hour per user (`PROFILE_SYNC_INTERVAL` in `backend/auth.py`). A profile change shows up within
an hour of that person's next request, which is fine for a name or photo, and a Clerk API
failure during a refresh is swallowed rather than breaking the request.

---

## Kubernetes: Not used

Kubernetes (EKS) was considered and ruled out. For 15 internal users with a single backend service and database, Kubernetes adds enormous infrastructure complexity, steep learning curve, and significant cost ($150+/month on EKS) with no meaningful benefit at this scale. It can be revisited if the product grows to hundreds of users across multiple services.
