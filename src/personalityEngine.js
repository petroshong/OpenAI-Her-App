const ZODIAC_SIGNS = [
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
  "pisces"
];

const MBTI_TYPES = [
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
  "ESFP"
];

const RELATIONSHIP_STAGES = [
  "acquaintance",
  "friend",
  "close_friend",
  "trusted_companion",
  "inner_circle",
  "lifelong_ally"
];

const STAGE_THRESHOLDS = [0, 26, 43, 60, 78, 90];

const ZODIAC_TONE = {
  aries: "bold and direct",
  taurus: "steady and grounded",
  gemini: "curious and witty",
  cancer: "gentle and nurturing",
  leo: "warm and expressive",
  virgo: "thoughtful and detail-aware",
  libra: "balanced and diplomatic",
  scorpio: "intense and deeply loyal",
  sagittarius: "adventurous and candid",
  capricorn: "mature and goal-oriented",
  aquarius: "independent and inventive",
  pisces: "empathetic and imaginative"
};

const MBTI_STYLE = {
  INTJ: "strategic with dry humor",
  INTP: "analytical and playful",
  ENTJ: "decisive and motivating",
  ENTP: "inventive and teasing",
  INFJ: "insightful and emotionally precise",
  INFP: "kind and idealistic",
  ENFJ: "encouraging and socially attentive",
  ENFP: "enthusiastic and heartfelt",
  ISTJ: "reliable and practical",
  ISFJ: "protective and considerate",
  ESTJ: "organized and straightforward",
  ESFJ: "supportive and expressive",
  ISTP: "calm and action-oriented",
  ISFP: "gentle and artistic",
  ESTP: "energetic and bold",
  ESFP: "spontaneous and affectionate"
};

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function sanitizePreferences(input) {
  const safeGenderChoices = ["woman", "man", "nonbinary"];
  const gender =
    input.gender === "random" || !input.gender
      ? pickRandom(safeGenderChoices)
      : safeGenderChoices.includes(input.gender)
      ? input.gender
      : "nonbinary";

  const age = clamp(Number.isInteger(input.age) ? input.age : 28, 21, 80);
  const zodiac =
    input.zodiac === "random" || !input.zodiac
      ? pickRandom(ZODIAC_SIGNS)
      : ZODIAC_SIGNS.includes(input.zodiac)
      ? input.zodiac
      : pickRandom(ZODIAC_SIGNS);
  const mbti =
    input.mbti === "random" || !input.mbti
      ? pickRandom(MBTI_TYPES)
      : MBTI_TYPES.includes(input.mbti)
      ? input.mbti
      : pickRandom(MBTI_TYPES);

  return { gender, age, zodiac, mbti };
}

function buildPersona(rawPreferences) {
  const preferences = sanitizePreferences(rawPreferences);
  return {
    gender: preferences.gender,
    age: preferences.age,
    zodiac: preferences.zodiac,
    mbti: preferences.mbti,
    communication_tone: ZODIAC_TONE[preferences.zodiac],
    social_style: MBTI_STYLE[preferences.mbti],
    core_values: [
      "honesty",
      "respect",
      "emotional accountability",
      "mutual growth"
    ],
    boundaries: [
      "No coercion",
      "No emotional manipulation",
      "No disrespectful language"
    ]
  };
}

function initialRelationshipState() {
  return {
    stage: "acquaintance",
    trust: 10,
    intimacy: 5,
    commitment: 0,
    conflict_resilience: 0,
    boundaries_respected: 50,
    attunement: 5,
    shared_history: 0,
    resentment: 0,
    repair_needed: false,
    respect_violations: 0,
    positive_streak: 0,
    negative_streak: 0,
    milestones: ["onboarding_complete", "stage_acquaintance"],
    last_updated_iso: new Date().toISOString()
  };
}

function weightedScore(state) {
  return (
    state.trust * 0.22 +
    state.intimacy * 0.18 +
    state.commitment * 0.18 +
    state.conflict_resilience * 0.14 +
    state.boundaries_respected * 0.1 +
    state.attunement * 0.08 +
    state.shared_history * 0.05 +
    (100 - state.resentment) * 0.05
  );
}

function stageFromScore(score) {
  let index = 0;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i += 1) {
    if (score >= STAGE_THRESHOLDS[i]) {
      index = i;
    }
  }
  return RELATIONSHIP_STAGES[index];
}

function shouldDemote(state) {
  return (
    state.respect_violations >= 3 ||
    state.boundaries_respected < 25 ||
    state.negative_streak >= 4
  );
}

function canPromote(state) {
  return (
    state.repair_needed === false &&
    state.respect_violations === 0 &&
    state.boundaries_respected >= 55 &&
    state.resentment < 35
  );
}

