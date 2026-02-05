#!/bin/sh
set -e

INTERVAL="${ROLLUP_INTERVAL:-60}"
echo "rollup: starting (interval: ${INTERVAL}s)"

while true; do
  psql "$DATABASE_URL" -f /app/rollup.sql 2>&1
  sleep "$INTERVAL"
done
