#!/usr/bin/env bash
# One-shot migration of the bare-metal database into the stack's Postgres
# container. Runs ON THE BOX. Not called by deploy.sh -- this is cutover step 3
# from docs/deployment.md, run once per environment by hand and never again.
#
# Ordering matters and is the reason this is separate. It must run while ONLY
# the postgres service is up, before the backend container ever starts: the
# backend runs `alembic upgrade head` on boot, so letting it start first would
# build an empty schema that a full restore then collides with. Restoring the
# whole dump into a clean database instead brings the schema, the data AND
# alembic_version across together, and the backend's migration on first boot
# becomes the no-op it should be.
#
# EVERY `docker compose exec` HERE REDIRECTS STDIN.
# `exec -T` attaches stdin, and a command that does not redirect it will eat
# whatever the caller's stdin happens to be -- which, when this is piped to a
# shell over ssh, is the remainder of the script. It stops silently, part-way,
# looking like a command that produced no output.
set -euo pipefail

STACK_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$STACK_DIR"

DUMP="${1:?usage: restore-baremetal-dump.sh <path/to/dump.sql>}"
[ -f "$DUMP" ] || { echo "ERROR: no such dump: $DUMP" >&2; exit 1; }

COMPOSE=(docker compose --env-file stack.env -f docker-compose.prod.yml)
PG_USER="$(grep '^POSTGRES_USER=' stack.env | cut -d= -f2-)"
DB=ticketing_saas

psql_q() {
  "${COMPOSE[@]}" exec -T postgres psql -U "$PG_USER" -d "$DB" -At -c "$1" < /dev/null
}

# --- Refuse to run twice ---------------------------------------------------
#
# A second restore into a populated database would fail on every CREATE TABLE
# and leave a half-applied mess behind. Cheaper to check than to unpick.
existing="$(psql_q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
if [ "$existing" != "0" ]; then
  echo "ERROR: ${DB} already has ${existing} tables in public." >&2
  echo "This script only restores into an EMPTY database. If you meant to" >&2
  echo "start over: docker compose down -v (DESTROYS THE VOLUME), redeploy," >&2
  echo "then run this again." >&2
  exit 1
fi

echo "restoring ${DUMP} into the ${DB} container database"
"${COMPOSE[@]}" exec -T postgres psql -U "$PG_USER" -d "$DB" -v ON_ERROR_STOP=1 -q < "$DUMP"

echo
echo "restored. row counts:"
psql_q "
  SELECT relname || ' = ' || n_live_tup
    FROM pg_stat_user_tables
   ORDER BY n_live_tup DESC;"

echo
echo "alembic revision: $(psql_q 'SELECT version_num FROM alembic_version;')"
echo "The backend's own 'alembic upgrade head' on first boot should be a no-op."
