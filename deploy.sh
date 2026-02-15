#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"  # Stelle sicher, dass wir immer im richtigen Verzeichnis sind
LOG_DIR="$APP_DIR/logs"
CONTAINER_NAME="koffein-tracker"

mkdir -p "$LOG_DIR"

is_container_running() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    return 0  # Container läuft
  fi
  return 1  # Container läuft nicht
}

install_docker() {
  echo "🔧 Installiere Docker..."
  
  if command -v apt-get >/dev/null 2>&1; then
    echo "  📦 Erkannt: Ubuntu/Debian"
    sudo apt-get update -y
    sudo apt-get install -y docker.io docker-compose
  elif command -v dnf >/dev/null 2>&1; then
    echo "  📦 Erkannt: Fedora"
    sudo dnf install -y docker docker-compose
  elif command -v yum >/dev/null 2>&1; then
    echo "  📦 Erkannt: RHEL/CentOS"
    sudo yum install -y docker docker-compose
  elif command -v pacman >/dev/null 2>&1; then
    echo "  📦 Erkannt: Arch"
    sudo pacman -Sy --noconfirm docker docker-compose
  else
    echo "❌ Kein unterstützter Paketmanager gefunden!"
    echo "Bitte installieren Sie Docker manuell: https://docs.docker.com/get-docker/"
    exit 1
  fi

  echo "✅ Docker installiert"
}

ensure_docker() {
  # Docker prüfen und installieren falls nötig
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker ist nicht installiert"
    ensure_root
    install_docker
  fi

  # Docker-Compose prüfen und installieren falls nötig
  if ! command -v docker-compose >/dev/null 2>&1; then
    echo "❌ Docker Compose ist nicht installiert"
    ensure_root
    
    # Versuche neuere Docker-Version mit integriertem 'docker compose' zu verwenden
    if docker compose version >/dev/null 2>&1; then
      echo "✅ Nutze integriertes 'docker compose' (Docker 20.10+)"
      # Erstelle Wrapper-Alias für docker-compose
      sudo tee /usr/local/bin/docker-compose > /dev/null <<'EOF'
#!/usr/bin/env bash
docker compose "$@"
EOF
      sudo chmod +x /usr/local/bin/docker-compose
    else
      # Installiere docker-compose separat
      echo "  📥 Installiere Docker Compose..."
      sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      sudo chmod +x /usr/local/bin/docker-compose
      echo "✅ Docker Compose installiert"
    fi
  fi

  # Docker-Daemon starten
  if ! docker ps >/dev/null 2>&1; then
    echo "🔧 Starte Docker Daemon..."
    sudo systemctl start docker
    sudo systemctl enable docker
    sleep 2
  fi

  # Finale Prüfung
  if docker ps >/dev/null 2>&1; then
    echo "✅ Docker ist bereit"
  else
    echo "❌ Docker konnte nicht gestartet werden"
    exit 1
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


# Docker wird verwendet, Node.js nicht direkt nötig
ensure_docker

create_env_files() {
  local env_example=".env.example"
  local env_local=".env.local"
  
  if [[ ! -f "$env_example" ]]; then
    echo "Erstelle $env_example..."
    cat > "$env_example" << 'EOF'
# Firebase Konfiguration - kopiere diese Datei zu .env.local und fülle die Werte aus
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# API Base URL (MySQL Backend)
VITE_API_BASE_URL=http://localhost:3001

# Datenbank-Auswahl: mysql | influx
DB_TYPE=mysql

# MySQL Server (Backend)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=caffeine_tracker

# InfluxDB Server (Backend)
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your_influx_token
INFLUX_ORG=your_org
INFLUX_BUCKET=your_bucket

# CORS Origin for API
CORS_ORIGIN=http://localhost:5173

# API Server Port
PORT=3001
EOF
  fi
  
  if [[ ! -f "$env_local" ]]; then
    echo "Erstelle $env_local aus $env_example..."
    cp "$env_example" "$env_local"
    echo "⚠️  Bitte .env.local mit Ihren Werten konfigurieren!"
  fi
}

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
  local app_dir="$2"
  local config_path="/etc/nginx/conf.d/koffein-tracker.conf"

  sudo tee "$config_path" >/dev/null <<EOF
server {
  listen 80;
  server_name ${domain};

  # Frontend - statische Dateien
  location / {
    root ${app_dir}/dist;
    try_files \$uri \$uri/ /index.html;
    expires 1h;
    add_header Cache-Control "public, max-age=3600";
  }

  # API Backend
  location /api/ {
    proxy_pass http://localhost:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
    proxy_request_buffering off;
  }

  # Für API Endpoints ohne /api/ prefix
  location /version {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

  sudo nginx -t || { echo "Nginx Konfiguration fehlerhaft!"; exit 1; }
  sudo systemctl enable --now nginx
  sudo systemctl reload nginx
}

obtain_ssl_cert() {
  local domain="$1"
  local email="$2"
  sudo certbot --nginx -d "$domain" --non-interactive --agree-tos -m "$email" --redirect
}

# =================================================================
# MAIN DEPLOYMENT LOGIC
# =================================================================

echo "🐳 Koffein-Tracker Deployment mit Docker"
echo "========================================="
echo ""

# Stelle sicher dass Docker installiert und bereit ist
ensure_docker

create_env_files

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

# Prüfe ob Container bereits läuft
if is_container_running; then
  echo ""
  echo "✓ Docker Container läuft bereits"
  echo "🔄 Überspringe Datenbankauswahl, verwende existierende Konfiguration..."
  SERVICE_ALREADY_RUNNING=true
else
  SERVICE_ALREADY_RUNNING=false
  
  echo "Datenbank wählen:"
  echo "1) MySQL (lokal im Speicher)"
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
fi

cd "$APP_DIR"

# Docker Build und Deployment
echo ""
echo "🔨 Baue Docker Image..."
sudo docker-compose build --no-cache

echo ""
echo "🚀 Starte Docker Container..."
sudo docker-compose down 2>/dev/null || true
sudo docker-compose up -d

# Warte bis Container ready ist
echo "⏳ Warte bis Container bereit ist..."
sleep 5

if is_container_running; then
  CONTAINER_ID=$(docker ps --filter "name=$CONTAINER_NAME" --format "{{.ID}}" | head -c 12)
  echo "✅ Docker Container läuft (ID: $CONTAINER_ID)"
else
  echo "❌ Container konnte nicht gestartet werden!"
  echo "Logs:"
  sudo docker-compose logs --tail=50
  exit 1
fi

# Domain-Konfiguration nur beim ersten Deployment
if [[ "$SERVICE_ALREADY_RUNNING" == "false" ]]; then
  echo ""
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
      configure_nginx "$DOMAIN_NAME" "$APP_DIR"
      obtain_ssl_cert "$DOMAIN_NAME" "$CERTBOT_EMAIL"

      set_env_key "CORS_ORIGIN" "https://${DOMAIN_NAME}"

      # Restart Container mit neuer Config
      echo "🔄 Starte Docker Container neu..."
      sudo docker-compose restart
      sleep 3
    fi
  fi
else
  echo "✓ Domain bereits konfiguriert. Überspringe Setup."
fi

echo ""
echo "========================================="
echo "✅ Deployment erfolgreich abgeschlossen!"
echo "========================================="
echo ""
echo "🌐 App erreichbar unter:"
echo "   http://localhost:3001"
echo ""
echo "📊 Container Status:"
sudo docker-compose ps
echo ""
echo "📝 Logs anzeigen: docker-compose logs -f"
echo "🛑 Container stoppen: docker-compose down"
echo "♻️  Container neustarten: docker-compose restart"
