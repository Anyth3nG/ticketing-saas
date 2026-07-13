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

- One bucket per environment: `ticketing-saas-test`, `ticketing-saas-prod`
- Static website hosting enabled
- Public read access (CloudFront only)

### CloudFront

- One distribution per environment
- Points to corresponding S3 bucket
- Custom domain via Route 53
- SSL via ACM certificate

### ALB (Application Load Balancer)

- One ALB per environment
- Routes traffic to EC2
- ACM SSL certificate attached
- Health check on `/health` endpoint

## GitHub Actions Secrets and Variables

**Secrets** (sensitive — set under Settings → Secrets):
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
EC2_SSH_KEY
```

**Variables** (non-sensitive — set under Settings → Variables):
```
AWS_REGION
S3_BUCKET_TEST
S3_BUCKET_PROD
EC2_HOST_TEST
EC2_HOST_PROD
EC2_USER
```

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
