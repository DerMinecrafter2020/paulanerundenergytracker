# 🚀 Deployment Guide — Koffein-Tracker

## Voraussetzungen

- Docker + Docker Compose
- Linux Server (z.B. Debian/Ubuntu)
- Bash Shell

## Schritt 1: Repository klonen

```bash
cd /root
git clone https://github.com/DerMinecrafter2020/energytracker.git
cd energytracker
```

## Schritt 2: `.env.local` erstellen

Kopiere `.env.production.example` zu `.env.local` und trage deine Werte ein:

```bash
cp .env.production.example /root/energytracker/.env.local
# Editiere mit: nano /root/energytracker/.env.local
```

**Wichtigste Variablen:**
- `MYSQL_PASSWORD` — Starkes Passwort für MySQL
- `ADMIN_SECRET` — Zufällig, für Admin-API-Authentifizierung
- `CORS_ORIGIN` — Deine Domain (z.B. `https://energytracker.example.com`)
- `MYSQL_HOST=mysql` — **NICHT `localhost`!** Das ist der Docker Service-Name

## Schritt 3: Docker Compose starten

```bash
cd /root/energytracker
docker compose up -d
```

Der Startup wird:
1. MySQL-Container starten
2. MySQL Health-Check durchführen (30s Start-Periode, dann alle 10s)
3. Koffein-Tracker-Container starten (wartet bis MySQL bereit ist)
4. Watchtower starten (überwacht Docker Hub, prüft stündlich nach Updates)

## Schritt 4: Logs überprüfen

```bash
# Alle Logs anschauen
docker compose logs -f

# Nur die App-Logs
docker compose logs -f koffein-tracker

# Nur MySQL-Logs
docker compose logs -f mysql

# Nur Watchtower-Logs
docker compose logs -f watchtower
```

## Debugging: ECONNREFUSED-Fehler

Wenn du diesen Fehler siehst:
```
Error: connect ECONNREFUSED
```

**Prüfe:**

### 1. Ist `.env.local` vorhanden und readable?
```bash
ls -la /root/energytracker/.env.local
```

### 2. Ist `MYSQL_HOST=mysql` (nicht `localhost`)?
```bash
grep MYSQL_HOST /root/energytracker/.env.local
```

### 3. Läuft der MySQL-Container?
```bash
docker ps | grep mysql
```

### 4. Hat MySQL gestartet? Warte 30+ Sekunden nach `docker compose up -d`
```bash
docker compose logs mysql | tail -20
```

### 5. Netzwerk-Verbindung testen (in App-Container)
```bash
docker exec koffein-tracker ping mysql
docker exec koffein-tracker nc -zv mysql 3306
```

### 6. Env-Variablen in App überprüfen
```bash
docker exec koffein-tracker env | grep MYSQL
```

Falls `MYSQL_HOST=localhost`, dann wird die `.env.local` falsch eingebunden. Prüfe die `depends_on: volumes:` in docker-compose.yml.

## Updates

Watchtower prüft automatisch jede Stunde nach Updates auf Docker Hub. Wenn ein neues Image da ist, wird der Container automatisch neu gestartet.

**Manuell updaten:**
```bash
cd /root/energytracker
docker compose pull
docker compose up -d
```

## Backup der Datenbank

```bash
# MySQL-Datenbank dumpen
docker exec koffein-mysql mysqldump -u koffein -p${MYSQL_PASSWORD} caffeine_tracker > backup-$(date +%Y%m%d).sql

# MySQL-Volume-Backup (einfacher)
docker compose exec mysql mysqldump -u koffein -p${MYSQL_PASSWORD} caffeine_tracker | gzip > backup.sql.gz
```

## Wichtige Dateien

- `docker-compose.yml` — Container-Orchestrierung
- `.env.local` — Produktions-Secrets (nicht in Git!)
- `server.js` — Node.js Backend mit MySQL
- `Dockerfile` — Multi-stage Build für Frontend + Backend

---

**Support:** Bei Problemen, schau in die Logs und überprüfe die `MYSQL_HOST`-Variable!
