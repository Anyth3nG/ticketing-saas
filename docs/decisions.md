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

## Auth: Clerk, hand-provisioned accounts, over AWS Cognito

Clerk was chosen over Cognito because:

- Clerk provides a hosted login page out of the box
- JWT tokens are easy to validate in FastAPI
- Free tier covers well beyond 15 users
- Cognito configuration is complex and time-consuming for the same result

Google OAuth was tried initially but dropped: accounts are instead created by hand — a manager
adds each team member directly in Clerk with an initial password, which they change after
first login — and self-serve sign-up is disabled on the Clerk instance, so no account can ever
be created that a manager didn't explicitly provision.

This is more than a login-flow detail — it's load-bearing for a real security property.
`get_current_user` (`backend/auth.py`) re-links a `users` row to a new Clerk `clerk_id` by
matching on email whenever a person's Clerk identity is reissued (e.g. the app was pointed at a
different Clerk instance), and that re-link inherits the row's role. Trusting an email match
that way is only safe *because* sign-up is disabled — nobody can mint an account for an email
they weren't personally handed one for. Re-enabling self-serve sign-up would turn this into a
privilege-escalation path (register with someone else's email, inherit their role) and would
need this logic revisited first.

One open gap from this model: initial passwords have no forced-rotation or single-use
enforcement in Clerk, so one stays valid indefinitely for anyone who doesn't get around to
changing it, and the manager who set it knows it. Worth requiring MFA or switching to
password-reset links (single-use) instead of directly-set passwords, if this becomes a concern.

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

## DNS/HTTPS: Cloudflare-proxied over ACM + ALB/CloudFront

The original plan was AWS-native: ACM certificates on an ALB (backend) and CloudFront (frontend), with Route 53 for DNS. Switched to Cloudflare-proxied DNS instead:

- An ALB costs ~$20-30/month — pure overhead for a single EC2 instance serving ~15 internal users, with no meaningful availability benefit at this scale
- Cloudflare's free tier provides the same HTTPS-termination-at-the-edge behavior for both the S3 frontend and the EC2 backend, at no cost
- DNS for `max-cpa.co.il` is already on Cloudflare (managed by an external IT company), so no migration was needed to use it

Two constraints fell out of this choice that shaped the domain layout in [architecture.md](architecture.md):

- **S3 website hosting has no domain-mapping layer** — without CloudFront in front, the bucket name must exactly match the custom domain (S3 matches the `Host` header directly to a bucket name), so the frontend buckets are named `testing.max-cpa.co.il` / `workload.max-cpa.co.il` rather than anything more conventional.
- **Cloudflare's free Universal SSL cert only covers the apex + one wildcard level** (`max-cpa.co.il` + `*.max-cpa.co.il`). A 2-level subdomain like `api.testing.max-cpa.co.il` gets no certificate at all and fails TLS outright — hence the API domains are flattened to `api-testing.max-cpa.co.il` / `api-workload.max-cpa.co.il` instead of nesting under `testing`/`workload`.

The EC2 origin's Nginx config deliberately serves identically on port 80 and port 443 (no forced HTTPS redirect), so it works under either Cloudflare SSL/TLS mode (Flexible connects to the origin on :80, Full on :443) without needing dashboard access to check or control which one is set.

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

## Manager's "My Work" page: a standalone copy, not a shared component

Managers needed their own personal-ticket board (`frontend/src/pages/ManagerWorkDashboard.jsx`,
`/manager/work`), separate from the Team Board they use to oversee workers. It's currently a
near-verbatim copy of `WorkerDashboard.jsx` — same 4-column kanban, same drag-and-drop, same
create-ticket form — including two columns ("Managers Work", "Awaiting Approval") that are
structurally always empty for a manager, since nothing can ever assign a ticket to a manager
and personal tickets never reach `awaiting_approval`.

This was a deliberate choice, not an oversight: the client asked for a like-for-like copy now,
with an explicit plan to redesign this page's layout in a later iteration. Extracting a shared
component between the two pages would mean less duplicated code today, but that shared piece
would need to be pulled apart again the moment the manager page's layout actually diverges —
paying an abstraction cost now for a shape we already know is temporary. A plain duplicate
means the eventual redesign only ever touches one file and can't destabilize the worker board
workers depend on daily. Revisit the shared-component question once the manager page's actual
target layout is known.

## Recurring tickets: the schedule is a separate, first-class thing from any month's ticket

A recurring ticket is two things under the hood: a `RecurringTicketTemplate` (the schedule —
title, urgency, day of month) and, at any given time, at most one materialized `Ticket` row
generated from it for the current month (`generate_due_recurring_tickets`, see
[api.md](api.md)). Marking that month's ticket done used to mean the whole recurring series
visually vanished from the "All" view for the rest of the month — there was no way to tell it
still existed, or to remove it short of deleting individual monthly instances (which didn't
even work correctly: the next `GET /tickets` would silently regenerate whatever you'd just
deleted, since generation only checks "does *a* ticket exist for this template this month," not
whether one existed and was deleted).

Fix: the template is now independently listable, editable, and deletable
(`GET`/`PUT`/`DELETE /api/tickets/recurring-templates[/{id}]`), and the frontend's "All" tab
shows exactly one persistent card per active template — never the live monthly ticket, which
only appears under Today/Week/Month (due-date filtered, unchanged). This avoids showing the
same series twice, and means "All" no longer loses a recurring series just because this
month's occurrence was completed. Deleting is now only possible at the template level:
`DELETE /api/tickets/{id}` rejects any recurring instance (`400`) — the schedule and the
current unfinished occurrence are removed together, but past **completed** months are kept
(the template is deactivated, not row-deleted, so their `template_id` foreign key stays valid
for Archive history).

## Kubernetes: Not used

Kubernetes (EKS) was considered and ruled out. For 15 internal users with a single backend service and database, Kubernetes adds enormous infrastructure complexity, steep learning curve, and significant cost ($150+/month on EKS) with no meaningful benefit at this scale. It can be revisited if the product grows to hundreds of users across multiple services.
