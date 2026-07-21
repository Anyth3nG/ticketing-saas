#!/usr/bin/env bash
# Idempotent: safe to run on every deploy. Installs nginx + certbot if
# missing, reverse-proxies :80/:443 -> the FastAPI app on :8000, and
# issues/renews a Let's Encrypt cert for the given domain.
set -euo pipefail

DOMAIN="$1"
EMAIL="$2"

CONF_PATH="/etc/nginx/sites-available/ticketing-backend"
TEMPLATE_PATH="$(dirname "$0")/nginx.conf.template"

PACKAGES=""
command -v nginx >/dev/null 2>&1 || PACKAGES="$PACKAGES nginx"
command -v certbot >/dev/null 2>&1 || PACKAGES="$PACKAGES certbot python3-certbot-nginx"
if [ -n "$PACKAGES" ]; then
  sudo apt-get update -y
  sudo apt-get install -y $PACKAGES
fi

# certbot rewrites this file in place to add the TLS server block, so only
# lay down the plain-HTTP base config the first time -- re-templating on
# every deploy would wipe out certbot's edits.
if [ ! -f "$CONF_PATH" ]; then
  sed "s/__DOMAIN__/${DOMAIN}/g" "$TEMPLATE_PATH" | sudo tee "$CONF_PATH" > /dev/null
  sudo ln -sf "$CONF_PATH" /etc/nginx/sites-enabled/ticketing-backend
  sudo rm -f /etc/nginx/sites-enabled/default
fi

sudo nginx -t
sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx

# Skips re-issuance if a valid cert already exists and isn't close to expiry.
sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

sudo systemctl reload nginx
