#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$APP_DIR/app.pid"

mkdir -p "$LOG_DIR"

install_node() {
  echo "Installiere Node.js und npm..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y curl ca-certificates gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nodejs npm
  else
    echo "Kein unterstützter Paketmanager gefunden. Bitte Node.js manuell installieren."
    exit 1
  fi
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  ensure_root
  install_node
fi

command -v node >/dev/null 2>&1 || { echo "Node.js fehlt"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm fehlt"; exit 1; }

update_app() {
  if ! command -v git >/dev/null 2>&1; then
    echo "git fehlt. Update nicht möglich."
    return 1
  fi

  if [[ ! -d .git ]]; then
    echo "Kein Git-Repository gefunden. Update nicht möglich."
    return 1
  fi

  echo "Prüfe auf Updates..."
  git fetch --all --prune
  LOCAL_COMMIT=$(git rev-parse @)
  REMOTE_COMMIT=$(git rev-parse @{u} 2>/dev/null || true)

  if [[ -z "$REMOTE_COMMIT" ]]; then
    echo "Kein Upstream-Branch konfiguriert."
    return 1
  fi

  if [[ "$LOCAL_COMMIT" == "$REMOTE_COMMIT" ]]; then
    echo "Keine Updates verfügbar."
    return 0
  fi

  echo "Update verfügbar. Aktualisiere..."
  git pull --rebase
  echo "Update abgeschlossen."
}

if [[ ! -f ".env.local" ]]; then
  echo ".env.local fehlt. Bitte anlegen (siehe .env.example)."
  exit 1
fi

echo "Update prüfen und installieren?"
echo "1) Ja"
echo "2) Nein"
read -r UPDATE_CHOICE

if [[ "$UPDATE_CHOICE" == "1" ]]; then
  update_app || true
fi

set_env_key() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" .env.local; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env.local
  else
    echo "${key}=${value}" >> .env.local
  fi
}

get_public_ip() {
  if command -v curl >/dev/null 2>&1; then
    curl -s https://api.ipify.org || true
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- https://api.ipify.org || true
  else
    echo ""
  fi
}

resolve_domain_ip() {
  local domain="$1"
  if command -v getent >/dev/null 2>&1; then
    getent hosts "$domain" | awk '{print $1}' | head -n1
  elif command -v dig >/dev/null 2>&1; then
    dig +short A "$domain" | head -n1
  else
    echo ""
  fi
}

ensure_root() {
  if [[ $EUID -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo -v
    else
      echo "Root-Rechte fehlen (sudo nicht verfügbar)."
      exit 1
    fi
  fi
}

install_nginx_certbot() {
  if command -v nginx >/dev/null 2>&1 && command -v certbot >/dev/null 2>&1; then
    return
  fi

  echo "Installiere Nginx und Certbot..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y
    sudo apt-get install -y nginx certbot python3-certbot-nginx
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nginx certbot python3-certbot-nginx
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y nginx certbot python3-certbot-nginx
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm nginx certbot certbot-nginx
  else
    echo "Kein unterstützter Paketmanager gefunden."
    exit 1
  fi
}

configure_nginx() {
  local domain="$1"
  local config_path="/etc/nginx/conf.d/koffein-tracker.conf"

  sudo tee "$config_path" >/dev/null <<EOF
server {
  listen 80;
  server_name ${domain};

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

  sudo nginx -t
  sudo systemctl enable --now nginx
  sudo systemctl reload nginx
}

obtain_ssl_cert() {
  local domain="$1"
  local email="$2"
  sudo certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect
}

echo "Datenbank wählen:"
echo "1) MySQL"
echo "2) InfluxDB"
read -r DB_CHOICE

case "$DB_CHOICE" in
  1)
    set_env_key "DB_TYPE" "mysql"
    echo "MySQL Konfiguration: (Standardwerte werden verwendet)"
    read -r -s -p "Passwort: " MYSQL_PASS_INPUT
    echo

    set_env_key "MYSQL_HOST" "localhost"
    set_env_key "MYSQL_PORT" "3306"
    set_env_key "MYSQL_USER" "root"
    set_env_key "MYSQL_PASSWORD" "${MYSQL_PASS_INPUT}"
    set_env_key "MYSQL_DATABASE" "caffeine_tracker"
    ;;
  2)
    set_env_key "DB_TYPE" "influx"
    ;;
  *)
    echo "Ungültige Auswahl."
    exit 1
    ;;
esac

set -a
source .env.local
set +a

if [[ "${DB_TYPE}" == "mysql" ]]; then
  : "${MYSQL_HOST:?MYSQL_HOST fehlt}"
  : "${MYSQL_USER:?MYSQL_USER fehlt}"
  : "${MYSQL_PASSWORD:?MYSQL_PASSWORD fehlt}"
  : "${MYSQL_DATABASE:?MYSQL_DATABASE fehlt}"
elif [[ "${DB_TYPE}" == "influx" ]]; then
  : "${INFLUX_URL:?INFLUX_URL fehlt}"
  : "${INFLUX_TOKEN:?INFLUX_TOKEN fehlt}"
  : "${INFLUX_ORG:?INFLUX_ORG fehlt}"
  : "${INFLUX_BUCKET:?INFLUX_BUCKET fehlt}"
  echo "InfluxDB ist im Backend noch nicht implementiert."
  echo "Bitte MySQL wählen oder die InfluxDB-Implementierung hinzufügen."
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

echo "Soll die App über eine Domain erreichbar sein?"
echo "1) Ja"
echo "2) Nein"
read -r DOMAIN_CHOICE

if [[ "$DOMAIN_CHOICE" == "1" ]]; then
  read -r -p "Domain (z.B. example.com): " DOMAIN_NAME
  if [[ -z "$DOMAIN_NAME" ]]; then
    echo "Keine Domain angegeben. Überspringe Domain-Konfiguration."
  else
    DOMAIN_IP=$(resolve_domain_ip "$DOMAIN_NAME")
    PUBLIC_IP=$(get_public_ip)

    if [[ -z "$DOMAIN_IP" || -z "$PUBLIC_IP" ]]; then
      echo "DNS-Prüfung fehlgeschlagen. Bitte DNS und Internetzugang prüfen."
      exit 1
    fi

    if [[ "$DOMAIN_IP" != "$PUBLIC_IP" ]]; then
      echo "DNS nicht korrekt gesetzt."
      echo "Domain-IP: $DOMAIN_IP"
      echo "Server-IP: $PUBLIC_IP"
      exit 1
    fi

    read -r -p "E-Mail für Let's Encrypt: " CERTBOT_EMAIL
    if [[ -z "$CERTBOT_EMAIL" ]]; then
      echo "E-Mail fehlt. Abbruch."
      exit 1
    fi

    ensure_root
    install_nginx_certbot
    configure_nginx "$DOMAIN_NAME"
    obtain_ssl_cert "$DOMAIN_NAME" "$CERTBOT_EMAIL"

    set_env_key "CORS_ORIGIN" "https://${DOMAIN_NAME}"

    if [[ -f "$PID_FILE" ]]; then
      OLD_PID=$(cat "$PID_FILE" || true)
      if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Starte API-Server neu (PID $OLD_PID)"
        kill "$OLD_PID"
        sleep 2
        nohup npm run server > "$LOG_DIR/server.log" 2>&1 &
        NEW_PID=$!
        echo "$NEW_PID" > "$PID_FILE"
        echo "Neuer PID: $NEW_PID"
      fi
    fi
  fi
fi

echo "Tipp: Für Systemdienste nutze ./install_systemd.sh"
