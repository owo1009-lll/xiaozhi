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
  if (!source.length) return fallback;
  return source[index % source.length];
}

function buildOptions(answer, distractors = []) {
  return unique([answer, ...distractors]).slice(0, 4);
}

// subConcepts → used for Q01-Q25 (concept/recognition/exclusion/application/analysis)
function buildConceptPool(point) {
  const subs = unique(asArray(point.subConcepts));
  const padded = [...subs];
  let i = 0;
  while (padded.length < 5) {
    padded.push(cyclePick(subs, i) || `${point.title} 相关概念 ${i + 1}`);
    i += 1;
  }
  return padded.slice(0, 5);
}

// easy/medium/hard → used for Q16-Q20 application scenarios
function buildScenarioPool(point) {
  const base = unique([
    ...asArray(point.easy),
    ...asArray(point.medium),
    ...asArray(point.hard),
  ]);
  const padded = [...base];
  let i = 0;
  while (padded.length < 5) {
    padded.push(`${point.title} 应用任务 ${i + 1}`);
    i += 1;
  }
  return padded.slice(0, 5);
}

// facts (new field) → used for Q26-Q30 specific-fact questions
function buildTextbookFactPool(point) {
  const facts = unique(asArray(point.facts));
  const subs = unique(asArray(point.subConcepts));
  const padded = [...facts];
  let i = 0;
  while (padded.length < 5) {
    padded.push(cyclePick(subs, i) || `${point.title} 具体事实 ${i + 1}`);
    i += 1;
  }
  return padded.slice(0, 5);
}

// comparisons (new field) → used for Q31-Q35 contrast questions
function buildComparisonPool(point) {
  const comps = unique(asArray(point.comparisons));
  const facts = unique(asArray(point.facts));
  const padded = [...comps];
  let i = 0;
  while (padded.length < 5) {
    padded.push(cyclePick(facts, i) || `${point.title} 对比要点 ${i + 1}`);
    i += 1;
  }
  return padded.slice(0, 5);
}

function getPeerPoints(point, lessonPoints) {
  const lessonPeers = lessonPoints.filter((item) => item.id !== point.id);
  if (lessonPeers.length) return lessonPeers;
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
  return point.lessonId === "L12" || /Integrated Review|综合复习/.test(point.title);
}

function getEvidenceWeight(point, defaultWeight = "strong") {
  return isReviewPoint(point) ? "medium" : defaultWeight;
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
    source: "curated-generated-v5",
    reviewStatus: "pending",
    reviewNotes: "",
    prompt,
    options,
    answer,
    explanation,
  };
}

// ── Prompt template arrays (5 variants each to avoid repetition) ─────────────

const RECOGNITION_PROMPTS = [
  (title) => `关于“${title}”，哪一项表述是正确的？`,
  (title) => `哪一项属于“${title}”的内容？`,
  (title) => `关于“${title}”，哪一项描述最准确？`,
  (title) => `哪一项属于“${title}”的学习范围？`,
  (title) => `关于“${title}”，哪一项说法准确？`,
];

const KP_MATCH_PROMPTS = [
  (fact) => `“${fact}”最直接对应哪个知识点？`,
  (fact) => `理解“${fact}”主要有助于掌握哪个知识点？`,
  (fact) => `如果题目涉及“${fact}”，最可能考查哪个知识点？`,
  (fact) => `“${fact}”是哪一个知识点的核心内容？`,
  (fact) => `学习哪个知识点最需要理解“${fact}”？`,
];

const EXCLUSION_PROMPTS = [
  (title) => `哪一项不是“${title}”的核心内容？`,
  (title) => `哪一项与“${title}”没有直接关系？`,
  (title) => `学习“${title}”时，哪一项不是必须掌握的内容？`,
  (title) => `哪一项超出了“${title}”的学习范围？`,
  (title) => `哪一项描述不属于“${title}”？`,
];

const APPLICATION_PROMPTS = [
  (scenario) => `完成“${scenario}”主要考查哪个知识点？`,
  (scenario) => `完成“${scenario}”需要运用哪个知识点？`,
  (scenario) => `“${scenario}”是哪一个知识点的典型练习？`,
  (scenario) => `练习“${scenario}”最能体现对哪个知识点的掌握？`,
  (scenario) => `完成“${scenario}”前，应先学习哪个知识点？`,
];

