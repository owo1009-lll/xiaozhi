import {
  BKT_PARAMS,
  KNOWLEDGE_POINTS,
  KNOWLEDGE_POINTS_BY_ID,
  getBktKnowledgePoints,
  getKnowledgePoint,
  getKnowledgePointsForLesson,
} from "./musicaiKnowledge.js";

const STORAGE_PREFIX = "musicai.user";
const MAPPING_KEY = "musicai.system.knowledgeMapping";

const STORAGE_TYPES = {
  knowledge: "knowledge",
  errors: "errors",
  sessions: "sessions",
  tutor: "tutor",
};

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson(key, fallback) {
  if (!storageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
}

export function makeUserKey(userId, type) {
  return `${STORAGE_PREFIX}.${userId}.${type}`;
}

function normalizeQuestionDifficulty(raw) {
  const value = String(raw || "medium").toLowerCase();
  if (value === "easy" || value === "hard" || value === "medium") return value;
  if (value === "basic") return "easy";
  if (value === "core") return "medium";
  if (value === "transfer") return "hard";
  return "medium";
}

export function getDifficultyTierForPL(value) {
  const pL = clamp01(value);
  if (pL >= 0.75) return "hard";
  if (pL >= 0.45) return "medium";
  return "easy";
}

function buildDefaultKnowledgeState(point) {
  return {
    id: point.id,
    pL: BKT_PARAMS.pL0,
    difficulty: getDifficultyTierForPL(BKT_PARAMS.pL0),
    totalAttempts: 0,
    correctAttempts: 0,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    lastPracticed: null,
    mastered: false,
    evidenceCount: 0,
    pL0: BKT_PARAMS.pL0,
    pT: BKT_PARAMS.pT,
    pG: BKT_PARAMS.pG,
    pS: BKT_PARAMS.pS,
    history: [],
  };
}

export function initializeKnowledgeStore(userId) {
  const key = makeUserKey(userId, STORAGE_TYPES.knowledge);
  const existing = readJson(key, null);
  const baseState = Object.fromEntries(KNOWLEDGE_POINTS.map((point) => [point.id, buildDefaultKnowledgeState(point)]));
  const merged = Object.fromEntries(
    KNOWLEDGE_POINTS.map((point) => {
      const current = existing?.[point.id] || {};
      const next = {
        ...baseState[point.id],
        ...current,
      };
      next.pL = clamp01(next.pL);
      next.mastered = next.pL >= BKT_PARAMS.masteryThreshold;
      next.difficulty = getDifficultyTierForPL(next.pL);
      return [point.id, next];
    }),
  );
  writeJson(key, merged);
  writeJson(makeUserKey(userId, STORAGE_TYPES.errors), readJson(makeUserKey(userId, STORAGE_TYPES.errors), []));
  writeJson(makeUserKey(userId, STORAGE_TYPES.sessions), readJson(makeUserKey(userId, STORAGE_TYPES.sessions), []));
  writeJson(makeUserKey(userId, STORAGE_TYPES.tutor), readJson(makeUserKey(userId, STORAGE_TYPES.tutor), []));
  return merged;
}

export function getKnowledgeStore(userId) {
  return initializeKnowledgeStore(userId);
}

export function getKnowledgeArray(userId) {
  const store = getKnowledgeStore(userId);
  return KNOWLEDGE_POINTS.map((point) => store[point.id] || buildDefaultKnowledgeState(point));
}

export function getKnowledgeMappingCache() {
  return readJson(MAPPING_KEY, {});
}

export function setKnowledgeMapping(mappingKey, value) {
  const cache = getKnowledgeMappingCache();
  cache[mappingKey] = {
    ...value,
    updatedAt: nowIso(),
  };
  writeJson(MAPPING_KEY, cache);
  return cache[mappingKey];
}

export function getKnowledgeMapping(mappingKey) {
  return getKnowledgeMappingCache()[mappingKey] || null;
}

function applyBktObservation(previousState, isCorrect) {
  const pL = clamp01(previousState.pL ?? BKT_PARAMS.pL0);
  const pT = clamp01(previousState.pT ?? BKT_PARAMS.pT);
  const pG = clamp01(previousState.pG ?? BKT_PARAMS.pG);
  const pS = clamp01(previousState.pS ?? BKT_PARAMS.pS);

  let posterior;
  if (isCorrect) {
    posterior = (pL * (1 - pS)) / ((pL * (1 - pS)) + ((1 - pL) * pG));
  } else {
    posterior = (pL * pS) / ((pL * pS) + ((1 - pL) * (1 - pG)));
  }
  const transitioned = posterior + ((1 - posterior) * pT);
  return clamp01(transitioned);
}

export function updateKnowledgePointEvidence(userId, knowledgePointId, observation, metadata = {}) {
  const store = getKnowledgeStore(userId);
  const current = store[knowledgePointId] || buildDefaultKnowledgeState(getKnowledgePoint(knowledgePointId) || { id: knowledgePointId });
  const isCorrect = observation === "correct";
  const previousPL = clamp01(current.pL ?? BKT_PARAMS.pL0);
  const nextPL = applyBktObservation(current, isCorrect);
  const nextState = {
    ...current,
    pL: nextPL,
    difficulty: getDifficultyTierForPL(nextPL),
    totalAttempts: Number(current.totalAttempts || 0) + 1,
    correctAttempts: Number(current.correctAttempts || 0) + (isCorrect ? 1 : 0),
    consecutiveCorrect: isCorrect ? Number(current.consecutiveCorrect || 0) + 1 : 0,
    consecutiveIncorrect: isCorrect ? 0 : Number(current.consecutiveIncorrect || 0) + 1,
    lastPracticed: nowIso(),
    mastered: nextPL >= BKT_PARAMS.masteryThreshold,
    evidenceCount: Number(current.evidenceCount || 0) + 1,
    history: [
      ...(Array.isArray(current.history) ? current.history.slice(-11) : []),
      {
        observation,
        lessonId: metadata.lessonId || "",
        source: metadata.source || "",
        prompt: metadata.prompt || "",
        score: metadata.score ?? null,
        questionDifficulty: normalizeQuestionDifficulty(metadata.difficulty || ""),
        previousPL: previousPL,
        nextPL: nextPL,
        at: nowIso(),
      },
    ],
  };
  store[knowledgePointId] = nextState;
  writeJson(makeUserKey(userId, STORAGE_TYPES.knowledge), store);
  return nextState;
}

export function appendErrorRecord(userId, payload) {
  const key = makeUserKey(userId, STORAGE_TYPES.errors);
  const current = readJson(key, []);
  const next = [
    ...current.slice(-119),
    {
      ...payload,
      at: nowIso(),
    },
  ];
  writeJson(key, next);
  return next;
}

export function appendSessionRecord(userId, payload) {
  const key = makeUserKey(userId, STORAGE_TYPES.sessions);
  const current = readJson(key, []);
  const next = [
    ...current.slice(-199),
    {
      ...payload,
      at: nowIso(),
    },
  ];
  writeJson(key, next);
  return next;
}

export function appendTutorHistory(userId, payload) {
  const key = makeUserKey(userId, STORAGE_TYPES.tutor);
  const current = readJson(key, []);
  const next = [
    ...current.slice(-79),
    {
      ...payload,
      at: nowIso(),
    },
  ];
  writeJson(key, next);
  return next;
}

export function summarizeLessonKnowledge(userId, lessonId) {
  const store = getKnowledgeStore(userId);
  const lessonPoints = getKnowledgePointsForLesson(lessonId);
  const rows = lessonPoints.map((point) => ({
    ...point,
    ...(store[point.id] || buildDefaultKnowledgeState(point)),
  })).map((item) => {
    const latestHistory = Array.isArray(item.history) ? item.history[item.history.length - 1] : null;
    const latestDelta = latestHistory && Number.isFinite(Number(latestHistory.nextPL)) && Number.isFinite(Number(latestHistory.previousPL))
      ? Number((Number(latestHistory.nextPL) - Number(latestHistory.previousPL)).toFixed(3))
      : 0;
    return {
      ...item,
      latestDelta,
    };
  });
  const sorted = [...rows].sort((a, b) => a.pL - b.pL);
  return {
    lessonId,
    rows,
    strong: [...rows].sort((a, b) => b.pL - a.pL).slice(0, 2),
    weak: sorted.slice(0, Math.min(3, sorted.length)),
    developing: rows.filter((item) => item.pL >= 0.45 && item.pL < 0.75),
    averageMastery: rows.length
      ? Number((rows.reduce((sum, item) => sum + Number(item.pL || 0), 0) / rows.length).toFixed(3))
      : BKT_PARAMS.pL0,
  };
}

export function getRecommendationFromSummary(summary) {
  const weak = summary.weak?.[0];
  if (!weak) {
    return "先完成本课的课前预习与课堂练习，系统会逐步建立知识点掌握画像。";
  }
  if (weak.pL < 0.45) {
    return `建议先回看“${weak.title}”相关的课前预习与 PPT，再向 AI 导师提问。`;
  }
  if (weak.pL < 0.75) {
    return `建议继续完成课堂练习，优先巩固“${weak.title}”这个知识点。`;
  }
  return "当前课时掌握度较稳定，可进入下一课时或综合复习。";
}

export function buildKnowledgeMirrorPayload(userId, lessonId) {
  const summary = summarizeLessonKnowledge(userId, lessonId);
  const lessonPoints = getKnowledgePointsForLesson(lessonId);
  return {
    userId,
    lessonId,
    strongPoints: summary.strong.map((item) => ({ id: item.id, title: item.title, pL: item.pL })),
    weakPoints: summary.weak.map((item) => ({ id: item.id, title: item.title, pL: item.pL })),
    averageMastery: summary.averageMastery,
    recommendation: getRecommendationFromSummary(summary),
    knowledgeStates: lessonPoints.map((point) => {
      const state = getKnowledgeStore(userId)[point.id] || buildDefaultKnowledgeState(point);
      return {
        id: point.id,
        title: point.title,
        lessonId: point.lessonId,
        chapterId: point.chapterId,
        pL: state.pL,
        totalAttempts: state.totalAttempts,
        correctAttempts: state.correctAttempts,
        consecutiveCorrect: state.consecutiveCorrect,
        consecutiveIncorrect: state.consecutiveIncorrect,
        mastered: state.mastered,
        difficulty: state.difficulty,
        lastPracticed: state.lastPracticed,
      };
    }),
  };
}

export function chooseAdaptivePracticeQuestions(userId, lessonId, pool) {
  const questions = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!questions.length) return [];
  const summary = summarizeLessonKnowledge(userId, lessonId);
  const weakIds = new Set(summary.weak.map((item) => item.id));
  const stableIds = new Set(summary.strong.map((item) => item.id));
  const weak = [];
  const current = [];
  const review = [];

  for (const item of questions) {
    if (item.knowledgePointId && weakIds.has(item.knowledgePointId)) {
      weak.push(item);
    } else if (item.knowledgePointId && stableIds.has(item.knowledgePointId)) {
      review.push(item);
    } else {
      current.push(item);
    }
  }

  const ordered = [...weak, ...current, ...review];
  return ordered.length ? ordered : questions;
}

