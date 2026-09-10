#!/usr/bin/env bash
# =============================================================================
# VPS SSL setup — nginx TLS in front of the school-timetable compose stack.
#
# Run ON THE VPS as root:
#   bash setup-ssl.sh
#
# What it does:
#   1. Installs nginx (from the apt mirror).
#   2. Creates a self-signed certificate for the domain (10 years, SANs:
#      domain + VPS IP). Cloudflare "Full" SSL mode accepts self-signed
#      origin certs ("Full (strict)" would reject them — see step 5).
#   3. Moves the app container from host port 80 to 3000 (env APP_PORT).
#   4. Configures nginx:
#        :80  → 127.0.0.1:3000   (plain HTTP: direct-IP access keeps working)
#        :443 → 127.0.0.1:3000   (TLS termination, X-Forwarded-* headers,
#                                  proxy_buffering off for SSE notifications)
#   5. In Cloudflare (dashboard → SSL/TLS → Overview) set the mode to
#      "Full" — NOT "Flexible" (insecure) and NOT "Full (strict)"
#      (rejects self-signed; switch to it only after installing a
#      Cloudflare Origin CA certificate on this server).
#
# Re-running is safe: idempotent steps, backups end in .bak.
# =============================================================================
set -euo pipefail

DOMAIN="${1:-tkb.minhvuong.io.vn}"
VPS_IP="160.22.106.164"
APP_DIR="/opt/school-timetable"
CERT_DIR="/etc/nginx/ssl"

echo "== 1/5 nginx =="
command -v nginx >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx; }
nginx -v

echo "== 2/5 self-signed certificate for ${DOMAIN} =="
mkdir -p "${CERT_DIR}"
if [ ! -f "${CERT_DIR}/${DOMAIN}.crt" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "${CERT_DIR}/${DOMAIN}.key" \
    -out "${CERT_DIR}/${DOMAIN}.crt" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:*.${DOMAIN#*.},IP:${VPS_IP}"
fi
chmod 600 "${CERT_DIR}/${DOMAIN}.key"

echo "== 3/5 app container → host port 3000 =="
cd "${APP_DIR}"
if grep -q '^APP_PORT=80$' .env 2>/dev/null; then
  sed -i.bak 's/^APP_PORT=80$/APP_PORT=3000/' .env
  docker compose up -d
else
  grep -q '^APP_PORT=' .env || { echo "APP_PORT=3000" >> .env; docker compose up -d; }
  grep '^APP_PORT=' .env
fi

echo "== 4/5 nginx site config =="
cat > /etc/nginx/sites-available/school-timetable <<NGINX
# school-timetable — TLS termination in front of the Docker compose app.
# Cloudflare (Full mode) or direct HTTPS to the IP both land here.

map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} ${VPS_IP} _;

    # Let's Encrypt HTTP-01 challenges (if you later run certbot --nginx).
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        # SSE (notifications) needs unbuffered pass-through.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name ${DOMAIN} ${VPS_IP} _;

    ssl_certificate     ${CERT_DIR}/${DOMAIN}.crt;
    ssl_certificate_key ${CERT_DIR}/${DOMAIN}.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/school-timetable /etc/nginx/sites-enabled/school-timetable
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "== 5/5 verify =="
sleep 2
curl -s -o /dev/null -w "HTTP  :80  → %{http_code}\n" http://127.0.0.1/
curl -sk -o /dev/null -w "HTTPS :443 → %{http_code} (ssl_verify: %{ssl_verify_result})\n" https://127.0.0.1/

cat <<'EOF'

DONE. Remaining (one-time, in the Cloudflare dashboard):
  1. DNS: A record "tkb" → 160.22.106.164, proxy ENABLED (orange cloud)
  2. SSL/TLS → Overview → mode "Full"
     (use "Full (strict)" only after installing a Cloudflare Origin CA cert)
  3. Optional: SSL/TLS → Edge Certificates → "Always Use HTTPS" = ON
EOF
