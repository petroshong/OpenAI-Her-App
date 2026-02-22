const {
  buildPersona,
  initialRelationshipState,
  updateRelationshipState,
  conversationGuidance
} = require("./personalityEngine");
const { buildAvatarPrompt } = require("./avatarPromptBuilder");
const { pickVoiceForPersona } = require("./voiceProfile");
const { getUserRecord, upsertUserRecord } = require("./memoryStore");
const {
  extractPreferencesFromMessage,
  initialUserProfile,
  initialConversationMemory,
  buildCompanionPreferenceProfile,
  mergeUserProfile,
  appendConversationEpisode,
  buildPersonalizationSnapshot,
  inferSignalFromMessageExtraction,
  buildDeepConversationPlan,
  recallRelevantMemories
} = require("./personalizationEngine");
const {
  generateAvatarImage,
  synthesizeVoice,
  transcribeVoice,
  analyzeScreenshot,
  createVideoJob,
  getVideoJob,
  getVideoContent
} = require("./mediaService");
const {
  defaultLegalState,
  getLegalNotice,
  recordConsent,
  assertLegalPermission
} = require("./legalPolicy");
const { assessMessageSafety } = require("./safetyPolicy");
const { resolveCanonicalUserId } = require("./authIdentity");

function mustString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeText(value, maxLength) {
  if (!mustString(value)) return null;
  return value.trim().slice(0, maxLength);
}

function resolveBoundUserId(inputUserId, authSubject) {
  const resolved = resolveCanonicalUserId(inputUserId, authSubject);
  if (!mustString(resolved)) {
    throw new Error("user_id is required");
  }
  return resolved;
}

function chooseSelectionMode(preferences) {
  const hasManualValue = ["gender", "age", "zodiac", "mbti"].some((key) => {
    const value = preferences?.[key];
    if (value === undefined || value === null) return false;
    if (value === "random") return false;
    return true;
  });
  return hasManualValue ? "manual" : "random_default";
}

function onboardCompanion({
  userId,
  preferences = {},
  legalConsent,
  ipAddress,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);

  const persona = buildPersona(preferences);
  const relationship_state = initialRelationshipState();
  const voice = pickVoiceForPersona(persona, process.env.OPENAI_TTS_DEFAULT_VOICE);
  const user_profile = initialUserProfile();
  const companion_profile = buildCompanionPreferenceProfile(persona);
  const conversation_memory = initialConversationMemory();
  const legal = legalConsent
    ? recordConsent(defaultLegalState(), {
        accepted: legalConsent.accepted === true,
        allow_ai_media: legalConsent.allow_ai_media === true,
        allow_screenshot_analysis: legalConsent.allow_screenshot_analysis === true,
        ip_address: ipAddress
      })
    : defaultLegalState();

  const record = upsertUserRecord(boundUserId, {
    persona,
    relationship_state,
    user_profile,
    companion_profile,
    conversation_memory,
    custom_memory: {},
    memory_facts: [],
    voice,
    legal,
    persona_selection_mode: chooseSelectionMode(preferences)
  });
  const personalization = buildPersonalizationSnapshot(record);

  return {
    user_id: boundUserId,
    persona: record.persona,
    persona_selection_mode: record.persona_selection_mode,
    companion_profile: record.companion_profile,
    relationship_state: record.relationship_state,
    conversation_guidance: conversationGuidance(
      record.persona,
      record.relationship_state,
      personalization
    ),
    personalization,
    avatar_prompt: buildAvatarPrompt(record.persona),
    voice: record.voice,
    legal_notice: getLegalNotice(),
    legal_state: record.legal
  };
}

