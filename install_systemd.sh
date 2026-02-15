#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="energy-tracker.service"

if [[ $EUID -ne 0 ]]; then
  echo "Bitte als root ausführen (sudo)."
  exit 1
fi

mkdir -p /opt/koffein-tracker
rsync -a --delete "$APP_DIR/" /opt/koffein-tracker/

cp /opt/koffein-tracker/energy-tracker.service /etc/systemd/system/$SERVICE_NAME

if [[ ! -f /opt/koffein-tracker/.env.local ]]; then
  echo "/opt/koffein-tracker/.env.local fehlt. Bitte anlegen."
  exit 1
fi

systemctl daemon-reload
systemctl enable --now $SERVICE_NAME
systemctl status $SERVICE_NAME --no-pager
