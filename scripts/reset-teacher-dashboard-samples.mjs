import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getKnowledgePointsForLesson } from "../src/musicaiKnowledge.js";
import { getPptLessonData } from "../src/pptLessonData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const analyticsFile = path.join(dataDir, "teacher-analytics.json");
const bktSummaryFile = path.join(dataDir, "teacher-bkt-summary.json");

const lessonIds = Array.from({ length: 12 }, (_, index) => `L${index + 1}`);
const lessonTitles = Object.fromEntries(
  lessonIds.map((lessonId) => [lessonId, getPptLessonData(lessonId)?.lessonTitle || lessonId]),
);

const studentProfiles = [
  { userId: "virtual-01", studentLabel: "优等型学生 1", profile: "优等型", averageBias: 0.12, studyBias: 2, homework: true },
  { userId: "virtual-02", studentLabel: "优等型学生 2", profile: "优等型", averageBias: 0.14, studyBias: 3, homework: true },
  { userId: "virtual-03", studentLabel: "优等型学生 3", profile: "优等型", averageBias: 0.16, studyBias: 4, homework: true },
  { userId: "virtual-04", studentLabel: "中等稳定型学生 1", profile: "中等稳定型", averageBias: -0.02, studyBias: 1, homework: true },
  { userId: "virtual-05", studentLabel: "中等稳定型学生 2", profile: "中等稳定型", averageBias: 0.0, studyBias: 2, homework: true },
  { userId: "virtual-06", studentLabel: "中等稳定型学生 3", profile: "中等稳定型", averageBias: 0.02, studyBias: 1, homework: true },
  { userId: "virtual-07", studentLabel: "偏科型学生 1", profile: "偏科型", averageBias: -0.05, studyBias: 0, homework: true },
  { userId: "virtual-08", studentLabel: "偏科型学生 2", profile: "偏科型", averageBias: -0.06, studyBias: -1, homework: true },
  { userId: "virtual-09", studentLabel: "偏科型学生 3", profile: "偏科型", averageBias: -0.04, studyBias: 0, homework: true },
  { userId: "virtual-10", studentLabel: "低参与型学生 1", profile: "低参与型", averageBias: -0.22, studyBias: -6, homework: false },
  { userId: "virtual-11", studentLabel: "低参与型学生 2", profile: "低参与型", averageBias: -0.22, studyBias: -6, homework: false },
  { userId: "virtual-12", studentLabel: "低参与型学生 3", profile: "低参与型", averageBias: -0.22, studyBias: -6, homework: false },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isoHoursAgo(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

function accuracyFromPL(pL, lessonOffset) {
  return clamp(Math.round((pL - 0.12 + lessonOffset * 0.01) * 100), 20, 96);
}

function buildKnowledgeState(point, pL, attemptsBase, lessonOffset) {
  const totalAttempts = attemptsBase + (lessonOffset % 3);
  const accuracy = accuracyFromPL(pL, lessonOffset);
  const correctAttempts = Math.max(0, Math.min(totalAttempts, Math.round((accuracy / 100) * totalAttempts)));
  return {
    id: point.id,
    title: point.title,
    lessonId: point.lessonId,
    chapterId: point.chapterId,
    pL: Number(pL.toFixed(3)),
    mastered: pL >= 0.8,
    difficulty: pL >= 0.75 ? "hard" : pL >= 0.45 ? "medium" : "easy",
    totalAttempts,
    correctAttempts,
    accuracy: Number((correctAttempts / Math.max(totalAttempts, 1)).toFixed(3)),
  };
}

function profileAdjustedPL(profile, point, lessonOffset) {
  let base = 0.62 + profile.averageBias + ((lessonOffset % 4) * 0.02);
  const title = point.title || "";

  if (profile.profile === "偏科型") {
    const rhythmLike = /节拍|节奏|音值|切分|连音/.test(title);
    const notationLike = /谱号|谱表|中央 C|音组/.test(title);
    if (profile.userId.endsWith("7") || profile.userId.endsWith("9")) {
      base = rhythmLike ? 0.82 : notationLike ? 0.42 : 0.58;
    } else {
      base = notationLike ? 0.81 : rhythmLike ? 0.44 : 0.57;
    }
  }

  if (profile.profile === "低参与型") {
    base = 0.34 + ((lessonOffset % 3) * 0.04);
  }

  if (/综合/.test(title)) {
    base -= 0.04;
  }

  if (point.id === "L3_K2_bassClef" || point.id === "L8_K1_tempoTerms") {
    base -= 0.03;
  }

  return clamp(base, 0.18, 0.98);
}

function buildAnalyticsRecord(profile, lessonId, lessonOffset) {
  const points = getKnowledgePointsForLesson(lessonId);
  const pointTitles = points.slice(0, 2).map((item) => item.title);
  const score = clamp(
    profile.profile === "优等型"
      ? 82 + lessonOffset
      : profile.profile === "中等稳定型"
        ? 68 + lessonOffset
        : profile.profile === "偏科型"
          ? 58 + (lessonOffset % 7)
          : 45,
    40,
    95,
  );
  const studyMinutes = Math.max(8, 14 + profile.studyBias + lessonOffset);
  const homeworkSubmitted = profile.homework || lessonOffset % 4 !== 0;
  const errorTypes = Object.fromEntries(pointTitles.map((title) => [title, 1]));

  return {
    createdAt: isoHoursAgo(lessonOffset * 12 + 3),
    studentId: profile.userId,
    studentLabel: profile.studentLabel,
    lessonId,
    lessonTitle: lessonTitles[lessonId],
    source: "clean-sample",
    section: lessonOffset % 3 === 0 ? "preview" : lessonOffset % 3 === 1 ? "practice" : "homework",
    score,
    rating: score >= 80 ? 5 : score >= 65 ? 4 : score >= 55 ? 3 : 2,
    studyMinutes,
    interactions: 4 + (lessonOffset % 5),
    errors: 2,
    errorTypes,
    homeworkSeconds: homeworkSubmitted ? 900 + lessonOffset * 15 : 420 + lessonOffset * 10,
    homeworkSubmitted,
    homeworkLength: homeworkSubmitted ? 80 + lessonOffset * 2 : 42 + lessonOffset,
    lastExplanation: `重点回看“${pointTitles[0] || lessonId}”的核心规则。`,
    updatedAt: isoHoursAgo(lessonOffset),
    homeworkText: "",
    homeworkImages: [],
    homeworkImageCount: 0,
    homeworkRhythmData: null,
    homeworkStaffData: null,
    aiHomeworkFeedback: "",
    submissionTypes: [],
    homeworkPianoData: null,
    homeworkVoiceTranscript: "",
    homeworkAudioMeta: null,
    evaluationScores: null,
    evaluationTags: pointTitles,
    evaluationComment: `当前需要加强${pointTitles[0] || lessonId}。`,
  };
}

function buildBktRecord(profile, lessonId, lessonOffset) {
  const knowledgeStates = getKnowledgePointsForLesson(lessonId).map((point, index) => {
    const pL = profileAdjustedPL(profile, point, lessonOffset + index);
    const attemptsBase =
      profile.profile === "优等型"
        ? 9
        : profile.profile === "中等稳定型"
          ? 7
          : profile.profile === "偏科型"
            ? 6
            : 3;
    return buildKnowledgeState(point, pL, attemptsBase, lessonOffset);
  });

  const sorted = [...knowledgeStates].sort((a, b) => a.pL - b.pL);
  const averageMastery = Number(
    (knowledgeStates.reduce((sum, item) => sum + item.pL, 0) / Math.max(knowledgeStates.length, 1)).toFixed(3),
  );

  return {
    userId: profile.userId,
    studentLabel: profile.studentLabel,
    lessonId,
    source: "clean-sample",
    recommendation: `优先巩固“${sorted[0]?.title || lessonId}”，再进入下一个学习环节。`,
    averageMastery,
    strongPoints: [...knowledgeStates]
      .sort((a, b) => b.pL - a.pL)
      .slice(0, 2)
      .map(({ id, title, pL }) => ({ id, title, pL })),
    weakPoints: sorted.slice(0, 3).map(({ id, title, pL }) => ({ id, title, pL })),
    knowledgeStates,
    updatedAt: isoHoursAgo(lessonOffset),
  };
}

async function main() {
  const analyticsRecords = [];
  const bktRecords = [];

  for (const profile of studentProfiles) {
    for (let lessonOffset = 0; lessonOffset < lessonIds.length; lessonOffset += 1) {
      const lessonId = lessonIds[lessonOffset];
      analyticsRecords.push(buildAnalyticsRecord(profile, lessonId, lessonOffset));
      bktRecords.push(buildBktRecord(profile, lessonId, lessonOffset));
    }
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(analyticsFile, `${JSON.stringify({ records: analyticsRecords }, null, 2)}\n`, "utf8");
  await fs.writeFile(
    bktSummaryFile,
    `${JSON.stringify({ records: bktRecords, simulatedStudents: studentProfiles.map((item) => item.userId) }, null, 2)}\n`,
    "utf8",
  );

  console.log(`teacher-analytics.json records: ${analyticsRecords.length}`);
  console.log(`teacher-bkt-summary.json records: ${bktRecords.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
