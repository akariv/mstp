#!/usr/bin/env bash
# Adds (or updates) an allowed user directly in Firestore. Use once to bootstrap the first admin;
# afterwards manage users in the app under Beheer → Gebruikers.
# Usage: scripts/seed-admin.sh someone@gmail.com [admin|student] [Name]
set -euo pipefail
EMAIL=$(echo "$1" | tr '[:upper:]' '[:lower:]')
ROLE=${2:-admin}
NAME=${3:-}
PROJECT=${PROJECT:-mstp-509920}
curl -sf -X PATCH \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/allowedUsers/$EMAIL" \
  -d "{\"fields\":{\"role\":{\"stringValue\":\"$ROLE\"},\"name\":{\"stringValue\":\"$NAME\"}}}" >/dev/null
echo "allowedUsers/$EMAIL -> $ROLE"
