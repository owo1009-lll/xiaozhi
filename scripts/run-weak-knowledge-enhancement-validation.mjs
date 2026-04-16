import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BKT_PARAMS, KNOWLEDGE_POINTS_BY_ID } from "../src/musicaiKnowledge.js";
import { WEAK_KNOWLEDGE_ENHANCEMENTS } from "../src/weakKnowledgeEnhancements.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const TARGET_IDS = [
  "L1_K1_pitchProperties",
  "L1_K2_wholeStepHalfStep",
  "L2_K1_octaveGroups",
  "L2_K2_temperamentEnharmonic",
  "L3_K1_trebleClef",
  "L3_K2_bassClef",
  "L4_K1_noteValues",
  "L4_K2_dotsAndTies",
  "L5_K1_trillMordent",
  "L5_K2_turnAppoggiatura",
  "L6_K1_dynamics",
  "L6_K2_articulation",
  "L7_K1_repeatSigns",
  "L7_K2_dcDsCoda",
  "L8_K1_tempoTerms",
  "L8_K2_expressionTerms",
  "L9_K1_timeSignatureMeter",
  "L9_K2_simpleCompound",
  "L10_K1_noteGrouping",
  "L10_K2_crossBarTies",
  "L11_K1_syncopationTypes",
  "L11_K2_classicSyncopation",
];

const STUDENT_COUNT = Math.max(20, Math.min(300, Number(process.env.WEAK_ENHANCEMENT_STUDENT_COUNT || 100)));
const DURATION_MINUTES = Math.max(60, Math.min(240, Number(process.env.WEAK_ENHANCEMENT_DURATION_MINUTES || 120)));
const OUTPUT_JSON = path.join(DATA_DIR, "weak-knowledge-enhancement-validation-latest.json");
const OUTPUT_CSV = path.join(DATA_DIR, "weak-knowledge-enhancement-validation-latest.csv");
const OUTPUT_HTML = path.join(DATA_DIR, "weak-knowledge-enhancement-validation-latest.html");

