#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${1:-}}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: BASE_URL=https://api.yourdomain.com $0"
  echo "Optional: AUTH_TOKEN=<bearer-token>"
  exit 1
fi

BASE_URL="${BASE_URL%/}"

tmp_body() {
  mktemp
}

curl_json() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local body_file
  body_file="$(tmp_body)"

  local -a args
  args=(-sS -m 25 -o "$body_file" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Content-Type: application/json")
  if [[ -n "$AUTH_TOKEN" ]]; then
    args+=(-H "Authorization: Bearer $AUTH_TOKEN")
  fi
  if [[ -n "$data" ]]; then
    args+=(--data "$data")
  fi

  local status
  status="$(curl "${args[@]}")"
  echo "$status|$body_file"
}

expect_status() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: $label expected HTTP $expected, got $actual"
    return 1
  fi
  echo "OK: $label ($actual)"
}

contains_text() {
  local file="$1"
  local needle="$2"
  grep -q "$needle" "$file"
}

run_check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local data="${4:-}"
  local expected_status="${5:-200}"

  local res status file
  res="$(curl_json "$method" "$path" "$data")"
  status="${res%%|*}"
  file="${res##*|}"

  expect_status "$status" "$expected_status" "$label"
  rm -f "$file"
}

echo "Running pre-submit smoke checks against $BASE_URL"

run_check "health" GET "/health" "" 200
run_check "oauth protected resource metadata" GET "/.well-known/oauth-protected-resource" "" 200
run_check "legal notice" GET "/api/legal/notice" "" 200

init_payload='{"jsonrpc":"2.0","id":"smoke-init-1","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"pre-submit-smoke","version":"1.0.0"}}}'
init_res="$(curl_json POST "/mcp" "$init_payload")"
init_status="${init_res%%|*}"
init_file="${init_res##*|}"
expect_status "$init_status" "200" "mcp initialize"
if contains_text "$init_file" '"error"'; then
  echo "ERROR: mcp initialize returned error"
  cat "$init_file"
  rm -f "$init_file"
  exit 1
fi
rm -f "$init_file"

auth_probe_payload='{"user_id":"smoke-user","preferences":{"gender":"random","age":28,"zodiac":"random","mbti":"random"},"legal_consent":{"accepted":true,"allow_ai_media":true,"allow_screenshot_analysis":true}}'
auth_probe="$(curl_json POST "/api/onboard" "$auth_probe_payload")"
auth_probe_status="${auth_probe%%|*}"
auth_probe_file="${auth_probe##*|}"

if [[ -n "$AUTH_TOKEN" ]]; then
  expect_status "$auth_probe_status" "200" "onboard (authenticated)"

  capture_payload='{"user_id":"smoke-user","message":"I like morning walks and documentaries.","mood":"good"}'
  run_check "capture message" POST "/api/conversation/capture" "$capture_payload" 200

  voice_payload='{"user_id":"smoke-user","text":"Hello from your companion.","format":"mp3"}'
  voice_res="$(curl_json POST "/api/voice/speak" "$voice_payload")"
  voice_status="${voice_res%%|*}"
  voice_file="${voice_res##*|}"
  expect_status "$voice_status" "200" "voice generation"
  if ! contains_text "$voice_file" "AI-generated"; then
    echo "ERROR: voice response missing AI disclosure"
    cat "$voice_file"
    rm -f "$voice_file"
    exit 1
  fi
  rm -f "$voice_file"
else
  if [[ "$auth_probe_status" == "401" ]]; then
    echo "OK: onboard unauthenticated is blocked (401)"
  elif [[ "$auth_probe_status" == "200" ]]; then
    echo "WARN: onboard succeeded without auth token. Confirm REQUIRE_OAUTH_ACCOUNT_BINDING=true in production."
  else
    echo "ERROR: unexpected onboard status without auth token: $auth_probe_status"
    cat "$auth_probe_file"
    rm -f "$auth_probe_file"
    exit 1
  fi
fi
rm -f "$auth_probe_file"

echo "Pre-submit smoke checks completed."