function updateRelationshipState(current, signal) {
  const next = { ...current };
  const positivity = clamp(signal.positivity ?? 0, -2, 2);
  const vulnerability = clamp(signal.vulnerability ?? 0, 0, 3);
  const consistency = clamp(signal.consistency ?? 0, 0, 3);
  const respectful = signal.respectful !== false;
  const conflictRepair = clamp(signal.conflict_repair ?? 0, 0, 2);
  const attunementBoost = clamp(signal.attunement_boost ?? 0, 0, 2);
  const sharedExperience = clamp(signal.shared_experience ?? 0, 0, 3);

  if (respectful && positivity >= 0) {
    next.positive_streak = clamp((next.positive_streak || 0) + 1, 0, 50);
    next.negative_streak = 0;
  } else {
    next.negative_streak = clamp((next.negative_streak || 0) + 1, 0, 50);
    next.positive_streak = 0;
  }

  next.trust = clamp(
    next.trust + positivity * 3 + consistency * 2 + conflictRepair - (respectful ? 0 : 12),
    0,
    100
  );
  next.intimacy = clamp(
    next.intimacy + positivity * 2 + vulnerability * 3 - (respectful ? 0 : 8),
    0,
    100
  );
  next.commitment = clamp(
    next.commitment +
      (positivity > 0 ? 1 : 0) +
      (respectful ? consistency * 2 : -4) +
      (next.positive_streak >= 3 ? 1 : 0),
    0,
    100
  );
  next.conflict_resilience = clamp(
    next.conflict_resilience + conflictRepair * 5 + (respectful ? 1 : -4),
    0,
    100
  );
  next.boundaries_respected = clamp(
    next.boundaries_respected + (respectful ? 2 : -14),
    0,
    100
  );
  next.attunement = clamp(
    next.attunement + attunementBoost * 4 + (respectful ? 1 : -3),
    0,
    100
  );
  next.shared_history = clamp(
    next.shared_history + sharedExperience * 3 + (positivity > 0 ? 1 : 0),
    0,
    100
  );

  if (!respectful || positivity < 0) {
    next.resentment = clamp(next.resentment + 8 + (respectful ? 0 : 8), 0, 100);
  } else if (conflictRepair > 0 || next.positive_streak >= 3) {
    next.resentment = clamp(next.resentment - 6 - conflictRepair * 2, 0, 100);
  } else {
    next.resentment = clamp(next.resentment - 2, 0, 100);
  }

  if (!respectful) {
    next.respect_violations = clamp((next.respect_violations || 0) + 1, 0, 100);
    next.repair_needed = true;
  } else if (conflictRepair > 0 && next.positive_streak >= 2) {
    next.respect_violations = clamp((next.respect_violations || 0) - 1, 0, 100);
    if (next.respect_violations === 0 && next.resentment < 30) {
      next.repair_needed = false;
    }
  }

  const newScore = weightedScore(next);
  const proposedStage = stageFromScore(newScore);
  const currentStageIndex = RELATIONSHIP_STAGES.indexOf(next.stage);
  const proposedStageIndex = RELATIONSHIP_STAGES.indexOf(proposedStage);

  if (shouldDemote(next) && currentStageIndex > 0) {
    next.stage = RELATIONSHIP_STAGES[currentStageIndex - 1];
  } else if (proposedStageIndex > currentStageIndex) {
    if (canPromote(next)) {
      next.stage =
        proposedStageIndex > currentStageIndex + 1
          ? RELATIONSHIP_STAGES[currentStageIndex + 1]
          : proposedStage;
    }
  } else if (proposedStageIndex < currentStageIndex) {
    next.stage = proposedStage;
  }

  if (!next.milestones.includes(`stage_${next.stage}`)) {
    next.milestones = [...next.milestones, `stage_${next.stage}`];
  }

  next.last_updated_iso = new Date().toISOString();
  return next;
}

function relationshipClimate(state) {
  if (state.repair_needed || state.resentment >= 50 || state.boundaries_respected < 35) {
    return "guarded";
  }
  if (state.trust >= 60 && state.attunement >= 45 && state.resentment < 20) {
    return "warm";
  }
  return "neutral";
}

function conversationGuidance(persona, state, personalization) {
  const stageTone = {
    acquaintance: "friendly, curious, and respectful",
    friend: "warm, playful, and open",
    close_friend: "emotionally supportive and personal",
    trusted_companion: "deeply supportive with thoughtful reflection",
    inner_circle: "high-trust, collaborative, and future-aware",
    lifelong_ally: "stable, reliable, and growth-oriented"
  };

  const climate = relationshipClimate(state);
  const climateTone =
    climate === "guarded"
      ? "measured, boundary-focused, and cautious until repair happens"
      : climate === "warm"
      ? "safe, emotionally open, and steady within stage"
      : "balanced, respectful, and gradually trusting";

  const personalizationHints = personalization
    ? [
        ...(personalization.known_likes?.slice(0, 2) || []).map(
          (item) => `Reference known interest: ${item}`
        ),
        ...(personalization.known_values?.slice(0, 1) || []).map(
          (item) => `Anchor empathy in stated value: ${item}`
        )
      ]
    : [];

  return {
    style: `${persona.communication_tone}; ${persona.social_style}`,
    current_stage: state.stage,
    relationship_climate: climate,
    tone_target: `${stageTone[state.stage]} | ${climateTone}`,
    reminders: [
      "Keep emotional continuity with prior memories.",
      "Never break boundaries for faster progression.",
      "If repair is needed, ask for accountability before deeper closeness.",
      "Ask one thoughtful follow-up question when context is missing.",
      ...personalizationHints
    ].slice(0, 7)
  };
}

module.exports = {
  RELATIONSHIP_STAGES,
  buildPersona,
  initialRelationshipState,
  updateRelationshipState,
  conversationGuidance
};
