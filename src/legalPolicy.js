const TERMS_VERSION = "2026-02-22";
const PRIVACY_VERSION = "2026-02-22";
const CONSENT_VERSION = "2026-02-22";

function defaultLegalState() {
  return {
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    consent_version: CONSENT_VERSION,
    accepted: false,
    accepted_at_iso: null,
    accepted_ip_hash: null,
    allow_ai_media: false,
    allow_screenshot_analysis: false
  };
}

function getLegalNotice() {
  return {
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    consent_version: CONSENT_VERSION,
    notices: [
      "This is an AI companion and not a human person.",
      "This app is designed for general audiences.",
      "Explicit sexual content is not supported.",
      "Content is for conversation and entertainment, not medical, legal, or mental health advice.",
      "Voice, images, and generated media are AI-generated.",
      "Screenshot analysis only happens for user-provided screenshots with explicit consent."
    ]
  };
}

function hashIp(value) {
  if (!value) return null;
  const text = String(value);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) % 2147483647;
  }
  return `ip_${Math.abs(hash)}`;
}

function recordConsent(currentLegalState, input = {}) {
  const now = new Date().toISOString();
  const accepted = input.accepted === true;
  if (!accepted) {
    return {
      ...(currentLegalState || defaultLegalState()),
      accepted: false
    };
  }

  return {
    ...(currentLegalState || defaultLegalState()),
    accepted: true,
    accepted_at_iso: now,
    accepted_ip_hash: hashIp(input.ip_address || ""),
    allow_ai_media: input.allow_ai_media === true,
    allow_screenshot_analysis: input.allow_screenshot_analysis === true
  };
}

function assertLegalPermission(record, feature) {
  const requireConsent = String(process.env.REQUIRE_LEGAL_CONSENT || "true") !== "false";
  const legal = record?.legal || defaultLegalState();

  if (!requireConsent) {
    return;
  }
  if (!legal.accepted) {
    throw new Error("legal consent required");
  }
  if (feature === "ai_media" && !legal.allow_ai_media) {
    throw new Error("ai media consent required");
  }
  if (feature === "screenshot" && !legal.allow_screenshot_analysis) {
    throw new Error("screenshot analysis consent required");
  }
}

module.exports = {
  defaultLegalState,
  getLegalNotice,
  recordConsent,
  assertLegalPermission
};
