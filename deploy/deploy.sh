#!/usr/bin/env bash
# Deploy the containerized stack. Runs ON THE EC2 BOX, invoked over SSH by the
# GitHub Actions workflow. Idempotent -- safe to run on every deploy.
#
# Expects, already copied into $STACK_DIR by the workflow:
#   backend.env   rendered from backend/.env.example (see render-env.sh)
#   .env          rendered from deploy/compose.env.example -- COMPOSE_FILE,
#                 POSTGRES_*, BACKEND_IMAGE, FRONTEND_IMAGE
#   docker-compose.prod.yml, proxy-templates/
#
# This box PULLS images and never builds them: it is small, it stops nightly,
# and a build here would be a second place for the result to differ from what
# CI actually tested.
set -euo pipefail

USAGE="usage: deploy.sh <domain> <legacy-api-domain|none> <certbot-email> [crm-domain]"
DOMAIN="${1:?$USAGE}"
# The legacy API hostname, or the literal word `none` where an environment has
# retired it (test, since 2026-09-10). A word rather than an empty argument on
# purpose: prod derives this from a GitHub variable, and an empty value there
# has to stay an error instead of quietly meaning "none".
API_DOMAIN="${2:?missing legacy api domain -- pass 'none' if this environment has none}"
CERTBOT_EMAIL="${3:?missing certbot email}"
# Optional: a hostname this proxy hands across to the CRM, which runs as its own
# compose project on the same box. See proxy-templates/crm-http.conf. Test
# passes one; prod passes none, because the CRM does not run there yet.
CRM_DOMAIN="${4:-}"

# One hostname in two server blocks is not something nginx refuses. It warns
# "conflicting server name ... ignored" and serves whichever block it read
# first -- so a mix-up here would route one app's hostname to the other app
# with nothing failing.
if [ -n "$CRM_DOMAIN" ] && { [ "$CRM_DOMAIN" = "$DOMAIN" ] || [ "$CRM_DOMAIN" = "$API_DOMAIN" ]; }; then
  echo "ERROR: ${CRM_DOMAIN} is given to both ticketing and the CRM" >&2
  exit 1
fi

# The :80 block answers for the app's hostname and, where one still exists,
# the legacy API hostname.
HTTP_SERVER_NAMES="$DOMAIN"
if [ "$API_DOMAIN" != none ]; then
  HTTP_SERVER_NAMES="$DOMAIN $API_DOMAIN"
fi

# Shared with the CRM's proxy. See step 3.
EDGE_NETWORK=max-cpa-edge

STACK_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$STACK_DIR"

# Every compose command below is bare, because .env -- Compose's own default
# env file -- carries COMPOSE_FILE along with the values the compose file
# interpolates. So is the command a human types in ~/stack when something needs
# looking at. That is the point: one invocation, no flags to remember, and no
# way for the deploy path and the debugging path to drift apart.
#
# Checked rather than assumed. Without .env, Compose finds no configuration
# file at all; with a partial one it interpolates the missing values to blank
# strings and only warns, which is the failure this project keeps having.
if [ ! -f .env ]; then
  echo "ERROR: ${STACK_DIR}/.env is missing -- CI renders it from deploy/compose.env.example" >&2
  exit 1
fi
chmod 600 .env

# Left over from before .env: stack.env was the old --env-file, and scp does
# not delete what CI has stopped sending. A stale second copy of the same
# credentials is worth removing rather than leaving to be found later.
rm -f stack.env

COMPOSE=(docker compose)

# --- 1. Render the proxy config -------------------------------------------
#
# Each SSL block is installed only once the certificate it names exists: nginx
# refuses to start if a ssl_certificate file is missing, and on a first deploy
# certbot has not run yet. See proxy-templates/ticketing-http.conf.
#
# The directory is EMPTIED IN PLACE, never deleted and recreated. The proxy
# bind-mounts it, and a bind mount stays attached to the directory that existed
# when the container started: `rm -rf` + `mkdir` puts a new directory at the
# same path while a running proxy goes on seeing the deleted one -- empty
# (verified 2026-09-10). A config change would then reach the proxy only at its
# next restart, which on these boxes means the nightly stop/start.
have_cert() {
  [ -f "/etc/letsencrypt/live/$1/fullchain.pem" ]
}

render() {
  sed -e "s/__DOMAIN__/${DOMAIN}/g" \
      -e "s/__API_DOMAIN__/${API_DOMAIN}/g" \
      -e "s/__CRM_DOMAIN__/${CRM_DOMAIN}/g" \
      -e "s/__HTTP_SERVER_NAMES__/${HTTP_SERVER_NAMES}/g" \
    "proxy-templates/$1" > "proxy-conf.d/$1"
}

