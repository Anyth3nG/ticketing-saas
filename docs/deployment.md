# Deployment

## Status: two models, one live

The app is moving from a bare-metal deployment to a containerized one. Both are
described here because both currently matter.

| | Bare metal | Containerized |
|---|---|---|
| Status | **Live in prod today** | **Live on test** since 2026-09-04; prod not cut over |
| Backend | venv + systemd `ticketing-backend` | container |
| Frontend | S3 static website | container behind the proxy |
| Postgres | on the instance | container, shared with the CRM |
| nginx | on the host, configured per deploy | container |
| Origin | `workload` (S3) + `api-workload` (EC2) | one origin, `workload` |

Until the prod cutover happens, everything under [Bare metal](#bare-metal-the-current-live-deployment)
is what is actually serving the firm. Test now runs the containerized stack, so
the two environments deliberately differ — that is the point of the rehearsal,
not a drift to correct.

---

## Containerized deployment

### Topology

One EC2 box, one Docker network, one compose project (`maxcpa`) that will hold
both this app and the CRM:

```
Cloudflare ──▶ proxy (nginx container, :80/:443)
                 ├── /api  ──▶ ticketing-backend  (FastAPI)
                 └── /     ──▶ ticketing-frontend (nginx serving the built SPA)
                                    │
                              postgres (shared: ticketing_saas + crm)
```

**Same origin.** One hostname serves the SPA and the API. That is why the
backend has no CORS middleware and the bundle has no API base URL — there is no
second origin for either to describe. It also means the whole zone can run
Cloudflare Full SSL, with no per-hostname Flexible override for an S3 bucket.

Service names carry a `ticketing-` prefix because the CRM's containers join the
same network, where a bare `backend` would collide.

### The pipeline

```
Push to main/staging          Manual run (Actions tab)
      │                              │
      ▼                              ▼
  [build] ──────────────────────▶ [deploy]
  render-env asserts config      render backend.env + stack.env
  build backend image            scp the stack to the box
  build frontend image           bootstrap.sh          ← own ssh session
  push both to GHCR, tagged      docker login ghcr.io (read-only token)
  by commit SHA                  deploy.sh: pull, handover, up -d, certs
                                 smoke test https://<domain>/health
```

A push **builds and publishes but does not deploy** — see [Cutover](#cutover).
The box only ever pulls; it never builds. It is small, it stops nightly, and a
build there would be a second place for the result to differ from what CI
tested.

Images are tagged by commit SHA rather than `:latest`, so a deploy names one
immutable image and a rollback is redeploying an older tag.

### Preparing the box

A deploy box built for the bare-metal model has no Docker on it, and its host
nginx already owns `:80` and `:443`. Two steps close that gap. Both are
idempotent and become no-ops once a box is prepared, so they stay in the normal
deploy path rather than being one-time manual work someone has to remember.

**`deploy/bootstrap.sh`** installs Docker Engine and the compose plugin, adds
the deploy user to the `docker` group, and caps container log size. It comes
from Docker's own apt repository, not Ubuntu's `docker.io`, because the compose
*plugin* — `docker compose`, which is what the stack is driven with — ships only
from there.

> **It must stay its own workflow step.** Group membership is resolved at
> login, so the session that runs `usermod` does not have it. Chaining
> bootstrap ahead of `docker login` in one `ssh` call installs Docker
> correctly and then fails on the socket, one line later. A new step is a new
> session, which is the entire reason it is separate.

**The port handover** lives in `deploy.sh`, between the pull and `up -d`. It
stops *and disables* host `nginx` and `ticketing-backend`:

- The proxy container binds `:80`/`:443` **on the host**, so `up` fails with
  "address already in use" while host nginx holds them. The other three
  services start anyway and sit there unreachable — which looks exactly like a
  successful deploy in `docker ps`.
- The backend unit conflicts with nothing (it binds `127.0.0.1:8000`), but it
  keeps writing to the bare-metal database after the container database has
  become the source of truth. Two live datasets, no error on either side.
- **Disabling matters as much as stopping.** These instances stop and start
  nightly. An enabled nginx comes back at boot and takes `:80` before Docker
  does, leaving a stack that passes every container health check while serving
  the old app. That is a failure that surfaces as "it worked yesterday".

Neither unit is removed. The [rollback](#rollback) below is `docker compose
down` plus `systemctl start`, and that needs the units and the venv still on
the box.

The pull happens *before* the handover, so the bare-metal stack keeps serving
through the slow step and the switch itself takes seconds.

### Configuration is validated, not assumed

`backend/.env.example` is the **single source of truth** for backend config.
`deploy/render-env.sh` reads it, takes each value from the workflow's `env:`
block, and **fails the build** if a required key has no value — naming all the
missing keys at once.

This is the direct fix for this project's dominant failure mode. The old
workflows wrote `backend/.env` from a fixed heredoc; a variable added in GitHub
Actions did nothing until someone remembered to edit the heredoc too, and the
app then read an empty string and behaved as though the feature had never been
configured. No error, no log line. It cost a day on staging once.

A key that may legitimately be empty (`ADMIN_EMAIL` meaning "nobody") is marked
`# optional` in the template. The same script guards the frontend's build args,
which Vite inlines at build time and which fail just as silently.

### TLS

Certbot stays on the **host**; the proxy container mounts `/etc/letsencrypt`
read-only. Two things had to change when nginx moved into a container:

- **Authenticator.** `--nginx` wants to edit a host nginx that no longer
  exists, and `--standalone` wants to bind `:80`, which the proxy container
  holds. `--webroot` is what works: certbot writes the challenge into
  `/var/www/certbot`, bind-mounted into the container, and nginx serves it.
- **Deploy hook.** `systemctl reload nginx` would now reload nothing. The hook
  is `/usr/local/bin/reload-maxcpa-proxy`, which reloads the *container*.
  Renewal runs on certbot's own timer, often weeks after any deploy — get this
  wrong and the certificate renews on disk while the proxy serves the expired
  one until it fails.

The SSL server blocks are installed only once the certificates exist. nginx
refuses to start when a `ssl_certificate` file is missing, but certbot's
challenge needs a running nginx — `deploy.sh` breaks that circle by bringing
the stack up HTTP-only on a first run, issuing, then installing the SSL blocks
and reloading.

Port 80 still does **not** redirect to 443, so the origin works whether
Cloudflare is set to Flexible or Full without needing to know which.

> **Certificates issued before cutover will not auto-renew.** They were issued
> with `--nginx`, and their renewal config still says
> `authenticator = nginx` — a host nginx the handover has now disabled.
> Nothing reports this: renewal fails quietly on certbot's timer, weeks later,
> and the first symptom is an expired certificate. `setup-certs.sh` rewrites
> the renewal config to `--webroot` the first time it runs for that hostname,
> so the fix is simply to let a real deploy run. Until one has,
> **`api-testing` on test is in this state.** Check with
> `grep authenticator /etc/letsencrypt/renewal/*.conf`.

Also note that `ticketing-http.conf` puts the app and API hostnames in **one**
server block, so on `:80` the API hostname serves the SPA too. The `:443`
config does not — `ticketing-ssl.conf` gives the API hostname its own API-only
block. So an app that works via the API hostname under Flexible will stop doing
so at the Full flip. Do not treat that as a way in; it is an artifact of the
HTTP-only phase.

### `default_server` is claimed exactly once

`proxy/deploy/conf.d/000-default.conf` owns `default_server` on `:80` and
`:443` and returns `444` to anything whose `Host` matches no server block —
scanners probing the bare Elastic IP, which bypasses Cloudflare entirely.

nginx **refuses to start with two `default_server` blocks**. The CRM's
`proxy/conf.d/crm.conf` currently claims `listen 80 default_server` for local
development; that keyword must be dropped when its block joins this proxy.

---

## Cutover

Deliberately manual, and rehearsed on test first.

**Test was cut over on 2026-09-04** — steps 1-4 below are done there and
passed, including the stop/start. Prod has not been touched. The one thing
still outstanding on test is step 6, the DNS record.

Both workflows build on push but gate the deploy job behind
`if: github.event_name == 'workflow_dispatch'`. **Do not merge this to `main`
and walk away**: with the branch merged, a push to `main` would build images
and deploy nothing, while the old bare-metal path is gone — prod would simply
stop receiving deploys. Either cut over in the same session as the merge, or
keep the branch open until you are ready.

1. Start the instance (test is normally stopped).
2. Add the new GitHub secrets and variables below.
3. **Migrate the database.** Order matters, because the backend container runs
   `alembic upgrade head` on boot:
   1. `pg_dump --no-owner --no-acl` the bare-metal database and keep the file.
   2. Bring up **only** Postgres — `docker compose up -d postgres` — and wait
      for healthy.
   3. `deploy/restore-baremetal-dump.sh <dump>`. Restoring the whole dump into
      an empty database brings schema, data *and* `alembic_version` across
      together, so the backend's migration on first boot is the no-op it
      should be. Let the backend start first instead and it builds an empty
      schema that the restore then collides with.
   4. Run the deploy for real, and verify row counts.
4. **Stop and start the instance** and confirm every container comes back, and
   that `nginx` and `ticketing-backend` are still `inactive / disabled`. This is
   the thing that actually breaks nightly, and it is the whole reason test
   exists.
5. Repeat on prod, out of hours.
6. Point Cloudflare's `workload` record at the origin and switch that hostname
   from Flexible to **Full**. Verify the per-hostname override is gone.
7. Delete the `if:` line from both deploy jobs so pushes deploy again.
8. Delete `backend/deploy/`, the systemd unit, and the S3 buckets.

`DATABASE_URL` changes meaning at step 3 — from bare-metal localhost to the
container over the Docker network. It is a secret edit in a pipeline whose
failure mode is silence, so change it *after* the pipeline rewrite is in place,
never before.

### Until step 6, the old frontend is still being served

This cost an afternoon on test and will do the same on prod. The app hostname
(`testing` / `workload`) still resolves to the **S3 bucket** until its DNS
record moves. So after cutover the browser loads the *old* bundle, which has an
absolute `https://api-.../api/...` URL compiled into it, and fires it at the
*new* backend — which deliberately carries no CORS middleware, because the new
frontend is same-origin. The result is a console full of

```
No 'Access-Control-Allow-Origin' header is present on the requested resource
```

**Do not add CORS back.** Nothing is broken; two halves of two different
deployments are talking to each other. It disappears when the record moves.
Confirm which you are looking at by comparing the `index-*.js` filename the
browser loaded against the one the origin serves — and check the response
headers, since S3 answers with `x-amz-request-id`.

To exercise the real stack before the DNS moves, point the hostname at the
origin in your own `/etc/hosts` and use **http://** (the origin has no
certificate for that name yet, and does not need one under Flexible).

**Rollback** during cutover: the venv and the systemd units are left in place,
stopped and disabled, so recovery is

```bash
cd ~/stack && docker compose --env-file stack.env -f docker-compose.prod.yml down
sudo systemctl enable --now nginx ticketing-backend
```

`enable`, not just `start` — the handover disabled both, so a plain `start`
comes back but does not survive the next nightly boot. The host nginx config is
untouched by any of this and still points at `127.0.0.1:8000`. Note that this
also reverts to the bare-metal database: anything written through the
containerized app since cutover stays in the container volume and is not in the
bare-metal copy.

---

## GitHub Actions secrets and variables

**Secrets:**

```
EC2_SSH_KEY
GHCR_PULL_TOKEN            read-only package token used by the box
DATABASE_URL_TEST          DATABASE_URL_PROD
CLERK_SECRET_KEY           PROD_CLERK_SECRET_KEY
CLERK_FRONTEND_API         PROD_CLERK_FRONTEND_API
POSTGRES_USER_TEST         POSTGRES_USER_PROD
POSTGRES_PASSWORD_TEST     POSTGRES_PASSWORD_PROD
CRM_DB_PASSWORD_TEST       CRM_DB_PASSWORD_PROD
```

**Variables:**

```
EC2_USER
EC2_HOST_TEST              EC2_HOST_PROD
TEST_DOMAIN                PROD_DOMAIN        the app's own hostname
VITE_API_URL               PROD_API_URL       legacy API hostname, still served
VITE_CLERK_PUBLISHABLE_KEY PROD_CLERK_PUBLISHABLE_KEY
CRM_DB_USER_TEST           CRM_DB_USER_PROD   the CRM's role, per environment
ADMIN_EMAIL                MANAGER_EMAIL
CERTBOT_EMAIL
```

### The CRM's database role, and its one chance

The database is `crm` on every box — isolation is per instance, exactly as
`ticketing_saas` is the same name on test and prod. What carries the
environment is the OWNER: `crm_dev` / `crm_test` / `crm_prod`, mirroring
`ticketing_dev` / `ticketing_test` / `ticketing_prod`. A credential is then
obviously one environment's when it shows up in a log or a config file.

`CRM_DB_USER_*` and `CRM_DB_PASSWORD_*` are read by
`postgres-init/01-create-crm-database.sh`, which Postgres runs **once**, on the
first `up` against an empty volume, and never again. Changing either variable
afterwards does nothing at all — no error, no re-read. Correcting a name or
password later means `ALTER ROLE` by hand on the box.

**Prod gets exactly one chance, at cutover.** Set both before the deploy that
first brings up the stack there.

Both must also be listed in the postgres service's `environment:` block to
exist inside the container. An `--env-file` supplies values for interpolation
in the compose file; it puts nothing into the container. They were missing
there until 2026-09-06, so the script fell through to its `crm`/`crm` defaults
whatever the workflow had been told — and an init script that "worked" leaves
nothing to notice.

`TEST_DOMAIN` / `PROD_DOMAIN` are new: with one origin, the app's hostname is
no longer derivable from the API URL. `VITE_API_URL` / `PROD_API_URL` are kept
only to derive the legacy `api-*` hostname, whose server block still exists so
that browsers holding a cached S3 bundle keep working. Retire both once the
buckets are gone.

Retired after cutover: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, `S3_BUCKET_TEST`, `S3_BUCKET_PROD`.

---

## Bare metal (the current live deployment)

Everything below describes what is running today and is superseded by the
cutover above.

### Branch → environment

| Git branch | Environment | Auto deploy |
|---|---|---|
| Feature branches | Dev (local only) | No |
| `staging` | Test | Yes |
| `main` | Prod | Yes |

### EC2

- t3.small, Ubuntu 24.04 LTS; one instance for test, one for prod
- FastAPI under systemd, PostgreSQL on the same instance
- Prod runs on a scheduler that stops it 20:00 and starts it 07:00

### S3

- One bucket per environment, named to **exactly match its custom domain**
  (`testing.max-cpa.co.il`, `workload.max-cpa.co.il`). S3 website hosting
  matches the bucket name against the `Host` header, so a CNAME pointing at a
  differently-named bucket 404s with `NoSuchBucket`.
- Static website hosting, `index.html` as both index and error document
- Public-read bucket policy; no CloudFront

### nginx + TLS on the host

`backend/deploy/setup_nginx_tls.sh` provisions nginx and certbot on every
deploy — idempotent, and self-healing if an instance is rebuilt. It also
installs `nginx_default.conf` as the `444` catch-all.

**What that does not close:** a request that knows the real domain and sends
the correct `Host`/SNI still reaches the origin directly, bypassing Cloudflare
and any WAF there. Closing it means restricting the security group's `80`/`443`
ingress to Cloudflare's published ranges — considered, deliberately not done
(it would need redoing if the record is ever grey-clouded). Still open under
the containerized model.

### Firewall

Inbound `22`, `80`, `443` open to `0.0.0.0/0`. Port `8000` is not open at the
security-group level, and the app binds `127.0.0.1:8000` — either alone would
prevent reaching uvicorn directly.

### Rollback

```bash
ssh -i key.pem ubuntu@ec2-prod-ip
sudo journalctl -u ticketing-backend -n 50
cd /app && git log --oneline -5
git checkout <commit-hash>
pip install -r requirements.txt
alembic downgrade -1        # only if a migration needs reverting
sudo systemctl restart ticketing-backend
```

### systemd unit

```ini
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

A drop-in at `.service.d/override.conf` on both instances adds Postgres
ordering (`After=/Wants=postgresql.service`) and rebinds to `127.0.0.1`.

**The drop-in is not in the repo and no deploy step applies it** — a rebuilt
instance comes up with `--host 0.0.0.0` and no Postgres ordering until someone
reapplies it by hand. The containerized stack removes this class of problem
entirely: ordering is `depends_on` with a healthcheck, and the port is never
published.