const ANALYSIS_PROMPTS = [
  (title) => `判断学生已经掌握“${title}”时，最可靠的依据是什么？`,
  (title) => `哪一项最能体现对“${title}”的深入理解？`,
  (title) => `在“${title}”的综合学习中，哪一项最能体现高阶思考？`,
  (title) => `关于深入理解“${title}”，哪一项判断最准确？`,
  (title) => `若要考查“${title}”的迁移能力，教师应重点关注什么？`,
];

const SPECIFIC_FACT_PROMPTS = [
  (title) => `关于“${title}”，哪一项具体说法正确？`,
  (title) => `“${title}”中哪一项具体事实符合乐理规则？`,
  (title) => `根据基础乐理，关于“${title}”哪一项描述最准确？`,
  (title) => `学习“${title}”时，哪一项具体事实正确？`,
  (title) => `关于“${title}”，哪一项专业表述准确？`,
];

const CONTRAST_PROMPTS = [
  (title) => `关于“${title}”中的两个概念，哪一项区分正确？`,
  (title) => `关于“${title}”，哪一项对比正确？`,
  (title) => `“${title}”中哪一项概念对比符合乐理规则？`,
  (title) => `深入学习“${title}”时，哪一项对比最准确？`,
  (title) => `哪一项正确说明了“${title}”中两个概念的差异？`,
];

// ── Question builders ─────────────────────────────────────────────────────────

function buildRecognitionQuestions(point, concepts, peerFacts) {
  return concepts.slice(0, 5).map((concept, index) => {
    const samePointOthers = concepts.filter((c) => c !== concept);
    const d1 = cyclePick(samePointOthers, index, cyclePick(peerFacts, index * 3));
    const d2 = cyclePick(samePointOthers, index + 1, cyclePick(peerFacts, index * 3 + 1));
    const d3 = cyclePick(peerFacts, index * 3 + 2, point.title);
    return createQuestion({
      point,
      suffix: `Q${String(index + 1).padStart(2, "0")}`,
      difficulty: index < 3 ? "basic" : "medium",
      questionType: "concept-recognition",
      evidenceWeight: "strong",
      prompt: RECOGNITION_PROMPTS[index](point.title),
      options: buildOptions(concept, [d1, d2, d3]),
      answer: concept,
      explanation: `“${concept}”属于“${point.title}”的内容。`,
    });
  });
}

function buildKnowledgePointMatchQuestions(point, concepts, peerTitles) {
  return concepts.slice(0, 5).map((concept, index) =>
    createQuestion({
      point,
      suffix: `Q${String(index + 6).padStart(2, "0")}`,
      difficulty: index < 2 ? "basic" : "medium",
      questionType: "knowledge-point-match",
      evidenceWeight: "strong",
      prompt: KP_MATCH_PROMPTS[index](concept),
      options: buildOptions(point.title, [
        cyclePick(peerTitles, index * 3 + 0, point.title),
        cyclePick(peerTitles, index * 3 + 1, point.title),
        cyclePick(peerTitles, index * 3 + 2, point.title),
      ]),
      answer: point.title,
      explanation: `“${concept}”是“${point.title}”的核心内容之一。`,
    }),
  );
}

function buildExclusionQuestions(point, concepts, peerFacts) {
  return concepts.slice(0, 5).map((concept, index) => {
    const wrong = cyclePick(peerFacts, index, point.title);
    const distractors = unique(concepts.filter((item) => item !== concept).slice(0, 3));
    return createQuestion({
      point,
      suffix: `Q${String(index + 11).padStart(2, "0")}`,
      difficulty: "medium",
      questionType: "exclusion",
      evidenceWeight: "strong",
      prompt: EXCLUSION_PROMPTS[index](point.title),
      options: buildOptions(wrong, distractors),
      answer: wrong,
      explanation: `“${wrong}”不属于“${point.title}”；其他选项与该知识点直接相关。`,
    });
  });
}

function buildApplicationQuestions(point, scenarios, peerTitles) {
  return scenarios.slice(0, 5).map((scenario, index) =>
    createQuestion({
      point,
      suffix: `Q${String(index + 16).padStart(2, "0")}`,
      difficulty: index < 2 ? "medium" : "hard",
      questionType: "application",
      evidenceWeight: index < 4 ? "strong" : "medium",
      prompt: APPLICATION_PROMPTS[index](scenario),
      options: buildOptions(point.title, [
        cyclePick(peerTitles, index * 3 + 0, point.title),
        cyclePick(peerTitles, index * 3 + 1, point.title),
        cyclePick(peerTitles, index * 3 + 2, point.title),
      ]),
      answer: point.title,
      explanation: `“${scenario}”主要检查对“${point.title}”的掌握情况。`,
    }),
  );
}

