import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const inputPath = path.join(projectRoot, "data", "bkt-test-results.json");
const outputPath = path.join(projectRoot, "data", "bkt-test-results-latest.csv");

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

const raw = await fs.readFile(inputPath, "utf8");
const parsed = JSON.parse(raw);
const latestRun = parsed.latestRun;

if (!latestRun) {
  throw new Error("No latest BKT test run found.");
}

const lines = [
  [
    "scenarioId",
    "scenarioLabel",
    "profile",
    "knowledgePointId",
    "title",
    "pL",
    "mastered",
    "difficulty",
    "totalAttempts",
    "correctAttempts",
    "accuracy",
  ].join(","),
];

for (const scenario of latestRun.results || []) {
  for (const state of scenario.knowledgeStates || []) {
    lines.push([
      csvEscape(scenario.scenarioId),
      csvEscape(scenario.label),
      csvEscape(scenario.profile),
      csvEscape(state.id),
      csvEscape(state.title),
      csvEscape(state.pL),
      csvEscape(state.mastered),
      csvEscape(state.difficulty),
      csvEscape(state.totalAttempts),
      csvEscape(state.correctAttempts),
      csvEscape(state.accuracy),
    ].join(","));
  }
}

await fs.writeFile(outputPath, `\uFEFF${lines.join("\n")}\n`, "utf8");
console.log(outputPath);
