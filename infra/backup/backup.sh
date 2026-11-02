#!/bin/sh
# Backs up the database and prescription files. Schedule daily from cron (docs/runbook.md).
# Copy BACKUP_DIR off this server: a backup on the same disk does not survive losing the VPS.
set -eu

: "${COMPOSE_PROJECT_NAME:?set COMPOSE_PROJECT_NAME}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/albarakah}"
KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

db="$BACKUP_DIR/db-$stamp.dump"
docker exec "$COMPOSE_PROJECT_NAME-postgres-1" pg_dump -U albarakah -d albarakah -Fc > "$db.partial"
mv "$db.partial" "$db"

files="$BACKUP_DIR/files-$stamp.tar.gz"
docker run --rm -v "${COMPOSE_PROJECT_NAME}_objectdata:/data:ro" alpine:3.22 tar -czf - -C /data . > "$files.partial"
mv "$files.partial" "$files"

find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime "+$KEEP_DAYS" -delete
echo "Backed up to $db and $files"
