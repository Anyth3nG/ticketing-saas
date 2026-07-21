#!/usr/bin/env bash
# Idempotent: safe to run on every deploy. Installs nginx + certbot if
# missing, reverse-proxies :80/:443 -> the FastAPI app on :8000, and
# issues/renews a Let's Encrypt cert for the given domain.
#
# certbot is used with `certonly` (authenticator only), never the `--nginx`
# installer -- we own the nginx config entirely ourselves via the two
# templates in this directory. That means port 80 always proxies straight
# through rather than redirecting to 443, so the origin works correctly
# whether Cloudflare is set to Flexible (origin hit on :80) or Full (origin
# hit on :443) mode, without needing to know or control which one is set.
set -euo pipefail

DOMAIN="$1"
EMAIL="$2"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "ERROR: DOMAIN and EMAIL must both be non-empty (got DOMAIN='$DOMAIN' EMAIL='$EMAIL')." >&2
  echo "Check the VITE_API_URL/PROD_API_URL/CERTBOT_EMAIL GitHub Actions variables." >&2
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
HTTP_CONF="/etc/nginx/sites-available/ticketing-backend"
SSL_CONF="/etc/nginx/sites-available/ticketing-backend-ssl"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

PACKAGES=""
command -v nginx >/dev/null 2>&1 || PACKAGES="$PACKAGES nginx"
command -v certbot >/dev/null 2>&1 || PACKAGES="$PACKAGES certbot python3-certbot-nginx"
if [ -n "$PACKAGES" ]; then
  sudo apt-get update -y
  sudo apt-get install -y $PACKAGES
fi

# Safe to unconditionally (re)render -- we're the only thing that ever
# writes this file, so there's nothing to preserve between runs.
sed "s/__DOMAIN__/${DOMAIN}/g" "$SCRIPT_DIR/nginx.conf.template" | sudo tee "$HTTP_CONF" > /dev/null
sudo ln -sf "$HTTP_CONF" /etc/nginx/sites-enabled/ticketing-backend
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx

# Skips re-issuance if a valid cert already exists and isn't close to expiry.
# --deploy-hook fires on actual renewal too (via certbot's systemd timer),
# not just on this script running, so nginx picks up a renewed cert even
# during a long gap between deploys.
sudo certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" \
  --deploy-hook "systemctl reload nginx"

if [ -f "$CERT_PATH" ]; then
  sed "s/__DOMAIN__/${DOMAIN}/g" "$SCRIPT_DIR/nginx_ssl.conf.template" | sudo tee "$SSL_CONF" > /dev/null
  sudo ln -sf "$SSL_CONF" /etc/nginx/sites-enabled/ticketing-backend-ssl
  sudo nginx -t
  sudo systemctl reload nginx
fi
