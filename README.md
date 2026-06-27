# Ticketing System — Internal Work Distribution SaaS

An internal ticketing and work distribution system built for a small team of ~15 users. Allows team members to create, assign, track, and close tasks through a clean web interface.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Python + FastAPI |
| Database | PostgreSQL |
| Auth | Clerk (Google OAuth) |
| Frontend Hosting | AWS S3 + CloudFront |
| Backend Hosting | AWS EC2 |
| CI/CD | GitHub Actions |
| Domain | Client's custom domain via Route 53 |
| SSL | AWS ACM + ALB |

## Quick Start (Local Development)

### Prerequisites
- Node.js (for React frontend)
- Python 3.11+
- PostgreSQL
- Nginx
- Git

### 1. Clone the repo
```bash
git clone <repo-url>
cd ticketing-system
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Fill in your values — see docs/environment-variables.md
```

### 3. Start the backend
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head       # run DB migrations
uvicorn main:app --reload  # start FastAPI
```

### 4. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

### 5. Nginx
Use Nginx as a local proxy — see `docs/setup.md` for config.

## Documentation

- [Architecture](docs/architecture.md) — system overview, AWS setup
- [Setup Guide](docs/setup.md) — full local dev environment setup
- [API Reference](docs/api.md) — all API endpoints
- [Database Schema](docs/database.md) — tables and relationships
- [Deployment](docs/deployment.md) — CI/CD pipeline and environments
- [Decisions](docs/decisions.md) — why we made certain tech choices

## Environments

| Environment | Frontend | Backend | Purpose |
|---|---|---|---|
| Dev | Nginx (local VM) | Local FastAPI | Active development |
| Test | S3 + CloudFront | EC2 | QA before release |
| Prod | S3 + CloudFront | EC2 | Live client environment |
