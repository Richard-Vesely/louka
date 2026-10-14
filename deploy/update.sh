#!/usr/bin/env bash
# Nahraje na VPS nejnovější verzi z GitHubu a restartuje server (svět se při vypnutí uloží).
#   sudo bash /opt/louka/deploy/update.sh
set -euo pipefail
cd /opt/louka
sudo -u louka git pull --ff-only
sudo -u louka npm ci
sudo -u louka npm run build
systemctl restart louka
sleep 2
curl -fsS http://127.0.0.1:8787/health && echo
