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
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE crm LOGIN PASSWORD '${CRM_DB_PASSWORD:-crm}';
    CREATE DATABASE crm OWNER crm;
EOSQL

echo "created database 'crm' owned by role 'crm'"
