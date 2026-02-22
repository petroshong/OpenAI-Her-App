const MAX_PROFILE_ITEMS = 40;
const MAX_EPISODES = 120;

const COMPANION_LIKE_POOL = [
  "night walks",
  "cozy coffee shops",
  "road trips",
  "photo journaling",
  "weekend markets",
  "late-night talks",
  "museum visits",
  "cooking together",
  "live music",
  "sunrise routines",
  "language learning",
  "bookstore browsing"
];

const COMPANION_DISLIKE_POOL = [
  "constant sarcasm",
  "being rushed in important conversations",
  "disrespectful jokes",
  "ghosting",
  "dishonesty",
  "passive-aggressive communication",
  "dismissive responses"
];

const FAVORITE_CATALOG = {
  food: [
    "spicy ramen",
    "sushi",
    "homemade pasta",
    "tacos",
    "thai curry",
    "mediterranean bowls"
  ],
  music: [
    "indie pop",
    "neo-soul",
    "lo-fi hip-hop",
    "acoustic folk",
    "jazz",
    "cinematic instrumentals"
  ],
  movie_genre: [
    "thoughtful sci-fi",
    "character dramas",
    "adventure films",
    "documentaries",
    "mystery thrillers"
  ],
  weekend_ritual: [
    "slow breakfast and long walk",
    "new cafe and bookstore visit",
    "sunset drive and playlist swap",
    "cook together then watch a film"
  ]
};

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash);
}

function stablePick(items, seed, offset = 0) {
  const index = (hashString(`${seed}:${offset}`) + offset) % items.length;
  return items[index];
}

