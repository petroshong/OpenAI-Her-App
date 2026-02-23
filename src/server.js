const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { ensureStore } = require("./memoryStore");
const { getMediaDir } = require("./mediaShareStore");
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
const {
  resolveAuthContext,
  requiresAccountBinding,
  buildWwwAuthenticate
} = require("./authIdentity");

dotenv.config();
ensureStore();

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use("/media", express.static(getMediaDir()));

app.use(async (req, _res, next) => {
  try {
    req.auth_context = await resolveAuthContext(req);
    next();
  } catch (error) {
    next(error);
  }
});

function authSubject(req) {
  const subject = req.auth_context?.subject || null;
  if (requiresAccountBinding() && !subject) {
    throw new Error("authenticated ChatGPT account required");
  }
  return subject;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "relationship-companion-api" });
});

app.get("/api/legal/notice", (_req, res) => {
  return res.json(getLegalNotice());
});

app.post("/api/legal/state", (req, res) => {
  const { user_id: userId } = req.body || {};
  try {
    const payload = getLegalState({ userId, authSubject: authSubject(req) });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/legal/consent", (req, res) => {
  const {
    user_id: userId,
    accepted,
    allow_ai_media: allowAiMedia,
    allow_screenshot_analysis: allowScreenshotAnalysis,
    ip_address: ipAddress
  } = req.body || {};
  try {
    const payload = setLegalConsent({
      userId,
      accepted,
      allowAiMedia,
      allowScreenshotAnalysis,
      ipAddress,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/onboard", (req, res) => {
  const {
    user_id: userId,
    preferences = {},
    legal_consent: legalConsent,
    ip_address: ipAddress
  } = req.body || {};
  try {
    const payload = onboardCompanion({
      userId,
      preferences,
      legalConsent,
      ipAddress,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/companion/customize", (req, res) => {
  const { user_id: userId, preferences = {} } = req.body || {};
  try {
    const payload = customizeCompanion({
      userId,
      preferences,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/session/open", async (req, res) => {
  const {
    user_id: userId,
    preferences = {},
    refresh_media: refreshMedia,
    include_video: includeVideo
  } = req.body || {};
  try {
    const payload = await openCompanionSession({
      userId,
      preferences,
      refreshMedia,
      includeVideo,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/chat/turn", async (req, res) => {
  const {
    user_id: userId,
    message,
    mood,
    topic_hint: topicHint,
    refresh_media: refreshMedia,
    include_video: includeVideo
  } = req.body || {};
  try {
    const payload = await handleCompanionMessage({
      userId,
      message,
      mood,
      topicHint,
      refreshMedia,
      includeVideo,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/relationship/update", (req, res) => {
  const { user_id: userId, signal = {}, memory_fact: memoryFact } = req.body || {};
  try {
    const payload = updateCompanionRelationship({
      userId,
      signal,
      memoryFact,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/memory/get", (req, res) => {
  const { user_id: userId, include_raw: includeRaw } = req.body || {};
  try {
    const payload = getCompanionMemory({
      userId,
      includeRaw,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/memory/upsert", (req, res) => {
  const { user_id: userId, memory_key: memoryKey, memory_value: memoryValue } = req.body || {};
  try {
    const payload = upsertCompanionMemory({
      userId,
      memoryKey,
      memoryValue,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/personalization/snapshot", (req, res) => {
  const { user_id: userId } = req.body || {};
  try {
    const payload = getPersonalizationSnapshot({
      userId,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/conversation/capture", (req, res) => {
  const { user_id: userId, message, mood, topic_hint: topicHint } = req.body || {};
  try {
    const payload = captureConversationMessage({
      userId,
      message,
      mood,
      topicHint,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/conversation/plan", (req, res) => {
  const { user_id: userId, focus_topic: focusTopic, goal, count } = req.body || {};
  try {
    const payload = getDeepConversationPlan({
      userId,
      focusTopic,
      goal,
      count,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/memory/recall", (req, res) => {
  const { user_id: userId, query, limit } = req.body || {};
  try {
    const payload = getMemoryRecall({
      userId,
      query,
      limit,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/avatar/prompt", (req, res) => {
  const { user_id: userId, preferences = {} } = req.body || {};
  try {
    const payload = getAvatarPrompt({
      userId,
      preferences,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/avatar/generate", async (req, res) => {
  try {
    const { user_id: userId, preferences = {}, size, quality, include_base64: includeBase64 } = req.body || {};
    const payload = await generateAvatar({
      userId,
      preferences,
      size,
      quality,
      includeBase64,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/experience/intro", async (req, res) => {
  try {
    const {
      user_id: userId,
      setup = {},
      media = {}
    } = req.body || {};
    const payload = await generateIntroBundle({
      userId,
      preferences: setup.preferences || {},
      legalConsent: setup.legal_consent,
      ipAddress: setup.ip_address,
      introText: media.intro_text,
      voice: media.voice,
      voiceFormat: media.voice_format,
      avatarSize: media.avatar_size,
      avatarQuality: media.avatar_quality,
      includeVideo: media.include_video,
      videoPrompt: media.video_prompt,
      videoSeconds: media.video_seconds,
      includeVoiceBase64: media.include_voice_base64,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    const statusCode = error.message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
});

app.post("/api/screenshot/analyze", async (req, res) => {
  try {
    const {
      user_id: userId,
      image_url: imageUrl,
      image_base64: imageBase64,
      question,
      explicit_consent: explicitConsent
    } = req.body || {};
    const payload = await analyzeUserScreenshot({
      userId,
      imageUrl,
      imageBase64,
      question,
      explicitConsent,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/voice/speak", async (req, res) => {
  try {
    const {
      user_id: userId,
      text,
      voice,
      format,
      include_base64: includeBase64
    } = req.body || {};
    const payload = await generateVoice({
      userId,
      text,
      voice,
      format,
      includeBase64,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/voice/transcribe", async (req, res) => {
  try {
    const { audio_base64: audioBase64, filename, language } = req.body || {};
    const payload = await transcribeInputVoice({ audioBase64, filename, language });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/video/generate", async (req, res) => {
  try {
    const {
      user_id: userId,
      prompt,
      seconds,
      size,
      fps,
      include_base64: includeBase64,
      auto_poll: autoPoll
    } = req.body || {};
    const payload = await generateCompanionVideo({
      userId,
      prompt,
      seconds,
      size,
      fps,
      includeBase64,
      autoPoll,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/video/status", async (req, res) => {
  try {
    const { user_id: userId, video_id: videoId } = req.body || {};
    const payload = await getCompanionVideoStatus({
      userId,
      videoId,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post("/api/video/content", async (req, res) => {
  try {
    const { user_id: userId, video_id: videoId } = req.body || {};
    const payload = await getCompanionVideoContent({
      userId,
      videoId,
      authSubject: authSubject(req)
    });
    return res.json(payload);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.use((error, _req, res, _next) => {
  const message = error?.message || "internal server error";
  const isAuthError = message.includes("authenticated ChatGPT account required");
  const statusCode = isAuthError ? 401 : 400;
  if (isAuthError) {
    res.setHeader(
      "WWW-Authenticate",
      buildWwwAuthenticate(process.env.APP_PUBLIC_BASE_URL, "Connect your account to continue")
    );
  }
  return res.status(statusCode).json({ error: message });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Relationship companion API listening on http://localhost:${port}`);
});
