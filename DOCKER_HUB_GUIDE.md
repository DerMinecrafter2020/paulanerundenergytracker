# Docker Hub Upload Instructions

## Voraussetzungen
- Docker Hub Account (https://hub.docker.com)
- Docker installiert
- Das Repository geclont

## Schnellstart

### 1. Docker Image hochladen

```bash
./push-to-docker-hub.sh
```

Das Script wird dich fragen:
- Docker Hub Username
- Dann automatisch bauen und hochladen

### 2. Manueller Upload

```bash
# In Docker Hub anmelden
docker login

# Image bauen
docker build -t <DEIN_USERNAME>/koffein-tracker:latest .
docker tag <DEIN_USERNAME>/koffein-tracker:latest <DEIN_USERNAME>/koffein-tracker:1.0.0

# Auf Docker Hub pushen
docker push <DEIN_USERNAME>/koffein-tracker:latest
docker push <DEIN_USERNAME>/koffein-tracker:1.0.0
```

## Image verwenden

### Lokal ausführen
```bash
docker run -p 3001:3001 <DEIN_USERNAME>/koffein-tracker:latest
```

### Mit Docker Compose
```bash
docker-compose.yml:
services:
  app:
    image: <DEIN_USERNAME>/koffein-tracker:latest
    ports:
      - "3001:3001"
```

## GitHub Actions CI/CD (optional)

Für automatisches Uploaden nach jedem Push, erstelle `.github/workflows/docker-push.yml`:

```yaml
name: Push to Docker Hub

on:
  push:
    branches: [main]
    paths:
      - 'Dockerfile'
      - 'src/**'
      - 'server.js'
      - '.github/workflows/docker-push.yml'

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v1
      
      - name: Login to Docker Hub
        uses: docker/login-action@v1
        with:
          username: ${{ secrets.DOCKER_HUB_USERNAME }}
          password: ${{ secrets.DOCKER_HUB_PASSWORD }}
      
      - name: Build and push
        uses: docker/build-push-action@v2
        with:
          context: .
          push: true
          tags: |
            ${{ secrets.DOCKER_HUB_USERNAME }}/koffein-tracker:latest
            ${{ secrets.DOCKER_HUB_USERNAME }}/koffein-tracker:${{ github.sha }}
```

**GitHub Secrets hinzufügen:**
1. Gehe zu Repository Settings → Secrets
2. Füge hinzu:
   - `DOCKER_HUB_USERNAME`: Dein Docker Hub Username
   - `DOCKER_HUB_PASSWORD`: Dein Docker Hub Password/Token

## Image-Beschreibung

Füge auf Docker Hub hinzu:

**Description:**
```
Koffein-Tracker - Track your caffeine intake with style!

A full-stack React + Express application for monitoring energy drink and caffeine consumption.

Features:
- Real-time caffeine tracking
- Energy drink database with Open Food Facts API
- Local or MySQL storage
- Docker deployment ready
- Responsive UI with Tailwind CSS

Quick Start:
docker run -p 3001:3001 <username>/koffein-tracker:latest
```

## Tags-Strategie

- `latest`: Neuste Version
- `1.0.0`, `1.0.1`, etc: Spezifische Versionen
- `dev`: Development Branch (optional)

## Docker Hub Insights

Nach dem Upload kannst du auf Docker Hub sehen:
- Download-Statistiken
- Build-Verlauf
- Automated Builds (optional)