function buildAnalysisQuestions(point, concepts, peerFacts) {
  return ANALYSIS_PROMPTS.map((promptFn, index) => {
    const answerConcept = cyclePick(concepts, index, point.title);
    return createQuestion({
      point,
      suffix: `Q${String(index + 21).padStart(2, "0")}`,
      difficulty: "hard",
      questionType: "analysis",
      evidenceWeight: index < 3 ? "strong" : "medium",
      prompt: promptFn(point.title),
      options: buildOptions(answerConcept, [
        cyclePick(peerFacts, index * 3 + 0, point.title),
        cyclePick(peerFacts, index * 3 + 1, point.title),
        cyclePick(peerFacts, index * 3 + 2, point.title),
      ]),
      answer: answerConcept,
      explanation: `判断是否深入理解“${point.title}”时，“${answerConcept}”是可靠依据。`,
    });
  });
}

// Q26-Q30: specific-fact — answers from textbook facts; distractors from same-point facts (high plausibility)
function buildSpecificFactQuestions(point, textbookFacts, peerFacts) {
  return textbookFacts.slice(0, 5).map((fact, index) => {
    const otherFacts = textbookFacts.filter((f) => f !== fact);
    const d1 = cyclePick(otherFacts, index, cyclePick(peerFacts, index * 3));
    const d2 = cyclePick(otherFacts, index + 1, cyclePick(peerFacts, index * 3 + 1));
    const d3 = cyclePick(peerFacts, index * 3 + 2, point.title);
    return createQuestion({
      point,
      suffix: `Q${String(index + 26).padStart(2, "0")}`,
      difficulty: index < 2 ? "basic" : index < 4 ? "medium" : "hard",
      questionType: "specific-fact",
      evidenceWeight: "strong",
      prompt: SPECIFIC_FACT_PROMPTS[index](point.title),
      options: buildOptions(fact, [d1, d2, d3]),
      answer: fact,
      explanation: `“${point.title}”的具体事实：${fact}`,
    });
  });
}

// Q31-Q35: contrast — answers are comparison statements; tests deeper conceptual differentiation
function buildContrastQuestions(point, comparisons, peerFacts) {
  return comparisons.slice(0, 5).map((comparison, index) =>
    createQuestion({
      point,
      suffix: `Q${String(index + 31).padStart(2, "0")}`,
      difficulty: index < 2 ? "medium" : "hard",
      questionType: "contrast",
      evidenceWeight: index < 4 ? "strong" : "medium",
      prompt: CONTRAST_PROMPTS[index](point.title),
      options: buildOptions(comparison, [
        cyclePick(peerFacts, index * 3, point.title),
        cyclePick(peerFacts, index * 3 + 1, point.title),
        cyclePick(peerFacts, index * 3 + 2, point.title),
      ]),
      answer: comparison,
      explanation: `关于“${point.title}”的正确对比：${comparison}`,
    }),
  );
}

// ── Assemble all 35 questions per knowledge point ────────────────────────────

function buildFormalQuestionsForPoint(point, lessonPoints) {
  const concepts = buildConceptPool(point);
  const scenarios = buildScenarioPool(point);
  const textbookFacts = buildTextbookFactPool(point);
  const comparisons = buildComparisonPool(point);
  const peerFacts = getPeerFacts(point, lessonPoints);
  const peerTitles = getPeerTitles(point, lessonPoints);

  return [
    ...buildRecognitionQuestions(point, concepts, peerFacts),          // Q01-Q05
    ...buildKnowledgePointMatchQuestions(point, concepts, peerTitles), // Q06-Q10
    ...buildExclusionQuestions(point, concepts, peerFacts),            // Q11-Q15
    ...buildApplicationQuestions(point, scenarios, peerTitles),        // Q16-Q20
    ...buildAnalysisQuestions(point, concepts, peerFacts),             // Q21-Q25
    ...buildSpecificFactQuestions(point, textbookFacts, peerFacts),    // Q26-Q30
    ...buildContrastQuestions(point, comparisons, peerFacts),          // Q31-Q35
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
          evidenceWeight: "medium",
        })),
    );
  }
  return FORMAL_QUESTION_BANK.filter((item) => item.lessonId === lessonId);
}

export function getQuestionsForKnowledgePoint(knowledgePointId) {
  if (isDiagnosticKnowledgePoint(knowledgePointId)) return [];
  return FORMAL_QUESTION_BANK.filter((item) => item.knowledgePointId === knowledgePointId);
}
