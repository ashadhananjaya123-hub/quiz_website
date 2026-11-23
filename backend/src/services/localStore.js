import fs from "fs";
import path from "path";

const DATA_FILE = path.resolve("./data/local-db.json");

// Ensure data folder exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getDefaultData() {
  return {
    materials: [],
    questions: [],
    quizzes: [],
    quiz_attempts: [],
    student_answers: [],
  };
}

// Load data from disk or initialize
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not read local-db.json, reinitializing:", err.message);
  }
  return getDefaultData();
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write local-db.json:", err.message);
  }
}

let db = loadData();

export const localStore = {
  get(collection) {
    db = loadData();
    return db[collection] || [];
  },

  insert(collection, item) {
    db = loadData();
    if (!db[collection]) db[collection] = [];
    const record = {
      id: item.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      ...item,
    };
    db[collection].push(record);
    saveData(db);
    return record;
  },

  insertMany(collection, items) {
    db = loadData();
    if (!db[collection]) db[collection] = [];
    const inserted = items.map((item) => ({
      id: item.id || `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
      ...item,
    }));
    db[collection].push(...inserted);
    saveData(db);
    return inserted;
  },

  findById(collection, id) {
    db = loadData();
    return (db[collection] || []).find((item) => item.id === id) || null;
  },

  update(collection, id, updates) {
    db = loadData();
    const list = db[collection] || [];
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates, updated_at: new Date().toISOString() };
    saveData(db);
    return list[index];
  },

  delete(collection, id) {
    db = loadData();
    const list = db[collection] || [];
    const filtered = list.filter((item) => item.id !== id);
    db[collection] = filtered;
    saveData(db);
    return true;
  },
};
