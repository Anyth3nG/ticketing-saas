# Architecture

## Overview

The ticketing system is a full-stack web application with a decoupled frontend and backend, hosted on AWS with Cloudflare in front for DNS and HTTPS. The frontend is served as a static site directly from an S3 website endpoint. The backend is a Python FastAPI application running persistently on EC2 behind Nginx, connected to a local PostgreSQL database.

## System Diagram

```
User's Browser
      │
      ├─── loads app ──────────────────────────────────────────────────────►
      │                                                        Cloudflare (proxied, edge TLS)
      │                                                                    │
      │                                                          S3 website endpoint
      │                                                          (bucket name == domain)
      │
      └─── API calls to api-workload.max-cpa.co.il ────────────────────────►
                                                            Cloudflare (proxied, edge TLS)
                                                                        │
                                                                    EC2 Instance
                                                                        │
                                                           ┌────────────┴────────────┐
                                                           │   Nginx (:80 / :443)     │
                                                           │   Let's Encrypt cert     │
                                                           │           │              │
                                                           │  FastAPI (:8000)         │
                                                           │           │              │
                                                           │      PostgreSQL          │
                                                           │    (local to EC2)        │
                                                           └──────────────────────────┘
```

## Domain Setup

`max-cpa.co.il` is registered/managed by an external IT company (Compbiz); DNS is hosted on Cloudflare, proxied (orange-cloud) for all records except `clerk.max-cpa.co.il`.

| Domain | Points to | Notes |
|---|---|---|
| `testing.max-cpa.co.il` | Test EC2 Elastic IP | **This app on test**, containerized and same origin (SPA + `/api`), since 2026-09-10. Until then it was the S3 test bucket, which is why that bucket is named `testing.max-cpa.co.il` — S3 website hosting matches the bucket name to the `Host` header |
| `workload.max-cpa.co.il` | S3 website endpoint (prod bucket) | Same constraint — bucket named `workload.max-cpa.co.il` |
| `api-testing.max-cpa.co.il` | Test EC2 Elastic IP | **The CRM on test** since 2026-09-10 — this app's proxy hands it across to the CRM's own stack (see [deployment.md](deployment.md)). Before that it was this app's test API. Deliberately 1 level under the apex — Cloudflare's free Universal SSL only covers the apex + one wildcard level (`*.max-cpa.co.il`), not 2-level subdomains like `api.testing.max-cpa.co.il` |
| `api-workload.max-cpa.co.il` | Prod EC2 Elastic IP | Same reason |
| `crm.max-cpa.co.il` | Prod EC2 Elastic IP | The CRM's planned prod hostname. Nothing serves it yet, and nothing in this repo configures it |
| `clerk.max-cpa.co.il` | `frontend-api.clerk.services` | **DNS-only** (grey-cloud), not proxied — Clerk terminates its own TLS and verifies domain ownership directly against this CNAME; Cloudflare proxying breaks both |

SSL: Cloudflare terminates HTTPS at the edge for every record (Universal SSL, free tier). For the two `api-*` records, Cloudflare also connects onward to the EC2 origin over HTTPS using a Let's Encrypt cert provisioned by `backend/deploy/setup_nginx_tls.sh` (see [deployment.md](deployment.md)) — but the origin's Nginx config intentionally serves identically on port 80 and port 443 (no forced redirect), so it works correctly regardless of whether Cloudflare's SSL/TLS mode for that hostname is set to Flexible or Full.

No ALB, ACM, Route 53, or CloudFront are used — considered and rejected in favor of Cloudflare for cost reasons at this scale (~15 users, single EC2 per environment). See [decisions.md](decisions.md).

## Frontend

- Built with React + Vite
- In development: served by Nginx on local VM, proxied to local FastAPI
- In test/prod: built via `npm run build`, uploaded to S3 by GitHub Actions, served directly from the bucket's static website endpoint (no CDN in front — Cloudflare's proxy provides edge caching/TLS instead)

## Backend

- Python + FastAPI running on EC2, listening on `127.0.0.1:8000`
- Nginx reverse-proxies `:80`/`:443` to the app and terminates TLS with a Let's Encrypt cert (see [deployment.md](deployment.md))
- Managed by systemd (keeps the process alive 24/7, auto-restarts on crash)
- All routes contained in a single FastAPI application
- Connects to local PostgreSQL instance on the same EC2
- Auth handled via Clerk JWT tokens — FastAPI validates the token on protected routes

## Database

- PostgreSQL running locally on the EC2 instance (same machine as FastAPI)
- One database per environment, all named `ticketing_saas` — each environment runs its own PostgreSQL instance
- Schema changes managed by Alembic migrations
- Backups via AWS EBS snapshots + pg_dump cron job

## Auth Flow

Accounts are provisioned by hand, not self-serve: a manager creates each user directly in
Clerk with an initial password (which they update after first login), and sign-up is disabled
on the Clerk instance — no unknown account can ever be created. See
[decisions.md](decisions.md) for why.

1. User visits the app and signs in with the email/password a manager gave them
2. Clerk issues a JWT token to the frontend
3. Frontend includes the JWT in every API request header
4. FastAPI validates the JWT on each request before processing (full JWKS verification, no dev bypass)

This matters beyond login: `get_current_user` (`backend/auth.py`) re-links a `users` row to a
new Clerk `clerk_id` by matching on email when a person's Clerk identity is reissued (e.g. a
Clerk instance switch), inheriting that row's role. That's only safe because sign-up is
disabled — nobody can present a token for an email they weren't personally given one for. If
self-serve sign-up were ever enabled, this becomes a privilege-escalation path.

### Where sign-in happens

The sign-in form is Clerk's, drawn inside this app's own page: `main.jsx` mounts
`<SignIn>` at `/sign-in`, Clerk's script renders it, and the credentials go by
`fetch` straight to Clerk. The app itself never redirects to sign in —
`ProtectedRoute` changes the URL client-side.

Two props keep Clerk's other flows on the same hostname:

- `signInUrl="/sign-in"` on `ClerkProvider` — where the avatar menu's **Add
  account** goes.
- `afterSwitchSessionUrl="/"` on `UserButton` — where switching account lands.
  Clerk reads this one only from `UserButton` or its dashboard, never from
  `ClerkProvider`.

Both are relative on purpose. Unset, Clerk falls back to its hosted sign-in
page and to the absolute URLs saved in its dashboard — one set per Clerk
instance. On test that instance is shared with the CRM and those URLs pointed
at the CRM, so Add account landed people in the other app. A relative path
follows whichever hostname the app is on, and never needs the dashboard
changed. See [decisions.md](decisions.md).

Not covered: signing out of one of several accounts still passes through
Clerk's hosted "choose account" page.

## CI/CD

See [deployment.md](deployment.md) for full pipeline details.

## Environments

| | Dev | Test | Prod |
|---|---|---|---|
| Frontend | Nginx (local VM) | container behind the proxy (EC2) | S3 (behind Cloudflare) |
| Backend | FastAPI (local VM) | container (EC2) | EC2 |
| Database | PostgreSQL (local VM) | container (EC2) | PostgreSQL (EC2) |

Test runs the containerized deployment; prod is still on the bare-metal one
described above until its cutover. See [deployment.md](deployment.md).
| Git branch | feature branches | staging | main |
