# Relationship Companion App Kit (ChatGPT)

This repo now includes a submission-oriented OpenAI Apps SDK MCP server plus supporting API logic for:

- Companion profile setup (`gender`, `age 21-80`, `zodiac`, `MBTI`, random options)
- Autonomous persona mode (no manual setup required; companion self-selects and introduces itself)
- General-audience-safe consent and disclosure flow
- Multi-factor trust progression (`acquaintance` to `lifelong_ally`)
- Persistent memory record per user (local JSON store for development; replace in production)
- Avatar image prompt + generated image output
- Voice synthesis + voice transcription
- Deep personalization memory (likes, dislikes, favorites, values, nickname, communication preferences)
- Memory recall tool for context retrieval from prior episodes/preferences
- Stage-aware deep conversation planning tied to known preferences
- Consent-gated screenshot analysis (only user-submitted screenshots with explicit consent)
- AI video generation workflows (queued status + retrieval endpoints)
- Legal consent and disclosure flow for safer deployment
- OAuth account binding support so memory can be tied to authenticated account identity
- Apps SDK-compatible MCP endpoint (`/mcp`) with tool metadata and resource CSP/domain metadata

## Project layout

- `/Users/petroshong/Desktop/Personality on ChatGPT/prompts/system_companion.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/prompts/onboarding_flow.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/schemas/user_preferences.schema.json`
- `/Users/petroshong/Desktop/Personality on ChatGPT/schemas/relationship_state.schema.json`
- `/Users/petroshong/Desktop/Personality on ChatGPT/schemas/personalization_state.schema.json`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/personalityEngine.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/avatarPromptBuilder.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/personalizationEngine.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/authIdentity.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/legalPolicy.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/safetyPolicy.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/mediaService.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/companionService.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/server.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/mcpServer.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/src/demoFlow.js`
- `/Users/petroshong/Desktop/Personality on ChatGPT/actions/openapi.yaml`
- `/Users/petroshong/Desktop/Personality on ChatGPT/docs/apps_sdk_submission.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/docs/deploy_and_submit.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/docs/legal_controls.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/docs/privacy_policy_template.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/docs/terms_of_service_template.md`
- `/Users/petroshong/Desktop/Personality on ChatGPT/docs/submission_checklist.md`

## Local setup

1. Install dependencies:

```bash
cd "/Users/petroshong/Desktop/Personality on ChatGPT"
npm install
```

2. Configure environment:

```bash
cp "/Users/petroshong/Desktop/Personality on ChatGPT/.env.example" "/Users/petroshong/Desktop/Personality on ChatGPT/.env"
```

3. Set required values in `.env`:

- `OPENAI_API_KEY`
- `APP_PUBLIC_BASE_URL` (public HTTPS origin of your deployed app backend)
- `APP_WIDGET_DOMAIN` (unique dedicated domain for widget assets)
- `MCP_ALLOWED_ORIGINS` and `MCP_ALLOWED_HOSTS` (restrict requests to expected origins/hosts)
- `REQUIRE_LEGAL_CONSENT` (`true` recommended for production)
- OAuth verification envs (`REQUIRE_OAUTH_ACCOUNT_BINDING`, `OAUTH_JWKS_URI`, `OAUTH_ISSUER`, `OAUTH_AUDIENCE`)

4. Run MCP server (default start command):

```bash
npm start
```

5. (Optional) Run REST API compatibility server:

```bash
npm run start:api
```

6. (Optional) Run progression demo:

```bash
npm run demo
```

## MCP endpoint

- `POST /mcp` for initialize and command requests
- `GET /mcp` for stream/session requests
- `DELETE /mcp` for session termination
- `GET /health` for health checks

Registered MCP tools:

- `companion.create_profile`
- `companion.legal_notice`
- `companion.set_legal_consent`
- `companion.legal_state`
- `companion.get_memory`
- `companion.update_relationship`
- `companion.upsert_memory`
- `companion.capture_message`
- `companion.personalization_snapshot`
- `companion.deep_conversation_plan`
- `companion.memory_recall`
- `companion.avatar_prompt`
- `companion.generate_avatar`
- `companion.analyze_screenshot`
- `companion.generate_voice`
- `companion.transcribe_voice`
- `companion.generate_video`
- `companion.video_status`
- `companion.video_content`

The MCP server includes Apps SDK metadata such as:

- security scheme declarations mirrored into `_meta`
- `annotations` hints (`readOnlyHint`, `destructiveHint`, `openWorldHint`, `idempotentHint`)
- resource `ui.csp` and `ui.domain`

## Relationship progression model

State dimensions:

- `trust`
- `intimacy`
- `commitment`
- `conflict_resilience`
- `boundaries_respected`
- `attunement`
- `shared_history`
- `resentment`
- `respect_violations`
- `repair_needed`

Stages:

1. `acquaintance`
2. `friend`
3. `close_friend`
4. `trusted_companion`
5. `inner_circle`
6. `lifelong_ally`

Promotions require weighted score growth, respectful behavior, and consistency. Stage skipping is blocked. Repeated disrespect can demote stages and force repair.

## Personalization model

Stored personalization includes:

- User likes/dislikes with confidence scoring
- Favorites by category (for example favorite music/food/hobby)
- Stated values and communication preferences
- Conversation episodes and open follow-up loops
- Companion-owned stable preferences and favorites

Use `companion.capture_message` after important user messages to keep memory accurate.

## Video availability note

Video APIs are account/region dependent. If unavailable, video endpoints return a clear capability error.

## Safety baseline

- Companion profile age is restricted to `21-80`.
- App behavior is designed to be general-audience-safe.
- Mature/explicit content is blocked in relationship memory updates.
- Screenshot analysis requires user consent and explicit per-request confirmation.
- Voice output includes AI-generated disclosure.
- Dependency-inducing language patterns are disallowed in prompts.
