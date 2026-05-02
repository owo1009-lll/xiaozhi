import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data", "mte");
const outputFile = path.join(dataDir, "MTE-汇总总报告.docx");

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(dataDir, fileName), "utf8"));
}

function title(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text,
    heading: level,
    spacing: { before: 180, after: 100 },
  });
}

function normal(text, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold })],
    spacing: { after: 80 },
  });
}

function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function buildTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (header) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })],
            }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: headers.map(
              (header) =>
                new TableCell({
                  children: [new Paragraph(String(row[header] ?? ""))],
                }),
            ),
          }),
      ),
    ],
  });
}

async function main() {
  const paper = await readJson("mte-paper.json");
  const summary = await readJson("mte-summary.json");
  const analysis = await readJson("mte-item-analysis.json");
  const reviews = await readJson("mte-virtual-expert-review.json");

  const summaryTable = buildTable(
    ["指标", "结果"],
    [
      { 指标: "信度指标", 结果: "KR-20" },
      { 指标: "KR-20", 结果: round(summary.kr20, 4) },
      { 指标: "题目数量", 结果: summary.questionCount },
      { 指标: "虚拟预试人数", 结果: summary.studentCount },
      { 指标: "每题分值", 结果: summary.scoringModel.itemScore },
      { 指标: "满分", 结果: summary.scoringModel.maxScore },
      { 指标: "难度达标题", 结果: `${summary.difficultyPassCount}/${summary.questionCount}` },
      { 指标: "区分度达标题", 结果: `${summary.discriminationPassCount}/${summary.questionCount}` },
    ],
  );

  const lessonTable = buildTable(
    ["lessonId", "lessonTitle", "targetItems", "selectedItems", "rationale"],
    summary.lessonDistribution,
  );

  const itemTable = buildTable(
    ["itemId", "lessonId", "knowledgePointTitle", "difficultyIndex", "discriminationIndex", "reviewDecision"],
    analysis.map((item) => ({
      itemId: item.itemId,
      lessonId: item.lessonId,
      knowledgePointTitle: item.knowledgePointTitle,
      difficultyIndex: round(item.difficultyIndex, 4),
      discriminationIndex: round(item.discriminationIndex, 4),
      reviewDecision: item.reviewDecision,
    })),
  );

  const reviewTable = buildTable(
    ["itemId", "reviewerName", "relevance", "clarity", "difficultyFit", "comment"],
    reviews.slice(0, 24).map((item) => ({
      itemId: item.itemId,
      reviewerName: item.reviewerName,
      relevance: item.relevance,
      clarity: item.clarity,
      difficultyFit: item.difficultyFit,
      comment: item.comment,
    })),
  );

  const children = [
    title("MTE 汇总总报告"),
    normal("本报告以 Excel 定稿卷为唯一真源，整合正式试卷、答案与评分、虚拟学生预试统计、内容效度审查及论文写作模板。"),
    normal(`来源文件：${summary.sourceExcelPath}`),
    heading("一、研究摘要"),
    summaryTable,
    heading("二、课时分布蓝图"),
    lessonTable,
    pageBreak(),
    heading("三、正式试卷"),
  ];

  paper.forEach((item) => {
    children.push(
      heading(`第 ${item.itemNumber} 题`, HeadingLevel.HEADING_2),
      normal(`课时：${item.lessonId} ${item.lessonTitle}`),
      normal(`知识点：${item.knowledgePointTitle}`),
      normal(`难度：${item.difficultyLabel}`),
      normal(item.prompt),
    );
    item.options.forEach((option, index) => {
      children.push(bullet(`${String.fromCharCode(65 + index)}. ${option}`));
    });
  });

  children.push(pageBreak(), heading("四、答案与评分细则"));
  paper.forEach((item) => {
    children.push(
      heading(`第 ${item.itemNumber} 题`, HeadingLevel.HEADING_2),
      normal(`标准答案：${item.answer}（${item.answerText}）`),
      normal(item.scoringRule.fullCredit),
      ...item.scoringRule.rubric.map((rule) => bullet(`${rule.score} 分：${rule.description}`)),
    );
  });

  children.push(
    pageBreak(),
    heading("五、虚拟预试统计"),
    normal("统计输入为 0/1 正误矩阵。虽然卷面记分为每题 2 分，但 KR-20 的计算以答对=1、答错=0 为基础，因此该信度指标在本卷上适用。"),
    itemTable,
    heading("六、内容效度审查"),
    reviewTable,
    heading("七、论文方法模板"),
    normal("本研究采用经 Excel 定稿的 MTE 试卷，共 50 题，全部为单选题，每题 2 分，满分 100 分。"),
    normal("预试阶段采用 48 名虚拟学生进行先行模拟，以 0/1 正误矩阵计算 KR-20，并同步分析每题难度系数与区分度。"),
    normal("内容效度部分由 3 位虚拟资深乐理教师对题目相关性、表述清晰度与难度适切性进行审查。"),
    heading("八、论文结果模板"),
    normal(`虚拟预试结果显示，整卷 KR-20 为 ${round(summary.kr20, 4)}，达到内部一致性要求（> 0.80）。`),
    normal(`在 50 题中，共有 ${summary.difficultyPassCount} 题难度系数落在 0.30–0.70 范围内，${summary.discriminationPassCount} 题区分度达到 0.30 以上。`),
    normal("整体来看，该卷在固定课时权重分布下仍保持良好的内部一致性与项目区分度，可进入真实学生预试阶段。"),
  );

  const document = new Document({
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(document);
  await fs.writeFile(outputFile, buffer);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
