#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    source "$env_file"
  fi
}

load_env "$ROOT_DIR/.env"
load_env "$ROOT_DIR/supabase/.env"

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY is not set. Update your .env files." >&2
  exit 1
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "Error: SUPABASE_URL is not set. Update your .env files." >&2
  exit 1
fi

curl -X POST "${SUPABASE_URL%/}/functions/v1/sync-legislators-and-votes" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json"
