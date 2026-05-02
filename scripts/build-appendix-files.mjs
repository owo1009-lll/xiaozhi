import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { KNOWLEDGE_POINTS } from "../src/musicaiKnowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const APPENDIX_DIR = path.join(ROOT_DIR, "docs", "appendix");
const TEMP_DIR = path.join(ROOT_DIR, "data", "tmp");
const MTE_DIR = path.join(ROOT_DIR, "data", "mte");

const IMMS_TAM_ASCII_PATH = path.join(TEMP_DIR, "IMMS_TAM_Questionnaire_and_SPSS_Criteria.xlsx");
const MTE_PAPER_PATH = path.join(MTE_DIR, "mte-paper.json");
const MTE_ITEM_ANALYSIS_PATH = path.join(MTE_DIR, "mte-item-analysis.json");
const MTE_SUMMARY_PATH = path.join(MTE_DIR, "mte-summary.json");

const OUTPUTS = {
  directory: "附录目录.md",
  a1: "附录A1-24个知识点完整定义表.csv",
  a2: "附录A2-BIMMS36题完整量表.csv",
  a3: "附录A3-TAM13题完整量表.csv",
  a4: "附录A4-MTE试题蓝图表.csv",
  a5: "附录A5-MTE项目分析摘要表.csv",
  workbook: "附录总表.xlsx",
};

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function buildSheet(rows) {
  return xlsx.utils.aoa_to_sheet(rows);
}

function toList(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function normalizeScaleRows(rows) {
  const itemRows = [];
  for (let index = 3; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (typeof row[0] !== "number") continue;
    itemRows.push({
      itemNumber: row[0],
      dimension: row[1] || "",
      english: row[2] || "",
      chinese: row[3] || "",
      reverse: row[4] || "",
      spssVariable: row[5] || "",
    });
  }
  return itemRows;
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureWorkbookSource() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
  try {
    await fs.access(IMMS_TAM_ASCII_PATH);
    return IMMS_TAM_ASCII_PATH;
  } catch {
    throw new Error(`缺少量表源文件：${IMMS_TAM_ASCII_PATH}`);
  }
}

async function clearAppendixDirectory() {
  await fs.mkdir(APPENDIX_DIR, { recursive: true });
  const entries = await fs.readdir(APPENDIX_DIR, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(APPENDIX_DIR, entry.name), {
        recursive: true,
        force: true,
      }),
    ),
  );
}

function round(value, digits = 4) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : "";
}

function createKnowledgeRows() {
  return KNOWLEDGE_POINTS.map((point) => [
    point.id,
    point.title,
    point.lessonId,
    point.chapterId,
    toList(point.subConcepts).join("；"),
    toList(point.exerciseTypes).join("；"),
    toList(point.easy).join("；"),
    toList(point.medium).join("；"),
    toList(point.hard).join("；"),
  ]);
}

function createBlueprintRows(mteItems, mteSummary) {
  const actualMap = new Map();
  for (const item of mteItems) {
    const current = actualMap.get(item.lessonId) || {
      lessonId: item.lessonId,
      lessonTitle: item.lessonTitle,
      totalItems: 0,
      easyItems: 0,
      mediumItems: 0,
      hardItems: 0,
    };
    current.totalItems += 1;
    if (item.difficultyLabel === "易") current.easyItems += 1;
    if (item.difficultyLabel === "中") current.mediumItems += 1;
    if (item.difficultyLabel === "难") current.hardItems += 1;
    actualMap.set(item.lessonId, current);
  }

  return mteSummary.lessonDistribution.map((lesson) => {
    const actual = actualMap.get(lesson.lessonId) || {
      totalItems: 0,
      easyItems: 0,
      mediumItems: 0,
      hardItems: 0,
    };
    return [
      lesson.lessonId,
      lesson.lessonTitle,
      lesson.targetItems,
      actual.totalItems,
      actual.easyItems,
      actual.mediumItems,
      actual.hardItems,
      lesson.rationale || "",
    ];
  });
}

function createItemAnalysisRows(itemAnalysis, mteSummary) {
  return itemAnalysis.map((row) => [
    row.itemNumber,
    row.itemId,
    row.lessonId,
    row.knowledgePointId,
    round(row.difficultyIndex, 4),
    round(row.discriminationIndex, 4),
    round(row.itemTotalCorrelation, 4),
    round(row.kr20IfDeleted, 4),
    row.reviewDecision,
    round(mteSummary.kr20, 4),
  ]);
}