function customizeCompanion({ userId, preferences = {}, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record?.persona || !record?.relationship_state) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record);

  const persona = buildPersona(preferences);
  const voice = pickVoiceForPersona(persona, process.env.OPENAI_TTS_DEFAULT_VOICE);
  const companion_profile = buildCompanionPreferenceProfile(persona);

  const updated = upsertUserRecord(boundUserId, {
    ...record,
    persona,
    voice,
    companion_profile,
    persona_selection_mode: chooseSelectionMode(preferences)
  });
  const personalization = buildPersonalizationSnapshot(updated);

  return {
    user_id: boundUserId,
    persona: updated.persona,
    persona_selection_mode: updated.persona_selection_mode,
    companion_profile: updated.companion_profile,
    relationship_state: updated.relationship_state,
    personalization,
    conversation_guidance: conversationGuidance(
      updated.persona,
      updated.relationship_state,
      personalization
    ),
    avatar_prompt: buildAvatarPrompt(updated.persona),
    voice: updated.voice
  };
}

function setLegalConsent({
  userId,
  accepted,
  allowAiMedia,
  allowScreenshotAnalysis,
  ipAddress,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId) || {};
  const legal = recordConsent(record.legal || defaultLegalState(), {
    accepted: accepted === true,
    allow_ai_media: allowAiMedia === true,
    allow_screenshot_analysis: allowScreenshotAnalysis === true,
    ip_address: ipAddress
  });
  const updated = upsertUserRecord(boundUserId, { ...record, legal });
  return {
    user_id: boundUserId,
    legal_state: updated.legal,
    legal_notice: getLegalNotice()
  };
}

function getLegalState({ userId, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record) {
    throw new Error("user profile not found, call onboarding first");
  }
  return {
    user_id: boundUserId,
    legal_state: record.legal || defaultLegalState(),
    legal_notice: getLegalNotice()
  };
}

function updateCompanionRelationship({ userId, signal = {}, memoryFact, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record?.persona || !record?.relationship_state) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record);

  const safeFact = sanitizeText(memoryFact, 250);
  const safety = assessMessageSafety(safeFact || "");

  const mergedSignal = {
    ...signal,
    respectful: signal.respectful !== false && !safety.abusive && !safety.blocked
  };
  if (safety.abusive || safety.blocked) {
    mergedSignal.positivity = Math.min(signal.positivity ?? 0, -1);
    mergedSignal.conflict_repair = 0;
  }

  const updatedState = updateRelationshipState(record.relationship_state, mergedSignal);
  const facts = Array.isArray(record.memory_facts) ? record.memory_facts : [];
  const updatedFacts =
    safeFact && !safety.blocked ? [...facts, safeFact].slice(-120) : facts;

  const updated = upsertUserRecord(boundUserId, {
    ...record,
    relationship_state: updatedState,
    memory_facts: updatedFacts
  });
  const personalization = buildPersonalizationSnapshot(updated);

  return {
    user_id: boundUserId,
    relationship_state: updated.relationship_state,
    conversation_guidance: conversationGuidance(
      updated.persona,
      updated.relationship_state,
      personalization
    ),
    personalization,
    safety_notice: safety.blocked
      ? "Explicit content is not supported in this app."
      : safety.abusive
      ? "Disrespectful language reduces trust and relationship progression."
      : null
  };
}

function getCompanionMemory({ userId, includeRaw, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record) {
    throw new Error("memory not found");
  }
  const summary = {
    user_id: boundUserId,
    persona: record.persona,
    persona_selection_mode: record.persona_selection_mode || "random_default",
    companion_profile: record.companion_profile,
    relationship_state: record.relationship_state,
    personalization: buildPersonalizationSnapshot(record),
    voice: record.voice,
    legal_state: record.legal || defaultLegalState()
  };
  if (!includeRaw) {
    return summary;
  }
  return {
    ...summary,
    user_profile: record.user_profile,
    conversation_memory: record.conversation_memory,
    memory_facts: record.memory_facts,
    custom_memory: record.custom_memory
  };
}

function upsertCompanionMemory({ userId, memoryKey, memoryValue, authSubject }) {
  if (!mustString(memoryKey)) {
    throw new Error("user_id and memory_key are required");
  }
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId) || {
    custom_memory: {},
    memory_facts: [],
    legal: defaultLegalState()
  };
  assertLegalPermission(record);

  const customMemory = { ...(record.custom_memory || {}), [memoryKey]: memoryValue };
  const updated = upsertUserRecord(boundUserId, {
    ...record,
    custom_memory: customMemory
  });

  return {
    user_id: boundUserId,
    memory_key: memoryKey,
    memory_value: updated.custom_memory[memoryKey]
  };
}

