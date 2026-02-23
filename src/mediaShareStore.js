const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const MEDIA_DIR =
  process.env.MEDIA_SHARE_DIR || path.join(ROOT_DIR, "data", "shared-media");

function ensureMediaDir() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

function extFromMime(mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  if (type.includes("ogg")) return "ogg";
  return "bin";
}

function baseUrl() {
  return (
    process.env.MEDIA_SHARE_BASE_URL ||
    process.env.APP_PUBLIC_BASE_URL ||
    null
  );
}

function toPublicUrl(relativeUrl) {
  const base = baseUrl();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${relativeUrl}`;
}

function saveBase64Media({ base64, mimeType, prefix = "asset" }) {
  if (!base64) {
    throw new Error("base64 payload is required");
  }
  ensureMediaDir();
  const ext = extFromMime(mimeType);
  const id = crypto.randomUUID();
  const fileName = `${prefix}-${id}.${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  const data = Buffer.from(base64, "base64");
  fs.writeFileSync(filePath, data);

  const relativeUrl = `/media/${fileName}`;
  return {
    asset_id: id,
    file_name: fileName,
    file_path: filePath,
    mime_type: mimeType || "application/octet-stream",
    relative_url: relativeUrl,
    public_url: toPublicUrl(relativeUrl)
  };
}

function getMediaDir() {
  ensureMediaDir();
  return MEDIA_DIR;
}

module.exports = {
  saveBase64Media,
  toPublicUrl,
  getMediaDir
};

