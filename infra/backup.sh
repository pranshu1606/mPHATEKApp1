#!/usr/bin/env bash
# Nightly backup of the app's Docker volumes (SQLite DB, resume PDFs, Chroma vectors).
#
# Keeps the last $KEEP archives in ~/backups. If BACKUP_S3_URI is set in .env
# (terraform output backup_s3_uri), each archive is also uploaded to S3 using the
# instance role — no AWS keys on the VM. The bucket expires objects after 14 days.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT="resume-portal"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${KEEP:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="${PROJECT}-${STAMP}.tar.gz"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

env_value() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }
BACKUP_S3_URI="$(env_value BACKUP_S3_URI)"

mkdir -p "$BACKUP_DIR"

# Stop writers briefly so SQLite (WAL) and Chroma files are consistent on disk.
"${COMPOSE[@]}" stop frontend backend
trap '"${COMPOSE[@]}" start backend frontend' EXIT

docker run --rm \
  -v "${PROJECT}_web-data:/backup/web-data:ro" \
  -v "${PROJECT}_vector-data:/backup/vector-data:ro" \
  -v "$BACKUP_DIR:/out" \
  alpine tar czf "/out/$NAME" -C /backup .

"${COMPOSE[@]}" start backend frontend
trap - EXIT

echo "Created $BACKUP_DIR/$NAME ($(du -h "$BACKUP_DIR/$NAME" | cut -f1))"

if [ -n "$BACKUP_S3_URI" ]; then
  # Region from instance metadata (IMDSv2); credentials come from the instance role.
  IMDS_TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')"
  REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/placement/region)"
  docker run --rm -e AWS_DEFAULT_REGION="$REGION" -v "$BACKUP_DIR:/b:ro" amazon/aws-cli \
    s3 cp "/b/$NAME" "${BACKUP_S3_URI%/}/$NAME" --only-show-errors
  echo "Uploaded to ${BACKUP_S3_URI%/}/$NAME"
fi

ls -1t "$BACKUP_DIR"/${PROJECT}-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
