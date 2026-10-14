#!/usr/bin/env bash
# Jednorázová instalace Louky na čistý VPS s Ubuntu 24.04 (spusť jako root).
#   bash setup-vps.sh hry.ardoremy.cz 'heslo-pro-kroužek'
# Co udělá: Node.js 22, Caddy (HTTPS), firewall, uživatel `louka`, kód v /opt/louka, služba `louka`.
set -euo pipefail
DOMAIN="${1:?Použití: setup-vps.sh <doména> <heslo-místnosti>}"
PASSWORD="${2:?Použití: setup-vps.sh <doména> <heslo-místnosti>}"
REPO="${REPO:-https://github.com/Richard-Vesely/louka.git}"
BRANCH="${BRANCH:-main}"

echo "== Balíčky"
apt-get update
apt-get install -y curl git ufw gpg debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "== Firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Kód hry"
id louka >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin louka
mkdir -p /opt/louka
chown louka:louka /opt/louka
if [ ! -d /opt/louka/.git ]; then sudo -u louka git clone --branch "$BRANCH" "$REPO" /opt/louka; fi
cd /opt/louka
sudo -u louka npm ci
sudo -u louka npm run build
sudo -u louka mkdir -p server/data

echo "== Nastavení (/etc/louka.env)"
if [ ! -f /etc/louka.env ]; then
  cat > /etc/louka.env <<ENV
PORT=8787
ROOM_PASSWORD=$PASSWORD
DATA_DIR=/opt/louka/server/data
STATIC_DIR=/opt/louka/client/dist
MAX_PLAYERS=8
ENV
  chmod 600 /etc/louka.env
fi

echo "== Služba louka"
cp deploy/louka.service /etc/systemd/system/louka.service
systemctl daemon-reload
systemctl enable --now louka

echo "== Caddy pro $DOMAIN"
sed "s/hry.ardoremy.cz/$DOMAIN/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy

sleep 2
curl -fsS http://127.0.0.1:8787/health && echo
echo "Hotovo. Hra: https://$DOMAIN  ·  server pro GitHub Pages: wss://$DOMAIN"
