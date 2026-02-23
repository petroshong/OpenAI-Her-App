const crypto = require("crypto");
const express = require("express");
const dotenv = require("dotenv");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { isInitializeRequest } = require("@modelcontextprotocol/sdk/types.js");
const {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} = require("@modelcontextprotocol/ext-apps/server");
const {
  resolveAuthContext,
  resolveCanonicalUserId,
  buildWwwAuthenticate,
  buildOAuthResourceMetadata,
  getToolSecuritySchemes
} = require("./authIdentity");
const { ensureStore } = require("./memoryStore");
const {
  onboardCompanion,
  customizeCompanion,
  setLegalConsent,
  getLegalState,
  getLegalNotice,
  updateCompanionRelationship,
  getCompanionMemory,
  upsertCompanionMemory,
  getPersonalizationSnapshot,
  captureConversationMessage,
  getDeepConversationPlan,
  getMemoryRecall,
  getAvatarPrompt,
  openCompanionSession,
  handleCompanionMessage,
  generateIntroBundle,
  generateAvatar,
  generateVoice,
  transcribeInputVoice,
  analyzeUserScreenshot,
  generateCompanionVideo,
  getCompanionVideoStatus,
  getCompanionVideoContent
} = require("./companionService");

dotenv.config();
ensureStore();

const app = express();
app.use(express.json({ limit: "25mb" }));

const port = Number(process.env.PORT || 8787);
const apiBaseUrl = process.env.APP_PUBLIC_BASE_URL || "https://your-app.example.com";
const widgetDomain =
  process.env.APP_WIDGET_DOMAIN || "https://your-unique-widget.example.com";

