import http from "node:http";
import { app } from "../server.js";
import { BKT_PARAMS, KNOWLEDGE_POINTS_BY_LESSON } from "../src/musicaiKnowledge.js";

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function buildValidPayload(studentIndex) {
  const lessonId = "L1";
  return {
    userId: `stress-${studentIndex}`,
    studentLabel: `并发学生 ${studentIndex}`,
    lessonId,
    source: "stress-test",
    knowledgeStates: (KNOWLEDGE_POINTS_BY_LESSON[lessonId] || []).map((point, index) => ({
      id: point.id,
      title: point.title,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      pL: Number((BKT_PARAMS.pL0 + 0.05 * ((studentIndex + index) % 4)).toFixed(3)),
      difficulty: "medium",
      totalAttempts: 3 + index,
      correctAttempts: 2 + index,
      consecutiveCorrect: 1,
      consecutiveIncorrect: 0,
      mastered: false,
      lastPracticed: new Date().toISOString(),
    })),
  };
}

const invalidPayloads = [
  { userId: "invalid-neg", lessonId: "L1", knowledgeStates: [{ id: "L1_K1_pitchProperties", lessonId: "L1", chapterId: "ch1", pL: -1, difficulty: "medium", totalAttempts: 1, correctAttempts: 1, consecutiveCorrect: 1, consecutiveIncorrect: 0 }] },
  { userId: "invalid-over", lessonId: "L1", knowledgeStates: [{ id: "L1_K1_pitchProperties", lessonId: "L1", chapterId: "ch1", pL: 2.5, difficulty: "medium", totalAttempts: 1, correctAttempts: 1, consecutiveCorrect: 1, consecutiveIncorrect: 0 }] },
  { userId: "invalid-string", lessonId: "L1", knowledgeStates: [{ id: "L1_K1_pitchProperties", lessonId: "L1", chapterId: "ch1", pL: "abc", difficulty: "medium", totalAttempts: 1, correctAttempts: 1, consecutiveCorrect: 1, consecutiveIncorrect: 0 }] },
  {},
];

const { server, baseUrl } = await startServer();

try {
  const concurrencyResults = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      fetch(`${baseUrl}/api/bkt/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildValidPayload(index + 1)),
      }).then(async (response) => ({
        status: response.status,
        body: await response.json(),
      })),
    ),
  );

  const invalidResults = [];
  for (const payload of invalidPayloads) {
    const response = await fetch(`${baseUrl}/api/bkt/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    invalidResults.push({
      status: response.status,
      body: await response.json(),
    });
  }

  console.log(JSON.stringify({
    concurrency: {
      total: concurrencyResults.length,
      success: concurrencyResults.filter((item) => item.status === 200).length,
      failures: concurrencyResults.filter((item) => item.status !== 200).length,
    },
    invalidResults,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
