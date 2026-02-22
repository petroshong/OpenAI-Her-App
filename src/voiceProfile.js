function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickVoiceForPersona(persona, fallbackVoice) {
  const voicePools = {
    woman: ["nova", "shimmer", "alloy"],
    man: ["onyx", "echo", "alloy"],
    nonbinary: ["alloy", "fable", "echo"]
  };

  const defaultVoice = fallbackVoice || "alloy";
  const pool = voicePools[persona?.gender] || [defaultVoice];
  return pickRandom(pool);
}

module.exports = { pickVoiceForPersona };