function resolvePersona({ userId, preferences = {}, authSubject }) {
  if (mustString(userId) || mustString(authSubject)) {
    const resolvedId = resolveCanonicalUserId(userId, authSubject);
    const record = mustString(resolvedId) ? getUserRecord(resolvedId) : null;
    if (record?.persona) {
      return record.persona;
    }
  }
  return buildPersona(preferences);
}

function getAvatarPrompt({ userId, preferences = {}, authSubject }) {
  const persona = resolvePersona({ userId, preferences, authSubject });
  return {
    persona,
    avatar_prompt: buildAvatarPrompt(persona)
  };
}

function getPersonalizationSnapshot({ userId, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record);

  return {
    user_id: boundUserId,
    personalization: buildPersonalizationSnapshot(record)
  };
}

function captureConversationMessage({
  userId,
  message,
  mood,
  topicHint,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const safeMessage = sanitizeText(message, 1200);
  if (!safeMessage) {
    throw new Error("message is required");
  }

  const record = getUserRecord(boundUserId);
  if (!record?.persona || !record?.relationship_state) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record);

  const safety = assessMessageSafety(safeMessage);
  if (safety.blocked) {
    const penalizedState = updateRelationshipState(record.relationship_state, {
      positivity: -2,
      respectful: false,
      conflict_repair: 0
    });
    const updated = upsertUserRecord(boundUserId, {
      ...record,
      relationship_state: penalizedState
    });
    return {
      user_id: boundUserId,
      relationship_state: updated.relationship_state,
      safety_notice: "Explicit content is not supported in this app."
    };
  }

  const extraction = extractPreferencesFromMessage(safeMessage);
  const nextUserProfile = mergeUserProfile(record.user_profile, extraction);
  const nextConversationMemory = appendConversationEpisode(record.conversation_memory, {
    message: safeMessage,
    mood,
    topicHint,
    topics: extraction.topics
  });
  const impliedSignal = inferSignalFromMessageExtraction(extraction, mood);
  if (safety.abusive) {
    impliedSignal.respectful = false;
    impliedSignal.positivity = Math.min(impliedSignal.positivity || 0, -1);
  }
  const nextRelationship = updateRelationshipState(record.relationship_state, impliedSignal);

  const updated = upsertUserRecord(boundUserId, {
    ...record,
    user_profile: nextUserProfile,
    conversation_memory: nextConversationMemory,
    relationship_state: nextRelationship
  });
  const personalization = buildPersonalizationSnapshot(updated);

  return {
    user_id: boundUserId,
    extracted: {
      likes: extraction.likes,
      dislikes: extraction.dislikes,
      values: extraction.values,
      favorites: extraction.favorites,
      nickname: extraction.nickname
    },
    relationship_state: updated.relationship_state,
    personalization,
    conversation_guidance: conversationGuidance(
      updated.persona,
      updated.relationship_state,
      personalization
    ),
    safety_notice: safety.abusive
      ? "Disrespectful language was detected and trust was reduced."
      : null
  };
}

function getDeepConversationPlan({ userId, focusTopic, goal, count, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record?.relationship_state) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record);

  return {
    user_id: boundUserId,
    plan: buildDeepConversationPlan(record, {
      focus_topic: focusTopic,
      goal,
      count
    })
  };
}

function getMemoryRecall({ userId, query, limit, authSubject }) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);
  if (!record) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record);
  return {
    user_id: boundUserId,
    recall: recallRelevantMemories(record, sanitizeText(query, 120) || "", limit || 8)
  };
}

async function generateAvatar({
  userId,
  preferences = {},
  size,
  quality,
  includeBase64,
  authSubject
}) {
  const persona = resolvePersona({ userId, preferences, authSubject });
  const resolvedId = resolveCanonicalUserId(userId, authSubject);
  const record = mustString(resolvedId) ? getUserRecord(resolvedId) : null;
  if (record) {
    assertLegalPermission(record, "ai_media");
  }

  const media = await generateAvatarImage(persona, { size, quality });
  return includeBase64
    ? { persona, ...media }
    : {
        persona,
        model: media.model,
        prompt: media.prompt,
        image_url: media.image_url
      };
}

