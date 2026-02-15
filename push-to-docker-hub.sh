#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🐳 Docker Hub Upload${NC}"
echo "=================================="
echo ""

# Prüfe ob Docker installiert ist
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}❌ Docker ist nicht installiert${NC}"
  exit 1
fi

# Prüfe ob bereits angemeldet
if ! docker info | grep -q "Username"; then
  echo "Bitte melden Sie sich bei Docker Hub an:"
  docker login
fi

# Frage nach Docker Hub Username
read -p "Docker Hub Username: " DOCKER_USER

# Prüfe ob package.json existiert
if [[ ! -f "package.json" ]]; then
  echo -e "${RED}❌ package.json nicht gefunden${NC}"
  exit 1
fi

# Extrahiere Version aus package.json
VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
if [[ -z "$VERSION" ]]; then
  VERSION="latest"
fi

# Image Namen
IMAGE_NAME="${DOCKER_USER}/koffein-tracker"

echo ""
echo -e "${YELLOW}📦 Image Details:${NC}"
echo "  Repository: $IMAGE_NAME"
echo "  Version: $VERSION"
echo "  Tags: latest, $VERSION"
echo ""

# Build Image
echo -e "${YELLOW}🔨 Baue Docker Image...${NC}"
docker build -t "$IMAGE_NAME:latest" .
docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:$VERSION"

echo -e "${GREEN}✅ Image gebaut${NC}"
echo ""

# Push zu Docker Hub
echo -e "${YELLOW}📤 Lade auf Docker Hub hoch...${NC}"
echo "  Pushing: $IMAGE_NAME:latest"
docker push "$IMAGE_NAME:latest"

echo "  Pushing: $IMAGE_NAME:$VERSION"
docker push "$IMAGE_NAME:$VERSION"

echo -e "${GREEN}✅ Erfolgreich auf Docker Hub hochgeladen!${NC}"
echo ""
echo "🔗 Repository: https://hub.docker.com/r/${DOCKER_USER}/koffein-tracker"
echo ""
echo "📋 Verwendung:"
echo "  docker run -p 3001:3001 $IMAGE_NAME:latest"
echo ""
echo "🐳 Mit Docker Compose:"
echo "  docker-compose.yml anpassen:"
echo "    image: $IMAGE_NAME:latest"
