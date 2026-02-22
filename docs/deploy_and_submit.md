# Deploy and Submit (MCP App)

## 1. Deploy backend

1. Deploy `/Users/petroshong/Desktop/Personality on ChatGPT/src/mcpServer.js` to a public HTTPS host.
2. Configure env vars:
   - `OPENAI_API_KEY`
   - `PORT`
   - `APP_PUBLIC_BASE_URL`
   - `APP_WIDGET_DOMAIN`
   - `MCP_ALLOWED_ORIGINS`
   - `MCP_ALLOWED_HOSTS`
   - `REQUIRE_LEGAL_CONSENT`
   - `REQUIRE_OAUTH_ACCOUNT_BINDING`
   - `OAUTH_JWKS_URI`
   - `OAUTH_ISSUER`
   - `OAUTH_AUDIENCE`
   - `OPENAI_VIDEO_MODEL`
3. Confirm health:
   - `GET https://<your-domain>/health` returns `ok: true`
4. Confirm MCP endpoint:
   - `POST https://<your-domain>/mcp` accepts initialize request.
5. Confirm OAuth protected resource metadata:
   - `GET https://<your-domain>/.well-known/oauth-protected-resource`

## 2. Builder configuration

1. In ChatGPT app builder, connect MCP server URL `https://<your-domain>/mcp`.
2. Configure app name/icon/description/support contact.
3. Add privacy policy URL.
4. Test each tool flow:
   - legal notice + legal consent
   - adult confirmation (18+) path
   - create profile
   - capture message (learn likes/dislikes/favorites)
   - personalization snapshot
   - memory recall
   - deep conversation plan
   - update relationship
   - avatar generation
   - screenshot analysis (explicit consent required)
   - voice generation + disclosure
   - voice transcription
   - video generate + status + content

## 3. Final pre-submit checks

1. Verify there are no dead-end actions or broken links.
2. Ensure mature explicit content is blocked.
3. Ensure disrespect can reduce trust and demote stage.
4. Ensure only production domains are used.
5. Ensure CSP domains are exact and minimal.
6. Confirm one version at a time is in review.

## 4. Submit

Use the Apps SDK submission flow:

- https://developers.openai.com/apps-sdk/deploy/submission
