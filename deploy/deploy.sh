#!/usr/bin/env bash
# Deploy the containerized stack. Runs ON THE EC2 BOX, invoked over SSH by the
# GitHub Actions workflow. Idempotent -- safe to run on every deploy.
#
# Expects, already copied into $STACK_DIR by the workflow:
#   backend.env   rendered from backend/.env.example (see render-env.sh)
#   stack.env     POSTGRES_USER/PASSWORD, BACKEND_IMAGE, FRONTEND_IMAGE
#   docker-compose.prod.yml, postgres-init/, proxy-templates/
#
# This box PULLS images and never builds them: it is small, it stops nightly,
# and a build here would be a second place for the result to differ from what
# CI actually tested.
set -euo pipefail

DOMAIN="${1:?usage: deploy.sh <domain> <api-domain> <certbot-email>}"
API_DOMAIN="${2:?missing api domain}"
CERTBOT_EMAIL="${3:?missing certbot email}"

STACK_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$STACK_DIR"

COMPOSE=(docker compose --env-file stack.env -f docker-compose.prod.yml)

# --- 1. Render the proxy config -------------------------------------------
#
# The SSL blocks are installed only once the certificates they name actually
# exist: nginx refuses to start if a ssl_certificate file is missing, and on a
# first deploy certbot has not run yet. See proxy-templates/ticketing-http.conf.
render_proxy_conf() {
  local include_ssl="$1"

  rm -rf proxy-conf.d && mkdir -p proxy-conf.d
  cp proxy-templates/000-default.conf proxy-conf.d/

  sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__API_DOMAIN__/${API_DOMAIN}/g" \
    proxy-templates/ticketing-http.conf > proxy-conf.d/ticketing-http.conf

  if [ "$include_ssl" = "yes" ]; then
    sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__API_DOMAIN__/${API_DOMAIN}/g" \
      proxy-templates/ticketing-ssl.conf > proxy-conf.d/ticketing-ssl.conf
  fi
}

have_certs() {
  [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] &&
    [ -f "/etc/letsencrypt/live/${API_DOMAIN}/fullchain.pem" ]
}

if have_certs; then
  render_proxy_conf yes
else
  echo "certificates not present yet -- bringing up HTTP only so the ACME challenge can be served"
  render_proxy_conf no
fi

# --- 2. Pull and start ----------------------------------------------------
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --remove-orphans

# --- 3. Certificates ------------------------------------------------------
#
# After the proxy is up, because the http-01 challenge is served BY the proxy.
sudo bash "${STACK_DIR}/setup-certs.sh" "$DOMAIN" "$API_DOMAIN" "$CERTBOT_EMAIL"

# If that was a first issuance, the SSL blocks can go in now.
if have_certs && [ ! -f proxy-conf.d/ticketing-ssl.conf ]; then
  echo "certificates now present -- installing the SSL server blocks"
  render_proxy_conf yes
  "${COMPOSE[@]}" exec -T proxy nginx -t
  "${COMPOSE[@]}" exec -T proxy nginx -s reload
fi

# --- 4. Tidy --------------------------------------------------------------
#
# Untagged images accumulate on every deploy and this disk is small. Only
# dangling ones: a tagged image may be the rollback target.
docker image prune -f

echo
echo "deployed. running containers:"
"${COMPOSE[@]}" ps
