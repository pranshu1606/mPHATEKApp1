#!/usr/bin/env bash
# Pull the CI-built images for a commit and (re)start the production stack.
# Run on the VM:  bash infra/deploy.sh [git-sha]   (default tag: latest)
# CI runs this through SSM Run Command after `git reset --hard <sha>`.
set -euo pipefail

cd "$(dirname "$0")/.."

export IMAGE_TAG="${1:-latest}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "Deploying image tag: $IMAGE_TAG"
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --no-build --remove-orphans
docker image prune -f
"${COMPOSE[@]}" ps
