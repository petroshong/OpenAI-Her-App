# Legal and Safety Controls Implemented

## Consent model

- `GET /api/legal/notice` returns required disclosures.
- `POST /api/legal/consent` stores user consent flags:
  - `accepted`
  - `allow_ai_media`
  - `allow_screenshot_analysis`
- `REQUIRE_LEGAL_CONSENT=true` enforces consent before memory/media workflows.
- Adult-only gate: user must confirm `18+` (`user_is_adult=true`) when consenting.

## Account binding

- `REQUIRE_OAUTH_ACCOUNT_BINDING=true` can require authenticated account identity.
- Canonical memory identity resolves from auth token subject instead of free-form `user_id`.
- OAuth token verification supports JWKS-based JWT validation.

## Screenshot privacy controls

- Screenshot analysis requires both:
  - user-level consent (`allow_screenshot_analysis`)
  - per-request explicit flag (`explicit_consent=true`)
- No hidden/continuous monitoring behavior exists.

## Relationship boundaries

- Relationship starts at `acquaintance`.
- Repeated disrespect or abuse can:
  - reduce trust
  - increase resentment
  - demote stage
  - require repair before progression resumes

## Content controls

- Explicit sexual content is blocked.
- Abusive language impacts relationship outcomes.
- Voice output includes AI disclosure.

## Production recommendations

- Add authentication before launch.
- Hash and minimize stored personal data.
- Add abuse monitoring and audit logs.
- Publish privacy policy and terms on verified domain before app submission.
