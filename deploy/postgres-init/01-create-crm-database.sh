#!/bin/bash
# Creates the CRM's database alongside ticketing_saas.
#
# Postgres runs everything in /docker-entrypoint-initdb.d ONCE, and only when
# the data directory is empty. That is exactly why this is here now rather than
# later: by the time the CRM is deployed, this volume holds the firm's live
# ticketing data, and there is no second chance to run an init script against
# it. Creating the database now costs nothing and is a no-op for ticketing.
#
# Only the database and its owner are created. The CRM's own Alembic
# migrations build every table inside it.
#
# THE ROLE NAME CARRIES THE ENVIRONMENT, matching ticketing's own convention:
# the database is `crm` on every box, but the owner is crm_dev / crm_test /
# crm_prod, exactly as ticketing_saas is owned by ticketing_dev / ticketing_test
# / ticketing_prod. Isolation is per box; the suffix is what makes a credential
# obviously belong to one environment when it turns up in a log or a config
# file.
#
# ONE SHOT, PER ENVIRONMENT. Both values are read only here, on the first `up`
# against an empty volume. Nothing re-reads them afterwards -- changing the
# variable later has no effect at all, and correcting a name or password then
# means ALTER ROLE by hand. Prod gets exactly one chance, at cutover.
set -euo pipefail

# Defaults are the unsuffixed name and a matching password so a bare
# `docker compose up` still works with nothing configured. They are NOT
# intended for a deployed box: the workflow supplies both.
CRM_DB_USER="${CRM_DB_USER:-crm}"
CRM_DB_PASSWORD="${CRM_DB_PASSWORD:-crm}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE ${CRM_DB_USER} LOGIN PASSWORD '${CRM_DB_PASSWORD}';
    CREATE DATABASE crm OWNER ${CRM_DB_USER};
EOSQL

echo "created database 'crm' owned by role '${CRM_DB_USER}'"
