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
    padded.push(cyclePick(subs, i) || `${point.title} related concept ${i + 1}`);
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
    padded.push(`${point.title} application task ${i + 1}`);
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
    padded.push(cyclePick(subs, i) || `${point.title} specific fact ${i + 1}`);
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
    padded.push(cyclePick(facts, i) || `${point.title} comparison point ${i + 1}`);
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
  (title) => `Which statement about "${title}" is correct?`,
  (title) => `Which item is included in "${title}"?`,
  (title) => `Which description of "${title}" is accurate?`,
  (title) => `Which item belongs to the learning scope of "${title}"?`,
  (title) => `Which option is accurate for "${title}"?`,
];

const KP_MATCH_PROMPTS = [
  (fact) => `Which knowledge point does "${fact}" most directly match?`,
  (fact) => `Understanding "${fact}" mainly supports which knowledge point?`,
  (fact) => `If a question involves "${fact}", which knowledge point is it most likely testing?`,
  (fact) => `"${fact}" is a core part of which knowledge point?`,
  (fact) => `Which knowledge point most requires understanding "${fact}"?`,
];

const EXCLUSION_PROMPTS = [
  (title) => `Which option is not a core part of "${title}"?`,
  (title) => `Which option is not directly related to "${title}"?`,
  (title) => `Which item is not required when learning "${title}"?`,
  (title) => `Which option falls outside the scope of "${title}"?`,
  (title) => `Which description does not belong to "${title}"?`,
];

const APPLICATION_PROMPTS = [
  (scenario) => `Which knowledge point is mainly tested by the task "${scenario}"?`,
  (scenario) => `Which knowledge point is needed to complete "${scenario}"?`,
  (scenario) => `"${scenario}" is a typical exercise for which knowledge point?`,
  (scenario) => `Practicing "${scenario}" best demonstrates mastery of which knowledge point?`,
  (scenario) => `Which knowledge point should be learned before completing "${scenario}"?`,
];

const ANALYSIS_PROMPTS = [
  (title) => `What is the most reliable evidence that a student has mastered "${title}"?`,
  (title) => `Which statement shows the deepest understanding of "${title}"?`,
  (title) => `In integrated learning of "${title}", which option best reflects higher-order thinking?`,
  (title) => `Which judgment is most accurate for a deep understanding of "${title}"?`,
  (title) => `To test transfer ability for "${title}", what should the teacher focus on?`,
];

const SPECIFIC_FACT_PROMPTS = [
  (title) => `Which specific statement about "${title}" is correct?`,
  (title) => `Which specific fact in "${title}" follows music-theory rules?`,
  (title) => `According to basic music theory, which description of "${title}" is most accurate?`,
  (title) => `When learning "${title}", which specific fact is correct?`,
  (title) => `Which specialized statement about "${title}" is accurate?`,
];

const CONTRAST_PROMPTS = [
  (title) => `Which option correctly distinguishes two concepts in "${title}"?`,
  (title) => `Which comparison about "${title}" is correct?`,
  (title) => `Which concept comparison in "${title}" follows music-theory rules?`,
  (title) => `In deeper study of "${title}", which comparison is most accurate?`,
  (title) => `Which option correctly explains the difference between two ideas in "${title}"?`,
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
      explanation: `"${concept}" is part of "${point.title}".`,
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
      explanation: `"${concept}" is one core part of "${point.title}".`,
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
      explanation: `"${wrong}" does not belong to "${point.title}"; the other options are directly related.`,
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
      explanation: `"${scenario}" mainly checks mastery of "${point.title}".`,
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
      explanation: `For deeper understanding of "${point.title}", "${answerConcept}" is a reliable basis for judgment.`,
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
      explanation: `Specific fact for "${point.title}": ${fact}`,
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
      explanation: `Correct comparison for "${point.title}": ${comparison}`,
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
