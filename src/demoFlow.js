const {
  buildPersona,
  initialRelationshipState,
  updateRelationshipState,
  conversationGuidance
} = require("./personalityEngine");
const { buildAvatarPrompt } = require("./avatarPromptBuilder");
const {
  initialUserProfile,
  mergeUserProfile,
  extractPreferencesFromMessage,
  buildCompanionPreferenceProfile,
  buildPersonalizationSnapshot
} = require("./personalizationEngine");

const preferences = {
  gender: "woman",
  age: 32,
  zodiac: "libra",
  mbti: "ENFJ"
};

const persona = buildPersona(preferences);
let state = initialRelationshipState();
let userProfile = initialUserProfile();
const companionProfile = buildCompanionPreferenceProfile(persona);

const interactionSignals = [
  { positivity: 2, vulnerability: 1, consistency: 1, respectful: true, conflict_repair: 0 },
  { positivity: 1, vulnerability: 2, consistency: 1, respectful: true, conflict_repair: 1 },
  { positivity: 2, vulnerability: 2, consistency: 2, respectful: true, conflict_repair: 1 },
  { positivity: 1, vulnerability: 1, consistency: 2, respectful: true, conflict_repair: 1 },
  { positivity: 2, vulnerability: 3, consistency: 2, respectful: true, conflict_repair: 2 }
];

for (const signal of interactionSignals) {
  state = updateRelationshipState(state, signal);
}

const sampleMessages = [
  "I love long walks and late-night jazz playlists.",
  "My favorite food is sushi and I prefer direct communication.",
  "I value honesty and emotional maturity."
];

for (const message of sampleMessages) {
  const extraction = extractPreferencesFromMessage(message);
  userProfile = mergeUserProfile(userProfile, extraction);
}

const personalization = buildPersonalizationSnapshot({
  user_profile: userProfile,
  companion_profile: companionProfile,
  relationship_state: state,
  conversation_memory: { episodes: [] }
});

const guidance = conversationGuidance(persona, state, personalization);
const avatarPrompt = buildAvatarPrompt(persona);

console.log("Persona:");
console.log(JSON.stringify(persona, null, 2));
console.log("\nCompanion Profile:");
console.log(JSON.stringify(companionProfile, null, 2));
console.log("\nRelationship State:");
console.log(JSON.stringify(state, null, 2));
console.log("\nPersonalization Snapshot:");
console.log(JSON.stringify(personalization, null, 2));
console.log("\nConversation Guidance:");
console.log(JSON.stringify(guidance, null, 2));
console.log("\nAvatar Prompt:");
console.log(avatarPrompt);
