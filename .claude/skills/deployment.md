# Deployment

## Environments

| Environment | Frontend | Backend | Database | Git Branch |
|---|---|---|---|---|
| Dev | Nginx (local VM, port 80) | FastAPI (local VM, port 8000) | PostgreSQL (local VM) | Feature branches |
| Test | S3 (behind Cloudflare) | EC2 | PostgreSQL (on EC2) | `staging` |
| Prod | S3 (behind Cloudflare) | EC2 | PostgreSQL (on EC2) | `main` |

## Branch → Deploy Mapping

- Push to `staging` → auto deploy to Test environment
- Push to `main` → auto deploy to Prod environment
- Feature branches → no auto deploy, dev only

## Frontend Pipeline (GitHub Actions)

Triggered on push to `staging` or `main`:

1. `npm install`
2. `npm run build` — outputs to `frontend/dist/`
3. Upload `dist/` to the correct S3 bucket (no CDN in front — the bucket is named to match its custom domain and served directly via its website endpoint, behind Cloudflare)

## Backend Pipeline (GitHub Actions)

Triggered on push to `staging` or `main`:

1. SSH into the correct EC2 instance
2. `git pull origin <branch>`
3. `bash backend/deploy/setup_nginx_tls.sh <domain> <email>` — idempotent; ensures Nginx + a Let's Encrypt cert are provisioned for the environment's API domain
4. `pip install -r requirements.txt`
5. `alembic upgrade head`
6. `sudo systemctl restart ticketing-backend`

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

DNS is on Cloudflare (managed by an external IT company, not directly accessible), proxied for all records except the Clerk custom domain. See `docs/architecture.md` for the full domain table and why the API subdomains are 1 level deep. No ALB, ACM, Route 53, or CloudFront — see `docs/decisions.md`.

## GitHub Actions Secrets and Variables

Set in GitHub → Settings → Secrets and variables → Actions. See `docs/deployment.md` for the current full list — it changes more often than this file and is the source of truth.
