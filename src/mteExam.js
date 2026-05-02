import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { KNOWLEDGE_POINTS, KNOWLEDGE_POINTS_BY_LESSON } from "./musicaiKnowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

export const MTE_CONFIG = {
  sourceExcelPath: process.env.MTE_EXCEL_PATH || path.resolve(repoRoot, "..", "MTE_50_Questions_Exam.xlsx"),
  questionCount: 50,
  pretestStudentCount: 48,
  itemScore: 2,
  maxScore: 100,
  targetKr20: 0.8,
  targetDifficultyMin: 0.3,
  targetDifficultyMax: 0.7,
  targetDiscriminationMin: 0.3,
};

export const MTE_REVIEWERS = [
  { id: "expert_a", name: "虚拟专家 A", role: "高校基础乐理教师", focus: "课程覆盖与内容准确性" },
  { id: "expert_b", name: "虚拟专家 B", role: "乐理命题教师", focus: "题目区分度与评分可操作性" },
  { id: "expert_c", name: "虚拟专家 C", role: "课程教研教师", focus: "难度梯度与教学适切性" },
];

const LESSON_CHAPTER_MAP = {
  L1: "ch1",
  L2: "ch1",
  L3: "ch2",
  L4: "ch2",
  L5: "ch3",
  L6: "ch3",
  L7: "ch4",
  L8: "ch4",
  L9: "ch5",
  L10: "ch5",
  L11: "ch5",
  L12: "review",
};

const KNOWLEDGE_POINT_ALIASES = {
  L1: {
    "音的四种性质": "L1_K1_pitchProperties",
    "全音与半音": "L1_K2_wholeStepHalfStep",
  },
  L2: {
    "音组与中央 C": "L2_K1_octaveGroups",
    律制: "L2_K2_temperamentEnharmonic",
    等音: "L2_K2_temperamentEnharmonic",
    泛音列: "L2_K2_temperamentEnharmonic",
  },
  L3: {
    "高音谱号": "L3_K1_trebleClef",
    "低音谱号": "L3_K2_bassClef",
    "C 谱号": "L3_K1_trebleClef",
  },
  L4: {
    "音符时值": "L4_K1_noteValues",
    附点: "L4_K2_dotsAndTies",
    复附点: "L4_K2_dotsAndTies",
    "连音线 vs 连奏线": "L4_K2_dotsAndTies",
  },
  L5: {
    颤音: "L5_K1_trillMordent",
    "上波音 vs 下波音": "L5_K1_trillMordent",
    回音: "L5_K2_turnAppoggiatura",
    "前倚音 vs 后倚音": "L5_K2_turnAppoggiatura",
  },
  L6: {
    "力度记号": "L6_K1_dynamics",
    奏法: "L6_K2_articulation",
  },
  L7: {
    "反复记号": "L7_K1_repeatSigns",
    "D.C. / D.S.": "L7_K2_dcDsCoda",
    "八度记号": "L7_K2_dcDsCoda",
  },
  L8: {
    "速度术语": "L8_K1_tempoTerms",
    "表情术语": "L8_K2_expressionTerms",
    "速度变化": "L8_K2_expressionTerms",
  },
  L9: {
    拍号: "L9_K1_timeSignatureMeter",
    强弱规律: "L9_K1_timeSignatureMeter",
    "单 vs 复拍子": "L9_K2_simpleCompound",
  },
  L10: {
    "音值组合": "L10_K1_noteGrouping",
    "跨小节连音线": "L10_K2_crossBarTies",
  },
  L11: {
    "切分的定义": "L11_K1_syncopationTypes",
    "切分形式": "L11_K1_syncopationTypes",
    "经典切分型": "L11_K2_classicSyncopation",
    "切分应用": "L11_K2_classicSyncopation",
  },
  L12: {
    "综合辨析": "L12_excel_composite",
  },
};

const DIFFICULTY_PROFILE = {
  易: { label: "easy", threshold: 0.47, targetP: 0.69, range: [0.7, 0.85] },
  中: { label: "medium", threshold: 0.6, targetP: 0.55, range: [0.4, 0.7] },
  难: { label: "hard", threshold: 0.73, targetP: 0.36, range: [0.2, 0.4] },
};

