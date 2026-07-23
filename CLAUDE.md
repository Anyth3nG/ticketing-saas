# CLAUDE.md

## Project Overview

Internal ticketing and work distribution SaaS for a small team of ~15 users. Allows team members to create, assign, track, and close tasks.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL (local to EC2)
- **Auth**: Clerk — accounts are provisioned by hand (manager sets an initial password per user); self-serve sign-up is disabled, so no unknown accounts can be created
- **Hosting**: AWS S3 + CloudFront (frontend), AWS EC2 (backend)
- **CI/CD**: GitHub Actions

## Repository Structure

```
/
├── frontend/        ← React + Vite app
├── backend/         ← Python + FastAPI app
├── docs/            ← Project documentation
├── .claude/         ← Claude Code configuration
├── .github/
│   └── workflows/   ← GitHub Actions CI/CD pipelines
├── CLAUDE.md
└── README.md
```

## Environments

| Environment | Frontend | Backend | Git Branch |
|---|---|---|---|
| Dev | Nginx (local VM) | Local FastAPI (port 8000) | Feature branches |
| Test | S3 + CloudFront | EC2 | `staging` |
| Prod | S3 + CloudFront | EC2 | `main` |

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