render_proxy_conf() {
  mkdir -p proxy-conf.d
  find proxy-conf.d -mindepth 1 -delete

  cp proxy-templates/000-default.conf proxy-templates/resolver.conf proxy-conf.d/
  render ticketing-http.conf

  if have_cert "$DOMAIN"; then
    render ticketing-ssl.conf
  fi
  if [ "$API_DOMAIN" != none ] && have_cert "$API_DOMAIN"; then
    render ticketing-legacy-api-ssl.conf
  fi
  if [ -n "$CRM_DOMAIN" ]; then
    render crm-http.conf
  fi

  echo "proxy config: $(ls proxy-conf.d | tr '\n' ' ')"
}

# Load whatever render_proxy_conf last wrote. `up -d` recreates the proxy only
# when its compose definition changes, so a config-only deploy would otherwise
# leave it on the config it started with. `nginx -t` first, so a bad config
# fails the deploy instead of being quietly refused by the reload.
reload_proxy() {
  "${COMPOSE[@]}" exec -T proxy nginx -t
  "${COMPOSE[@]}" exec -T proxy nginx -s reload
}

render_proxy_conf

# --- 2. Pull --------------------------------------------------------------
#
# Before the handover below, not after: pulling is the slow step, and doing it
# while the bare-metal stack is still serving keeps the switch to seconds.
"${COMPOSE[@]}" pull

# --- 3. The network shared with the CRM's proxy ---------------------------
#
# max-cpa-edge holds exactly two containers: this proxy and the CRM's. It is
# how crm-http.conf reaches the CRM without this proxy joining the CRM's own
# network, where `backend` and `frontend` would resolve to either app.
#
# EXTERNAL to both compose projects, so neither one's `down` can remove it from
# under the other. The catch is that nothing creates it on `up`, and a missing
# one stops `up` cold -- so it is created here and in the CRM's deploy.sh
# alike, whichever runs first. On prod too, where nothing else joins it yet:
# the compose file is shared, and an idle network costs nothing.
docker network inspect "$EDGE_NETWORK" >/dev/null 2>&1 ||
  docker network create "$EDGE_NETWORK" >/dev/null

# --- 4. Hand the host's ports over ----------------------------------------
#
# The proxy container binds :80 and :443 ON THE HOST. Until cutover the
# bare-metal stack still holds both -- host nginx on the ports, the systemd
# backend behind it -- so `up` would fail with "address already in use". The
# other three services would start regardless and sit there unreachable, which
# reads exactly like a working deploy right up until someone opens the site.
#
# The backend unit is stopped too. It binds 127.0.0.1:8000 and so conflicts
# with nothing, but it holds ~200MB on a 2GB box and, more to the point, goes
# on writing to the bare-metal database after the container database has become
# the source of truth. Two live datasets, no error either way.
#
# Stopped and DISABLED, never removed: the rollback in docs/deployment.md is
# `docker compose down` + `systemctl start`, which needs the units and the venv
# still on the box. Disabling matters as much as stopping, because these
# instances stop and start nightly -- an enabled nginx would come back at boot
# and take :80 from Docker on the way up.
#
# The CRM's proxy is NOT handled here. It binds loopback only, but held the
# host's :80 itself from 2026-09-07 to 2026-09-10; a CRM stack still on that
# configuration makes `up` below fail on the port, loudly, and the fix is to
# deploy the CRM first.
handover_host_ports() {
  local unit
  for unit in nginx ticketing-backend; do
    if systemctl is-active --quiet "$unit" 2>/dev/null ||
       systemctl is-enabled --quiet "$unit" 2>/dev/null; then
      echo "handover: stopping and disabling ${unit} (bare-metal stack)"
      sudo systemctl disable --now "$unit" || true
    fi
  done
}
handover_host_ports

# --- 5. Start -------------------------------------------------------------
"${COMPOSE[@]}" up -d --remove-orphans
reload_proxy

# --- 6. Certificates ------------------------------------------------------
#
# After the proxy is up, because the http-01 challenge is served BY the proxy.
sudo bash "${STACK_DIR}/setup-certs.sh" "$DOMAIN" "$API_DOMAIN" "$CERTBOT_EMAIL"

# A first issuance makes an SSL block installable now. Re-rendered either way:
# it is cheap, and it keeps the running config identical to what a fresh
# render would produce.
render_proxy_conf
reload_proxy

# --- 7. Tidy --------------------------------------------------------------
#
# Untagged images accumulate on every deploy and this disk is small. Only
# dangling ones: a tagged image may be the rollback target.
docker image prune -f

echo
echo "deployed. running containers:"
"${COMPOSE[@]}" ps
