# CLAUDE.md

## Project Overview

Internal ticketing and work distribution SaaS for a small team of ~15 users. Allows team members to create, assign, track, and close tasks.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL (a container on the EC2 box, shared with the CRM in a separate `crm` database)
- **Auth**: Clerk — accounts are provisioned by hand (manager sets an initial password per user); self-serve sign-up is disabled, so no unknown accounts can be created
- **Hosting**: Docker Compose on AWS EC2, behind an nginx proxy container. **Same origin** — one hostname serves the SPA and the API, so there is no CORS config and no API base URL in the bundle
- **CI/CD**: GitHub Actions building images to GHCR; the box only pulls

> **Cutover pending.** Prod still runs the previous bare-metal deployment
> (systemd + host nginx + S3 frontend). See [docs/deployment.md](docs/deployment.md)
> for both models and the cutover runbook — and read it before changing
> anything under `deploy/` or `.github/workflows/`.

## Repository Structure

```
/
├── frontend/        ← React + Vite app (Dockerfile builds and serves it)
├── backend/         ← Python + FastAPI app
│   └── deploy/      ← SUPERSEDED bare-metal nginx scripts; still live until cutover
├── proxy/           ← shared reverse proxy config
│   ├── conf.d/      ← local development
│   └── deploy/      ← production server-block templates
├── deploy/          ← deployed stack: compose file, deploy.sh, cert + env scripts
├── docs/            ← project documentation
├── .claude/         ← Claude Code configuration
├── .github/
│   └── workflows/   ← GitHub Actions CI/CD pipelines
├── docker-compose.yml   ← local stack, mirrors the production topology
├── CLAUDE.md
└── README.md
```

## Environments

| Environment | Serving | Git Branch |
|---|---|---|
| Dev | `docker compose up` → http://localhost:8081 | Feature branches |
| Test | containers on EC2 | `staging` |
| Prod | containers on EC2 | `main` |

Local uses 8081 because the CRM's stack already uses 8080 and both are checked
out on the same machine.

## Configuration

`backend/.env.example` is the **single source of truth** for backend config.
The deploy workflow resolves every key in it from GitHub Variables/Secrets and
**fails the build** on a missing value. Add a variable there and wire it in the
workflow's `env:` block — there is no second list.

This exists because the old workflows wrote `backend/.env` from a fixed
heredoc, so a variable added in GitHub silently arrived empty and the app
behaved as though the feature had never been configured. Never reintroduce a
config path that can fail quietly.

## Development Conventions

### Git

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Feature branches named: `feat/short-description`
- Never commit directly to `main` or `staging`

### Backend (FastAPI)

- All routes go in `backend/routes/`
- Database models go in `backend/models/`
- Alembic manages all schema changes — never edit DB manually
- Every endpoint requires auth except `/health`
- Environment variables loaded from `.env` via `python-dotenv`

### Frontend (React)

- Components go in `frontend/src/components/`
- Pages go in `frontend/src/pages/`
- API calls go in `frontend/src/api/`
- Use `.env.local` for local environment variables

### Never

- Never store secrets in code or config files
- Never commit `.env` files
- Never edit the database schema manually — always use Alembic migrations
- Never push directly to `main`

## Key Documentation

- Architecture: `docs/architecture.md`
- Local setup: `docs/setup.md`
- API endpoints: `docs/api.md`
- Database schema: `docs/database.md`
- Deployment: `docs/deployment.md`
- Tech decisions: `docs/decisions.md`
