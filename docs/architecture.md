# Architecture

## Overview

The ticketing system is a full-stack web application with a decoupled frontend and backend, hosted on AWS. The frontend is served as a static site via S3 and CloudFront. The backend is a Python FastAPI application running persistently on EC2, connected to a local PostgreSQL database.

## System Diagram

```
User's Browser
      │
      ├─── loads app ──────────────────────────────────────────────────────►
      │                                                              CloudFront (CDN)
      │                                                                    │
      │                                                              S3 Bucket
      │                                                          (React static files)
      │
      └─── API calls to api.clientdomain.com ──────────────────────────────►
                                                                    Route 53
                                                                        │
                                                                       ALB
                                                              (Application Load Balancer)
                                                                        │
                                                                    EC2 Instance
                                                                        │
                                                           ┌────────────┴────────────┐
                                                           │        FastAPI           │
                                                           │       (Python)           │
                                                           │           │              │
                                                           │      PostgreSQL          │
                                                           │    (local to EC2)        │
                                                           └──────────────────────────┘
```

## Domain Setup

- `clientdomain.com` → CloudFront → S3 (React app)
- `api.clientdomain.com` → Route 53 → ALB → EC2 (FastAPI)
- SSL certificates managed by AWS ACM, attached to CloudFront and ALB
- Client points their domain DNS to AWS via Route 53

## Frontend

- Built with React + Vite
- In development: served by Nginx on local VM, proxied to local FastAPI
- In test/prod: built via `npm run build`, uploaded to S3 by GitHub Actions, served via CloudFront
- CloudFront handles caching and cache invalidation on each deploy

## Backend

- Python + FastAPI running on EC2
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

1. User visits the app
2. Clerk presents Google OAuth login
3. User signs in with their Google account
4. Clerk issues a JWT token to the frontend
5. Frontend includes the JWT in every API request header
6. FastAPI validates the JWT on each request before processing

## CI/CD

See [deployment.md](deployment.md) for full pipeline details.

## Environments

| | Dev | Test | Prod |
|---|---|---|---|
| Frontend | Nginx (local VM) | S3 + CloudFront | S3 + CloudFront |
| Backend | FastAPI (local VM) | EC2 | EC2 |
| Database | PostgreSQL (local VM) | PostgreSQL (EC2) | PostgreSQL (EC2) |
| Git branch | feature branches | staging | main |
