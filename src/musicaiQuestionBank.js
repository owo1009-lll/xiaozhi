import {
  DIAGNOSTIC_LESSON_ID,
  KNOWLEDGE_POINTS,
  KNOWLEDGE_POINTS_BY_LESSON,
  getDiagnosticSourceKnowledgePoints,
  isDiagnosticKnowledgePoint,
} from "./musicaiKnowledge.js";
import { NOTATION_QUESTIONS } from "./musicaiNotationQuestions.js";

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
    padded.push(cyclePick(subs, i) || `${point.title}的相关概念 ${i + 1}`);
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
    padded.push(`${point.title}的应用练习 ${i + 1}`);
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
    padded.push(cyclePick(subs, i) || `${point.title}的具体知识 ${i + 1}`);
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
    padded.push(cyclePick(facts, i) || `${point.title}的对比要点 ${i + 1}`);
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
  return point.lessonId === "L12" || /综合复习/.test(point.title);
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
  (title) => `关于"${title}"，下列哪项表述正确？`,
  (title) => `"${title}"的组成内容中，包括以下哪一项？`,
  (title) => `下列关于"${title}"的说法，正确的是：`,
  (title) => `以下哪项内容属于"${title}"的学习范围？`,
  (title) => `"${title}"所涵盖的知识中，下列哪项是准确的？`,
];

const KP_MATCH_PROMPTS = [
  (fact) => `"${fact}"最直接对应下列哪个知识点？`,
  (fact) => `掌握"${fact}"，主要是为了学习哪个知识点？`,
  (fact) => `若题目涉及"${fact}"，它最可能归属于哪个知识点？`,
  (fact) => `"${fact}"是下列哪个知识点的核心内容之一？`,
  (fact) => `学习哪个知识点，最需要理解"${fact}"？`,
];

const EXCLUSION_PROMPTS = [
  (title) => `下列哪一项不属于"${title}"的核心内容？`,
  (title) => `下列哪项与"${title}"没有直接关系？`,
  (title) => `学习"${title}"时，下列哪项不是必须掌握的？`,
  (title) => `下列哪一项超出了"${title}"的知识范围？`,
  (title) => `下列哪项描述的不是"${title}"的相关内容？`,
];

const APPLICATION_PROMPTS = [
  (scenario) => `"${scenario}"这一练习，主要考查哪个知识点？`,
  (scenario) => `完成"${scenario}"这一任务，需要掌握哪个知识点？`,
  (scenario) => `"${scenario}"是学习哪个知识点时的典型练习？`,
  (scenario) => `练习"${scenario}"，最能体现对哪个知识点的掌握？`,
  (scenario) => `学习哪个知识点后，才能完成"${scenario}"这一练习？`,
];

const ANALYSIS_PROMPTS = [
  (title) => `若要判断学生是否真正掌握"${title}"，最可靠的评估依据是：`,
  (title) => `关于"${title}"，以下哪项表述体现了最深层的理解？`,
  (title) => `在"${title}"的综合学习中，哪项内容最能体现高阶思维？`,
  (title) => `深入理解"${title}"时，下列哪项判断最为准确？`,
  (title) => `若教师想检验学生对"${title}"的迁移能力，最应关注哪一项？`,
];

const SPECIFIC_FACT_PROMPTS = [
  (title) => `关于"${title}"，以下哪项具体表述正确？`,
  (title) => `"${title}"中，下列哪个具体知识点符合乐理规范？`,
  (title) => `根据基本乐理，"${title}"的以下描述中，哪项最准确？`,
  (title) => `学习"${title}"时，下列哪项具体事实是正确的？`,
  (title) => `"${title}"的专项知识中，以下哪个表述是准确的？`,
];

const CONTRAST_PROMPTS = [
  (title) => `以下哪项正确区分了"${title}"中的两个概念？`,
  (title) => `关于"${title}"的对比分析，下列哪项是正确的？`,
  (title) => `"${title}"学习中，下列哪项概念对比符合乐理规范？`,
  (title) => `在"${title}"的深入学习中，哪项比较最为准确？`,
  (title) => `以下哪项正确说明了"${title}"中两个概念的区别？`,
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
      explanation: `"${point.title}"的相关内容包括"${concept}"。`,
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
      explanation: `"${concept}"是"${point.title}"的核心内容之一。`,
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
      explanation: `"${wrong}"不属于"${point.title}"的内容，其余选项均与该知识点直接相关。`,
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
      explanation: `"${scenario}"主要用于检验学生对"${point.title}"的掌握。`,
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
      explanation: `在"${point.title}"的深层理解中，"${answerConcept}"是较准确的判断依据。`,
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
      explanation: `"${point.title}"的具体知识：${fact}`,
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
      explanation: `"${point.title}"中的正确对比分析：${comparison}`,
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

export const FORMAL_QUESTION_BANK = [
  ...KNOWLEDGE_POINTS.flatMap((point) =>
    buildFormalQuestionsForPoint(point, KNOWLEDGE_POINTS_BY_LESSON[point.lessonId] || []),
  ),
  ...NOTATION_QUESTIONS,
];

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
