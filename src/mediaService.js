const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const { buildAvatarPrompt } = require("./avatarPromptBuilder");
const { saveBase64Media } = require("./mediaShareStore");

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function generateAvatarImage(persona, options = {}) {
  const client = getClient();
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const size = options.size || "1024x1024";
  const quality = options.quality || "medium";
  const prompt = buildAvatarPrompt(persona);

  const result = await client.images.generate({
    model,
    prompt,
    size,
    quality
  });

  const firstImage = result?.data?.[0];
  if (!firstImage) {
    throw new Error("Image generation returned no image payload");
  }

  let share = null;
  if (!firstImage.url && firstImage.b64_json) {
    share = saveBase64Media({
      base64: firstImage.b64_json,
      mimeType: "image/png",
      prefix: "avatar"
    });
  }

  return {
    model,
    prompt,
    image_base64: firstImage.b64_json || null,
    image_url: firstImage.url || share?.public_url || null,
    share_url: firstImage.url || share?.public_url || null
  };
}

async function synthesizeVoice(text, voice, options = {}) {
  const client = getClient();
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const format = options.format || "mp3";

  const response = await client.audio.speech.create({
    model,
    voice,
    input: text,
    format
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return {
    model,
    voice,
    format,
    audio_base64: audioBuffer.toString("base64")
  };
}

async function transcribeVoice(audioBase64, options = {}) {
  const client = getClient();
  const model = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";
  const filename = options.filename || "voice-input.webm";
  const file = await toFile(Buffer.from(audioBase64, "base64"), filename);

  const result = await client.audio.transcriptions.create({
    model,
    file,
    language: options.language
  });

  return {
    model,
    text: result?.text || ""
  };
}

async function analyzeScreenshot(input, options = {}) {
  const client = getClient();
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
  const question =
    options.question ||
    "Describe what is on this screen and explain the likely user task and next best action.";

  const imageContent = input.image_url
    ? {
        type: "input_image",
        image_url: input.image_url
      }
    : {
        type: "input_image",
        image_url: `data:image/png;base64,${input.image_base64 || ""}`
      };

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: question }, imageContent]
      }
    ]
  });

  return {
    model,
    summary: response.output_text || "",
    usage: response.usage || null
  };
}

async function createVideoJob(input, options = {}) {
  const client = getClient();
  if (!client.videos?.create) {
    throw new Error("Video generation API is not available for this environment/account");
  }
  const model = process.env.OPENAI_VIDEO_MODEL || "sora";
  const prompt = input.prompt;
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const request = {
    model,
    prompt
  };
  if (options.seconds) request.seconds = options.seconds;
  if (options.size) request.size = options.size;
  if (options.fps) request.fps = options.fps;
  if (options.background) request.background = options.background;

  const response = await client.videos.create(request);
  const jobId = response?.id || response?.video_id || null;

  if (options.auto_poll !== false && jobId && client.videos?.retrieve) {
    let current = response;
    for (let i = 0; i < (options.max_polls || 20); i += 1) {
      if (current?.status === "completed" || current?.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, options.poll_interval_ms || 3000));
      current = await client.videos.retrieve(jobId);
    }
    return current;
  }
  return response;
}

async function getVideoJob(videoId) {
  const client = getClient();
  if (!client.videos?.retrieve) {
    throw new Error("Video status API is not available for this environment/account");
  }
  if (!videoId) {
    throw new Error("video_id is required");
  }
  return client.videos.retrieve(videoId);
}

async function getVideoContent(videoId) {
  const client = getClient();
  if (!client.videos?.content) {
    throw new Error("Video content API is not available for this environment/account");
  }
  if (!videoId) {
    throw new Error("video_id is required");
  }
  const response = await client.videos.content(videoId);
  const videoBuffer = Buffer.from(await response.arrayBuffer());
  return {
    video_base64: videoBuffer.toString("base64"),
    format: "mp4"
  };
}

module.exports = {
  generateAvatarImage,
  synthesizeVoice,
  transcribeVoice,
  analyzeScreenshot,
  createVideoJob,
  getVideoJob,
  getVideoContent
};