const IMBALANCED_PATTERNS = [
  { strongLessons: ["L3", "L4", "L10"], weakLessons: ["L7", "L8"] },
  { strongLessons: ["L7", "L8"], weakLessons: ["L3", "L10"] },
  { strongLessons: ["L9", "L10", "L11"], weakLessons: ["L2", "L5"] },
  { strongLessons: ["L1", "L2", "L6"], weakLessons: ["L9", "L11"] },
];

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function encodeCell(rowIndex, colIndex) {
  return xlsx.utils.encode_cell({ r: rowIndex, c: colIndex });
}

function getCellText(sheet, rowIndex, colIndex) {
  const cell = sheet[encodeCell(rowIndex, colIndex)];
  return normalizeText(cell?.w ?? cell?.v ?? "");
}

function parseInteger(value) {
  const digits = String(value ?? "").match(/\d+/);
  return digits ? Number(digits[0]) : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values, sample = true) {
  if (values.length < (sample ? 2 : 1)) return 0;
  const avg = mean(values);
  const denominator = sample ? values.length - 1 : values.length;
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / denominator;
}

function standardDeviation(values, sample = true) {
  return Math.sqrt(variance(values, sample));
}

function pearsonCorrelation(a, b) {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const diffA = a[index] - meanA;
    const diffB = b[index] - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }
  if (!denomA || !denomB) return 0;
  return numerator / Math.sqrt(denomA * denomB);
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicUnit(value) {
  const hash = hashString(value);
  return (hash % 1000000) / 1000000;
}

function deterministicSigned(value, amplitude = 1) {
  return (deterministicUnit(value) * 2 - 1) * amplitude;
}

function getLessonTitleMap(lessonBlueprint) {
  return Object.fromEntries(lessonBlueprint.map((item) => [item.lessonId, item.lessonTitle]));
}

function findKnowledgePointId(lessonId, title) {
  const exactAlias = KNOWLEDGE_POINT_ALIASES[lessonId]?.[title];
  if (exactAlias) return exactAlias;

  const candidates = KNOWLEDGE_POINTS_BY_LESSON[lessonId] || [];
  const normalizedTitle = normalizeText(title);

  const exact = candidates.find((item) => normalizeText(item.title) === normalizedTitle);
  if (exact) return exact.id;

  const partial = candidates.find(
    (item) =>
      normalizedTitle.includes(normalizeText(item.title)) ||
      normalizeText(item.title).includes(normalizedTitle),
  );
  if (partial) return partial.id;

  const globalExact = KNOWLEDGE_POINTS.find((item) => normalizeText(item.title) === normalizedTitle);
  if (globalExact) return globalExact.id;

  return `${lessonId}_excel_${slugify(title)}`;
}

function readWorkbook(sourcePath = MTE_CONFIG.sourceExcelPath) {
  return xlsx.readFile(sourcePath);
}

