#!/usr/bin/env bash
# =============================================================================
# InPilot – Manual Deploy Script
# Run on the DigitalOcean droplet as the deploy user when you want to deploy
# without pushing to GitHub (hotfix, first deploy, etc.)
#
#   Usage:   bash /opt/inpilot/scripts/deploy.sh
#   Options: SKIP_PULL=1 bash deploy.sh   (redeploy current image without pull)
# =============================================================================
set -euo pipefail

APP_DIR="/opt/inpilot"
COMPOSE="docker compose -f $APP_DIR/docker-compose.yml"
REGISTRY="ghcr.io"
IMAGE="${REGISTRY}/rohail-suii/inpilot:latest"   # adjust to your GitHub repo path

cd "$APP_DIR"

echo "=========================================="
echo " InPilot – Deploy  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# ── Guard: .env.production must exist ────────────────────────────────────────
if [ ! -f .env.production ]; then
  echo "ERROR: $APP_DIR/.env.production not found."
  echo "Create it from .env.production.example before deploying."
  exit 1
fi

# ── Pull latest image (unless skipped) ───────────────────────────────────────
if [ "${SKIP_PULL:-0}" != "1" ]; then
  echo "[1/4] Pulling latest image from GHCR…"
  # If this is called manually you need to be logged in:
  #   echo TOKEN | docker login ghcr.io -u USERNAME --password-stdin
  docker pull "$IMAGE"
else
  echo "[1/4] Skipping image pull (SKIP_PULL=1)"
fi

# ── Start / update database and nginx first ───────────────────────────────────
echo "[2/4] Ensuring MongoDB and Nginx are running…"
$COMPOSE up -d mongo nginx certbot

# Wait for Mongo to be healthy before starting app
echo "  Waiting for MongoDB…"
for i in $(seq 1 12); do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' linkedboost-mongo 2>/dev/null || echo "starting")
  [ "$HEALTH" = "healthy" ] && break
  [ "$i" -eq 12 ] && { echo "MongoDB did not start in time!"; exit 1; }
  sleep 5
done

# ── Rolling restart of app container ─────────────────────────────────────────
echo "[3/4] Restarting app container…"
$COMPOSE up -d --no-deps --remove-orphans app

# ── Health check ─────────────────────────────────────────────────────────────
echo "[4/4] Waiting for app health check…"
for i in $(seq 1 24); do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' linkedboost-app 2>/dev/null || echo "starting")
  echo "  [${i}/24] $HEALTH"
  [ "$HEALTH" = "healthy" ] && break
  if [ "$i" -eq 24 ]; then
    echo "FAILED – last 50 log lines:"
    $COMPOSE logs --tail=50 app
    exit 1
  fi
  sleep 5
done

# ── Cleanup ───────────────────────────────────────────────────────────────────
docker image prune -f

echo ""
echo "Deployment successful!"
echo "  App:       http://localhost:3000"
echo "  WebSocket: http://localhost:3001"
echo "  Logs:      docker compose logs -f app"
echo ""