export function createVirtualStudents() {
  const groups = [
    { prefix: "excellent", label: "优等型", range: [0.82, 0.96], tutorTurns: 2, sessionCount: 8, errors: 4 },
    { prefix: "steady", label: "中等稳定型", range: [0.56, 0.78], tutorTurns: 4, sessionCount: 6, errors: 8 },
    { prefix: "imbalanced", label: "偏科型", range: [0.35, 0.9], tutorTurns: 5, sessionCount: 6, errors: 10 },
    { prefix: "lowengage", label: "低参与型", range: [0.18, 0.46], tutorTurns: 1, sessionCount: 3, errors: 14 },
  ];

  const students = [];
  let index = 1;
  for (const group of groups) {
    for (let offset = 0; offset < 3; offset += 1) {
      const userId = `virtual-${String(index).padStart(2, "0")}`;
      const knowledge = {};
      for (const point of getBktKnowledgePoints()) {
        const rhythmBias = /节奏|音值|附点|连音|切分/.test(point.title);
        const notationBias = /谱号|谱表|记谱|五线谱|装饰音/.test(point.title);
        let pL;
        if (group.prefix === "imbalanced") {
          if (offset % 2 === 0) {
            pL = rhythmBias ? 0.84 : notationBias ? 0.32 : 0.58;
          } else {
            pL = notationBias ? 0.85 : rhythmBias ? 0.34 : 0.57;
          }
        } else {
          const [min, max] = group.range;
          pL = min + (((index + point.id.length) % 7) / 6) * (max - min);
        }
        const normalizedPL = Number(Math.min(0.98, Math.max(0.05, pL)).toFixed(3));
        knowledge[point.id] = {
          ...buildDefaultKnowledgeState(point),
          pL: normalizedPL,
          totalAttempts: group.sessionCount + ((index + point.id.length) % 4),
          correctAttempts: Math.max(0, Math.round((group.sessionCount + ((index + point.id.length) % 4)) * normalizedPL)),
          consecutiveCorrect: normalizedPL >= 0.75 ? 2 : 0,
          consecutiveIncorrect: normalizedPL < 0.45 ? 2 : 0,
          lastPracticed: nowIso(),
          mastered: normalizedPL >= BKT_PARAMS.masteryThreshold,
          difficulty: getDifficultyTierForPL(normalizedPL),
        };
      }

      const errors = Array.from({ length: Math.max(1, Math.floor(group.errors / 2)) }, (_, errorIndex) => ({
        type: group.prefix === "imbalanced" && offset % 2 === 0 ? "记谱识读" : "节奏判断",
        lessonId: KNOWLEDGE_POINTS[errorIndex % KNOWLEDGE_POINTS.length].lessonId,
        knowledgePointId: KNOWLEDGE_POINTS[errorIndex % KNOWLEDGE_POINTS.length].id,
        prompt: "虚拟学生测试错题",
        at: nowIso(),
      }));

      const sessions = Array.from({ length: group.sessionCount }, (_, sessionIndex) => {
        const point = KNOWLEDGE_POINTS[(index + sessionIndex) % KNOWLEDGE_POINTS.length];
        return {
          lessonId: point.lessonId,
          chapterId: point.chapterId,
          action: sessionIndex % 2 === 0 ? "practice" : "preview",
          durationMinutes: group.prefix === "lowengage" ? 4 + sessionIndex : 9 + sessionIndex,
          knowledgePointId: point.id,
          at: nowIso(),
        };
      });

      const tutor = Array.from({ length: group.tutorTurns }, (_, tutorIndex) => {
        const point = KNOWLEDGE_POINTS[(index + tutorIndex * 2) % KNOWLEDGE_POINTS.length];
        return {
          role: "user",
          lessonId: point.lessonId,
          content: `请解释 ${point.title} 的核心概念。`,
          at: nowIso(),
        };
      });

      students.push({
        userId,
        studentLabel: `${group.label}学生 ${offset + 1}`,
        profile: group.label,
        knowledge,
        errors,
        sessions,
        tutor,
      });
      index += 1;
    }
  }
  return students;
}

export function writeVirtualStudentsToLocalStorage(students) {
  if (!storageAvailable()) return;
  for (const student of students) {
    writeJson(makeUserKey(student.userId, STORAGE_TYPES.knowledge), student.knowledge);
    writeJson(makeUserKey(student.userId, STORAGE_TYPES.errors), student.errors);
    writeJson(makeUserKey(student.userId, STORAGE_TYPES.sessions), student.sessions);
    writeJson(makeUserKey(student.userId, STORAGE_TYPES.tutor), student.tutor);
  }
}

export function clearVirtualStudentsFromLocalStorage() {
  if (!storageAvailable()) return;
  const keysToRemove = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(`${STORAGE_PREFIX}.virtual-`)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

export function estimateUserStorageUsageBytes(userId) {
  const keys = Object.values(STORAGE_TYPES).map((type) => makeUserKey(userId, type));
  let total = 0;
  for (const key of keys) {
    const value = readJson(key, null);
    if (value != null) {
      total += (key.length + JSON.stringify(value).length) * 2;
    }
  }
  return total;
}

export {
  STORAGE_TYPES,
  KNOWLEDGE_POINTS,
  KNOWLEDGE_POINTS_BY_ID,
  MAPPING_KEY,
};
