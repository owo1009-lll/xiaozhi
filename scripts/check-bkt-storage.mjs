import { BKT_PARAMS, KNOWLEDGE_POINTS } from "../src/musicaiKnowledge.js";

function buildKnowledge() {
  return Object.fromEntries(
    KNOWLEDGE_POINTS.map((point, index) => [
      point.id,
      {
        id: point.id,
        pL: Number((BKT_PARAMS.pL0 + ((index % 10) * 0.05)).toFixed(3)),
        difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
        totalAttempts: 24 + (index % 8),
        correctAttempts: 12 + (index % 7),
        consecutiveCorrect: index % 4,
        consecutiveIncorrect: index % 3,
        lastPracticed: new Date().toISOString(),
        mastered: index % 5 === 0,
        history: Array.from({ length: 12 }, (_, historyIndex) => ({
          observation: historyIndex % 3 === 0 ? "incorrect" : "correct",
          lessonId: point.lessonId,
          source: "12-week-sample",
          prompt: `${point.title} 样本题 ${historyIndex + 1}`,
          at: new Date(Date.now() - historyIndex * 86400000).toISOString(),
        })),
      },
    ]),
  );
}

function buildErrors() {
  return Array.from({ length: 120 }, (_, index) => ({
    type: index % 2 === 0 ? "记谱识读" : "节奏判断",
    lessonId: KNOWLEDGE_POINTS[index % KNOWLEDGE_POINTS.length].lessonId,
    knowledgePointId: KNOWLEDGE_POINTS[index % KNOWLEDGE_POINTS.length].id,
    prompt: `错题样本 ${index + 1}`,
    at: new Date(Date.now() - index * 3600000).toISOString(),
  }));
}

function buildSessions() {
  return Array.from({ length: 180 }, (_, index) => {
    const point = KNOWLEDGE_POINTS[index % KNOWLEDGE_POINTS.length];
    return {
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      action: index % 3 === 0 ? "preview" : index % 3 === 1 ? "classroom-practice" : "homework-submit",
      knowledgePointId: point.id,
      durationMinutes: 8 + (index % 6),
      at: new Date(Date.now() - index * 5400000).toISOString(),
    };
  });
}

function buildTutor() {
  return Array.from({ length: 80 }, (_, index) => {
    const point = KNOWLEDGE_POINTS[index % KNOWLEDGE_POINTS.length];
    return {
      role: index % 2 === 0 ? "user" : "assistant",
      lessonId: point.lessonId,
      content: index % 2 === 0 ? `请解释 ${point.title}` : `${point.title} 的核心在于知识点辨析与应用。`,
      at: new Date(Date.now() - index * 2700000).toISOString(),
    };
  });
}

const payload = {
  knowledge: buildKnowledge(),
  errors: buildErrors(),
  sessions: buildSessions(),
  tutor: buildTutor(),
};

const serialized = JSON.stringify(payload);
const utf8Bytes = Buffer.byteLength(serialized, "utf8");
const utf16Bytes = serialized.length * 2;

console.log(JSON.stringify({
  utf8Bytes,
  utf16Bytes,
  within1MB: utf16Bytes < 1024 * 1024,
}, null, 2));
