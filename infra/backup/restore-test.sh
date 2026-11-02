#!/bin/sh
# Proves a backup can be restored: loads it into a temporary database, compares row counts
# with the live one, then removes it. Live data is only read. Usage: restore-test.sh db-XXXX.dump
set -eu

: "${COMPOSE_PROJECT_NAME:?set COMPOSE_PROJECT_NAME}"
dump="${1:?usage: restore-test.sh <db dump>}"
pg="$COMPOSE_PROJECT_NAME-postgres-1"
scratch=albarakah_restore_test

docker exec "$pg" psql -q -U albarakah -d postgres -c "DROP DATABASE IF EXISTS $scratch" -c "CREATE DATABASE $scratch"
trap 'docker exec "$pg" psql -q -U albarakah -d postgres -c "DROP DATABASE IF EXISTS $scratch"' EXIT
docker exec -i "$pg" pg_restore -U albarakah -d "$scratch" --no-owner --exit-on-error < "$dump"

counts='SELECT (SELECT count(*) FROM "User"), (SELECT count(*) FROM "Medicine"), (SELECT count(*) FROM "Order"), (SELECT count(*) FROM "_prisma_migrations")'
restored="$(docker exec "$pg" psql -At -U albarakah -d "$scratch" -c "$counts")"
live="$(docker exec "$pg" psql -At -U albarakah -d albarakah -c "$counts")"
echo "users|medicines|orders|migrations  restored: $restored  live: $live"

# Orders can arrive after the backup, so restored orders may trail live ones. The rest must exist.
case "$restored" in
  0\|*|*\|0\|*) echo "Restore FAILED: expected data is missing" >&2; exit 1 ;;
esac
echo "Restore OK"
