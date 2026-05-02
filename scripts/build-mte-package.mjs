import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMteResearchPackage } from "../src/mteExam.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data", "mte");
const docsDir = path.join(repoRoot, "docs", "mte");

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
}

function toBomCsv(headers, rows) {
  return `\uFEFF${toCsv(headers, rows)}`;
}

function markdownHeading(level, text) {
  return `${"#".repeat(level)} ${text}`;
}

function buildPaperMarkdown(result) {
  const lines = [
    markdownHeading(1, "MTE 正式试卷"),
    "",
    `来源：${result.config.sourceExcelPath}`,
    "",
    "题型：全部单选题",
    "计分方式：每题 2 分，满分 100 分",
    "",
  ];

  result.paper.forEach((item) => {
    lines.push(markdownHeading(2, `第 ${item.itemNumber} 题`));
    lines.push(`- 课时：${item.lessonId} ${item.lessonTitle}`);
    lines.push(`- 知识点：${item.knowledgePointTitle}`);
    lines.push(`- 难度：${item.difficultyLabel}`);
    lines.push("");
    lines.push(item.prompt);
    lines.push("");
    item.options.forEach((option, index) => {
      lines.push(`${String.fromCharCode(65 + index)}. ${option}`);
    });
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function buildHtmlReport(summary) {
  const lessonRows = summary.lessonDistribution
    .map(
      (item) =>
        `<tr><td>${item.lessonId}</td><td>${item.lessonTitle}</td><td>${item.targetItems}</td><td>${item.selectedItems}</td><td>${item.rationale}</td></tr>`,
    )
    .join("");

  const problemRows = summary.itemAnalysis
    .filter((item) => item.reviewDecision !== "保留")
    .slice(0, 15)
    .map(
      (item) =>
        `<tr><td>${item.itemId}</td><td>${item.lessonId}</td><td>${item.knowledgePointTitle}</td><td>${item.difficultyIndex}</td><td>${item.discriminationIndex}</td><td>${item.reviewDecision}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>MTE KR-20 预试报告</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #111; }
    .cards { display: grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap: 12px; margin: 24px 0; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; background: #fafafa; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0 28px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>MTE 虚拟预试研究包报告</h1>
  <p>本报告基于 Excel 定稿卷生成，信度指标使用 KR-20，统计输入为 0/1 正误矩阵，卷面总分按每题 2 分换算。</p>
  <div class="cards">
    <div class="card"><strong>KR-20</strong><div>${summary.kr20}</div></div>
    <div class="card"><strong>题目数</strong><div>${summary.questionCount}</div></div>
    <div class="card"><strong>预试人数</strong><div>${summary.studentCount}</div></div>
    <div class="card"><strong>难度达标题</strong><div>${summary.difficultyPassCount}/${summary.questionCount}</div></div>
    <div class="card"><strong>区分度达标题</strong><div>${summary.discriminationPassCount}/${summary.questionCount}</div></div>
  </div>
  <h2>课时分布</h2>
  <table>
    <thead><tr><th>课时</th><th>课时标题</th><th>目标题量</th><th>实际题量</th><th>设计理由</th></tr></thead>
    <tbody>${lessonRows}</tbody>
  </table>
  <h2>需要关注的题目</h2>
  <table>
    <thead><tr><th>题号</th><th>课时</th><th>知识点</th><th>难度</th><th>区分度</th><th>建议</th></tr></thead>
    <tbody>${problemRows}</tbody>
  </table>
</body>
</html>`;
}

async function cleanOutputs() {
  await fs.rm(docsDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(dataDir, { recursive: true });
}

async function main() {
  await cleanOutputs();

  const result = buildMteResearchPackage();
  const itemAnalysis = result.analysis.itemStats.map((item) => ({
    ...item,
    difficultyIndex: round(item.difficultyIndex, 4),
    meanScoreRate: round(item.meanScoreRate, 4),
    discriminationIndex: round(item.discriminationIndex, 4),
    itemTotalCorrelation: round(item.itemTotalCorrelation, 4),
    kr20IfDeleted: round(item.kr20IfDeleted, 4),
    expertCvi: round(item.expertCvi, 4),
  }));

  const summary = {
    sourceExcelPath: result.config.sourceExcelPath,
    generatedAt: new Date().toISOString(),
    scoringModel: {
      itemType: "single-choice",
      itemScore: result.config.itemScore,
      maxScore: result.config.maxScore,
      statisticalMatrix: "binary-0-1",
      reliabilityMetric: "KR-20",
    },
    questionCount: result.paper.length,
    studentCount: result.students.length,
    kr20: round(result.analysis.overallKr20, 4),
    difficultyPassCount: itemAnalysis.filter((item) => item.inDifficultyRange).length,
    discriminationPassCount: itemAnalysis.filter((item) => item.strongDiscrimination).length,
    lessonDistribution: result.lessonDistribution,
    difficultyDistribution: result.difficultyDistribution,
    itemAnalysis,
  };

  const paperForJson = result.paper.map((item) => ({
    ...item,
    scoringRule: item.scoringRule,
  }));

  const pretestRows = result.responses.map((student) => ({
    studentId: student.studentId,
    profile: student.profile,
    baseAbility: round(student.baseAbility, 4),
    totalBinaryScore: student.totalBinaryScore,
    totalScore: student.totalScore,
    responses: Object.fromEntries(
      student.responses.map((response) => [response.itemId, response.correctBinary]),
    ),
  }));

  await fs.writeFile(path.join(dataDir, "mte-paper.json"), JSON.stringify(paperForJson, null, 2), "utf8");
  await fs.writeFile(path.join(dataDir, "mte-paper.md"), buildPaperMarkdown(result), "utf8");
  await fs.writeFile(path.join(dataDir, "mte-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(dataDir, "mte-item-analysis.json"), JSON.stringify(itemAnalysis, null, 2), "utf8");
  await fs.writeFile(path.join(dataDir, "mte-pretest-results.json"), JSON.stringify(pretestRows, null, 2), "utf8");
  await fs.writeFile(path.join(dataDir, "mte-virtual-expert-review.json"), JSON.stringify(result.expertReviews, null, 2), "utf8");
  await fs.writeFile(path.join(dataDir, "mte-report.html"), buildHtmlReport(summary), "utf8");

  await fs.writeFile(
    path.join(dataDir, "mte-blueprint.csv"),
    toBomCsv(
      ["lessonId", "lessonTitle", "targetItems", "selectedItems", "rationale"],
      result.lessonDistribution.map((item) => [
        item.lessonId,
        item.lessonTitle,
        item.targetItems,
        item.selectedItems,
        item.rationale,
      ]),
    ),
    "utf8",
  );

  await fs.writeFile(
    path.join(dataDir, "mte-item-analysis.csv"),
    toBomCsv(
      [
        "itemId",
        "itemNumber",
        "lessonId",
        "knowledgePointId",
        "knowledgePointTitle",
        "difficultyLabel",
        "difficultyIndex",
        "discriminationIndex",
        "itemTotalCorrelation",
        "kr20IfDeleted",
        "expertCvi",
        "reviewDecision",
      ],
      itemAnalysis.map((item) => [
        item.itemId,
        item.itemNumber,
        item.lessonId,
        item.knowledgePointId,
        item.knowledgePointTitle,
        paperForJson.find((paperItem) => paperItem.itemId === item.itemId)?.difficultyLabel || "",
        item.difficultyIndex,
        item.discriminationIndex,
        item.itemTotalCorrelation,
        item.kr20IfDeleted,
        item.expertCvi,
        item.reviewDecision,
      ]),
    ),
    "utf8",
  );

  await fs.writeFile(
    path.join(dataDir, "mte-virtual-expert-review.csv"),
    toBomCsv(
      [
        "itemId",
        "itemNumber",
        "reviewerId",
        "reviewerName",
        "reviewerRole",
        "relevance",
        "clarity",
        "difficultyFit",
        "comment",
      ],
      result.expertReviews.map((item) => [
        item.itemId,
        item.itemNumber,
        item.reviewerId,
        item.reviewerName,
        item.reviewerRole,
        item.relevance,
        item.clarity,
        item.difficultyFit,
        item.comment,
      ]),
    ),
    "utf8",
  );

  const pretestHeaders = [
    "studentId",
    "profile",
    "baseAbility",
    "totalBinaryScore",
    "totalScore",
    ...result.paper.map((item) => item.itemId),
  ];
  await fs.writeFile(
    path.join(dataDir, "mte-pretest-results.csv"),
    toBomCsv(
      pretestHeaders,
      result.responses.map((student) => [
        student.studentId,
        student.profile,
        round(student.baseAbility, 4),
        student.totalBinaryScore,
        student.totalScore,
        ...result.paper.map(
          (item) => student.responses.find((response) => response.itemId === item.itemId)?.correctBinary ?? 0,
        ),
      ]),
    ),
    "utf8",
  );

  console.log(`KR-20: ${summary.kr20}`);
  console.log(`Difficulty pass count: ${summary.difficultyPassCount}/${summary.questionCount}`);
  console.log(`Discrimination pass count: ${summary.discriminationPassCount}/${summary.questionCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
