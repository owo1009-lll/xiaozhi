import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const sourcePath = path.join(dataDir, "bkt-test-results.json");
const jsonOutputPath = path.join(dataDir, "bkt-deep-results-latest.json");
const csvOutputPath = path.join(dataDir, "bkt-deep-results-latest.csv");

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const latest = source.latestDeepRun;

if (!latest) {
  throw new Error("No latestDeepRun found in bkt-test-results.json");
}

const rows = [
  [
    "userId",
    "studentLabel",
    "profile",
    "accuracyTarget",
    "durationMinutes",
    "questionCount",
    "averagePL",
    "masteredCount",
    "difficultyUpgradeCount",
    "mostConfused",
    "preferredTool",
    "reportedBug",
    "confusionReport",
    "positiveReport",
  ],
];

for (const student of latest.students || []) {
  rows.push([
    student.userId,
    student.studentLabel,
    student.profile,
    student.accuracyTarget,
    student.durationMinutes,
    student.questionCount,
    student.averagePL,
    student.masteredCount,
    student.difficultyUpgradeCount,
    (student.mostConfused || []).join(" / "),
    student.preferredTool || "",
    student.reportedBug || "",
    student.confusionReport || "",
    student.positiveReport || "",
  ]);
}

const csv = rows
  .map((row) =>
    row
      .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
      .join(",")
  )
  .join("\n");

await fs.writeFile(jsonOutputPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8");
await fs.writeFile(csvOutputPath, `\uFEFF${csv}\n`, "utf8");

console.log(JSON.stringify({
  ok: true,
  jsonOutputPath,
  csvOutputPath,
  studentCount: latest.studentCount,
}, null, 2));
