import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAL_QUESTION_BANK } from "../src/musicaiQuestionBank.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "data", "musicai-question-bank.csv");

function escapeCsv(value) {
  const normalized = String(value ?? "");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

const headers = [
  "questionId",
  "lessonId",
  "chapterId",
  "knowledgePointId",
  "difficulty",
  "questionType",
  "evidenceWeight",
  "source",
  "reviewStatus",
  "reviewNotes",
  "prompt",
  "options",
  "answer",
  "explanation",
];

const rows = FORMAL_QUESTION_BANK.map((item) => [
  item.id,
  item.lessonId,
  item.chapterId,
  item.knowledgePointId,
  item.difficulty,
  item.questionType,
  item.evidenceWeight,
  item.source || "generated",
  item.reviewStatus || "pending",
  item.reviewNotes || "",
  item.prompt,
  (item.options || []).join(" | "),
  item.answer,
  item.explanation,
]);

const csv = [headers, ...rows]
  .map((row) => row.map(escapeCsv).join(","))
  .join("\n");

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `\uFEFF${csv}`, "utf8");
console.log(`Exported ${rows.length} questions to ${outputPath}`);
