#!/bin/sh
# Loads the bundled SYNTHETIC demo data on start-up (idempotent), then starts the API.
set -e
if [ "${PBE_LOAD_DEMO_DATA:-true}" = "true" ]; then
  echo "Loading synthetic demo data (set PBE_LOAD_DEMO_DATA=false to skip)..."
  python -m scripts.load_demo_data || echo "WARNING: could not load demo data (continuing)"
fi
exec "$@"