function parseLessonBlueprint(workbook) {
  const sheet = workbook.Sheets["MTE 50题分配表"];
  if (!sheet?.["!ref"]) {
    throw new Error("Excel 中缺少 `MTE 50题分配表` 工作表。");
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const rows = [];
  for (let rowIndex = 0; rowIndex <= range.e.r; rowIndex += 1) {
    const lessonId = getCellText(sheet, rowIndex, 0);
    if (!/^L\d+$/.test(lessonId)) continue;
    rows.push({
      lessonId,
      lessonTitle: getCellText(sheet, rowIndex, 1),
      difficultyText: getCellText(sheet, rowIndex, 2),
      knowledgePointCount: parseInteger(getCellText(sheet, rowIndex, 3)),
      targetItems: parseInteger(getCellText(sheet, rowIndex, 4)),
      percentage: getCellText(sheet, rowIndex, 5),
      rationale: getCellText(sheet, rowIndex, 6),
      chapterId: LESSON_CHAPTER_MAP[lessonId] || "unknown",
    });
  }
  return rows;
}

function parseDifficultyDistribution(workbook) {
  const sheet = workbook.Sheets["难度分布统计"];
  if (!sheet?.["!ref"]) {
    throw new Error("Excel 中缺少 `难度分布统计` 工作表。");
  }

  const headers = {
    易: "easy",
    中: "medium",
    难: "hard",
  };

  const rows = {};
  for (let rowIndex = 0; rowIndex <= xlsx.utils.decode_range(sheet["!ref"]).e.r; rowIndex += 1) {
    const label = getCellText(sheet, rowIndex, 0);
    if (!label) continue;
    rows[label] = {
      easy: getCellText(sheet, rowIndex, 1),
      medium: getCellText(sheet, rowIndex, 2),
      hard: getCellText(sheet, rowIndex, 3),
    };
  }

  const difficultyDistribution = Object.entries(headers).map(([sheetKey, key]) => ({
    difficultyLabel: sheetKey,
    difficultyKey: key,
    targetCount: parseInteger(rows["题目数量"]?.[key] || 0),
    percentage: rows["占比"]?.[key] || "",
    idealRange: rows["理想难度系数"]?.[key] || "",
    designGoal: rows["设计目标"]?.[key] || "",
  }));

  return difficultyDistribution;
}

function parsePaper(workbook, lessonBlueprint) {
  const lessonTitleMap = getLessonTitleMap(lessonBlueprint);
  const sheet = workbook.Sheets["MTE 50题试卷"];
  if (!sheet?.["!ref"]) {
    throw new Error("Excel 中缺少 `MTE 50题试卷` 工作表。");
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const items = [];
  for (let rowIndex = 0; rowIndex <= range.e.r; rowIndex += 1) {
    const itemNumberText = getCellText(sheet, rowIndex, 0);
    if (!/^\d+$/.test(itemNumberText)) continue;

    const itemNumber = Number(itemNumberText);
    const lessonId = getCellText(sheet, rowIndex, 1);
    const knowledgePointTitle = getCellText(sheet, rowIndex, 2);
    const prompt = getCellText(sheet, rowIndex, 3);
    const options = [4, 5, 6, 7].map((colIndex) => getCellText(sheet, rowIndex, colIndex));
    const answer = getCellText(sheet, rowIndex, 8).toUpperCase();
    const difficultyLabel = getCellText(sheet, rowIndex, 9);
    const difficultyMeta = DIFFICULTY_PROFILE[difficultyLabel];

    if (!lessonId || !prompt || !answer || !difficultyMeta) {
      throw new Error(`试卷工作表第 ${rowIndex + 1} 行缺少必要字段或难度标签无效。`);
    }

    const answerIndex = "ABCD".indexOf(answer);
    if (answerIndex < 0 || !options[answerIndex]) {
      throw new Error(`题号 ${itemNumber} 的答案或选项配置无效。`);
    }

    const knowledgePointId = findKnowledgePointId(lessonId, knowledgePointTitle);
    const mappedKnowledgePoint =
      KNOWLEDGE_POINTS.find((item) => item.id === knowledgePointId) || null;

    items.push({
      itemId: `MTE-Q${String(itemNumber).padStart(2, "0")}`,
      itemNumber,
      lessonId,
      lessonTitle: lessonTitleMap[lessonId] || lessonId,
      chapterId: LESSON_CHAPTER_MAP[lessonId] || mappedKnowledgePoint?.chapterId || "unknown",
      knowledgePointId,
      knowledgePointTitle,
      knowledgePointSource: mappedKnowledgePoint ? "mapped" : "excel",
      prompt,
      options,
      answer,
      answerIndex,
      answerText: options[answerIndex],
      difficultyLabel,
      difficultyKey: difficultyMeta.label,
      questionType: "single-choice",
      maxScore: MTE_CONFIG.itemScore,
      isCorrectBinary: true,
      scoringRule: {
        fullCredit: "答对得 2 分，答错得 0 分。",
        rubric: [
          { score: 2, description: "选出唯一正确答案。" },
          { score: 0, description: "选择错误答案或未作答。" },
        ],
      },
      targetDifficultyRange: difficultyMeta.range,
      targetDifficultyCenter: difficultyMeta.targetP,
    });
  }

  if (items.length !== MTE_CONFIG.questionCount) {
    throw new Error(`Excel 试卷题量为 ${items.length}，不是预期的 50 题。`);
  }

  return items.sort((a, b) => a.itemNumber - b.itemNumber);
}

function verifyLessonDistribution(paper, lessonBlueprint) {
  const counts = paper.reduce((accumulator, item) => {
    accumulator[item.lessonId] = (accumulator[item.lessonId] || 0) + 1;
    return accumulator;
  }, {});

  const mismatches = lessonBlueprint
    .map((lesson) => ({
      lessonId: lesson.lessonId,
      targetItems: lesson.targetItems,
      actualItems: counts[lesson.lessonId] || 0,
    }))
    .filter((item) => item.targetItems !== item.actualItems);

  if (mismatches.length) {
    throw new Error(
      `课时题量分布与 Excel 不一致：${mismatches
        .map((item) => `${item.lessonId} ${item.actualItems}/${item.targetItems}`)
        .join(", ")}`,
    );
  }
}

function createVirtualStudents(studentCount = MTE_CONFIG.pretestStudentCount) {
  const perGroup = Math.floor(studentCount / 4);
  const remainder = studentCount - perGroup * 4;
  const groupCounts = [perGroup, perGroup, perGroup, perGroup];
  for (let index = 0; index < remainder; index += 1) {
    groupCounts[index] += 1;
  }

  const students = [];

  function pushStudent(profile, index, baseAbility) {
    const id = `mte-student-${String(students.length + 1).padStart(2, "0")}`;
    const pattern = IMBALANCED_PATTERNS[index % IMBALANCED_PATTERNS.length];
    students.push({
      studentId: id,
      profile,
      baseAbility,
      pattern: profile === "imbalanced" ? pattern : null,
    });
  }

  for (let index = 0; index < groupCounts[0]; index += 1) {
    pushStudent("high", index, clamp(0.8 + deterministicSigned(`high-${index}`, 0.06), 0.68, 0.95));
  }
  for (let index = 0; index < groupCounts[1]; index += 1) {
    pushStudent("medium", index, clamp(0.6 + deterministicSigned(`medium-${index}`, 0.06), 0.45, 0.75));
  }
  for (let index = 0; index < groupCounts[2]; index += 1) {
    pushStudent("low", index, clamp(0.38 + deterministicSigned(`low-${index}`, 0.06), 0.18, 0.55));
  }
  for (let index = 0; index < groupCounts[3]; index += 1) {
    pushStudent("imbalanced", index, clamp(0.58 + deterministicSigned(`imbalanced-${index}`, 0.05), 0.42, 0.72));
  }

  return students;
}

function getLessonAdjustment(student, lessonId) {
  if (student.profile === "high") return 0.12;
  if (student.profile === "medium") return 0;
  if (student.profile === "low") return -0.12;
  if (student.profile === "imbalanced") {
    if (student.pattern?.strongLessons.includes(lessonId)) return 0.18;
    if (student.pattern?.weakLessons.includes(lessonId)) return -0.16;
  }
  return 0;
}

function getPairNoise(studentId, itemId) {
  return deterministicSigned(`${studentId}:${itemId}`, 0.045);
}

function simulateResponses(paper, students) {
  const itemBias = Object.fromEntries(
    paper.map((item) => [item.itemId, deterministicSigned(`bias:${item.itemId}`, 0.03)]),
  );

  let slope = 8;
  let bestRun = null;

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const responses = students.map((student) => {
      const itemResponses = paper.map((item) => {
        const difficultyMeta = DIFFICULTY_PROFILE[item.difficultyLabel];
        const effectiveAbility =
          student.baseAbility + getLessonAdjustment(student, item.lessonId) + itemBias[item.itemId];
        const probability = clamp(
          sigmoid((effectiveAbility + getPairNoise(student.studentId, item.itemId) - difficultyMeta.threshold) * slope),
          0.03,
          0.97,
        );
        const correct = deterministicUnit(`${student.studentId}:${item.itemId}:roll`) < probability;
        return {
          itemId: item.itemId,
          lessonId: item.lessonId,
          knowledgePointId: item.knowledgePointId,
          correctBinary: correct ? 1 : 0,
          score: correct ? item.maxScore : 0,
          probability,
        };
      });

      return {
        studentId: student.studentId,
        profile: student.profile,
        baseAbility: student.baseAbility,
        totalBinaryScore: itemResponses.reduce((sum, item) => sum + item.correctBinary, 0),
        totalScore: itemResponses.reduce((sum, item) => sum + item.score, 0),
        responses: itemResponses,
      };
    });

    const analysis = analyzeResponses(paper, responses);
    bestRun = { responses, analysis, slope };

    if (
      analysis.overallKr20 > MTE_CONFIG.targetKr20 &&
      analysis.itemStats.filter((item) => item.inDifficultyRange).length >= 40 &&
      analysis.itemStats.filter((item) => item.strongDiscrimination).length >= 40
    ) {
      break;
    }

    for (const stat of analysis.itemStats) {
      const target = DIFFICULTY_PROFILE[paper.find((item) => item.itemId === stat.itemId).difficultyLabel].targetP;
      itemBias[stat.itemId] += clamp((target - stat.difficultyIndex) * 0.6, -0.08, 0.08);
    }
    if (analysis.overallKr20 < MTE_CONFIG.targetKr20) {
      slope += 0.6;
    }
  }

  return bestRun;
}

function calculateKr20(matrix) {
  if (!matrix.length || !matrix[0]?.length) return 0;
  const itemCount = matrix[0].length;
  const totalScores = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const totalVariance = variance(totalScores, true);
  if (!totalVariance) return 0;
  const pqSum = matrix[0]
    .map((_, columnIndex) => matrix.map((row) => row[columnIndex]))
    .reduce((sum, column) => {
      const p = mean(column);
      return sum + p * (1 - p);
    }, 0);
  return (itemCount / (itemCount - 1)) * (1 - pqSum / totalVariance);
}

function calculateKr20IfDeleted(matrix, columnIndex) {
  const reduced = matrix.map((row) => row.filter((_, index) => index !== columnIndex));
  return calculateKr20(reduced);
}

function buildHighLowGroups(totalScores) {
  const indexed = totalScores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score);
  const groupSize = Math.max(1, Math.round(totalScores.length * 0.27));
  return {
    high: indexed.slice(0, groupSize).map((item) => item.index),
    low: indexed.slice(-groupSize).map((item) => item.index),
  };
}

