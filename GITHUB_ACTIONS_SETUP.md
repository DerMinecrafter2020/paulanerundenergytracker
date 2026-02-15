# GitHub Actions Secrets Setup

## Schritt 1: Docker Hub Access Token erstellen
1. Gehe zu https://hub.docker.com/settings/security
2. Klicke "New Access Token"
3. Name: `github-actions`
4. Kopiere den Token

## Schritt 2: GitHub Secrets hinzufügen
1. Gehe zu deinem Repository auf GitHub
2. Settings → Secrets and variables → Actions
3. Füge hinzu:
   - Name: `DOCKER_HUB_USERNAME`
     Value: `derminecrafter2020`
   - Name: `DOCKER_HUB_PASSWORD`
     Value: `<dein_token_von_oben>`
   - Name: `DOCKER_HUB_TOKEN`
     Value: `<dein_token_von_oben>`

## Schritt 3: GitHub Action deployt automatisch

Sobald alles konfiguriert ist:
- Bei jedem `git push` zu `main`
- Wird GitHub Actions automatisch:
  1. Das Docker Image bauen
  2. Zu Docker Hub pushen (latest + Version)
  3. Du bekommst eine Notification

## Verifikation
- Gehe zu Repository → Actions
- Du siehst die Workflows dort
- Docker Hub wird automatisch aktualisiert
