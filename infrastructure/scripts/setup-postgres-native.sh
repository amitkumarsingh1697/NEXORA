#!/usr/bin/env bash
# Prepare a locally installed PostgreSQL 16 (no Docker) for NEXORA development.
# Requires sudo access to the postgres OS user. Local development only.
set -euo pipefail
PGUSER_NAME=${PGUSER_NAME:-nexora}
PGPASS=${PGPASS:-nexora_dev}
run() { sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc "$1"; }
if [ "$(run "select 1 from pg_roles where rolname='${PGUSER_NAME}'")" != "1" ]; then
  run "create role ${PGUSER_NAME} login password '${PGPASS}'"
fi
for db in cvforge cvforge_test cvforge_e2e; do
  if [ "$(run "select 1 from pg_database where datname='${db}'")" != "1" ]; then
    run "create database ${db} owner ${PGUSER_NAME}"
  fi
done
echo "Postgres ready: postgres://${PGUSER_NAME}:***@127.0.0.1:5432/{cvforge,cvforge_test,cvforge_e2e}"
