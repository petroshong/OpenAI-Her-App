function buildAvatarPrompt(persona) {
  const ageDescriptor = `${persona.age}-year-old`;
  const genderDescriptor = persona.gender;
  const expression = "gentle eye contact, slight natural smile";
  const lighting = "cinematic soft daylight";
  const framing = "portrait, chest-up, shallow depth of field";
  const aesthetic = "photorealistic, natural skin texture, high detail";

  return [
    `${ageDescriptor} ${genderDescriptor}`,
    `personality vibe: ${persona.communication_tone}, ${persona.social_style}`,
    `zodiac influence: ${persona.zodiac}`,
    `mbti influence: ${persona.mbti}`,
    expression,
    lighting,
    framing,
    aesthetic
  ].join(", ");
}

module.exports = { buildAvatarPrompt };
