// Merge seed + batch1..4 into final questions.json / cards.json
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");

// Load existing seed (to preserve)
const seedQuestions = JSON.parse(fs.readFileSync(path.join(dataDir, "questions.json"), "utf8"));
const seedCardsObj = JSON.parse(fs.readFileSync(path.join(dataDir, "cards.json"), "utf8"));

// Load batches
const batchFiles = ["batch1.json", "batch2.json", "batch3.json", "batch4.json"];
const batches = batchFiles.map(f => {
  const full = path.join(__dirname, f);
  return { name: f, data: JSON.parse(fs.readFileSync(full, "utf8")) };
});

// Combine
const allTopics = [...seedCardsObj.topics];
const allQuestions = [...seedQuestions];
const allCards = [...seedCardsObj.cards];

for (const { name, data } of batches) {
  if (Array.isArray(data.topics)) allTopics.push(...data.topics);
  if (Array.isArray(data.questions)) allQuestions.push(...data.questions);
  if (Array.isArray(data.cards)) allCards.push(...data.cards);
}

// De-dupe topics by id
const topicMap = new Map();
for (const t of allTopics) {
  if (!topicMap.has(t.id)) topicMap.set(t.id, t);
}
const topics = [...topicMap.values()];

// Validate question IDs unique
const idSet = new Set();
const dupes = [];
for (const q of allQuestions) {
  if (idSet.has(q.id)) dupes.push(q.id);
  idSet.add(q.id);
}
if (dupes.length) {
  console.error("DUPLICATE QUESTION IDS:", dupes);
  process.exit(1);
}

// Validate question schema
const errors = [];
for (const q of allQuestions) {
  if (!q.id || !q.type || !q.topic || !q.question) errors.push(`Missing required field: ${q.id || "<unknown>"}`);
  if (q.type === "choice" && (!Array.isArray(q.options) || typeof q.answer !== "number")) {
    errors.push(`Bad choice question: ${q.id}`);
  }
  if (q.type === "truefalse" && typeof q.answer !== "boolean") {
    errors.push(`Bad truefalse question: ${q.id}`);
  }
}
if (errors.length) {
  console.error("VALIDATION ERRORS:", errors.slice(0, 20));
  process.exit(1);
}

// Stats
const byTopicQ = {};
for (const q of allQuestions) byTopicQ[q.topic] = (byTopicQ[q.topic] || 0) + 1;
const byTopicC = {};
for (const c of allCards) byTopicC[c.topic] = (byTopicC[c.topic] || 0) + 1;
const types = {};
for (const c of allCards) types[c.displayType] = (types[c.displayType] || 0) + 1;

console.log("Topics:", topics.length);
console.log("Questions total:", allQuestions.length);
console.log("Cards total:", allCards.length);
console.log("Per topic Q:", byTopicQ);
console.log("Per topic C:", byTopicC);
console.log("Card display types:", types);

// Write final files
fs.writeFileSync(
  path.join(dataDir, "questions.json"),
  JSON.stringify(allQuestions, null, 2),
  "utf8"
);
fs.writeFileSync(
  path.join(dataDir, "cards.json"),
  JSON.stringify({ topics, cards: allCards }, null, 2),
  "utf8"
);
console.log("Written:", path.join(dataDir, "questions.json"));
console.log("Written:", path.join(dataDir, "cards.json"));