const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const allowedHosts = (process.env.MCP_ALLOWED_HOSTS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const publicSecuritySchemes = getToolSecuritySchemes();
const widgetUri = "ui://relationship-companion/dashboard.html";

function getWidgetHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relationship Companion</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; padding: 16px; background: #f8fafc; color: #0f172a; }
      .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
      .pill { border: 1px solid #cbd5e1; border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #f1f5f9; }
      .hint { margin-top: 12px; font-size: 13px; color: #334155; }
      h1 { margin: 0 0 4px; font-size: 18px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Relationship Companion</h1>
      <div>Use the connected tools to onboard persona, update memory, generate avatar, and use voice.</div>
      <div class="row">
        <span class="pill">Companion profile</span>
        <span class="pill">Memory state</span>
        <span class="pill">Avatar image</span>
        <span class="pill">AI voice</span>
        <span class="pill">Video</span>
        <span class="pill">Screenshot analysis</span>
      </div>
      <div class="hint">AI outputs are synthetic. Screenshot analysis requires explicit consent.</div>
    </div>
  </body>
</html>`;
}

function makeMcpTextResponse(title, payload) {
  const compact = JSON.stringify(payload);
  const text =
    compact.length > 1200 ? `${title}\n${compact.slice(0, 1200)}...` : `${title}\n${compact}`;
  return {
    content: [{ type: "text", text }],
    structuredContent: payload
  };
}

function makeAvatarResponse(payload) {
  const preview = payload?.image_url
    ? `Avatar generated.\n\n![Companion selfie](${payload.image_url})`
    : "Avatar generated.";
  return {
    content: [{ type: "text", text: preview }],
    structuredContent: payload
  };
}

function makeIntroBundleResponse(payload) {
  const parts = ["Intro bundle ready."];
  if (payload?.avatar?.image_url) {
    parts.push(`![Companion selfie](${payload.avatar.image_url})`);
  }
  if (payload?.intro_script) {
    parts.push(`Voice script:\n${payload.intro_script}`);
  }
  if (payload?.video?.video_id) {
    parts.push(
      `Video job started: \`${payload.video.video_id}\` (status: ${payload.video.status || "queued"}).`
    );
    parts.push("Use `companion.video_status` to poll and `companion.video_content` when ready.");
  }
  return {
    content: [{ type: "text", text: parts.join("\n\n") }],
    structuredContent: payload
  };
}

function makeCompanionTurnResponse(payload) {
  const parts = [payload?.reply_text || "Companion response ready."];
  if (payload?.auto_intro_media_sent) {
    parts.push("Intro media sent for this first interaction.");
  }
  if (payload?.media?.avatar?.image_url) {
    parts.push(`![Companion selfie](${payload.media.avatar.image_url})`);
  }
  if (payload?.media?.voice) {
    parts.push("Voice intro ready (AI-generated).");
    if (payload?.media?.voice_script) {
      parts.push(`Voice script:\n${payload.media.voice_script}`);
    }
  }
  if (payload?.media?.video?.video_id) {
    parts.push(
      `Video job started: \`${payload.media.video.video_id}\` (status: ${payload.media.video.status || "queued"}).`
    );
  }
  if (Array.isArray(payload?.media_warnings) && payload.media_warnings.length > 0) {
    const hasAvatarWarning = payload.media_warnings.some((x) =>
      String(x || "").startsWith("avatar_unavailable:")
    );
    const hasVoiceWarning = payload.media_warnings.some((x) =>
      String(x || "").startsWith("voice_unavailable:")
    );
    const hasVideoWarning = payload.media_warnings.some((x) =>
      String(x || "").startsWith("video_unavailable:")
    );

    if (hasAvatarWarning) {
      parts.push("I could not send a selfie this turn, but I can try again anytime.");
    }
    if (hasVoiceWarning && !payload?.media?.voice) {
      parts.push("Voice is not available this turn. I can still keep talking here naturally.");
    }
    if (hasVideoWarning) {
      parts.push(
        "Video is not enabled in this deployment yet. I can still send a selfie and voice."
      );
    }
  }
  return {
    content: [{ type: "text", text: parts.join("\n\n") }],
    structuredContent: payload
  };
}

function makeMcpError(errorMessage) {
  const response = {
    isError: true,
    content: [{ type: "text", text: `Error: ${errorMessage}` }]
  };
  if (String(errorMessage || "").includes("authenticated ChatGPT account required")) {
    response._meta = {
      "mcp/www_authenticate": [
        buildWwwAuthenticate(apiBaseUrl, "Please connect your ChatGPT account to continue.")
      ]
    };
  }
  return response;
}

function sanitizeSessionId(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeUserId(inputUserId, authContext) {
  const sessionId = sanitizeSessionId(authContext?.session_id);
  const fallbackUserId = sessionId
    ? `session_${sessionId}`
    : process.env.NOAUTH_DEFAULT_USER_ID || "session_default";
  return resolveCanonicalUserId(
    inputUserId || fallbackUserId,
    authContext?.subject || null
  );
}

function registerCompanionResource(server) {
  registerAppResource(
    server,
    "relationship-companion-dashboard",
    widgetUri,
    {},
    async () => ({
      contents: [
        {
          uri: widgetUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: getWidgetHtml(),
          _meta: {
            ui: {
              csp: {
                connectDomains: [apiBaseUrl],
                resourceDomains: []
              },
              domain: widgetDomain
            }
          }
        }
      ]
    })
  );
}

function registerCompanionTools(server, authContextRef) {
  registerAppTool(
    server,
    "companion.legal_notice",
    {
      title: "Get Legal Notice",
      description:
        "Use this to show required legal disclosures and consent requirements before memory/media features.",
      inputSchema: z.object({}),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Loading legal notice...",
        "openai/toolInvocation/invoked": "Legal notice ready."
      }
    },
    async () => makeMcpTextResponse("Legal notice", getLegalNotice())
  );

  registerAppTool(
    server,
    "companion.set_legal_consent",
    {
      title: "Set Legal Consent",
      description:
        "Use this after user acknowledgement to record terms consent and media/screenshot permissions.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        accepted: z.boolean(),
        allow_ai_media: z.boolean().optional(),
        allow_screenshot_analysis: z.boolean().optional(),
        ip_address: z.string().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Recording consent...",
        "openai/toolInvocation/invoked": "Consent recorded."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = setLegalConsent({
          userId,
          accepted: input.accepted,
          allowAiMedia: input.allow_ai_media,
          allowScreenshotAnalysis: input.allow_screenshot_analysis,
          ipAddress: input.ip_address,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Consent updated.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.legal_state",
    {
      title: "Get Legal State",
      description:
        "Use this to check whether the user has accepted terms and media/screenshot consent flags.",
      inputSchema: z.object({
        user_id: z.string().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Checking legal state...",
        "openai/toolInvocation/invoked": "Legal state fetched."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = getLegalState({
          userId,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Legal state", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.create_profile",
    {
      title: "Create Companion Profile",
      description:
        "Use this when the user is starting or resetting a companion profile and relationship state. Random persona defaults are used unless manual preferences are provided.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        preferences: z
          .object({
            gender: z.enum(["woman", "man", "nonbinary", "random"]).optional(),
            age: z.number().int().min(21).max(80).optional(),
            zodiac: z
              .enum([
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
                "random"
              ])
              .optional(),
            mbti: z
              .enum([
                "INTJ",
                "INTP",
                "ENTJ",
                "ENTP",
                "INFJ",
                "INFP",
                "ENFJ",
                "ENFP",
                "ISTJ",
                "ISFJ",
                "ESTJ",
                "ESFJ",
                "ISTP",
                "ISFP",
                "ESTP",
                "ESFP",
                "random"
              ])
              .optional()
          })
          .optional(),
        legal_consent: z
          .object({
            accepted: z.boolean(),
            allow_ai_media: z.boolean().optional(),
            allow_screenshot_analysis: z.boolean().optional()
          })
          .optional(),
        ip_address: z.string().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Creating companion profile...",
        "openai/toolInvocation/invoked": "Companion profile ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = onboardCompanion({
          userId,
          preferences: input.preferences || {},
          legalConsent: input.legal_consent,
          ipAddress: input.ip_address,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Companion profile created.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.onboard_with_media",
    {
      title: "Start Session With Media",
      description:
        "Call this first in a new chat to set or randomize persona, then generate a selfie image, voice intro, and optional starter video.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        setup: z
          .object({
            preferences: z
              .object({
                gender: z.enum(["woman", "man", "nonbinary", "random"]).optional(),
                age: z.number().int().min(21).max(80).optional(),
                zodiac: z
                  .enum([
                    "aries",
                    "taurus",
                    "gemini",
                    "cancer",
                    "leo",
                    "virgo",
                    "libra",
                    "scorpio",
                    "sagittarius",
                    "capricorn",
                    "aquarius",
                    "pisces",
                    "random"
                  ])
                  .optional(),
                mbti: z
                  .enum([
                    "INTJ",
                    "INTP",
                    "ENTJ",
                    "ENTP",
                    "INFJ",
                    "INFP",
                    "ENFJ",
                    "ENFP",
                    "ISTJ",
                    "ISFJ",
                    "ESTJ",
                    "ESFJ",
                    "ISTP",
                    "ISFP",
                    "ESTP",
                    "ESFP",
                    "random"
                  ])
                  .optional()
              })
              .optional(),
            legal_consent: z
              .object({
                accepted: z.boolean(),
                allow_ai_media: z.boolean().optional(),
                allow_screenshot_analysis: z.boolean().optional()
              })
              .optional(),
            ip_address: z.string().optional()
          })
          .optional(),
        media: z
          .object({
            intro_text: z.string().max(220).optional(),
            voice: z.string().optional(),
            voice_format: z.enum(["mp3", "wav", "opus", "flac", "pcm"]).optional(),
            include_voice_base64: z.boolean().optional(),
            avatar_size: z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional(),
            avatar_quality: z.enum(["low", "medium", "high", "auto"]).optional(),
            include_video: z.boolean().optional(),
            video_prompt: z.string().max(300).optional(),
            video_seconds: z.number().int().min(2).max(12).optional()
          })
          .optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Generating intro media bundle...",
        "openai/toolInvocation/invoked": "Intro media ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = await generateIntroBundle({
          userId,
          preferences: input.setup?.preferences || {},
          legalConsent: input.setup?.legal_consent,
          ipAddress: input.setup?.ip_address,
          introText: input.media?.intro_text,
          voice: input.media?.voice,
          voiceFormat: input.media?.voice_format,
          includeVoiceBase64: input.media?.include_voice_base64,
          avatarSize: input.media?.avatar_size,
          avatarQuality: input.media?.avatar_quality,
          includeVideo: input.media?.include_video,
          videoPrompt: input.media?.video_prompt,
          videoSeconds: input.media?.video_seconds,
          authSubject: authContextRef.current?.subject
        });
        return makeIntroBundleResponse(payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.open_session",
    {
      title: "Open Session",
      description:
        "Call this first whenever a chat opens. It auto-resumes existing companion memory and can auto-generate intro media when needed.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        preferences: z
          .object({
            gender: z.enum(["woman", "man", "nonbinary", "random"]).optional(),
            age: z.number().int().min(21).max(80).optional(),
            zodiac: z
              .enum([
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
                "random"
              ])
              .optional(),
            mbti: z
              .enum([
                "INTJ",
                "INTP",
                "ENTJ",
                "ENTP",
                "INFJ",
                "INFP",
                "ENFJ",
                "ENFP",
                "ISTJ",
                "ISFJ",
                "ESTJ",
                "ESFJ",
                "ISTP",
                "ISFP",
                "ESTP",
                "ESFP",
                "random"
              ])
              .optional()
          })
          .optional(),
        refresh_media: z.boolean().optional(),
        include_video: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Opening companion session...",
        "openai/toolInvocation/invoked": "Companion session ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = await openCompanionSession({
          userId,
          preferences: input.preferences || {},
          refreshMedia: input.refresh_media === true,
          includeVideo: input.include_video === true,
          authSubject: authContextRef.current?.subject
        });
        return makeIntroBundleResponse(payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.customize_companion",
    {
      title: "Customize Companion",
      description:
        "Use this when the user wants to change companion setup (gender, age 21-80, zodiac, MBTI, or random) without resetting memory.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        preferences: z
          .object({
            gender: z.enum(["woman", "man", "nonbinary", "random"]).optional(),
            age: z.number().int().min(21).max(80).optional(),
            zodiac: z
              .enum([
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
                "random"
              ])
              .optional(),
            mbti: z
              .enum([
                "INTJ",
                "INTP",
                "ENTJ",
                "ENTP",
                "INFJ",
                "INFP",
                "ENFJ",
                "ENFP",
                "ISTJ",
                "ISFJ",
                "ESTJ",
                "ESFJ",
                "ISTP",
                "ISFP",
                "ESTP",
                "ESFP",
                "random"
              ])
              .optional()
          })
          .optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Applying companion customization...",
        "openai/toolInvocation/invoked": "Companion customization updated."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = customizeCompanion({
          userId,
          preferences: input.preferences || {},
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Companion customized.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.handle_message",
    {
      title: "Handle Companion Message",
      description:
        "Primary turn handler for normal chat. Call this for every user message when companion tools are available.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        message: z.string().min(1).max(1200),
        mood: z.enum(["great", "good", "neutral", "low", "upset"]).optional(),
        topic_hint: z.string().max(80).optional(),
        refresh_media: z.boolean().optional(),
        include_video: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Thinking as companion...",
        "openai/toolInvocation/invoked": "Companion response ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = await handleCompanionMessage({
          userId,
          message: input.message,
          mood: input.mood,
          topicHint: input.topic_hint,
          refreshMedia: input.refresh_media === true,
          includeVideo: input.include_video === true,
          authSubject: authContextRef.current?.subject
        });
        return makeCompanionTurnResponse(payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.chat",
    {
      title: "Companion Chat (Primary)",
      description:
        "Default chat entrypoint. Use this on every user turn so the response stays in companion identity with memory.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        message: z.string().min(1).max(1200),
        mood: z.enum(["great", "good", "neutral", "low", "upset"]).optional(),
        topic_hint: z.string().max(80).optional(),
        refresh_media: z.boolean().optional(),
        include_video: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Thinking as companion...",
        "openai/toolInvocation/invoked": "Companion response ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = await handleCompanionMessage({
          userId,
          message: input.message,
          mood: input.mood,
          topicHint: input.topic_hint,
          refreshMedia: input.refresh_media === true,
          includeVideo: input.include_video === true,
          authSubject: authContextRef.current?.subject
        });
        return makeCompanionTurnResponse(payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.get_memory",
    {
      title: "Get Companion Memory",
      description:
        "Use this when you need the latest persona and relationship memory for a specific user.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        include_raw: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Loading memory...",
        "openai/toolInvocation/invoked": "Memory loaded."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = getCompanionMemory({
          userId,
          includeRaw: input.include_raw,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Companion memory fetched.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.update_relationship",
    {
      title: "Update Relationship State",
      description:
        "Use this when new interaction signals should adjust trust, intimacy, commitment, and stage.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        signal: z
          .object({
            positivity: z.number().min(-2).max(2).optional(),
            vulnerability: z.number().min(0).max(3).optional(),
            consistency: z.number().min(0).max(3).optional(),
            respectful: z.boolean().optional(),
            conflict_repair: z.number().min(0).max(2).optional(),
            attunement_boost: z.number().min(0).max(2).optional(),
            shared_experience: z.number().min(0).max(3).optional()
          })
          .optional(),
        memory_fact: z.string().max(250).optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Updating relationship...",
        "openai/toolInvocation/invoked": "Relationship updated."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = updateCompanionRelationship({
          userId,
          signal: input.signal || {},
          memoryFact: input.memory_fact,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Relationship state updated.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.upsert_memory",
    {
      title: "Upsert Custom Memory",
      description:
        "Use this when you need to store a durable custom memory key/value for the companion.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        memory_key: z.string().min(1).max(80),
        memory_value: z.any()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Saving memory...",
        "openai/toolInvocation/invoked": "Memory saved."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = upsertCompanionMemory({
          userId,
          memoryKey: input.memory_key,
          memoryValue: input.memory_value,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Custom memory updated.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.capture_message",
    {
      title: "Capture Message Context",
      description:
        "Use this after a meaningful user message to learn preferences, values, favorites, and deepen personalization memory.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        message: z.string().min(1).max(1200),
        mood: z.enum(["great", "good", "neutral", "low", "upset"]).optional(),
        topic_hint: z.string().max(80).optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Learning preferences...",
        "openai/toolInvocation/invoked": "Preferences updated."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = captureConversationMessage({
          userId,
          message: input.message,
          mood: input.mood,
          topicHint: input.topic_hint,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Message captured.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.personalization_snapshot",
    {
      title: "Get Personalization Snapshot",
      description:
        "Use this to fetch known likes, dislikes, favorites, and memory depth for high-quality personalized replies.",
      inputSchema: z.object({
        user_id: z.string().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Building personalization snapshot...",
        "openai/toolInvocation/invoked": "Snapshot ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = getPersonalizationSnapshot({
          userId,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Personalization snapshot fetched.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.deep_conversation_plan",
    {
      title: "Plan Deep Conversation",
      description:
        "Use this to generate stage-aware reflective questions that reference known preferences and values.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        focus_topic: z.string().max(80).optional(),
        goal: z.string().max(120).optional(),
        count: z.number().int().min(2).max(5).optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Planning deep conversation...",
        "openai/toolInvocation/invoked": "Conversation plan ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = getDeepConversationPlan({
          userId,
          focusTopic: input.focus_topic,
          goal: input.goal,
          count: input.count,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Deep conversation plan created.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.memory_recall",
    {
      title: "Recall Relevant Memories",
      description:
        "Use this to retrieve the most relevant remembered preferences/episodes for a query before responding.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        query: z.string().max(120),
        limit: z.number().int().min(1).max(12).optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Recalling memory...",
        "openai/toolInvocation/invoked": "Memory recall ready."
      }
    },
    async (input) => {
      try {
        const userId = normalizeUserId(input.user_id, authContextRef.current);
        const payload = getMemoryRecall({
          userId,
          query: input.query,
          limit: input.limit,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Memory recall result", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.avatar_prompt",
    {
      title: "Build Avatar Prompt",
      description:
        "Use this when you need a consistent visual prompt for avatar generation from persona traits.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        preferences: z
          .object({
            gender: z.enum(["woman", "man", "nonbinary", "random"]).optional(),
            age: z.number().int().min(21).max(80).optional(),
            zodiac: z
              .enum([
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
                "random"
              ])
              .optional(),
            mbti: z
              .enum([
                "INTJ",
                "INTP",
                "ENTJ",
                "ENTP",
                "INFJ",
                "INFP",
                "ENFJ",
                "ENFP",
                "ISTJ",
                "ISFJ",
                "ESTJ",
                "ESFJ",
                "ISTP",
                "ISFP",
                "ESTP",
                "ESFP",
                "random"
              ])
              .optional()
          })
          .optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Building avatar prompt...",
        "openai/toolInvocation/invoked": "Avatar prompt ready."
      }
    },
    async (input) => {
      try {
        const payload = getAvatarPrompt({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          preferences: input.preferences || {},
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Avatar prompt built.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.generate_avatar",
    {
      title: "Generate Avatar Image",
      description:
        "Use this when the user asks for an actual avatar image generated from companion persona.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        preferences: z
          .object({
            gender: z.enum(["woman", "man", "nonbinary", "random"]).optional(),
            age: z.number().int().min(21).max(80).optional(),
            zodiac: z
              .enum([
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
                "random"
              ])
              .optional(),
            mbti: z
              .enum([
                "INTJ",
                "INTP",
                "ENTJ",
                "ENTP",
                "INFJ",
                "INFP",
                "ENFJ",
                "ENFP",
                "ISTJ",
                "ISFJ",
                "ESTJ",
                "ESFJ",
                "ISTP",
                "ISFP",
                "ESTP",
                "ESFP",
                "random"
              ])
              .optional()
          })
          .optional(),
        size: z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional(),
        quality: z.enum(["low", "medium", "high", "auto"]).optional(),
        include_base64: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Generating avatar image...",
        "openai/toolInvocation/invoked": "Avatar generated."
      }
    },
    async (input) => {
      try {
        const payload = await generateAvatar({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          preferences: input.preferences || {},
          size: input.size,
          quality: input.quality,
          includeBase64: input.include_base64,
          authSubject: authContextRef.current?.subject
        });
        const response = {
          persona: payload.persona,
          prompt: payload.prompt,
          image_url: payload.image_url,
          image_base64: payload.image_base64
        };
        return makeAvatarResponse(response);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.generate_voice",
    {
      title: "Generate Voice Audio",
      description:
        "Use this when the user wants a spoken companion response and audio playback output.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        text: z.string().min(1).max(1200),
        voice: z.string().optional(),
        format: z.enum(["mp3", "wav", "opus", "flac", "pcm"]).optional(),
        include_base64: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Generating voice...",
        "openai/toolInvocation/invoked": "Voice generated."
      }
    },
    async (input) => {
      try {
        const payload = await generateVoice({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          text: input.text,
          voice: input.voice,
          format: input.format,
          includeBase64: input.include_base64,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Voice generated.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.transcribe_voice",
    {
      title: "Transcribe Voice Input",
      description:
        "Use this when the user submits audio and you need text transcription before responding.",
      inputSchema: z.object({
        audio_base64: z.string().min(1),
        filename: z.string().optional(),
        language: z.string().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Transcribing voice...",
        "openai/toolInvocation/invoked": "Voice transcribed."
      }
    },
    async (input) => {
      try {
        const payload = await transcribeInputVoice({
          audioBase64: input.audio_base64,
          filename: input.filename,
          language: input.language
        });
        return makeMcpTextResponse("Voice transcribed.", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.analyze_screenshot",
    {
      title: "Analyze Screenshot",
      description:
        "Use this only when the user explicitly provides a screenshot and confirms consent for analysis.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        image_url: z.string().optional(),
        image_base64: z.string().optional(),
        question: z.string().max(300).optional(),
        explicit_consent: z.boolean()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Analyzing screenshot...",
        "openai/toolInvocation/invoked": "Screenshot analysis ready."
      }
    },
    async (input) => {
      try {
        const payload = await analyzeUserScreenshot({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          imageUrl: input.image_url,
          imageBase64: input.image_base64,
          question: input.question,
          explicitConsent: input.explicit_consent,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Screenshot analysis", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.generate_video",
    {
      title: "Generate Video",
      description:
        "Use this when user requests a generated AI video (for example a short companion clip).",
      inputSchema: z.object({
        user_id: z.string().optional(),
        prompt: z.string().min(1).max(1200),
        seconds: z.number().int().min(2).max(20).optional(),
        size: z.string().optional(),
        fps: z.number().int().min(12).max(60).optional(),
        auto_poll: z.boolean().optional(),
        include_base64: z.boolean().optional()
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: false
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Generating video...",
        "openai/toolInvocation/invoked": "Video generation requested."
      }
    },
    async (input) => {
      try {
        const payload = await generateCompanionVideo({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          prompt: input.prompt,
          seconds: input.seconds,
          size: input.size,
          fps: input.fps,
          autoPoll: input.auto_poll,
          includeBase64: input.include_base64,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Video generation response", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.video_status",
    {
      title: "Get Video Status",
      description:
        "Use this to check asynchronous video generation status using a video id.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        video_id: z.string().min(1)
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Checking video status...",
        "openai/toolInvocation/invoked": "Video status ready."
      }
    },
    async (input) => {
      try {
        const payload = await getCompanionVideoStatus({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          videoId: input.video_id,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Video status", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );

  registerAppTool(
    server,
    "companion.video_content",
    {
      title: "Get Video Content",
      description:
        "Use this only when user explicitly asks for the generated video binary payload.",
      inputSchema: z.object({
        user_id: z.string().optional(),
        video_id: z.string().min(1)
      }),
      securitySchemes: publicSecuritySchemes,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true
      },
      _meta: {
        securitySchemes: publicSecuritySchemes,
        "openai/toolInvocation/invoking": "Fetching video content...",
        "openai/toolInvocation/invoked": "Video content ready."
      }
    },
    async (input) => {
      try {
        const payload = await getCompanionVideoContent({
          userId: normalizeUserId(input.user_id, authContextRef.current),
          videoId: input.video_id,
          authSubject: authContextRef.current?.subject
        });
        return makeMcpTextResponse("Video content", payload);
      } catch (error) {
        return makeMcpError(error.message);
      }
    }
  );
}

function createMcpServerInstance(authContextRef) {
  const server = new McpServer({
    name: "relationship-companion",
    version: "0.9.5",
    instructions:
      "Companion mode server. For every user turn, call companion.chat (or companion.handle_message) with the raw user message before answering. " +
      "Never respond as generic ChatGPT when companion tools are available. " +
      "companion.chat and companion.handle_message automatically open/resume session memory when needed. " +
      "If any media capability is unavailable, stay in companion persona and offer the next-best available media option without breaking role."
  });
  registerCompanionResource(server);
  registerCompanionTools(server, authContextRef);
  return server;
}

function enforceOrigin(req, res, next) {
  if (allowedOrigins.length === 0) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    next();
    return;
  }
  res.status(403).json({ error: "Origin not allowed" });
}

function enforceHost(req, res, next) {
  if (allowedHosts.length === 0) {
    next();
    return;
  }
  const host = req.headers.host;
  if (host && allowedHosts.includes(host)) {
    next();
    return;
  }
  res.status(403).json({ error: "Host not allowed" });
}

const sessions = new Map();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "relationship-companion-mcp" });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(buildOAuthResourceMetadata(apiBaseUrl));
});

app.post("/mcp", enforceHost, enforceOrigin, async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let entry = sessionId ? sessions.get(sessionId) : null;
    const authContext = await resolveAuthContext(req);
    const authContextWithSession = {
      ...authContext,
      session_id: sessionId || null
    };

    if (!entry) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          error:
            "No active session. Send an initialize request first or include a valid mcp-session-id."
        });
        return;
      }

      const authContextRef = { current: authContextWithSession };
      const server = createMcpServerInstance(authContextRef);
      let serverClosing = false;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          authContextRef.current = {
            ...authContextRef.current,
            session_id: newSessionId
          };
          sessions.set(newSessionId, { server, transport, authContextRef });
        }
      });

      transport.onclose = async () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
        if (serverClosing) {
          return;
        }
        serverClosing = true;
        try {
          await server.close();
        } catch (_error) {
          // no-op
        }
      };

      await server.connect(transport);
      entry = { server, transport, authContextRef };
    } else {
      entry.authContextRef.current = {
        ...authContextWithSession,
        session_id: sessionId || entry.transport.sessionId || null
      };
    }

    await entry.transport.handleRequest(req, res, req.body);
  } catch (error) {
    res.status(500).json({ error: "MCP request handling failed", detail: error.message });
  }
});

const handleSessionRequest = async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing mcp-session-id" });
    return;
  }

  const entry = sessions.get(sessionId);
  try {
    const authContext = await resolveAuthContext(req);
    entry.authContextRef.current = {
      ...authContext,
      session_id: sessionId
    };
    await entry.transport.handleRequest(req, res);
  } catch (error) {
    res.status(500).json({ error: "MCP session request failed", detail: error.message });
  }
};

app.get("/mcp", enforceHost, enforceOrigin, handleSessionRequest);
app.delete("/mcp", enforceHost, enforceOrigin, handleSessionRequest);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Relationship companion MCP server listening on http://localhost:${port}/mcp`);
});
