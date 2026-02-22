#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE"
  exit 1
fi

get_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  echo "$value"
}

required_keys=(
  OPENAI_API_KEY
  APP_PUBLIC_BASE_URL
  APP_WIDGET_DOMAIN
  MCP_ALLOWED_ORIGINS
  MCP_ALLOWED_HOSTS
  REQUIRE_LEGAL_CONSENT
  REQUIRE_OAUTH_ACCOUNT_BINDING
  AUTH_VERIFY_JWT
  OAUTH_JWKS_URI
  OAUTH_ISSUER
  OAUTH_AUDIENCE
)

fail=0
for key in "${required_keys[@]}"; do
  value="$(get_value "$key")"
  if [[ -z "$value" ]]; then
    echo "ERROR: missing $key"
    fail=1
  fi
done

check_not_placeholder() {
  local key="$1"
  local bad="$2"
  local value
  value="$(get_value "$key")"
  if [[ "$value" == *"$bad"* ]]; then
    echo "ERROR: $key still contains placeholder: $bad"
    fail=1
  fi
}

check_not_placeholder APP_PUBLIC_BASE_URL your-app.example.com
check_not_placeholder APP_WIDGET_DOMAIN your-unique-widget.example.com
check_not_placeholder OAUTH_JWKS_URI your-auth.example.com
check_not_placeholder OAUTH_ISSUER your-auth.example.com
check_not_placeholder OAUTH_AUDIENCE your-app.example.com

if [[ "$(get_value REQUIRE_OAUTH_ACCOUNT_BINDING)" != "true" ]]; then
  echo "WARN: REQUIRE_OAUTH_ACCOUNT_BINDING is not true"
fi
if [[ "$(get_value REQUIRE_LEGAL_CONSENT)" != "true" ]]; then
  echo "WARN: REQUIRE_LEGAL_CONSENT is not true"
fi
if [[ "$(get_value AUTH_VERIFY_JWT)" != "true" ]]; then
  echo "WARN: AUTH_VERIFY_JWT is not true"
fi

if [[ $fail -ne 0 ]]; then
  exit 1
fi

echo "OK: production env validation passed for $ENV_FILE"
