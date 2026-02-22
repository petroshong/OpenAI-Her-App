const { createRemoteJWKSet, decodeJwt, jwtVerify } = require("jose");

const DEFAULT_SCOPES = [
  "companion.read",
  "companion.write",
  "media.generate",
  "screen.read"
];

function boolEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return String(raw).toLowerCase() === "true";
}

function requiresAccountBinding() {
  return boolEnv("REQUIRE_OAUTH_ACCOUNT_BINDING", true);
}

function shouldVerifyJwt() {
  return boolEnv("AUTH_VERIFY_JWT", true);
}

function getOAuthScopes() {
  const raw = process.env.OAUTH_REQUIRED_SCOPES || "";
  const scopes = raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return scopes.length > 0 ? scopes : DEFAULT_SCOPES;
}

function extractBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  if (!header || !String(header).startsWith("Bearer ")) {
    return null;
  }
  return String(header).slice("Bearer ".length).trim();
}

function parseScopes(payload) {
  const scopeString =
    payload?.scope || payload?.scp || payload?.permissions || payload?.scopes;
  if (!scopeString) return [];
  if (Array.isArray(scopeString)) return scopeString.map((x) => String(x));
  return String(scopeString)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function verifyJwtToken(token) {
  const jwksUri = process.env.OAUTH_JWKS_URI;
  const issuer = process.env.OAUTH_ISSUER;
  const audience = process.env.OAUTH_AUDIENCE || process.env.APP_PUBLIC_BASE_URL;

  if (!jwksUri) {
    throw new Error("OAUTH_JWKS_URI missing for JWT verification");
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const options = {};
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  const verified = await jwtVerify(token, jwks, options);
  const payload = verified.payload || {};
  if (!payload.sub) {
    throw new Error("token missing sub claim");
  }
  return {
    subject: String(payload.sub),
    scopes: parseScopes(payload),
    payload
  };
}

async function resolveAuthContext(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      authenticated: false,
      subject: null,
      scopes: [],
      token_present: false
    };
  }

  if (shouldVerifyJwt()) {
    const verified = await verifyJwtToken(token);
    return {
      authenticated: true,
      subject: verified.subject,
      scopes: verified.scopes,
      token_present: true
    };
  }

  const payload = decodeJwt(token);
  return {
    authenticated: !!payload?.sub,
    subject: payload?.sub ? String(payload.sub) : null,
    scopes: parseScopes(payload),
    token_present: true
  };
}

function resolveCanonicalUserId(inputUserId, authSubject) {
  if (requiresAccountBinding()) {
    if (!authSubject) {
      throw new Error("authenticated ChatGPT account required");
    }
    return authSubject;
  }
  if (authSubject) return authSubject;
  return inputUserId;
}

function getResourceMetadataUrl(baseUrl) {
  return `${String(baseUrl || "").replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
}

function buildWwwAuthenticate(baseUrl, errorDescription) {
  const resourceMetadata = getResourceMetadataUrl(baseUrl);
  const scope = getOAuthScopes().join(" ");
  const escaped = String(errorDescription || "Authentication required").replace(/"/g, "'");
  return `Bearer resource_metadata="${resourceMetadata}", error="insufficient_scope", error_description="${escaped}", scope="${scope}"`;
}

function buildOAuthResourceMetadata(baseUrl) {
  const resource = String(baseUrl || "").replace(/\/$/, "");
  const authServers = (process.env.OAUTH_AUTHORIZATION_SERVERS || process.env.OAUTH_ISSUER || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    resource,
    authorization_servers: authServers,
    scopes_supported: getOAuthScopes()
  };
}

function getToolSecuritySchemes() {
  const oauthScheme = { type: "oauth2", scopes: getOAuthScopes() };
  if (requiresAccountBinding()) {
    return [oauthScheme];
  }
  return [{ type: "noauth" }, oauthScheme];
}

module.exports = {
  requiresAccountBinding,
  getToolSecuritySchemes,
  getResourceMetadataUrl,
  buildOAuthResourceMetadata,
  buildWwwAuthenticate,
  resolveAuthContext,
  resolveCanonicalUserId
};
