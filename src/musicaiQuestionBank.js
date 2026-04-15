import {
  DIAGNOSTIC_LESSON_ID,
  KNOWLEDGE_POINTS,
  KNOWLEDGE_POINTS_BY_LESSON,
  getDiagnosticSourceKnowledgePoints,
  isDiagnosticKnowledgePoint,
} from "./musicaiKnowledge.js";

function unique(items = []) {
  return items.filter((item, index, array) => item && array.indexOf(item) === index);
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function cyclePick(items = [], index = 0, fallback = "") {
  const source = unique(items).filter(Boolean);
  if (source.length === 0) return fallback;
  return source[index % source.length];
}

function buildOptions(answer, distractors = []) {
  return unique([answer, ...distractors]).slice(0, 4);
}

function buildFactPool(point) {
  const base = unique([
    point.title,
    ...asArray(point.subConcepts),
    ...asArray(point.easy),
    ...asArray(point.medium),
    ...asArray(point.hard),
  ]);
  const padded = [...base];
  let index = 0;
  while (padded.length < 5) {
    padded.push(`${point.title}的复习要点 ${index + 1}`);
    index += 1;
  }
  return padded.slice(0, 5);
}

function getPeerPoints(point, lessonPoints) {
  const lessonPeers = lessonPoints.filter((item) => item.id !== point.id);
  if (lessonPeers.length > 0) return lessonPeers;
  return KNOWLEDGE_POINTS.filter((item) => item.id !== point.id);
}

function getPeerFacts(point, lessonPoints) {
  return unique(
    getPeerPoints(point, lessonPoints).flatMap((item) => [
      item.title,
      ...asArray(item.subConcepts),
      ...asArray(item.easy),
      ...asArray(item.medium),
    ]),
  );
}

function getPeerTitles(point, lessonPoints) {
  const sameLesson = getPeerPoints(point, lessonPoints).map((item) => item.title);
  const crossLesson = KNOWLEDGE_POINTS.filter(
    (item) => item.id !== point.id && item.lessonId !== point.lessonId,
  ).map((item) => item.title);
  return unique([...sameLesson, ...crossLesson]);
}

function isReviewPoint(point) {
  return point.lessonId === "L12" || /综合复习/.test(point.title);
}

function getEvidenceWeight(point, strongOrMedium = "strong") {
  return isReviewPoint(point) ? "medium" : strongOrMedium;
}

function createQuestion({
  point,
  suffix,
  difficulty,
  questionType,
  evidenceWeight,
  prompt,
  options,
  answer,
  explanation,
}) {
  return {
    id: `${point.id}-${suffix}`,
    lessonId: point.lessonId,
    chapterId: point.chapterId,
    knowledgePointId: point.id,
    difficulty,
    questionType,
    evidenceWeight: getEvidenceWeight(point, evidenceWeight),
    source: "curated-generated-v3",
    reviewStatus: "pending",
    reviewNotes: "",
    prompt,
    options,
    answer,
    explanation,
  };
}

function buildRecognitionQuestions(point, facts, peerFacts) {
  return facts.slice(0, 5).map((fact, index) =>
    createQuestion({
      point,
      suffix: `Q${String(index + 1).padStart(2, "0")}`,
      difficulty: index < 3 ? "basic" : "medium",
      questionType: "concept-recognition",
      evidenceWeight: "strong",
      prompt: `关于“${point.title}”，下列说法正确的是：`,
      options: buildOptions(fact, [
        cyclePick(peerFacts, index * 3 + 0, point.title),
        cyclePick(peerFacts, index * 3 + 1, point.title),
        cyclePick(peerFacts, index * 3 + 2, point.title),
      ]),
      answer: fact,
      explanation: `“${point.title}”对应的正确信息是：${fact}。`,
    }),
  );
}

function buildKnowledgePointMatchQuestions(point, facts, peerTitles) {
  return facts.slice(0, 5).map((fact, index) =>
    createQuestion({
      point,
      suffix: `Q${String(index + 6).padStart(2, "0")}`,
      difficulty: index < 2 ? "basic" : "medium",
      questionType: "knowledge-point-match",
      evidenceWeight: "strong",
      prompt: `若题干出现“${fact}”，它最直接对应下列哪个知识点？`,
      options: buildOptions(point.title, [
        cyclePick(peerTitles, index * 3 + 0, point.title),
        cyclePick(peerTitles, index * 3 + 1, point.title),
        cyclePick(peerTitles, index * 3 + 2, point.title),
      ]),
      answer: point.title,
      explanation: `“${fact}”最直接对应的知识点是“${point.title}”。`,
    }),
  );
}

function buildExclusionQuestions(point, facts, peerFacts) {
  return facts.slice(0, 5).map((fact, index) => {
    const wrong = cyclePick(peerFacts, index, point.title);
    const distractors = unique(facts.filter((item) => item !== fact).slice(0, 3));
    return createQuestion({
      point,
      suffix: `Q${String(index + 11).padStart(2, "0")}`,
      difficulty: "medium",
      questionType: "exclusion",
      evidenceWeight: "strong",
      prompt: `下列哪一项不属于“${point.title}”的核心内容？`,
      options: buildOptions(wrong, distractors),
      answer: wrong,
      explanation: `“${wrong}”不属于“${point.title}”，其余选项都和该知识点直接相关。`,
    });
  });
}

function buildApplicationQuestions(point, peerTitles) {
  const base = unique([
    ...asArray(point.easy),
    ...asArray(point.medium),
    ...asArray(point.hard),
  ]);
  const scenarios = [...base];
  let index = 0;
  while (scenarios.length < 5) {
    scenarios.push(`${point.title}的课堂应用情境 ${index + 1}`);
    index += 1;
  }
  return scenarios.slice(0, 5).map((scenario, itemIndex) =>
    createQuestion({
      point,
      suffix: `Q${String(itemIndex + 16).padStart(2, "0")}`,
      difficulty: itemIndex < 2 ? "medium" : "hard",
      questionType: "application",
      evidenceWeight: itemIndex < 4 ? "strong" : "medium",
      prompt: `若课堂任务要求学生完成“${scenario}”，其主要考查的知识点是：`,
      options: buildOptions(point.title, [
        cyclePick(peerTitles, itemIndex * 3 + 0, point.title),
        cyclePick(peerTitles, itemIndex * 3 + 1, point.title),
        cyclePick(peerTitles, itemIndex * 3 + 2, point.title),
      ]),
      answer: point.title,
      explanation: `“${scenario}”主要用于考查“${point.title}”。`,
    }),
  );
}

function buildAnalysisQuestions(point, facts, peerFacts) {
  const analysisStems = [
    `若要判断学生是否真正掌握“${point.title}”，最可靠的依据是：`,
    `围绕“${point.title}”进行分析时，下列哪项判断最有效？`,
    `若学生要解释“${point.title}”，下列哪项表述最准确？`,
    `在“${point.title}”的高阶题中，下列哪项最可能作为分析结论？`,
    `若教师要判断学生能否迁移运用“${point.title}”，最应关注哪一项？`,
  ];

  return analysisStems.map((stem, index) =>
    createQuestion({
      point,
      suffix: `Q${String(index + 21).padStart(2, "0")}`,
      difficulty: "hard",
      questionType: "analysis",
      evidenceWeight: index < 3 ? "strong" : "medium",
      prompt: stem,
      options: buildOptions(cyclePick(facts, index, point.title), [
        cyclePick(peerFacts, index * 3 + 0, point.title),
        cyclePick(peerFacts, index * 3 + 1, point.title),
        cyclePick(peerFacts, index * 3 + 2, point.title),
      ]),
      answer: cyclePick(facts, index, point.title),
      explanation: `在“${point.title}”的分析题中，更准确的判断依据是：${cyclePick(facts, index, point.title)}。`,
    }),
  );
}

function buildFormalQuestionsForPoint(point, lessonPoints) {
  const facts = buildFactPool(point);
  const peerFacts = getPeerFacts(point, lessonPoints);
  const peerTitles = getPeerTitles(point, lessonPoints);

  return [
    ...buildRecognitionQuestions(point, facts, peerFacts),
    ...buildKnowledgePointMatchQuestions(point, facts, peerTitles),
    ...buildExclusionQuestions(point, facts, peerFacts),
    ...buildApplicationQuestions(point, peerTitles),
    ...buildAnalysisQuestions(point, facts, peerFacts),
  ];
}

export const FORMAL_QUESTION_BANK = KNOWLEDGE_POINTS.flatMap((point) =>
  buildFormalQuestionsForPoint(point, KNOWLEDGE_POINTS_BY_LESSON[point.lessonId] || []),
);

export function getQuestionsForLesson(lessonId) {
  if (lessonId === DIAGNOSTIC_LESSON_ID) {
    return getDiagnosticSourceKnowledgePoints().flatMap((point) =>
      FORMAL_QUESTION_BANK
        .filter((item) => item.knowledgePointId === point.id)
        .map((item, index) => ({
          ...item,
          id: `${item.id}-diagnostic-${index + 1}`,
          lessonId,
          source: `${item.source}-diagnostic`,
        })),
    );
  }
  return FORMAL_QUESTION_BANK.filter((item) => item.lessonId === lessonId);
}

export function getQuestionsForKnowledgePoint(knowledgePointId) {
  if (isDiagnosticKnowledgePoint(knowledgePointId)) return [];
  return FORMAL_QUESTION_BANK.filter((item) => item.knowledgePointId === knowledgePointId);
}