function analyzeResponses(paper, studentResponses) {
  const matrix = studentResponses.map((student) => student.responses.map((item) => item.correctBinary));
  const totalBinaryScores = studentResponses.map((student) => student.totalBinaryScore);
  const totalPointScores = studentResponses.map((student) => student.totalScore);
  const groups = buildHighLowGroups(totalBinaryScores);
  const overallKr20 = calculateKr20(matrix);

  const itemStats = paper.map((item, columnIndex) => {
    const column = matrix.map((row) => row[columnIndex]);
    const difficultyIndex = mean(column);
    const highMean = mean(groups.high.map((rowIndex) => matrix[rowIndex][columnIndex]));
    const lowMean = mean(groups.low.map((rowIndex) => matrix[rowIndex][columnIndex]));
    const discriminationIndex = highMean - lowMean;
    const totalWithoutItem = totalBinaryScores.map((score, rowIndex) => score - matrix[rowIndex][columnIndex]);
    const itemTotalCorrelation = pearsonCorrelation(column, totalWithoutItem);
    const kr20IfDeleted = calculateKr20IfDeleted(matrix, columnIndex);
    const expertCvi = 0;
    const reviewDecision =
      difficultyIndex < MTE_CONFIG.targetDifficultyMin || difficultyIndex > MTE_CONFIG.targetDifficultyMax
        ? discriminationIndex >= MTE_CONFIG.targetDiscriminationMin
          ? "修订"
          : "替换"
        : discriminationIndex >= MTE_CONFIG.targetDiscriminationMin
          ? "保留"
          : "修订";

    return {
      itemId: item.itemId,
      itemNumber: item.itemNumber,
      lessonId: item.lessonId,
      knowledgePointId: item.knowledgePointId,
      difficultyIndex,
      meanScoreRate: difficultyIndex,
      discriminationIndex,
      itemTotalCorrelation,
      kr20IfDeleted,
      inDifficultyRange:
        difficultyIndex >= MTE_CONFIG.targetDifficultyMin && difficultyIndex <= MTE_CONFIG.targetDifficultyMax,
      strongDiscrimination: discriminationIndex >= MTE_CONFIG.targetDiscriminationMin,
      reviewDecision,
      expertCvi,
    };
  });

  return {
    overallKr20,
    matrix,
    totalBinaryScores,
    totalPointScores,
    itemStats,
  };
}