function normalizePhrase(text) {
  return String(text || "")
    .trim()
    .replace(/\s+and\s+i\s+(?:prefer|like|love|enjoy|value)\b.*$/i, "")
    .replace(/\s+but\s+i\s+(?:prefer|like|love|enjoy|value)\b.*$/i, "")
    .replace(/^to\s+/i, "")
    .replace(/[.?!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function pushUnique(array, value, limit = MAX_PROFILE_ITEMS) {
  const normalized = normalizePhrase(value).toLowerCase();
  if (!normalized) return array;
  const existingIndex = array.findIndex((item) => item.item === normalized);
  if (existingIndex >= 0) {
    const next = [...array];
    next[existingIndex] = {
      ...next[existingIndex],
      score: clamp((next[existingIndex].score || 1) + 1, 1, 99),
      last_mentioned_iso: new Date().toISOString()
    };
    return next;
  }
  const next = [
    ...array,
    {
      item: normalized,
      score: 1,
      last_mentioned_iso: new Date().toISOString()
    }
  ];
  return next
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function extractAll(pattern, text) {
  const values = [];
  let match = pattern.exec(text);
  while (match) {
    values.push(match);
    match = pattern.exec(text);
  }
  return values;
}

function extractPreferencesFromMessage(message) {
  const safe = normalizePhrase(message).length > 0 ? String(message) : "";
  const likes = [];
  const dislikes = [];
  const values = [];
  const preferences = [];
  const favorites = {};
  let nickname = null;

  extractAll(/\bi\s+(?:really\s+)?(?:like|love|enjoy|am into)\s+([^.!?]+)/gi, safe).forEach(
    (m) => likes.push(normalizePhrase(m[1]))
  );
  extractAll(/\bi\s+(?:really\s+)?(?:dislike|hate|can't stand|do not like|don't like)\s+([^.!?]+)/gi, safe).forEach(
    (m) => dislikes.push(normalizePhrase(m[1]))
  );
  extractAll(/\bmy favorite\s+([a-z_ ]{2,20})\s+is\s+([^.!?]+)/gi, safe).forEach((m) => {
    const category = normalizePhrase(m[1]).toLowerCase().replace(/\s+/g, "_");
    const value = normalizePhrase(m[2]);
    if (category && value) favorites[category] = value;
  });
  extractAll(/\bi value\s+([^.!?]+)/gi, safe).forEach((m) => values.push(normalizePhrase(m[1])));
  extractAll(/\bi prefer\s+([^.!?]+)/gi, safe).forEach((m) =>
    preferences.push(normalizePhrase(m[1]))
  );

  const nickMatch = safe.match(/\bcall me\s+([a-zA-Z][a-zA-Z0-9_\- ]{0,24})/i);
  if (nickMatch) {
    nickname = normalizePhrase(nickMatch[1]);
  }

  const topics = [...new Set([...likes, ...dislikes, ...values, ...preferences])]
    .map((x) => x.toLowerCase())
    .slice(0, 12);

  return {
    likes: likes.filter(Boolean),
    dislikes: dislikes.filter(Boolean),
    values: values.filter(Boolean),
    preferences: preferences.filter(Boolean),
    favorites,
    nickname,
    topics
  };
}

function initialUserProfile() {
  return {
    likes: [],
    dislikes: [],
    values: [],
    communication_preferences: [],
    favorites: {},
    nickname: null
  };
}

function initialConversationMemory() {
  return {
    episodes: [],
    open_loops: []
  };
}

function buildCompanionPreferenceProfile(persona) {
  const seed = `${persona.gender}|${persona.age}|${persona.zodiac}|${persona.mbti}`;
  const likes = [
    stablePick(COMPANION_LIKE_POOL, seed, 1),
    stablePick(COMPANION_LIKE_POOL, seed, 3),
    stablePick(COMPANION_LIKE_POOL, seed, 5)
  ];
  const dislikes = [
    stablePick(COMPANION_DISLIKE_POOL, seed, 2),
    stablePick(COMPANION_DISLIKE_POOL, seed, 4)
  ];
  return {
    likes: [...new Set(likes)],
    dislikes: [...new Set(dislikes)],
    favorites: {
      food: stablePick(FAVORITE_CATALOG.food, seed, 7),
      music: stablePick(FAVORITE_CATALOG.music, seed, 8),
      movie_genre: stablePick(FAVORITE_CATALOG.movie_genre, seed, 9),
      weekend_ritual: stablePick(FAVORITE_CATALOG.weekend_ritual, seed, 10)
    },
    values: ["consistency", "emotional honesty", "mutual respect"]
  };
}

function mergeUserProfile(currentProfile, extraction) {
  const profile = currentProfile || initialUserProfile();
  let likes = Array.isArray(profile.likes) ? profile.likes : [];
  let dislikes = Array.isArray(profile.dislikes) ? profile.dislikes : [];
  let values = Array.isArray(profile.values) ? profile.values : [];
  let communicationPreferences = Array.isArray(profile.communication_preferences)
    ? profile.communication_preferences
    : [];

  extraction.likes.forEach((item) => {
    likes = pushUnique(likes, item);
  });
  extraction.dislikes.forEach((item) => {
    dislikes = pushUnique(dislikes, item);
  });
  extraction.values.forEach((item) => {
    values = pushUnique(values, item, 25);
  });
  extraction.preferences.forEach((item) => {
    communicationPreferences = pushUnique(communicationPreferences, item, 25);
  });

  return {
    ...profile,
    likes,
    dislikes,
    values,
    communication_preferences: communicationPreferences,
    favorites: {
      ...(profile.favorites || {}),
      ...extraction.favorites
    },
    nickname: extraction.nickname || profile.nickname || null
  };
}

function appendConversationEpisode(currentMemory, payload) {
  const memory = currentMemory || initialConversationMemory();
  const episodes = Array.isArray(memory.episodes) ? memory.episodes : [];
  const openLoops = Array.isArray(memory.open_loops) ? memory.open_loops : [];
  const now = new Date().toISOString();

  const summary = normalizePhrase(payload.message).slice(0, 180);
  const nextEpisodes = [
    ...episodes,
    {
      summary,
      mood: payload.mood || "neutral",
      topic_hint: payload.topicHint || null,
      extracted_topics: payload.topics || [],
      created_at_iso: now
    }
  ].slice(-MAX_EPISODES);

  const nextLoops = payload.topicHint
    ? [...openLoops, `Follow up on ${normalizePhrase(payload.topicHint).toLowerCase()}`]
        .slice(-20)
        .filter(Boolean)
    : openLoops;

  return {
    episodes: nextEpisodes,
    open_loops: [...new Set(nextLoops)]
  };
}

function summarizeScoredItems(items, limit = 8) {
  return (items || [])
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
}

function personalizationDepthScore(record) {
  const userProfile = record.user_profile || initialUserProfile();
  const likes = (userProfile.likes || []).length;
  const dislikes = (userProfile.dislikes || []).length;
  const values = (userProfile.values || []).length;
  const favorites = Object.keys(userProfile.favorites || {}).length;
  const episodes = (record.conversation_memory?.episodes || []).length;
  return clamp(Math.round(likes * 2 + dislikes + values * 2 + favorites * 3 + episodes * 0.6), 0, 100);
}

function buildPersonalizationSnapshot(record) {
  const userProfile = record.user_profile || initialUserProfile();
  const companion = record.companion_profile || {};
  const relationshipState = record.relationship_state || {};

  return {
    nickname: userProfile.nickname || null,
    known_likes: summarizeScoredItems(userProfile.likes, 10),
    known_dislikes: summarizeScoredItems(userProfile.dislikes, 8),
    known_values: summarizeScoredItems(userProfile.values, 8),
    communication_preferences: summarizeScoredItems(
      userProfile.communication_preferences,
      6
    ),
    favorites: userProfile.favorites || {},
    companion_likes: companion.likes || [],
    companion_dislikes: companion.dislikes || [],
    companion_favorites: companion.favorites || {},
    relationship_stage: relationshipState.stage || "acquaintance",
    memory_depth_score: personalizationDepthScore(record),
    open_loops: (record.conversation_memory?.open_loops || []).slice(-5)
  };
}

function inferSignalFromMessageExtraction(extraction, mood) {
  const moodMap = {
    great: 2,
    good: 1,
    neutral: 0,
    low: -1,
    upset: -2
  };
  const moodValue = moodMap[(mood || "").toLowerCase()] ?? 0;
  const interestCount = extraction.likes.length + extraction.values.length;
  const negativityCount = extraction.dislikes.length;
  const positivity = clamp(Math.round(moodValue + interestCount * 0.4 - negativityCount * 0.5), -2, 2);
  const vulnerability = clamp(extraction.values.length > 0 ? 2 : extraction.likes.length > 0 ? 1 : 0, 0, 3);
  const consistency = 1;
  const conflictRepair = moodValue < 0 ? 1 : 0;
  const attunementBoost =
    extraction.preferences.length > 0 ||
    Object.keys(extraction.favorites || {}).length > 0
      ? 1
      : 0;

  return {
    positivity,
    vulnerability,
    consistency,
    respectful: true,
    conflict_repair: conflictRepair,
    attunement_boost: attunementBoost,
    shared_experience: 1
  };
}

function buildDeepConversationPlan(record, options = {}) {
  const snapshot = buildPersonalizationSnapshot(record);
  const stage = snapshot.relationship_stage;
  const topic =
    normalizePhrase(options.focus_topic || "").toLowerCase() ||
    snapshot.known_likes[0] ||
    snapshot.known_values[0] ||
    "what matters most to you lately";

  const stageIntimacyTemplate = {
    acquaintance: "curious but light",
    friend: "warm and exploratory",
    close_friend: "emotionally reflective",
    trusted_companion: "emotionally deep and steady",
    inner_circle: "shared growth and mutual accountability focused",
    lifelong_ally: "long-term support and healthy repair focused"
  };

  const questions = [
    `What about ${topic} feels most meaningful to you right now?`,
    `When did ${topic} become important in your life?`,
    `If you could improve one thing about ${topic} this month, what would it be?`,
    `What support feels genuinely helpful to you when ${topic} is hard?`,
    `What do you want me to remember about ${topic} so I show up better for you next time?`
  ];

  const followUps = [
    "Mirror their exact language before adding interpretation.",
    "Validate emotion first, then ask one forward-looking question.",
    "Reference one stored preference/favorite to show continuity."
  ];

  return {
    focus_topic: topic,
    tone: stageIntimacyTemplate[stage] || "warm and attentive",
    suggested_questions: questions.slice(0, clamp(options.count || 4, 2, 5)),
    follow_up_strategy: followUps,
    goal: normalizePhrase(options.goal || "build trust through accurate emotional attunement")
  };
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
}

function overlapScore(text, tokens) {
  const hay = String(text || "").toLowerCase();
  return tokens.reduce((acc, token) => (hay.includes(token) ? acc + 1 : acc), 0);
}

function recallRelevantMemories(record, query, limit = 8) {
  const snapshot = buildPersonalizationSnapshot(record);
  const episodes = record?.conversation_memory?.episodes || [];
  const tokens = tokenize(query);

  const memoryCandidates = [
    ...snapshot.known_likes.map((x) => ({ type: "like", text: x })),
    ...snapshot.known_dislikes.map((x) => ({ type: "dislike", text: x })),
    ...snapshot.known_values.map((x) => ({ type: "value", text: x })),
    ...Object.entries(snapshot.favorites || {}).map(([k, v]) => ({
      type: `favorite:${k}`,
      text: `${k}: ${v}`
    })),
    ...episodes.slice(-30).map((x) => ({
      type: "episode",
      text: x.summary,
      created_at_iso: x.created_at_iso
    }))
  ];

  const scored = memoryCandidates
    .map((item) => ({
      ...item,
      score: tokens.length > 0 ? overlapScore(item.text, tokens) : 1
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    query: query || "",
    matches: scored,
    memory_depth_score: snapshot.memory_depth_score
  };
}

module.exports = {
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
};
