const fs = require("fs");
const path = require("path");

const STORE_DIR = path.join(__dirname, "..", "data");
const STORE_FILE = path.join(STORE_DIR, "memory-store.json");

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ users: {} }, null, 2), "utf8");
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    return { users: {} };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function getUserRecord(userId) {
  const store = readStore();
  return store.users[userId] || null;
}

function upsertUserRecord(userId, patch) {
  const store = readStore();
  const existing = store.users[userId] || {};
  const next = {
    ...existing,
    ...patch,
    last_updated_iso: new Date().toISOString()
  };
  store.users[userId] = next;
  writeStore(store);
  return next;
}

module.exports = {
  ensureStore,
  getUserRecord,
  upsertUserRecord
};
