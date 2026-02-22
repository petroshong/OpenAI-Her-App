# OpenAI Apps Directory Submission Checklist

Reference: https://developers.openai.com/apps-sdk/deploy/submission

## Account and ownership

- [ ] Organization verified in OpenAI dashboard
- [ ] Submission actor has role `Owner`
- [ ] Name and icon selected and aligned with app function
- [ ] Support contact email is valid and monitored

## Hosting and connectivity

- [ ] MCP endpoint is public over HTTPS (no localhost / ngrok test URL)
- [ ] API base domain in `APP_PUBLIC_BASE_URL` is production domain
- [ ] Widget domain in `APP_WIDGET_DOMAIN` is unique and dedicated
- [ ] Privacy policy URL is publicly accessible on verified domain
- [ ] Terms of service URL is publicly accessible
- [ ] OAuth/JWT verification is configured (`OAUTH_JWKS_URI`, issuer, audience)

## MCP/server quality

- [ ] Tools have clear names and action-oriented descriptions
- [ ] Tool `annotations` are present and accurate
- [ ] `securitySchemes` are present and mirrored in `_meta`
- [ ] Resource `_meta.ui.csp` uses exact allowlisted domains
- [ ] Resource `_meta.ui.domain` is set to dedicated widget domain
- [ ] Tool outputs are minimal and directly relevant (no oversized payloads by default)
- [ ] App has no broken links, dead-end flows, or consistent crashes

## Safety and policy

- [ ] App access is restricted to adults (18+) through consent gating
- [ ] App avoids mature/explicit sexual content
- [ ] Abuse protections exist for unsafe user input
- [ ] Voice output discloses AI generation
- [ ] Screenshot analysis is consent-gated and only user-initiated
- [ ] Memory identity is bound to authenticated account subject
- [ ] App does not include ads or in-chat billing prompts

## Review flow

- [ ] Only one version in review at a time
- [ ] New draft created for post-submission fixes
- [ ] Final smoke test completed with fresh account
