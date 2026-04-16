import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const BASELINE_JSON = path.join(DATA_DIR, "all-features-deep-simulation-latest.json");
const ENHANCEMENT_JSON = path.join(DATA_DIR, "weak-knowledge-enhancement-validation-latest.json");
const OUTPUT_JSON = path.join(DATA_DIR, "all-features-weak-rank-comparison-latest.json");
const OUTPUT_CSV = path.join(DATA_DIR, "all-features-weak-rank-comparison-latest.csv");
const OUTPUT_HTML = path.join(DATA_DIR, "all-features-weak-rank-comparison-latest.html");

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const baseline = JSON.parse(await fs.readFile(BASELINE_JSON, "utf8"));
  const enhancement = JSON.parse(await fs.readFile(ENHANCEMENT_JSON, "utf8"));

  const baselineRows = baseline?.bkt?.summary?.knowledgePointAverages ?? [];
  const enhancementRows = enhancement?.rows ?? [];

  const enhancementMap = new Map(
    enhancementRows.map((row) => [
      row.id,
      {
        afterAveragePL: Number(row.afterAveragePL ?? row.averagePL ?? 0),
        afterMasteredRate: Number(row.afterMasteredRate ?? row.masteredRate ?? 0),
        deltaPL: Number(row.deltaPL ?? 0),
        deltaMasteredRate: Number(row.deltaMasteredRate ?? 0),
      },
    ]),
  );

  const beforeSorted = [...baselineRows]
    .map((row) => ({
      ...row,
      averagePL: Number(row.averagePL ?? 0),
      masteredRate: Number(row.masteredRate ?? 0),
    }))
    .sort((a, b) => a.averagePL - b.averagePL);

  const beforeRankMap = new Map(beforeSorted.map((row, index) => [row.id, index + 1]));

  const afterSorted = baselineRows
    .map((row) => {
      const patch = enhancementMap.get(row.id);
      return {
        id: row.id,
        title: row.title,
        lessonId: row.lessonId,
        baselineAveragePL: Number(row.averagePL ?? 0),
        baselineMasteredRate: Number(row.masteredRate ?? 0),
        updatedAveragePL: patch ? patch.afterAveragePL : Number(row.averagePL ?? 0),
        updatedMasteredRate: patch ? patch.afterMasteredRate : Number(row.masteredRate ?? 0),
        deltaPL: patch ? patch.deltaPL : 0,
        deltaMasteredRate: patch ? patch.deltaMasteredRate : 0,
      };
    })
    .sort((a, b) => a.updatedAveragePL - b.updatedAveragePL)
    .map((row, index) => ({
      rankAfter: index + 1,
      rankBefore: beforeRankMap.get(row.id) ?? null,
      ...row,
    }));

  const weakestBefore = beforeSorted.slice(0, 10).map((row, index) => ({
    rank: index + 1,
    id: row.id,
    title: row.title,
    averagePL: row.averagePL,
    masteredRate: row.masteredRate,
  }));

  const weakestAfter = afterSorted.slice(0, 10);
  const strengthenedRows = afterSorted
    .filter((row) => row.deltaPL > 0)
    .sort((a, b) => b.deltaPL - a.deltaPL);

  const payload = {
    generatedAt: new Date().toISOString(),
    baselineSource: path.basename(BASELINE_JSON),
    enhancementSource: path.basename(ENHANCEMENT_JSON),
    weakestBefore,
    weakestAfter,
    strengthenedRows,
    comparisonRows: afterSorted,
  };

  const csvHeader = [
    "rankBefore",
    "rankAfter",
    "knowledgePointId",
    "title",
    "lessonId",
    "baselineAveragePL",
    "updatedAveragePL",
    "deltaPL",
    "baselineMasteredRate",
    "updatedMasteredRate",
    "deltaMasteredRate",
  ];

  const csvLines = [
    csvHeader.join(","),
    ...afterSorted.map((row) =>
      [
        row.rankBefore,
        row.rankAfter,
        row.id,
        row.title,
        row.lessonId,
        row.baselineAveragePL.toFixed(3),
        row.updatedAveragePL.toFixed(3),
        row.deltaPL.toFixed(3),
        row.baselineMasteredRate.toFixed(2),
        row.updatedMasteredRate.toFixed(2),
        row.deltaMasteredRate.toFixed(2),
      ].map(csvCell).join(","),
    ),
  ];

  const weakestBeforeHtml = weakestBefore
    .map((row) => `<tr><td>${row.rank}</td><td>${escapeHtml(row.title)}</td><td>${row.averagePL.toFixed(3)}</td><td>${(row.masteredRate * 100).toFixed(0)}%</td></tr>`)
    .join("");

  const weakestAfterHtml = weakestAfter
    .map((row) => `<tr><td>${row.rankAfter}</td><td>${row.rankBefore}</td><td>${escapeHtml(row.title)}</td><td>${row.updatedAveragePL.toFixed(3)}</td><td>${(row.updatedMasteredRate * 100).toFixed(0)}%</td><td>${row.deltaPL.toFixed(3)}</td></tr>`)
    .join("");

  const strongestHtml = strengthenedRows
    .slice(0, 10)
    .map((row) => `<tr><td>${escapeHtml(row.title)}</td><td>${row.rankBefore}</td><td>${row.rankAfter}</td><td>${row.deltaPL.toFixed(3)}</td><td>${(row.deltaMasteredRate * 100).toFixed(0)}%</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>100 人全平台薄弱知识点对比</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; margin: 32px; color: #111; }
    h1, h2 { margin: 0 0 16px; }
    p { margin: 0 0 16px; line-height: 1.7; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .card { border: 1px solid #ddd; border-radius: 16px; padding: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid #eee; text-align: left; padding: 8px; vertical-align: top; }
    th { background: #fafafa; }
  </style>
</head>
<body>
  <h1>100 人全平台薄弱知识点对比</h1>
  <p>本报告保留原 100 人全平台深测的 AI/作业链路结果，只将本轮知识点强化后的专项验证结果叠加到 BKT 掌握度上，用于重排全平台最弱知识点。</p>
  <div class="grid">
    <div class="card">
      <h2>旧版最弱前 10</h2>
      <table>
        <thead><tr><th>旧排名</th><th>知识点</th><th>平均 P(L)</th><th>Mastered 率</th></tr></thead>
        <tbody>${weakestBeforeHtml}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>新版最弱前 10</h2>
      <table>
        <thead><tr><th>新排名</th><th>旧排名</th><th>知识点</th><th>平均 P(L)</th><th>Mastered 率</th><th>提升</th></tr></thead>
        <tbody>${weakestAfterHtml}</tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <h2>提升最大的 10 个知识点</h2>
    <table>
      <thead><tr><th>知识点</th><th>旧排名</th><th>新排名</th><th>P(L) 提升</th><th>Mastered 率提升</th></tr></thead>
      <tbody>${strongestHtml}</tbody>
    </table>
  </div>
</body>
</html>`;

  await Promise.all([
    fs.writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2)),
    fs.writeFile(OUTPUT_CSV, `\uFEFF${csvLines.join("\n")}`),
    fs.writeFile(OUTPUT_HTML, html),
  ]);

  console.log(JSON.stringify({
    ok: true,
    outputJson: path.basename(OUTPUT_JSON),
    outputCsv: path.basename(OUTPUT_CSV),
    outputHtml: path.basename(OUTPUT_HTML),
    weakestBefore: weakestBefore.slice(0, 5),
    weakestAfter: weakestAfter.slice(0, 5),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
