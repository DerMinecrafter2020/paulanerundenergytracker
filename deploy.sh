#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$APP_DIR/app.pid"

mkdir -p "$LOG_DIR"

command -v node >/dev/null 2>&1 || { echo "Node.js fehlt"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm fehlt"; exit 1; }

if [[ ! -f ".env.local" ]]; then
  echo ".env.local fehlt. Bitte anlegen (siehe .env.example)."
  exit 1
fi

cd "$APP_DIR"

echo "Installiere Abhängigkeiten..."
npm install --no-progress

echo "Baue Frontend..."
npm run build

echo "Starte API-Server..."
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" || true)
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Beende laufenden Prozess $OLD_PID"
    kill "$OLD_PID"
    sleep 2
  fi
fi

nohup npm run server > "$LOG_DIR/server.log" 2>&1 &
NEW_PID=$!

echo "$NEW_PID" > "$PID_FILE"

echo "Fertig. Server läuft (PID $NEW_PID)."
echo "Tipp: Für Systemdienste nutze ./install_systemd.sh"