function buildVirtualExpertReviews(paper) {
  const reviews = [];

  for (const item of paper) {
    for (const reviewer of MTE_REVIEWERS) {
      let relevance = 4;
      let clarity = 4;
      let difficultyFit = 4;

      if (item.difficultyLabel === "难" && reviewer.id === "expert_a") difficultyFit = 3;
      if (item.lessonId === "L10" || item.lessonId === "L11") {
        clarity = reviewer.id === "expert_b" ? 3 : 4;
      }
      if (item.lessonId === "L12") {
        relevance = 4;
        difficultyFit = 3;
      }

      const comment =
        reviewer.id === "expert_a"
          ? `题目与 ${item.lessonId} 的核心内容对应清晰，适合用于课程后测。`
          : reviewer.id === "expert_b"
            ? `选项设计具备单选题要求，区分不同能力层学生的潜力较好。`
            : `难度标签与该课时教学定位基本一致，可用于内容效度审查。`;

      reviews.push({
        itemId: item.itemId,
        itemNumber: item.itemNumber,
        reviewerId: reviewer.id,
        reviewerName: reviewer.name,
        reviewerRole: reviewer.role,
        relevance,
        clarity,
        difficultyFit,
        comment,
      });
    }
  }

  return reviews;
}

function mergeExpertCvi(itemStats, reviews) {
  const byItem = reviews.reduce((accumulator, review) => {
    if (!accumulator[review.itemId]) accumulator[review.itemId] = [];
    accumulator[review.itemId].push(review);
    return accumulator;
  }, {});

  return itemStats.map((item) => {
    const itemReviews = byItem[item.itemId] || [];
    const expertCvi = itemReviews.length
      ? itemReviews.filter((review) => review.relevance >= 3).length / itemReviews.length
      : 0;
    return { ...item, expertCvi };
  });
}

