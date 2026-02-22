const EXPLICIT_CONTENT_PATTERN =
  /\b(sex|sexual|explicit|erotic|porn|nude|naked|fetish|bdsm|roleplay sex|nsfw)\b/i;
const SEVERE_ABUSE_PATTERN =
  /\b(stupid|idiot|worthless|hate you|shut up|bitch|slut|kill yourself)\b/i;

function mustString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assessMessageSafety(text) {
  const safeText = mustString(text) ? text : "";
  const explicit = EXPLICIT_CONTENT_PATTERN.test(safeText);
  const abusive = SEVERE_ABUSE_PATTERN.test(safeText);

  return {
    blocked: explicit,
    explicit,
    abusive,
    reasons: [
      ...(explicit ? ["explicit_content_not_supported"] : []),
      ...(abusive ? ["abusive_language_detected"] : [])
    ]
  };
}

module.exports = { assessMessageSafety };