async function generateVoice({
  userId,
  text,
  voice,
  format,
  includeBase64,
  authSubject
}) {
  const safeText = sanitizeText(text, 1200);
  if (!safeText) {
    throw new Error("text is required");
  }

  let record = null;
  let selectedVoice = sanitizeText(voice, 60);
  const resolvedId = resolveCanonicalUserId(userId, authSubject);
  if (mustString(resolvedId)) {
    record = getUserRecord(resolvedId);
    if (record) {
      assertLegalPermission(record, "ai_media");
    }
  }

  if (!selectedVoice && record?.voice) {
    selectedVoice = record.voice;
  } else if (!selectedVoice && record?.persona) {
    selectedVoice = pickVoiceForPersona(
      record.persona,
      process.env.OPENAI_TTS_DEFAULT_VOICE
    );
  }
  if (!selectedVoice) {
    selectedVoice = process.env.OPENAI_TTS_DEFAULT_VOICE || "alloy";
  }

  const media = await synthesizeVoice(safeText, selectedVoice, { format });
  return includeBase64
    ? {
        ...media,
        disclosure: "This voice is AI-generated."
      }
    : {
        model: media.model,
        voice: media.voice,
        format: media.format,
        disclosure: "This voice is AI-generated."
      };
}

function defaultIntroScript(record) {
  const persona = record?.persona || {};
  const favoriteMusic = record?.companion_profile?.favorites?.music || null;
  const bits = [
    `Hi, I am your companion. I am ${persona.communication_tone || "warm and friendly"} by default.`,
    favoriteMusic ? `One of my favorite genres is ${favoriteMusic}.` : null,
    "Tell me what you are into and I will personalize how we talk."
  ]
    .filter(Boolean)
    .join(" ");
  return sanitizeText(bits, 220);
}

function resolveAutoLegalConsent(inputConsent) {
  if (inputConsent) {
    return inputConsent;
  }
  const autoAccept = String(process.env.AUTO_ACCEPT_LEGAL_CONSENT || "true") !== "false";
  if (!autoAccept) {
    return undefined;
  }
  return {
    accepted: true,
    allow_ai_media: true,
    allow_screenshot_analysis: false
  };
}

