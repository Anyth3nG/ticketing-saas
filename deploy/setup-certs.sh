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

DOMAIN="${1:?usage: setup-certs.sh <domain> <api-domain> <email>}"
API_DOMAIN="${2:?missing api domain}"
EMAIL="${3:?missing email}"

WEBROOT=/var/www/certbot
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
set -euo pipefail
cid="$(docker ps -q --filter 'name=maxcpa-proxy' | head -1)"
if [ -z "$cid" ]; then
  echo "reload-maxcpa-proxy: no running proxy container found" >&2
  exit 1
fi
docker exec "$cid" nginx -s reload
HOOKEOF
chmod +x "$HOOK"

for d in "$DOMAIN" "$API_DOMAIN"; do
  echo "certbot: ensuring a certificate for ${d}"
  certbot certonly \
    --webroot -w "$WEBROOT" \
    -d "$d" \
    --non-interactive --agree-tos -m "$EMAIL" \
    --deploy-hook "$HOOK" \
    || echo "WARNING: could not obtain a certificate for ${d} -- the stack stays on HTTP for that hostname" >&2
done
