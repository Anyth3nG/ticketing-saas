# Deployment

## Environments

| Environment | Frontend | Backend | Database | Git Branch |
|---|---|---|---|---|
| Dev | Nginx (local VM, port 80) | FastAPI (local VM, port 8000) | PostgreSQL (local VM) | Feature branches |
| Test | S3 + CloudFront | EC2 | PostgreSQL (on EC2) | `staging` |
| Prod | S3 + CloudFront | EC2 | PostgreSQL (on EC2) | `main` |

## Branch → Deploy Mapping

- Push to `staging` → auto deploy to Test environment
- Push to `main` → auto deploy to Prod environment
- Feature branches → no auto deploy, dev only

## Frontend Pipeline (GitHub Actions)

Triggered on push to `staging` or `main`:

1. `npm install`
2. `npm run build` — outputs to `frontend/dist/`
3. Upload `dist/` to the correct S3 bucket
4. Invalidate CloudFront cache

## Backend Pipeline (GitHub Actions)

Triggered on push to `staging` or `main`:

1. SSH into the correct EC2 instance
2. `git pull origin <branch>`
3. `pip install -r requirements.txt`
4. `alembic upgrade head`
5. `sudo systemctl restart ticketing-backend`

## Manual Deploy (if needed)

```bash
# SSH into EC2
ssh -i key.pem ubuntu@<ec2-ip>

# Pull latest
cd /app
git pull origin main

# Update dependencies
source backend/venv/bin/activate
pip install -r backend/requirements.txt

# Run migrations
alembic upgrade head

# Restart backend
sudo systemctl restart ticketing-backend

# Check status
sudo systemctl status ticketing-backend
sudo journalctl -u ticketing-backend -n 50
```

## Rollback

```bash
# SSH into EC2
ssh -i key.pem ubuntu@<ec2-ip>

cd /app
git log --oneline -5          # find last good commit
git checkout <commit-hash>
alembic downgrade -1          # only if migration needs reverting
sudo systemctl restart ticketing-backend
```

## Domain

- `clientdomain.com` → CloudFront → S3 (React app)
- `api.clientdomain.com` → Route 53 → ALB → EC2 (FastAPI)

## GitHub Actions Secrets

Set in GitHub → Settings → Secrets and variables → Actions:

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
S3_BUCKET_TEST
S3_BUCKET_PROD
CLOUDFRONT_DISTRIBUTION_TEST
CLOUDFRONT_DISTRIBUTION_PROD
EC2_HOST_TEST
EC2_HOST_PROD
EC2_SSH_KEY
EC2_USER
```
