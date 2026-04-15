import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { app } from "../server.js";
import { AI_TUTOR_REGRESSION_CASES } from "./ai-tutor-regression-set.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const RESULT_JSON = path.join(DATA_DIR, "composite-student-simulation-latest.json");
const RESULT_CSV = path.join(DATA_DIR, "composite-student-simulation-latest.csv");

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

function createSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function hashString(input) {
  return [...String(input)].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function sample(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

function takeMany(rng, array, count) {
  const copy = [...array];
  const picked = [];
  while (copy.length && picked.length < count) {
    const index = Math.floor(rng() * copy.length);
    picked.push(copy.splice(index, 1)[0]);
  }
  return picked;
}

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
}

function buildHomeworkPayload(studentId, rng) {
  const prompts = [
    "请说明 4/4 拍节奏型书写时最容易出现的两个错误。",
    "请解释中央 C 在高音谱表和低音谱表中的位置差异。",
    "请说明附点与连音线在作业中应如何区分。",
    "请解释 p 和 f 的意义，并说明学生常见混淆点。",
  ];
  const prompt = sample(rng, prompts);
  return {
    lessonTitle: "综合作业测试",
    homeworkPrompt: prompt,
    text: `学生 ${studentId} 的作业说明：${prompt}。我认为关键点是先理解定义，再检查书写规则。`,
    images: [],
    evaluationContext: {
      evaluationType: /节奏|拍/.test(prompt) ? "rhythm" : /谱表|中央 C/.test(prompt) ? "notation" : "theory",
      dimensions: ["完成度", "准确性", "规范性", "表达清晰度", "提交质量"],
    },
  };
}

async function callTutor(baseUrl, testCase) {
  const message = {
    role: "user",
    content: testCase.prompt,
  };
  if (testCase.imageFile) {
    const imagePath = path.join(ROOT, "public", "regression-images", testCase.imageFile);
    const imageBuffer = await fs.readFile(imagePath);
    message.imageDataUrl = toDataUrl(imageBuffer, getMimeType(imagePath));
    message.imageName = testCase.imageFile;
  }
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: "你是一位大学乐理课程教师。请始终用中文回复，优先做定义、规则和例子解释。",
      maxTokens: testCase.imageFile ? 260 : 220,
      messages: [message],
    }),
  });
  const payload = await response.json();
  const reply = String(payload.text || payload.error || "");
  return {
    ok: response.ok,
    category: testCase.category,
    prompt: testCase.prompt,
    reply,
    elapsedMs: Number(payload.elapsedMs || (Date.now() - startedAt)),
    cached: Boolean(payload.cached),
    retried: Boolean(payload.retried),
    modelUsed: payload.modelUsed || "",
    passed: (testCase.expectedAny || []).some((keyword) => normalizeText(reply).includes(normalizeText(keyword))),
  };
}

async function callHomeworkReview(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/homework-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  return {
    ok: response.ok,
    mode: json.mode || "",
    text: String(json.text || ""),
    evaluation: json.evaluation || null,
  };
}

function summarizeCompositeRun(students) {
  const allTutorCalls = students.flatMap((student) => student.tutorRuns);
  const allHomework = students.flatMap((student) => student.homeworkRuns);
  const byCategory = Object.fromEntries(
    [...new Set(allTutorCalls.map((item) => item.category))].map((category) => {
      const subset = allTutorCalls.filter((item) => item.category === category);
      return [category, {
        total: subset.length,
        passed: subset.filter((item) => item.passed).length,
        averageElapsedMs: subset.length ? Math.round(subset.reduce((sum, item) => sum + item.elapsedMs, 0) / subset.length) : 0,
      }];
    }),
  );
  return {
    studentCount: students.length,
    tutorCallCount: allTutorCalls.length,
    tutorPassRate: allTutorCalls.length ? Number((allTutorCalls.filter((item) => item.passed).length / allTutorCalls.length).toFixed(4)) : 0,
    homeworkCallCount: allHomework.length,
    homeworkOkRate: allHomework.length ? Number((allHomework.filter((item) => item.ok).length / allHomework.length).toFixed(4)) : 0,
    averageTutorElapsedMs: allTutorCalls.length ? Math.round(allTutorCalls.reduce((sum, item) => sum + item.elapsedMs, 0) / allTutorCalls.length) : 0,
    byCategory,
    commonTutorFailures: allTutorCalls.filter((item) => !item.passed).slice(0, 12).map((item) => ({
      category: item.category,
      prompt: item.prompt,
      reply: item.reply,
      modelUsed: item.modelUsed,
    })),
  };
}

function toCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

async function writeReports(report) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RESULT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const rows = [[
    "studentId",
    "profile",
    "durationMinutes",
    "tutorCalls",
    "tutorPassed",
    "homeworkCalls",
    "homeworkOk",
    "sampleFailure",
  ].join(",")];
  for (const student of report.students) {
    rows.push([
      student.studentId,
      student.profile,
      student.durationMinutes,
      student.tutorRuns.length,
      student.tutorRuns.filter((item) => item.passed).length,
      student.homeworkRuns.length,
      student.homeworkRuns.filter((item) => item.ok).length,
      student.tutorRuns.find((item) => !item.passed)?.prompt || "",
    ].map(toCsvValue).join(","));
  }
  await fs.writeFile(RESULT_CSV, `\uFEFF${rows.join("\n")}\n`, "utf8");
}

const tutorPools = {
  text: AI_TUTOR_REGRESSION_CASES.filter((item) => ["concept", "terminology", "notation", "rhythm", "analysis", "teaching"].includes(item.category)),
  image: AI_TUTOR_REGRESSION_CASES.filter((item) => item.category === "image"),
  homework: AI_TUTOR_REGRESSION_CASES.filter((item) => item.category === "homework"),
};

const { server, baseUrl } = await startServer();

try {
  const bktResponse = await fetch(`${baseUrl}/api/bkt/test/deep-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentCount: 20, params: {}, durationMinutes: 60, questionCount: 140 }),
  });
  const bktRun = await bktResponse.json();

  const students = await mapWithConcurrency(Array.from({ length: 20 }, (_, index) => index + 1), 4, async (i) => {
    const rng = createSeededRandom(hashString(`composite-student-${i}`));
    const tutorRuns = [];
    const homeworkRuns = [];
    const profile = sample(rng, ["excellent", "steady", "imbalanced", "lowengage"]);
    const textCases = takeMany(rng, tutorPools.text, 3);
    const imageCases = takeMany(rng, tutorPools.image, 1);
    const homeworkCases = takeMany(rng, tutorPools.homework, 1);

    for (const testCase of [...textCases, ...imageCases, ...homeworkCases]) {
      tutorRuns.push(await callTutor(baseUrl, testCase));
    }

    for (let h = 0; h < 2; h += 1) {
      homeworkRuns.push(await callHomeworkReview(baseUrl, buildHomeworkPayload(`student-${i}`, rng)));
    }

    return {
      studentId: `composite-${String(i).padStart(2, "0")}`,
      profile,
      durationMinutes: 60,
      tutorRuns,
      homeworkRuns,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    summary: summarizeCompositeRun(students),
    bktRun,
    students,
  };
  await writeReports(report);
  console.log(JSON.stringify({
    resultJson: RESULT_JSON,
    resultCsv: RESULT_CSV,
    summary: report.summary,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
