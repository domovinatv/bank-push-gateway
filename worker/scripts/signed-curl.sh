#!/usr/bin/env bash
# Pošalji potpisan zahtjev Workeru (lokalno ili produkcija).
#   scripts/signed-curl.sh <path> <json-tijelo>
# Okolina: GW_URL (zadano http://localhost:8787), GW_DEVICE, GW_SECRET
set -euo pipefail
path="${1:?path, npr. /ingest}"
body="${2:?json tijelo}"
url="${GW_URL:-http://localhost:8787}"
device="${GW_DEVICE:?GW_DEVICE}"
secret="${GW_SECRET:?GW_SECRET}"
ts="$(date +%s)"
sig="$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$secret" -r | cut -d' ' -f1)"
curl -sS -X POST "$url$path" \
  -H 'content-type: application/json' \
  -H "x-device-id: $device" \
  -H "x-timestamp: $ts" \
  -H "x-signature: $sig" \
  --data-binary "$body"
echo
