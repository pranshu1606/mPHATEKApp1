#!/usr/bin/env bash
# Nightly backup of the app's Docker volumes (SQLite DB, resume PDFs, Chroma vectors).
#
# Keeps the last $KEEP archives in ~/backups. If BACKUP_PAR_URL is set in .env
# (an OCI Object Storage bucket pre-authenticated request URL with object-write
# access, ending in /o/), each archive is also uploaded there.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="resume-portal"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/${PROJECT}-${STAMP}.tar.gz"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

BACKUP_PAR_URL="$(grep -E '^BACKUP_PAR_URL=' .env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"

mkdir -p "$BACKUP_DIR"

# Stop writers briefly so SQLite (WAL) and Chroma files are consistent on disk.
"${COMPOSE[@]}" stop frontend backend
trap '"${COMPOSE[@]}" start backend frontend' EXIT

docker run --rm \
  -v "${PROJECT}_web-data:/backup/web-data:ro" \
  -v "${PROJECT}_vector-data:/backup/vector-data:ro" \
  -v "$BACKUP_DIR:/out" \
  alpine tar czf "/out/$(basename "$ARCHIVE")" -C /backup .

"${COMPOSE[@]}" start backend frontend
trap - EXIT

echo "Created $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

if [ -n "$BACKUP_PAR_URL" ]; then
  curl -fsS -X PUT --data-binary "@$ARCHIVE" "${BACKUP_PAR_URL}$(basename "$ARCHIVE")"
  echo "Uploaded to Object Storage"
fi

ls -1t "$BACKUP_DIR"/${PROJECT}-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
