#!/usr/bin/env bash
# Issue and renew Let's Encrypt certificates for the containerized stack.
# Idempotent: certbot skips a certificate that exists and is not near expiry,
# so this is safe to run on every deploy. Called by deploy.sh with sudo.
#
# THIS REPLACES backend/deploy/setup_nginx_tls.sh, which installed and
# configured nginx ON THE HOST. The proxy is a container now and owns its own
# configuration, so the only thing left for the host to do is hold certificates.
#
# Two things changed with that move, and both matter:
#
# 1. AUTHENTICATOR. The old script used `certbot certonly --nginx`, which needs
#    to read and edit the host's nginx config. There isn't one any more. And
#    --standalone is no worse than useless here: it wants to bind :80, which
#    the proxy container already holds. --webroot is the one that works --
#    certbot drops the challenge file in a directory, nginx serves it, nobody
#    needs to own the port twice.
#
# 2. DEPLOY HOOK. The old hook ran `systemctl reload nginx`. That would now
#    reload nothing -- or, worse, a host nginx that is not serving traffic.
#    Renewal happens on certbot's own systemd timer, often weeks after any
#    deploy, so if this hook is wrong the certificate silently renews on disk
#    while the proxy goes on serving the expired one until it fails.
set -euo pipefail

DOMAIN="${1:?usage: setup-certs.sh <domain> <legacy-api-domain|none> <email> [crm-domain]}"
API_DOMAIN="${2:?missing legacy api domain -- or 'none'}"
# The Let's Encrypt account on these boxes was registered with NO email
# contact, so this value reaches certbot and changes nothing: the account
# already exists and -m is not reapplied to it. It is kept as a required
# argument because a future box would register from scratch. The cost of the
# empty contact is that expiry warnings are never emailed, which is why
# renewal has to be checked rather than waited on.
EMAIL="${3:?missing email}"
# Optional, and passed by deploy.sh from its own 4th argument.
CRM_DOMAIN="${4:-}"

# The app's hostname always; the legacy API hostname and the CRM's hostname
# only where they exist.
#
# THE CRM'S HOSTNAME BELONGS HERE as of 2026-10-20. It used to be excluded --
# this proxy served it on :80 only -- which is what kept Cloudflare pinned to
# Flexible mode and the Cloudflare-to-origin hop in cleartext for live client
# data. It now gets a certificate and a :443 block like any other hostname
# (proxy/deploy/conf.d/crm-ssl.conf).
domains=("$DOMAIN")
if [ "$API_DOMAIN" != none ]; then
  domains+=("$API_DOMAIN")
fi
if [ -n "$CRM_DOMAIN" ]; then
  domains+=("$CRM_DOMAIN")
fi

WEBROOT=/var/www/certbot

# THE PATH STAYS `maxcpa` ON PURPOSE, even though the compose project is now
# `ticketing`. Certbot stored this path in every existing certificate's renewal
# config at issuance time, and a renewal weeks from now runs whatever path was
# stored then. Renaming the file would leave those configs pointing at nothing,
# which is the silent failure this indirection exists to avoid: the certificate
# renews on disk while the proxy serves the expired one. The contents are what
# gets corrected -- see the container filter in the hook below.
HOOK=/usr/local/bin/reload-maxcpa-proxy

command -v certbot >/dev/null 2>&1 || {
  apt-get update -y
  # certbot only -- deliberately NOT python3-certbot-nginx, which exists to
  # drive a host nginx this box no longer runs.
  apt-get install -y certbot
}

# Bind-mounted read-only into the proxy container.
mkdir -p "$WEBROOT"

# A file rather than an inline --deploy-hook string: certbot stores the hook in
# the renewal config at issuance time, and a renewal weeks later runs whatever
# was stored then. Pointing at a stable path means the hook can be corrected
# later without reissuing every certificate.
cat > "$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
# Reload the proxy CONTAINER after a certificate renews. Not host nginx --
# there isn't one.
#
# The filter tracks the COMPOSE PROJECT NAME, which is `ticketing` (it was
# `maxcpa` until 2026-09-07, when the CRM stopped sharing this stack). Rename
# the project again and this line has to move with it, or renewal goes quiet.
set -euo pipefail
cid="$(docker ps -q --filter 'name=ticketing-proxy' | head -1)"
if [ -z "$cid" ]; then
  echo "reload-ticketing-proxy: no running proxy container found" >&2
  exit 1
fi
docker exec "$cid" nginx -s reload
HOOKEOF
chmod +x "$HOOK"

for d in "${domains[@]}"; do
  echo "certbot: ensuring a certificate for ${d}"
  certbot certonly \
    --webroot -w "$WEBROOT" \
    -d "$d" \
    --non-interactive --agree-tos -m "$EMAIL" \
    --deploy-hook "$HOOK" \
    || echo "WARNING: could not obtain a certificate for ${d} -- the stack stays on HTTP for that hostname" >&2
done