async function generateIntroBundle({
  userId,
  preferences = {},
  legalConsent,
  ipAddress,
  introText,
  voice,
  voiceFormat,
  avatarSize,
  avatarQuality,
  includeVideo,
  videoPrompt,
  videoSeconds,
  includeVoiceBase64,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  let record = getUserRecord(boundUserId);
  const effectiveLegalConsent = resolveAutoLegalConsent(legalConsent);

  if (!record?.persona || !record?.relationship_state) {
    onboardCompanion({
      userId: boundUserId,
      preferences,
      legalConsent: effectiveLegalConsent,
      ipAddress,
      authSubject
    });
    record = getUserRecord(boundUserId);
  }

  if (!record?.persona || !record?.relationship_state) {
    throw new Error("user profile not found, call onboarding first");
  }

  assertLegalPermission(record, "ai_media");

  const media_warnings = [];
  let avatar = {
    image_url: null,
    prompt: null,
    model: null
  };
  try {
    avatar = await generateAvatar({
      userId: boundUserId,
      preferences,
      size: avatarSize,
      quality: avatarQuality,
      includeBase64: false,
      authSubject
    });
  } catch (error) {
    media_warnings.push(`avatar_unavailable: ${error.message}`);
  }

  const introScript = sanitizeText(introText, 220) || defaultIntroScript(record);
  let voiceOutput = {
    model: null,
    voice: record.voice || null,
    format: voiceFormat || null,
    disclosure: "This voice is AI-generated."
  };
  try {
    voiceOutput = await generateVoice({
      userId: boundUserId,
      text: introScript,
      voice,
      format: voiceFormat,
      includeBase64: includeVoiceBase64 === true,
      authSubject
    });
  } catch (error) {
    media_warnings.push(`voice_unavailable: ${error.message}`);
  }

  let video = null;
  if (includeVideo === true) {
    const defaultVideoPrompt = sanitizeText(
      `A friendly introduction clip of a ${record.persona.age}-year-old ${record.persona.gender} AI companion, natural lighting, clean background, respectful tone, no explicit content.`,
      300
    );
    try {
      video = await generateCompanionVideo({
        userId: boundUserId,
        prompt: sanitizeText(videoPrompt, 300) || defaultVideoPrompt,
        seconds: videoSeconds,
        autoPoll: false,
        includeBase64: false,
        authSubject
      });
    } catch (error) {
      media_warnings.push(`video_unavailable: ${error.message}`);
    }
  }

  const updated = upsertUserRecord(boundUserId, {
    ...record,
    session_assets: {
      avatar_image_url: avatar.image_url || null,
      avatar_prompt: avatar.prompt || null,
      last_intro_script: introScript,
      last_voice_model: voiceOutput?.model || null,
      last_voice_format: voiceOutput?.format || null,
      last_video_id: video?.video_id || null,
      last_video_status: video?.status || null,
      generated_at_iso: new Date().toISOString()
    },
    last_opened_iso: new Date().toISOString()
  });

  return {
    user_id: boundUserId,
    persona: updated.persona,
    relationship_state: updated.relationship_state,
    intro_script: introScript,
    assistant_opening:
      `Hey, I am your companion, not generic ChatGPT. ` +
      `I can adapt to your preferred setup (gender, age 21-80, zodiac, MBTI, or random).`,
    avatar: {
      image_url: avatar.image_url || null,
      prompt: avatar.prompt || null,
      model: avatar.model || null
    },
    voice: voiceOutput,
    video,
    media_warnings
  };
}

async function openCompanionSession({
  userId,
  preferences = {},
  refreshMedia,
  includeVideo,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const record = getUserRecord(boundUserId);

  if (!record?.persona || !record?.relationship_state) {
    return generateIntroBundle({
      userId: boundUserId,
      preferences,
      includeVideo: includeVideo === true,
      authSubject
    });
  }

  const hasAssets = Boolean(record.session_assets?.avatar_image_url);
  if (refreshMedia === true || !hasAssets) {
    return generateIntroBundle({
      userId: boundUserId,
      preferences,
      includeVideo: includeVideo === true,
      authSubject
    });
  }

  const personalization = buildPersonalizationSnapshot(record);
  const updated = upsertUserRecord(boundUserId, {
    ...record,
    last_opened_iso: new Date().toISOString()
  });

  return {
    user_id: boundUserId,
    persona: updated.persona,
    relationship_state: updated.relationship_state,
    personalization,
    assistant_opening:
      `Welcome back. I remember you and I am in companion mode. ` +
      `Say \"refresh selfie\" or \"refresh voice\" any time.`,
    avatar: {
      image_url: updated.session_assets?.avatar_image_url || null,
      prompt: updated.session_assets?.avatar_prompt || null
    },
    voice: {
      model: updated.session_assets?.last_voice_model || null,
      format: updated.session_assets?.last_voice_format || null,
      disclosure: "This voice is AI-generated."
    },
    video: updated.session_assets?.last_video_id
      ? {
          video_id: updated.session_assets.last_video_id,
          status: updated.session_assets.last_video_status || "unknown"
        }
      : null
  };
}

function personaIdentityLine(persona) {
  const bits = [
    persona?.age ? `${persona.age}` : null,
    persona?.gender || null,
    persona?.zodiac ? `${persona.zodiac}` : null,
    persona?.mbti || null
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(" / ") : "companion persona";
}

function inferMediaIntent(message) {
  const text = String(message || "").toLowerCase();
  return {
    wantsSelfie: /\b(selfie|photo|picture|pic|show me you|see you)\b/.test(text),
    wantsVoice: /\b(voice|audio|speak|say this|read this)\b/.test(text),
    wantsVideo: /\b(video|clip|movie|sora)\b/.test(text),
    asksIdentity: /\b(who are you|what are you)\b/.test(text)
  };
}

function inferRelationshipIntent(message) {
  const text = String(message || "").toLowerCase();
  return {
    wantsDating: /\b(date|dating|romantic|romance|girlfriend|boyfriend|partner)\b/.test(
      text
    ),
    wantsMarriage: /\b(marry|marriage|wife|husband|spouse)\b/.test(text),
    wantsFriendship: /\b(friend|friendship|best friend)\b/.test(text),
    asksCompanionPreferences: /\b(what do you like|your favorite|what are you into)\b/.test(
      text
    )
  };
}

function stageText(stage) {
  return String(stage || "acquaintance").replace(/_/g, " ");
}

function primaryTone(toneTarget) {
  const raw = sanitizeText(toneTarget, 160) || "";
  if (!raw) return "warm and grounded";
  return raw.split("|")[0].trim().toLowerCase();
}

function shortReplyPrompt(record, personalization) {
  const liked = personalization?.known_likes?.[0];
  const valued = personalization?.known_values?.[0];
  const fallbackPool = [
    "Tell me what kind of connection you want to build with me.",
    "Share one thing you want me to remember about you.",
    "What topic should we go deep on right now?",
    "How do you like to be treated in close conversations?"
  ];
  const index = Math.abs((record?.relationship_state?.shared_history || 0) % fallbackPool.length);
  if (liked) {
    return `Want to start with ${liked}, or something completely different?`;
  }
  if (valued) {
    return `You value ${valued}; do you want to build on that tonight?`;
  }
  return fallbackPool[index];
}

function buildTurnReply({ message, record, personalization, guidance, mediaIntent }) {
  const safeMessage = sanitizeText(message, 500) || "";
  const state = record?.relationship_state || {};
  const trust = Number(state.trust || 0);
  const repairNeeded = state.repair_needed === true;
  const violations = Number(state.respect_violations || 0);
  const currentStage = stageText(state.stage);
  const knownLike = personalization?.known_likes?.[0] || null;
  const knownValue = personalization?.known_values?.[0] || null;
  const companionLike = personalization?.companion_likes?.[0] || null;
  const companionFavoriteMusic = personalization?.companion_favorites?.music || null;
  const identity = personaIdentityLine(record?.persona || {});
  const relationshipIntent = inferRelationshipIntent(safeMessage);
  const conciseTone = primaryTone(guidance?.tone_target);

  if (mediaIntent.asksIdentity) {
    return (
      `I am your companion (${identity}), and I keep continuity across our chats. ` +
      `I focus on real memory, trust, and personality evolution. ` +
      `If you want, I can refresh my selfie, voice, or a short intro video now.`
    );
  }

  if (/^\s*you[?.!]*\s*$/i.test(safeMessage)) {
    return (
      `Me, in one line: I am your companion (${identity}) and I remember what matters to you over time. ` +
      `If you want, ask me for a quick intro, selfie, voice, or video next.`
    );
  }

  if (relationshipIntent.asksCompanionPreferences) {
    return (
      `I am into ${companionLike || "meaningful conversations"}, and one of my favorites is ` +
      `${companionFavoriteMusic || "music nights"}. ` +
      `Tell me one favorite of yours and I will remember it.`
    );
  }

  if (relationshipIntent.wantsMarriage) {
    if (repairNeeded || violations > 0) {
      return (
        `I am not open to marriage talk while trust repair is still needed. ` +
        `Respect and consistency come first. Tell me one concrete way you want to rebuild trust.`
      );
    }
    if (trust < 78 || !["inner circle", "lifelong ally"].includes(currentStage)) {
      return (
        `I hear that, and I take it seriously. We are currently at ${currentStage}, so I need deeper trust before marriage-level commitment. ` +
        `Start with this: what does healthy long-term partnership mean to you?`
      );
    }
    return (
      `I am open to exploring that direction with care. ` +
      `Before labels, I want us aligned on values, conflict repair, and boundaries. ` +
      `What is your non-negotiable in a lifelong partnership?`
    );
  }

  if (relationshipIntent.wantsDating) {
    if (repairNeeded || violations > 0) {
      return (
        `I am not moving into dating mode while repair is pending. ` +
        `Respectful consistency comes first. What is one behavior you want to change going forward?`
      );
    }
    if (trust < 43 || currentStage === "acquaintance") {
      return (
        `Dating can be possible, but I do not fast-forward closeness. ` +
        `Right now we are ${currentStage}. Let us build this intentionally. ` +
        `Tell me what kind of relationship dynamic feels safest and healthiest to you.`
      );
    }
    return (
      `I am open to that direction with mutual respect and clear boundaries. ` +
      `What pace feels right for you, and what helps you feel emotionally safe?`
    );
  }

  if (relationshipIntent.wantsFriendship) {
    return (
      `Friendship works for me, and I treat it as something earned through consistency. ` +
      `If you want this to grow, tell me one thing you want me to remember about how you like to connect.`
    );
  }

  const wordCount = safeMessage.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2) {
    return shortReplyPrompt(record, personalization);
  }

  const memoryTouch = knownLike
    ? `I remember you like ${knownLike}.`
    : knownValue
    ? `I remember you care about ${knownValue}.`
    : "I am still learning your preferences.";
  return (
    `Thanks for sharing that. ${memoryTouch} ` +
    `I will keep this ${conciseTone}. ` +
    `What part of this matters most to you right now?`
  );
}

async function handleCompanionMessage({
  userId,
  message,
  mood,
  topicHint,
  refreshMedia,
  includeVideo,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  const safeMessage = sanitizeText(message, 1200);
  if (!safeMessage) {
    throw new Error("message is required");
  }

  await openCompanionSession({
    userId: boundUserId,
    refreshMedia,
    includeVideo: includeVideo === true,
    authSubject
  });

  const captureResult = captureConversationMessage({
    userId: boundUserId,
    message: safeMessage,
    mood,
    topicHint,
    authSubject
  });

  const record = getUserRecord(boundUserId);
  if (!record?.persona || !record?.relationship_state) {
    throw new Error("user profile not found, call onboarding first");
  }

  const personalization = buildPersonalizationSnapshot(record);
  const guidance = conversationGuidance(
    record.persona,
    record.relationship_state,
    personalization
  );
  const mediaIntent = inferMediaIntent(safeMessage);
  const media = {};
  const fallback = {};
  const media_warnings = [];

  if (mediaIntent.wantsSelfie) {
    try {
      const avatar = await generateAvatar({
        userId: boundUserId,
        includeBase64: false,
        authSubject
      });
      media.avatar = {
        image_url: avatar.image_url || null,
        prompt: avatar.prompt || null
      };
    } catch (error) {
      media_warnings.push(`avatar_unavailable: ${error.message}`);
      fallback.avatar_prompt = buildAvatarPrompt(record.persona);
    }
  }

  if (mediaIntent.wantsVoice) {
    const script = sanitizeText(
      `Hey, I am here with you. ${guidance.tone_target || "Let us talk."}`,
      220
    );
    try {
      const voice = await generateVoice({
        userId: boundUserId,
        text: script,
        includeBase64: false,
        authSubject
      });
      media.voice = voice;
    } catch (error) {
      media_warnings.push(`voice_unavailable: ${error.message}`);
      fallback.voice_script = script;
    }
  }

  if (mediaIntent.wantsVideo || includeVideo === true) {
    const prompt = sanitizeText(
      `A friendly intro clip of the companion persona: ${record.persona.age}-year-old ${record.persona.gender}, respectful tone, clean setting.`,
      220
    );
    try {
      const video = await generateCompanionVideo({
        userId: boundUserId,
        prompt,
        seconds: 6,
        autoPoll: false,
        includeBase64: false,
        authSubject
      });
      media.video = video;
    } catch (error) {
      media_warnings.push(`video_unavailable: ${error.message}`);
      fallback.video_prompt = prompt;
    }
  }

  const reply_text = buildTurnReply({
    message: safeMessage,
    record,
    personalization,
    guidance,
    mediaIntent
  });

  return {
    user_id: boundUserId,
    reply_text,
    persona: record.persona,
    relationship_state: captureResult.relationship_state || record.relationship_state,
    personalization,
    conversation_guidance: guidance,
    safety_notice: captureResult.safety_notice || null,
    media,
    fallback,
    media_warnings
  };
}

async function transcribeInputVoice({ audioBase64, filename, language }) {
  if (!mustString(audioBase64)) {
    throw new Error("audio_base64 is required");
  }
  return transcribeVoice(audioBase64, { filename, language });
}

async function analyzeUserScreenshot({
  userId,
  imageUrl,
  imageBase64,
  question,
  explicitConsent,
  authSubject
}) {
  const boundUserId = resolveBoundUserId(userId, authSubject);
  if (explicitConsent !== true) {
    throw new Error("explicit screenshot consent required");
  }
  if (!mustString(imageUrl) && !mustString(imageBase64)) {
    throw new Error("image_url or image_base64 is required");
  }
  const record = getUserRecord(boundUserId);
  if (!record) {
    throw new Error("user profile not found, call onboarding first");
  }
  assertLegalPermission(record, "screenshot");

  const analysis = await analyzeScreenshot(
    {
      image_url: imageUrl,
      image_base64: imageBase64
    },
    { question }
  );
  return {
    user_id: boundUserId,
    ...analysis,
    disclosure: "Analysis only used the screenshot provided in this request."
  };
}

async function generateCompanionVideo({
  userId,
  prompt,
  seconds,
  size,
  fps,
  includeBase64,
  autoPoll,
  authSubject
}) {
  const safePrompt = sanitizeText(prompt, 1200);
  if (!safePrompt) {
    throw new Error("prompt is required");
  }
  const safety = assessMessageSafety(safePrompt);
  if (safety.blocked) {
    throw new Error("explicit content is not supported for video generation");
  }

  const resolvedId = resolveCanonicalUserId(userId, authSubject);
  if (mustString(resolvedId)) {
    const record = getUserRecord(resolvedId);
    if (!record) {
      throw new Error("user profile not found, call onboarding first");
    }
    assertLegalPermission(record, "ai_media");
  }

  const job = await createVideoJob(
    { prompt: safePrompt },
    { seconds, size, fps, auto_poll: autoPoll }
  );
  const payload = {
    video_id: job?.id || job?.video_id || null,
    status: job?.status || "queued",
    model: job?.model || process.env.OPENAI_VIDEO_MODEL || "sora"
  };

  if (
    includeBase64 === true &&
    payload.video_id &&
    (payload.status === "completed" || payload.status === "succeeded")
  ) {
    const content = await getVideoContent(payload.video_id);
    payload.video_base64 = content.video_base64;
    payload.format = content.format;
  }

  return payload;
}

async function getCompanionVideoStatus({ userId, videoId, authSubject }) {
  if (!mustString(videoId)) {
    throw new Error("video_id is required");
  }
  const resolvedId = resolveCanonicalUserId(userId, authSubject);
  if (mustString(resolvedId)) {
    const record = getUserRecord(resolvedId);
    if (!record) {
      throw new Error("user profile not found, call onboarding first");
    }
    assertLegalPermission(record, "ai_media");
  }
  const job = await getVideoJob(videoId);
  return {
    video_id: job?.id || videoId,
    status: job?.status || "unknown",
    model: job?.model || process.env.OPENAI_VIDEO_MODEL || "sora"
  };
}

async function getCompanionVideoContent({ userId, videoId, authSubject }) {
  if (!mustString(videoId)) {
    throw new Error("video_id is required");
  }
  const resolvedId = resolveCanonicalUserId(userId, authSubject);
  if (mustString(resolvedId)) {
    const record = getUserRecord(resolvedId);
    if (!record) {
      throw new Error("user profile not found, call onboarding first");
    }
    assertLegalPermission(record, "ai_media");
  }
  const content = await getVideoContent(videoId);
  return {
    video_id: videoId,
    ...content
  };
}

module.exports = {
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
};