async function buildAppendixFiles() {
  await clearAppendixDirectory();

  const immsTamPath = await ensureWorkbookSource();
  const workbook = xlsx.readFile(immsTamPath);
  const immsRows = normalizeScaleRows(xlsx.utils.sheet_to_json(workbook.Sheets["IMMS 36 Items"], { header: 1, defval: null }));
  const tamRows = normalizeScaleRows(xlsx.utils.sheet_to_json(workbook.Sheets["TAM 13 Items"], { header: 1, defval: null }));

  const mteItems = await loadJson(MTE_PAPER_PATH);
  const itemAnalysis = await loadJson(MTE_ITEM_ANALYSIS_PATH);
  const mteSummary = await loadJson(MTE_SUMMARY_PATH);

  const knowledgeHeaders = ["知识点ID", "名称", "所属课时", "所属章节", "子概念", "对应题型", "一级难度", "二级难度", "三级难度"];
  const knowledgeRows = createKnowledgeRows();

  const bimmsHeaders = ["题号", "维度", "英文题干", "中文题干", "是否反向题", "SPSS变量名"];
  const bimmsRows = immsRows.map((row) => [row.itemNumber, row.dimension, row.english, row.chinese, row.reverse, row.spssVariable]);

  const tamHeaders = ["题号", "维度", "英文题干", "中文题干", "是否反向题", "SPSS变量名"];
  const tamRowsFlat = tamRows.map((row) => [row.itemNumber, row.dimension, row.english, row.chinese, row.reverse, row.spssVariable]);

  const blueprintHeaders = ["课时ID", "课时名称", "计划题数", "实际题数", "易题数", "中题数", "难题数", "分配说明"];
  const blueprintRows = createBlueprintRows(mteItems, mteSummary);

  const itemAnalysisHeaders = ["题号", "题目ID", "课时", "知识点ID", "难度系数", "区分度", "题总相关", "删题后KR-20", "审查结论", "整卷KR-20"];
  const itemAnalysisRows = createItemAnalysisRows(itemAnalysis, mteSummary);

  const directoryMd = [
    "# 附录目录",
    "",
    "本文件夹用于集中存放论文附录所需表格与摘要文件。",
    "",
    "包含文件：",
    "",
    `- \`${OUTPUTS.a1}\`：24 个知识点完整定义表（ID、名称、子概念、对应题型、三级难度）`,
    `- \`${OUTPUTS.a2}\`：BIMMS 36 题完整量表（英文 + 中文，标注反向题）`,
    `- \`${OUTPUTS.a3}\`：TAM 13 题完整量表（英文 + 中文）`,
    `- \`${OUTPUTS.a4}\`：MTE 试题蓝图表（每课时分配题数 + 难度分布，不含具体题目和答案）`,
    `- \`${OUTPUTS.a5}\`：MTE 项目分析摘要表（50 题的难度系数、区分度、KR-20 汇总）`,
    `- \`${OUTPUTS.workbook}\`：附录总表，整合以上全部内容为一个 Excel 文件`,
    "",
  ].join("\n");

  await Promise.all([
    fs.writeFile(path.join(APPENDIX_DIR, OUTPUTS.directory), `${directoryMd}\n`, "utf8"),
    fs.writeFile(path.join(APPENDIX_DIR, OUTPUTS.a1), buildCsv(knowledgeHeaders, knowledgeRows), "utf8"),
    fs.writeFile(path.join(APPENDIX_DIR, OUTPUTS.a2), buildCsv(bimmsHeaders, bimmsRows), "utf8"),
    fs.writeFile(path.join(APPENDIX_DIR, OUTPUTS.a3), buildCsv(tamHeaders, tamRowsFlat), "utf8"),
    fs.writeFile(path.join(APPENDIX_DIR, OUTPUTS.a4), buildCsv(blueprintHeaders, blueprintRows), "utf8"),
    fs.writeFile(path.join(APPENDIX_DIR, OUTPUTS.a5), buildCsv(itemAnalysisHeaders, itemAnalysisRows), "utf8"),
  ]);

  const appendixWorkbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    appendixWorkbook,
    buildSheet([
      ["附录编号", "文件名称", "内容说明"],
      ["附录A1", OUTPUTS.a1, "24 个知识点完整定义表"],
      ["附录A2", OUTPUTS.a2, "BIMMS 36 题完整量表"],
      ["附录A3", OUTPUTS.a3, "TAM 13 题完整量表"],
      ["附录A4", OUTPUTS.a4, "MTE 试题蓝图表"],
      ["附录A5", OUTPUTS.a5, "MTE 项目分析摘要表"],
    ]),
    "附录目录",
  );
  xlsx.utils.book_append_sheet(appendixWorkbook, buildSheet([knowledgeHeaders, ...knowledgeRows]), "附录A1_知识点");
  xlsx.utils.book_append_sheet(appendixWorkbook, buildSheet([bimmsHeaders, ...bimmsRows]), "附录A2_BIMMS36");
  xlsx.utils.book_append_sheet(appendixWorkbook, buildSheet([tamHeaders, ...tamRowsFlat]), "附录A3_TAM13");
  xlsx.utils.book_append_sheet(appendixWorkbook, buildSheet([blueprintHeaders, ...blueprintRows]), "附录A4_MTE蓝图");
  xlsx.utils.book_append_sheet(
    appendixWorkbook,
    buildSheet([
      ["整卷KR-20", round(mteSummary.kr20, 4)],
      ["题目总数", mteSummary.questionCount],
      ["难度达标题数", mteSummary.difficultyPassCount],
      ["区分度达标题数", mteSummary.discriminationPassCount],
      [],
      itemAnalysisHeaders,
      ...itemAnalysisRows,
    ]),
    "附录A5_MTE分析",
  );

  xlsx.writeFile(appendixWorkbook, path.join(APPENDIX_DIR, OUTPUTS.workbook));

  return {
    appendixDir: APPENDIX_DIR,
    files: Object.values(OUTPUTS),
  };
}

const result = await buildAppendixFiles();
console.log(JSON.stringify(result, null, 2));
