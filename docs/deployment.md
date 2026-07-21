# Deployment

## Overview

Deployment is fully automated via GitHub Actions. Pushing to a branch triggers the corresponding environment's pipeline.

## Branch → Environment Mapping

| Git Branch | Environment | Auto Deploy |
|---|---|---|
| Feature branches | Dev (local only) | No |
| `staging` | Test | Yes |
| `main` | Prod | Yes |

## CI/CD Pipeline

Two workflow files, one per environment. Each runs a frontend and backend job in parallel.

### Test Pipeline — `deploy-test.yml`

Triggered on push to `staging`:

```
Push to staging
      │
      ▼
GitHub Actions
      │
      ├── [frontend] npm install → npm run build → aws s3 sync → S3_BUCKET_TEST
      └── [backend]  SSH into EC2_HOST_TEST → git pull → pip install → alembic upgrade head → restart
```

### Prod Pipeline — `deploy-prod.yml`

Triggered on push to `main`:

```
Push to main
      │
      ▼
GitHub Actions
      │
      ├── [frontend] npm install → npm run build → aws s3 sync → S3_BUCKET_PROD
      └── [backend]  SSH into EC2_HOST_PROD → git pull → pip install → alembic upgrade head → restart
```

## AWS Infrastructure

### EC2

- Instance type: t3.small
- OS: Ubuntu 24.04 LTS
- FastAPI managed by systemd
- PostgreSQL running locally on the same instance
- One EC2 for test, one for prod

### S3

- One bucket per environment, named to **exactly match its custom domain**: `testing.max-cpa.co.il`, `workload.max-cpa.co.il` — S3 static website hosting has no separate domain-mapping layer, it matches the bucket name directly against the incoming `Host` header, so a CNAME pointing at a differently-named bucket 404s with `NoSuchBucket`
- Static website hosting enabled (`index.html` as both index and error document)
- Public read bucket policy (`s3:GetObject` for `*`) — there's no CDN in front, so the bucket itself must serve public traffic
- No CloudFront distribution

### Nginx + TLS (on EC2)

There's no ALB. Each EC2 instance runs Nginx as a reverse proxy in front of the FastAPI app (`:80`/`:443` → `127.0.0.1:8000`), with a Let's Encrypt certificate obtained via certbot. This is provisioned automatically on every deploy — see `backend/deploy/setup_nginx_tls.sh`, invoked from the `deploy-backend` job right after the code is pulled. It's idempotent (safe to re-run every deploy) and self-healing (a rebuilt EC2 instance gets nginx/certbot reprovisioned on its next deploy without manual setup).

Nginx serves identically on port 80 and port 443 (no forced HTTP→HTTPS redirect) so it works correctly regardless of Cloudflare's SSL/TLS mode (Flexible connects to the origin on :80, Full connects on :443) — see [architecture.md](architecture.md) for why.

## GitHub Actions Secrets and Variables

**Secrets** (sensitive — set under Settings → Secrets):
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
EC2_SSH_KEY
DATABASE_URL_TEST
DATABASE_URL_PROD
CLERK_SECRET_KEY
CLERK_FRONTEND_API
PROD_CLERK_SECRET_KEY
PROD_CLERK_FRONTEND_API
```

**Variables** (non-sensitive — set under Settings → Variables):
```
AWS_REGION
S3_BUCKET_TEST
S3_BUCKET_PROD
EC2_HOST_TEST
EC2_HOST_PROD
EC2_USER
VITE_API_URL
VITE_CLERK_PUBLISHABLE_KEY
PROD_API_URL
PROD_CLERK_PUBLISHABLE_KEY
CERTBOT_EMAIL
```

`VITE_API_URL`/`PROD_API_URL` also double as the source of truth for the Nginx/certbot domain — the deploy workflow strips the scheme and any path to derive the bare hostname passed into `setup_nginx_tls.sh`, so there's only one place to update the API domain per environment.

## Rollback

If a deployment breaks prod:

```bash
# SSH into EC2
ssh -i key.pem ubuntu@ec2-prod-ip

# Check what went wrong
sudo journalctl -u ticketing-backend -n 50

# Roll back to previous code
cd /app
git log --oneline -5       # find the previous good commit
git checkout <commit-hash>
pip install -r requirements.txt
alembic downgrade -1       # if migration needs reverting
sudo systemctl restart ticketing-backend
```

## systemd Service (EC2)

FastAPI runs as a systemd service on EC2:

```ini
# /etc/systemd/system/ticketing-backend.service
[Unit]
Description=Ticketing System FastAPI Backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/app/backend
ExecStart=/app/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
EnvironmentFile=/app/backend/.env

[Install]
WantedBy=multi-user.target
```