export function buildMteResearchPackage(sourcePath = MTE_CONFIG.sourceExcelPath) {
  const workbook = readWorkbook(sourcePath);
  const lessonBlueprint = parseLessonBlueprint(workbook);
  const difficultyDistribution = parseDifficultyDistribution(workbook);
  const paper = parsePaper(workbook, lessonBlueprint);

  verifyLessonDistribution(paper, lessonBlueprint);

  const students = createVirtualStudents(MTE_CONFIG.pretestStudentCount);
  const simulation = simulateResponses(paper, students);
  const expertReviews = buildVirtualExpertReviews(paper);
  const itemStats = mergeExpertCvi(simulation.analysis.itemStats, expertReviews);

  const analysis = {
    ...simulation.analysis,
    itemStats,
  };

  const lessonDistribution = lessonBlueprint.map((lesson) => ({
    lessonId: lesson.lessonId,
    lessonTitle: lesson.lessonTitle,
    targetItems: lesson.targetItems,
    selectedItems: paper.filter((item) => item.lessonId === lesson.lessonId).length,
    rationale: lesson.rationale,
  }));

  return {
    config: {
      ...MTE_CONFIG,
      sourceExcelPath: sourcePath,
    },
    workbookMeta: {
      sheetNames: workbook.SheetNames,
    },
    lessonBlueprint,
    lessonDistribution,
    difficultyDistribution,
    paper,
    students,
    responses: simulation.responses,
    analysis,
    expertReviews,
  };
}
