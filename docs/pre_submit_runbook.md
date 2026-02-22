# Pre-Submit Runbook

Use this on launch day before submitting in ChatGPT Apps.

## 1) Prepare production env

1. Copy template:

```bash
cp .env.production.example .env.production
```

2. Fill in real production values (no placeholders).

3. Validate env file:

```bash
bash ./scripts/verify_production_env.sh ./.env.production
```

## 2) Deploy and configure app builder

1. Deploy `src/mcpServer.js` to public HTTPS.
2. Set env vars from `.env.production` on the host.
3. In ChatGPT Apps builder, connect MCP URL:

```text
https://<your-domain>/mcp
```

## 3) Smoke test deployed app

Without auth token (checks public endpoints and auth enforcement):

```bash
BASE_URL=https://<your-domain> bash ./scripts/pre_submit_smoke.sh
```

With auth token (checks onboarding, capture, and voice disclosure):

```bash
BASE_URL=https://<your-domain> AUTH_TOKEN=<bearer-token> bash ./scripts/pre_submit_smoke.sh
```

## 4) Submission checklist

1. Confirm all items in `docs/submission_checklist.md` are complete.
2. Confirm Privacy Policy and Terms URLs are public and reachable.
3. Confirm only one version is in review.
4. Submit via:
   - https://developers.openai.com/apps-sdk/deploy/submission