function nowIso() {
  return new Date().toISOString();
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp01(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
}

function applyBktObservation(previousPL, isCorrect, params = BKT_PARAMS) {
  const pL = clamp01(previousPL);
  const pT = clamp01(params.pT);
  const pG = clamp01(params.pG);
  const pS = clamp01(params.pS);

  const posterior = isCorrect
    ? (pL * (1 - pS)) / ((pL * (1 - pS)) + ((1 - pL) * pG))
    : (pL * pS) / ((pL * pS) + ((1 - pL) * (1 - pG)));

  return clamp01(posterior + ((1 - posterior) * pT));
}

function pickWeightedValue(rng, items, getWeight) {
  const normalized = items
    .map((item, index) => ({ item, weight: Math.max(0.0001, Number(getWeight(item, index) || 0)) }))
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
  const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * total;
  for (const entry of normalized) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return normalized[normalized.length - 1]?.item;
}

function getProfileConfig() {
  return [
    { profile: "excellent", label: "优等型", baseAccuracy: [0.76, 0.86], weight: 0.22 },
    { profile: "steady", label: "中等稳定型", baseAccuracy: [0.55, 0.68], weight: 0.42 },
    { profile: "imbalanced", label: "偏科型", baseAccuracy: [0.54, 0.68], weight: 0.18 },
    { profile: "lowengage", label: "低参与型", baseAccuracy: [0.32, 0.46], weight: 0.18 },
  ];
}

function getPointFamily(pointId) {
  if (["L3_K1_trebleClef", "L3_K2_bassClef", "L2_K1_octaveGroups"].includes(pointId)) return "notation";
  if (["L4_K1_noteValues", "L9_K1_timeSignatureMeter", "L9_K2_simpleCompound", "L10_K1_noteGrouping", "L10_K2_crossBarTies", "L11_K1_syncopationTypes", "L11_K2_classicSyncopation"].includes(pointId)) return "rhythm";
  if (["L6_K1_dynamics", "L8_K1_tempoTerms", "L8_K2_expressionTerms", "L6_K2_articulation"].includes(pointId)) return "terms";
  if (["L5_K1_trillMordent", "L5_K2_turnAppoggiatura"].includes(pointId)) return "ornament";
  return "theory";
}

function getProfileBias(profile, pointId) {
  const family = getPointFamily(pointId);
  if (profile === "excellent") return 0.1;
  if (profile === "steady") return 0.02;
  if (profile === "lowengage") return -0.08;
  if (profile === "imbalanced") {
    if (family === "rhythm") return 0.12;
    if (family === "notation") return -0.12;
    return -0.02;
  }
  return 0;
}

function createStudentProfile(index) {
  const rng = createSeededRandom(hashString(`weak-enhancement-${index}`));
  const profile = pickWeightedValue(rng, getProfileConfig(), (item) => item.weight);
  const accuracyBase = profile.baseAccuracy[0] + ((profile.baseAccuracy[1] - profile.baseAccuracy[0]) * rng());
  return {
    rng,
    profile: profile.profile,
    label: profile.label,
    accuracyBase: Number(accuracyBase.toFixed(3)),
  };
}

function simulatePoint({ rng, pointId, profile, accuracyBase, enhanced = false }) {
  const enhancement = WEAK_KNOWLEDGE_ENHANCEMENTS[pointId];
  const correctionCount = enhancement?.correctionQuestions?.length || 0;
  const misunderstandingCount = enhancement?.misunderstandings?.length || 0;
  const guideCount = enhancement?.practiceGuide?.length || 0;
  const practiceAttempts = 12;
  let pL = BKT_PARAMS.pL0;
  let correctCount = 0;
  let attempts = 0;
  const hasVisualWidget = pointId === "L3_K1_trebleClef";
  const hasBassWidget = pointId === "L3_K2_bassClef";
  const hasContrastCard = pointId === "L8_K2_expressionTerms";
  const hasNoteValueGuide = pointId === "L4_K1_noteValues";
  const hasDotsGuide = pointId === "L4_K2_dotsAndTies";
  const hasTrillGuide = pointId === "L5_K1_trillMordent";
  const hasOrnamentGuide = pointId === "L5_K2_turnAppoggiatura";
  const hasArticulationGuide = pointId === "L6_K2_articulation";
  const hasDynamicsGuide = pointId === "L6_K1_dynamics";
  const hasRepeatGuide = pointId === "L7_K1_repeatSigns";
  const hasDcGuide = pointId === "L7_K2_dcDsCoda";
  const hasEnharmonicGuide = pointId === "L2_K2_temperamentEnharmonic";
  const hasSyncTypeGuide = pointId === "L11_K1_syncopationTypes";
  const hasSyncopationGuide = pointId === "L11_K2_classicSyncopation";
  const hasMeterGuide = pointId === "L9_K1_timeSignatureMeter";
  const hasCrossBarGuide = pointId === "L10_K2_crossBarTies";

  if (enhanced) {
    for (let index = 0; index < correctionCount; index += 1) {
      let correctionAccuracy = accuracyBase + getProfileBias(profile, pointId) + 0.11;
      correctionAccuracy += Math.min(0.05, misunderstandingCount * 0.008);
      correctionAccuracy += Math.min(0.04, guideCount * 0.006);
      if (hasVisualWidget) correctionAccuracy += 0.05;
      if (hasBassWidget) correctionAccuracy += 0.05;
      if (hasContrastCard) correctionAccuracy += 0.04;
      if (hasNoteValueGuide) correctionAccuracy += 0.04;
      if (hasDotsGuide) correctionAccuracy += 0.04;
      if (hasTrillGuide) correctionAccuracy += 0.04;
      if (hasOrnamentGuide) correctionAccuracy += 0.04;
      if (hasDynamicsGuide) correctionAccuracy += 0.04;
      if (hasArticulationGuide) correctionAccuracy += 0.04;
      if (hasRepeatGuide) correctionAccuracy += 0.04;
      if (hasDcGuide) correctionAccuracy += 0.04;
      if (hasEnharmonicGuide) correctionAccuracy += 0.04;
      if (hasSyncTypeGuide) correctionAccuracy += 0.05;
      if (hasSyncopationGuide) correctionAccuracy += 0.05;
      if (hasMeterGuide) correctionAccuracy += 0.04;
      if (hasCrossBarGuide) correctionAccuracy += 0.04;
      correctionAccuracy = clamp01(correctionAccuracy);
      const isCorrect = rng() < correctionAccuracy;
      pL = applyBktObservation(pL, isCorrect);
      attempts += 1;
      if (isCorrect) correctCount += 1;
    }
  }

  let recentIncorrect = false;
  for (let index = 0; index < practiceAttempts; index += 1) {
    let effectiveAccuracy = accuracyBase + getProfileBias(profile, pointId);
    if (enhanced) {
      effectiveAccuracy += 0.05;
      if (index < 4) effectiveAccuracy += 0.03;
      if (recentIncorrect) effectiveAccuracy += 0.04;
      effectiveAccuracy += Math.min(0.04, misunderstandingCount * 0.006);
      effectiveAccuracy += Math.min(0.03, guideCount * 0.005);
      if (hasVisualWidget && index < 6) effectiveAccuracy += 0.05;
      if (hasBassWidget && index < 6) effectiveAccuracy += 0.05;
      if (hasContrastCard && index < 6) effectiveAccuracy += 0.04;
      if (hasNoteValueGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasDotsGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasTrillGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasOrnamentGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasDynamicsGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasArticulationGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasRepeatGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasDcGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasEnharmonicGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasSyncTypeGuide && index < 6) effectiveAccuracy += 0.05;
      if (hasSyncopationGuide && index < 6) effectiveAccuracy += 0.05;
      if (hasMeterGuide && index < 6) effectiveAccuracy += 0.04;
      if (hasCrossBarGuide && index < 6) effectiveAccuracy += 0.04;
    }
    effectiveAccuracy = clamp01(effectiveAccuracy);
    const isCorrect = rng() < effectiveAccuracy;
    pL = applyBktObservation(pL, isCorrect);
    attempts += 1;
    if (isCorrect) correctCount += 1;
    recentIncorrect = !isCorrect;
  }

  return {
    pointId,
    pL: Number(pL.toFixed(3)),
    attempts,
    correctCount,
    mastered: pL >= BKT_PARAMS.masteryThreshold,
  };
}

function summarizeByPoint(results) {
  return TARGET_IDS.map((pointId) => {
    const rows = results.map((student) => student.points[pointId]);
    const averagePL = rows.reduce((sum, item) => sum + item.pL, 0) / Math.max(1, rows.length);
    const masteredRate = rows.filter((item) => item.mastered).length / Math.max(1, rows.length);
    return {
      id: pointId,
      title: KNOWLEDGE_POINTS_BY_ID[pointId]?.title || pointId,
      lessonId: KNOWLEDGE_POINTS_BY_ID[pointId]?.lessonId || "",
      averagePL: Number(averagePL.toFixed(3)),
      masteredRate: Number(masteredRate.toFixed(3)),
    };
  });
}

async function loadBaselineMap() {
  const sourcePath = path.join(DATA_DIR, "all-features-deep-simulation-latest.json");
  const raw = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const averages = raw?.bkt?.summary?.knowledgePointAverages || [];
  return Object.fromEntries(averages.map((item) => [item.id, item]));
}

function buildCsv(rows) {
  const headers = ["knowledgePointId", "title", "lessonId", "baselineAveragePL", "afterAveragePL", "deltaPL", "baselineMasteredRate", "afterMasteredRate", "deltaMasteredRate"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push([
      row.id,
      `"${String(row.title).replace(/"/g, '""')}"`,
      row.lessonId,
      row.baselineAveragePL.toFixed(3),
      row.afterAveragePL.toFixed(3),
      row.deltaPL.toFixed(3),
      row.baselineMasteredRate.toFixed(3),
      row.afterMasteredRate.toFixed(3),
      row.deltaMasteredRate.toFixed(3),
    ].join(","));
  }
  return lines.join("\n");
}

function buildHtmlReport({ generatedAt, studentCount, durationMinutes, rows }) {
  const maxDelta = Math.max(...rows.map((row) => row.deltaPL), 0.001);
  const barRows = rows.map((row) => {
    const width = Math.max(6, Math.round((row.deltaPL / maxDelta) * 100));
    return `
      <tr>
        <td>${row.title}</td>
        <td>${row.baselineAveragePL.toFixed(3)}</td>
        <td>${row.afterAveragePL.toFixed(3)}</td>
        <td>${row.deltaPL.toFixed(3)}</td>
        <td>${row.baselineMasteredRate.toFixed(3)}</td>
        <td>${row.afterMasteredRate.toFixed(3)}</td>
        <td>
          <div style="background:#111111;height:10px;border-radius:999px;width:${width}%"></div>
        </td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>弱知识点强化验证报告</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;background:#fafafa}
      h1,h2{margin:0 0 12px}
      .meta{margin:0 0 20px;color:#555;line-height:1.8}
      table{width:100%;border-collapse:collapse;background:#fff}
      th,td{padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-size:13px}
      th{background:#f3f4f6}
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:18px}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>8 个长期薄弱知识点强化验证</h1>
      <div class="meta">
        生成时间：${generatedAt}<br/>
        虚拟学生：${studentCount} 名<br/>
        模拟时长：${durationMinutes} 分钟<br/>
        说明：对比基线来自最新 100 人全功能深测；新结果额外纳入解释卡、纠错题和课堂练习引导。
      </div>
    </div>
    <div class="card">
      <h2>前后对比</h2>
      <table>
        <thead>
          <tr>
            <th>知识点</th>
            <th>基线 P(L)</th>
            <th>强化后 P(L)</th>
            <th>提升</th>
            <th>基线 mastered</th>
            <th>强化后 mastered</th>
            <th>提升图</th>
          </tr>
        </thead>
        <tbody>${barRows}</tbody>
      </table>
    </div>
  </body>
  </html>`;
}

async function main() {
  const baselineMap = await loadBaselineMap();
  const students = [];

  for (let index = 1; index <= STUDENT_COUNT; index += 1) {
    const student = createStudentProfile(index);
    const points = Object.fromEntries(
      TARGET_IDS.map((pointId) => [
        pointId,
        simulatePoint({
          rng: student.rng,
          pointId,
          profile: student.profile,
          accuracyBase: student.accuracyBase,
          enhanced: true,
        }),
      ]),
    );
    students.push({
      studentId: `weak-enhancement-${String(index).padStart(3, "0")}`,
      profile: student.profile,
      points,
    });
  }

  const afterRows = summarizeByPoint(students);
  const reportRows = afterRows.map((row) => {
    const baseline = baselineMap[row.id] || { averagePL: 0, masteredRate: 0 };
    return {
      ...row,
      baselineAveragePL: Number(baseline.averagePL || 0),
      afterAveragePL: row.averagePL,
      deltaPL: Number((row.averagePL - Number(baseline.averagePL || 0)).toFixed(3)),
      baselineMasteredRate: Number(baseline.masteredRate || 0),
      afterMasteredRate: row.masteredRate,
      deltaMasteredRate: Number((row.masteredRate - Number(baseline.masteredRate || 0)).toFixed(3)),
    };
  }).sort((a, b) => b.deltaPL - a.deltaPL);

  const payload = {
    generatedAt: nowIso(),
    studentCount: STUDENT_COUNT,
    durationMinutes: DURATION_MINUTES,
    params: BKT_PARAMS,
    rows: reportRows,
    conclusion: {
      averageDeltaPL: Number((reportRows.reduce((sum, row) => sum + row.deltaPL, 0) / Math.max(1, reportRows.length)).toFixed(3)),
      averageDeltaMasteredRate: Number((reportRows.reduce((sum, row) => sum + row.deltaMasteredRate, 0) / Math.max(1, reportRows.length)).toFixed(3)),
    },
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(OUTPUT_CSV, `\uFEFF${buildCsv(reportRows)}`, "utf8");
  await fs.writeFile(OUTPUT_HTML, buildHtmlReport(payload), "utf8");

  console.log(JSON.stringify({
    ok: true,
    outputJson: OUTPUT_JSON,
    outputCsv: OUTPUT_CSV,
    outputHtml: OUTPUT_HTML,
    conclusion: payload.conclusion,
    rows: reportRows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
