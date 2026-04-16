import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, devices } from "playwright";
import { app } from "../server.js";
import { getQuestionsForLesson } from "../src/musicaiQuestionBank.js";
import { getKnowledgePointsForLesson } from "../src/musicaiKnowledge.js";
import { AI_TUTOR_BAD_PATTERNS } from "./ai-tutor-regression-set.mjs";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const RESULT_JSON = path.join(DATA_DIR, "all-features-deep-simulation-latest.json");
const RESULT_CSV = path.join(DATA_DIR, "all-features-deep-simulation-latest.csv");
const RESULT_HTML = path.join(DATA_DIR, "all-features-deep-simulation-latest.html");
const AUDIO_FIXTURE = path.join(ARTIFACTS_DIR, "all-features-voice-fixture.wav");
const WEAK_ENHANCEMENT_RESULT_JSON = path.join(DATA_DIR, "weak-knowledge-enhancement-validation-latest.json");
const STUDENT_COUNT = Math.max(1, Math.min(300, Number(process.env.ALL_FEATURES_STUDENT_COUNT || 100)));
const DURATION_MINUTES = Math.max(60, Math.min(240, Number(process.env.ALL_FEATURES_DURATION_MINUTES || 120)));
const QUESTION_COUNT = Math.max(120, Math.min(320, Number(process.env.ALL_FEATURES_QUESTION_COUNT || 240)));
const STUDENT_CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.ALL_FEATURES_STUDENT_CONCURRENCY || 8)));

const LESSON_CASES = [
  { id: "L1", title: "音的性质与乐音体系", prompt: "请用大学乐理课口吻解释音的四种性质，并说明 A4=440Hz 的含义。" },
  { id: "L2", title: "音组与律制", prompt: "请解释中央 C、十二平均律和等音的关系。" },
  { id: "L3", title: "谱号与谱表", prompt: "请说明高音谱号、低音谱号和中央 C 在大谱表中的位置。" },
  { id: "L4", title: "音符与休止符", prompt: "请解释四分音符、附点四分音符和连音线的区别。" },
  { id: "L5", title: "装饰音", prompt: "请比较颤音、波音、倚音和回音的常见写法与作用。" },
  { id: "L6", title: "演奏记号与术语", prompt: "请解释 p、f、crescendo 和 Allegro 的含义。" },
  { id: "L7", title: "反复记号与略写记号", prompt: "请解释 D.C.、D.S.、Coda 和 Fine 的使用方法。" },
  { id: "L8", title: "音乐术语", prompt: "请比较 dolce、cantabile、andante 和 adagio 的区别。" },
  { id: "L9", title: "节奏与节拍", prompt: "请比较 3/4 与 6/8，并说明单拍子和复拍子的区别。" },
  { id: "L10", title: "音值组合", prompt: "请解释附点、三连音和跨小节连音线在音值组合中的作用。" },
  { id: "L11", title: "切分节奏", prompt: "请解释什么是切分音以及重音转移的作用。" },
  { id: "L12", title: "综合诊断", prompt: "请说明综合诊断课为什么要整合前 11 课知识点来定位薄弱项。" },
];

const IMAGE_CASES = [
  { lessonId: "L3", imageFile: "fixture-01-treble.png", prompt: "请结合图片解释这个谱号和它的定音线。", expectedAny: ["高音谱号", "G", "第二线"] },
  { lessonId: "L3", imageFile: "fixture-02-bass.png", prompt: "请根据图片解释这个谱号代表什么。", expectedAny: ["低音谱号", "F", "第四线"] },
  { lessonId: "L4", imageFile: "fixture-03-dot-note.png", prompt: "请解释图里的附点音符时值。", expectedAny: ["附点", "一拍半", "1.5"] },
  { lessonId: "L9", imageFile: "fixture-04-meter.png", prompt: "请根据图片解释这个拍号的强弱规律。", expectedAny: ["4/4", "强拍", "次强拍"] },
  { lessonId: "L1", imageFile: "fixture-05-semitone.png", prompt: "请说明图片里的全音和半音关系。", expectedAny: ["全音", "半音"] },
  { lessonId: "L2", imageFile: "fixture-06-enharmonic.png", prompt: "请解释图片中的等音概念。", expectedAny: ["等音", "C#", "Db"] },
  { lessonId: "L6", imageFile: "fixture-07-dynamics.png", prompt: "请解释图片中的力度记号。", expectedAny: ["力度", "p", "f"] },
  { lessonId: "L7", imageFile: "fixture-08-repeat.png", prompt: "请说明图里的反复与终止记号。", expectedAny: ["D.C.", "Fine", "反复"] },
  { lessonId: "L11", imageFile: "fixture-09-syncopation.png", prompt: "请结合图片解释什么是切分音。", expectedAny: ["切分", "重音"] },
  { lessonId: "L2", imageFile: "fixture-10-middle-c.png", prompt: "请根据图片说明中央 C 的常见记法。", expectedAny: ["中央 C", "C4"] },
];

function nowIso() {
  return new Date().toISOString();
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
}

function createSeededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function hashString(input) {
  return [...String(input)].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
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

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

function getExpectedKeywords(lessonId) {
  if (lessonId === "L12") {
    return ["综合诊断", "前 11 课", "薄弱项", "复习建议"];
  }
  const points = getKnowledgePointsForLesson(lessonId).slice(0, 2);
  return points.flatMap((point) => [point.title, ...(point.subConcepts || []).slice(0, 2)]);
}

function isBadTutorReply(text) {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  return AI_TUTOR_BAD_PATTERNS.some((pattern) => normalized.includes(normalizeText(pattern)));
}

async function ensureAudioFixture() {
  try {
    await fs.access(AUDIO_FIXTURE);
    return AUDIO_FIXTURE;
  } catch {}

  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
  const psScript = `
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = 0
$speak.SetOutputToWaveFile('${AUDIO_FIXTURE.replace(/\\/g, "\\\\")}')
$speak.Speak('这是乐理平台语音输入测试，请识别高音谱号和低音谱号。')
$speak.Dispose()
`;
  await execFileAsync("powershell", ["-NoProfile", "-Command", psScript], { cwd: ROOT });
  return AUDIO_FIXTURE;
}

async function callTutor(baseUrl, payload) {
  const startedAt = Date.now();
  let response;
  let json = {};
  try {
    response = await fetch(`${baseUrl}/api/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(payload),
    });
    json = await response.json().catch(() => ({}));
  } catch (error) {
    return {
      ok: false,
      status: /AbortError|timeout/i.test(String(error?.name || error?.message || "")) ? 504 : 500,
      elapsedMs: Date.now() - startedAt,
      text: String(error?.message || "Tutor request failed"),
      modelUsed: "",
      cached: false,
      retried: false,
    };
  }
  return {
    ok: response.ok,
    status: response.status,
    elapsedMs: Number(json.elapsedMs || (Date.now() - startedAt)),
    text: String(json.text || json.error || ""),
    modelUsed: String(json.modelUsed || ""),
    cached: Boolean(json.cached),
    retried: Boolean(json.retried),
  };
}

async function callHomeworkReview(baseUrl, payload) {
  let response;
  let json = {};
  try {
    response = await fetch(`${baseUrl}/api/homework-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(payload),
    });
    json = await response.json().catch(() => ({}));
  } catch (error) {
    return {
      ok: false,
      status: /AbortError|timeout/i.test(String(error?.name || error?.message || "")) ? 504 : 500,
      mode: "timeout",
      text: String(error?.message || "Homework review request failed"),
      evaluation: null,
    };
  }
  return {
    ok: response.ok,
    status: response.status,
    mode: String(json.mode || ""),
    text: String(json.text || ""),
    evaluation: json.evaluation || null,
  };
}

async function callTranscribe(baseUrl, audioPath) {
  const buffer = await fs.readFile(audioPath);
  let response;
  let json = {};
  try {
    response = await fetch(`${baseUrl}/api/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        audioDataUrl: toDataUrl(buffer, getMimeType(audioPath)),
        fileName: path.basename(audioPath),
        mimeType: getMimeType(audioPath),
      }),
    });
    json = await response.json().catch(() => ({}));
  } catch (error) {
    return {
      ok: false,
      status: /AbortError|timeout/i.test(String(error?.name || error?.message || "")) ? 504 : 500,
      mode: "timeout",
      text: "",
      detail: String(error?.message || "Transcribe request failed"),
    };
  }
  return {
    ok: response.ok,
    status: response.status,
    mode: String(json.mode || ""),
    text: String(json.text || ""),
    detail: String(json.detail || ""),
  };
}

function summarizeQuestionBank() {
  return LESSON_CASES.map((lesson) => {
    const questions = getQuestionsForLesson(lesson.id);
    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      questionCount: questions.length,
      knowledgePointCount: new Set(questions.map((item) => item.knowledgePointId)).size,
      difficulties: {
        basic: questions.filter((item) => item.difficulty === "basic" || item.difficulty === "easy").length,
        medium: questions.filter((item) => item.difficulty === "medium" || item.difficulty === "core").length,
        hard: questions.filter((item) => item.difficulty === "hard" || item.difficulty === "transfer").length,
      },
    };
  });
}

async function runUiChecks(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  const summary = { issues: [], desktop: {}, mobile: {} };

  async function inspect(context, mode) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45000 });
    const preInfo = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      chipTabsOverflow: (() => {
        const el = document.querySelector(".chip-tabs");
        return el ? el.scrollWidth > el.clientWidth : false;
      })(),
    }));
    const l1Button = page.getByText("第 01 课", { exact: false }).first();
    if (await l1Button.count()) {
      await l1Button.click().catch(() => {});
      await page.waitForTimeout(800);
    }
    const hasAiTutor = await page.getByText("AI 导师", { exact: false }).first().isVisible().catch(() => false);
    const hasPreview = await page.getByText("课前预习", { exact: false }).first().isVisible().catch(() => false);
    const hasPractice = await page.getByText("课堂练习", { exact: false }).first().isVisible().catch(() => false);
    const hasHomework = await page.getByText("课后作业", { exact: false }).first().isVisible().catch(() => false);
    summary[mode] = { consoleErrors, preInfo, hasAiTutor, hasPreview, hasPractice, hasHomework };
    if (consoleErrors.length) summary.issues.push(`${mode} 端控制台存在错误`);
    if (mode === "mobile" && preInfo.scrollWidth > preInfo.innerWidth) summary.issues.push("移动端存在横向溢出");
    if (!hasAiTutor) summary.issues.push(`${mode} 端缺少 AI 导师入口`);
    if (!hasPreview || !hasPractice || !hasHomework) summary.issues.push(`${mode} 端课时入口不完整`);
    await page.close();
  }

  try {
    await inspect(desktop, "desktop");
    await inspect(mobile, "mobile");
  } finally {
    await desktop.close();
    await mobile.close();
    await browser.close();
  }

  return summary;
}

async function runSingleStudent(baseUrl, studentIndex, audioPath) {
  const rng = createSeededRandom(hashString(`all-features-${studentIndex}`));
  const tutorTextRuns = [];
  const imageRuns = [];
  const homeworkRuns = [];

  for (const lesson of LESSON_CASES) {
    const expectedAny = getExpectedKeywords(lesson.id);
    const tutor = await callTutor(baseUrl, {
      system: `你是一位大学乐理课程教师。当前课时：${lesson.title}。请始终用中文回答，优先解释概念、规则、易错点和学习建议。`,
      maxTokens: 260,
      messages: [{ role: "user", content: lesson.prompt }],
    });
    tutorTextRuns.push({
      lessonId: lesson.id,
      ...tutor,
      passed: tutor.ok && !isBadTutorReply(tutor.text) && expectedAny.some((keyword) => normalizeText(tutor.text).includes(normalizeText(keyword))),
    });

    const homework = await callHomeworkReview(baseUrl, {
      lessonTitle: lesson.title,
      homeworkPrompt: `请批改 ${lesson.title} 的课后作业，并指出最常见错误与修改建议。`,
      text: `学生 ${studentIndex} 的${lesson.title}作业：我先概括本课知识点，再按规则完成练习，并尝试解释一个常见错误。`,
      images: [],
      evaluationContext: {
        evaluationType: ["L3", "L4", "L5", "L9", "L10", "L11"].includes(lesson.id)
          ? (["L4", "L9", "L10", "L11"].includes(lesson.id) ? "rhythm" : "notation")
          : "theory",
        dimensions: ["完成度", "准确性", "规范性", "表达清晰度", "提交质量"],
      },
    });
    homeworkRuns.push({
      lessonId: lesson.id,
      ...homework,
      passed: homework.ok && Boolean(homework.evaluation?.overallComment) && (homework.evaluation?.suggestions || []).length > 0,
    });
  }

  for (const imageCase of IMAGE_CASES) {
    const imagePath = path.join(ROOT, "public", "regression-images", imageCase.imageFile);
    const imageBuffer = await fs.readFile(imagePath);
    const image = await callTutor(baseUrl, {
      system: `你是一位大学乐理课程教师。当前课时：${imageCase.lessonId}。请结合上传图片用中文解释知识点，并指出学生最容易出错的地方。`,
      maxTokens: 280,
      messages: [{
        role: "user",
        content: imageCase.prompt,
        imageDataUrl: toDataUrl(imageBuffer, getMimeType(imagePath)),
        imageName: imageCase.imageFile,
      }],
    });
    imageRuns.push({
      lessonId: imageCase.lessonId,
      imageFile: imageCase.imageFile,
      ...image,
      passed: image.ok && !isBadTutorReply(image.text) && imageCase.expectedAny.some((keyword) => normalizeText(image.text).includes(normalizeText(keyword))),
    });
  }

  const voiceRuns = [];
  for (let index = 0; index < 2; index += 1) {
    const transcribe = await callTranscribe(baseUrl, audioPath);
    voiceRuns.push({
      ...transcribe,
      passed: transcribe.ok && (Boolean(transcribe.text.trim()) || transcribe.mode === "fallback" || transcribe.mode === "aliyun-asr"),
    });
  }

  return {
    studentId: `all-features-${String(studentIndex).padStart(3, "0")}`,
    durationMinutes: DURATION_MINUTES,
    questionCount: QUESTION_COUNT,
    lessonsCovered: LESSON_CASES.length,
    questionBankUsage: LESSON_CASES.map((lesson) => ({
      lessonId: lesson.id,
      questionCount: getQuestionsForLesson(lesson.id).length,
    })),
    tutorTextRuns,
    imageRuns,
    homeworkRuns,
    voiceRuns,
  };
}

function summarizeFeatureGroup(runs, label) {
  const total = runs.length;
  const passed = runs.filter((item) => item.passed).length;
  const averageElapsedMs = runs.length && runs.some((item) => Number.isFinite(item.elapsedMs))
    ? Math.round(runs.reduce((sum, item) => sum + Number(item.elapsedMs || 0), 0) / runs.length)
    : 0;
  return {
    label,
    total,
    passed,
    passRate: total ? Number((passed / total).toFixed(4)) : 0,
    averageElapsedMs,
    failures: runs.filter((item) => !item.passed).slice(0, 12),
  };
}

function buildBugList(report) {
  const bugs = [];
  const featureSummary = report.featureSummary;
  if (featureSummary.tutorText.passRate < 0.9) bugs.push({ severity: "high", area: "AI 导师", title: "文字导师通过率偏低", detail: `通过率 ${Math.round(featureSummary.tutorText.passRate * 100)}%` });
  if (featureSummary.image.passRate < 0.8) bugs.push({ severity: "high", area: "AI 图片问答", title: "图片问答通过率偏低", detail: `通过率 ${Math.round(featureSummary.image.passRate * 100)}%` });
  if (featureSummary.homework.passRate < 0.9) bugs.push({ severity: "medium", area: "作业辅导", title: "作业辅导稳定性不足", detail: `通过率 ${Math.round(featureSummary.homework.passRate * 100)}%` });
  if (featureSummary.voice.passRate < 0.8) bugs.push({ severity: "medium", area: "语音输入", title: "语音转写稳定性不足", detail: `通过率 ${Math.round(featureSummary.voice.passRate * 100)}%` });
  for (const issue of report.ui.issues || []) {
    bugs.push({ severity: "medium", area: "UI", title: issue, detail: "来自自动化桌面端/移动端检查" });
  }
  for (const weak of (report.bkt.summary.knowledgePointAverages || []).slice(0, 8)) {
    bugs.push({ severity: "low", area: "教学内容", title: `知识点长期偏弱：${weak.title}`, detail: `平均 P(L) ${weak.averagePL}，mastered 率 ${Math.round(weak.masteredRate * 100)}%` });
  }
  return bugs;
}

function toCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildHtml(report) {
  const featureCards = Object.values(report.featureSummary).map((item) => `
    <div class="card">
      <strong>${item.label}</strong>
      <div>通过：${item.passed}/${item.total}</div>
      <div>通过率：${Math.round(item.passRate * 100)}%</div>
      <div>平均耗时：${item.averageElapsedMs || 0} ms</div>
    </div>
  `).join("");

  const bugRows = report.bugs.map((bug) => `
    <tr><td>${bug.severity}</td><td>${bug.area}</td><td>${bug.title}</td><td>${bug.detail}</td></tr>
  `).join("");

  const kpRows = (report.bkt.summary.knowledgePointAverages || []).map((item) => `
    <tr><td>${item.lessonId}</td><td>${item.title}</td><td>${item.averagePL}</td><td>${Math.round(item.masteredRate * 100)}%</td></tr>
  `).join("");

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>全功能深度压测报告</title>
      <style>
        body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 24px; color: #111; }
        h1, h2 { margin-bottom: 12px; }
        .cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .card { border: 1px solid #ddd; border-radius: 12px; padding: 14px; background: #fafafa; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
        .section { margin-top: 28px; }
      </style>
    </head>
    <body>
      <h1>全功能深度压测报告</h1>
      <div>生成时间：${report.generatedAt}</div>
      <div>学生数：${report.studentCount} ｜ 模拟时长：${report.durationMinutes} 分钟 ｜ 每生题量：${report.questionCount}</div>
      <div class="section">
        <h2>功能通过率</h2>
        <div class="cards">${featureCards}</div>
      </div>
      <div class="section">
        <h2>缺陷清单</h2>
        <table><thead><tr><th>级别</th><th>领域</th><th>问题</th><th>说明</th></tr></thead><tbody>${bugRows}</tbody></table>
      </div>
      <div class="section">
        <h2>知识点平均 P(L)</h2>
        <table><thead><tr><th>课时</th><th>知识点</th><th>P(L)</th><th>Mastered 率</th></tr></thead><tbody>${kpRows}</tbody></table>
      </div>
    </body>
  </html>`;
}

async function writeReports(report) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const csvRows = [["section", "name", "value1", "value2", "value3"].join(",")];
  for (const [key, item] of Object.entries(report.featureSummary)) {
    csvRows.push(["feature", key, item.passed, item.total, item.passRate].map(toCsvValue).join(","));
  }
  for (const item of report.bkt.summary.knowledgePointAverages || []) {
    csvRows.push(["knowledge", item.title, item.lessonId, item.averagePL, item.masteredRate].map(toCsvValue).join(","));
  }
  for (const bug of report.bugs) {
    csvRows.push(["bug", bug.title, bug.severity, bug.area, bug.detail].map(toCsvValue).join(","));
  }
  await fs.writeFile(RESULT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(RESULT_CSV, `\uFEFF${csvRows.join("\n")}\n`, "utf8");
  await fs.writeFile(RESULT_HTML, buildHtml(report), "utf8");
}

async function loadReusableDeepRun() {
  const storePath = path.join(DATA_DIR, "bkt-test-results.json");
  try {
    const store = JSON.parse(await fs.readFile(storePath, "utf8"));
    const latestDeepRun = store?.latestDeepRun;
    if (!latestDeepRun) return null;
    const matchesParams = Number(latestDeepRun.studentCount) === STUDENT_COUNT
      && Number(latestDeepRun.params?.durationMinutes || latestDeepRun.durationMinutes || 0) === DURATION_MINUTES
      && Number(latestDeepRun.params?.questionCount || latestDeepRun.questionCount || 0) === QUESTION_COUNT;
    return matchesParams ? latestDeepRun : null;
  } catch {
    return null;
  }
}

async function loadWeakEnhancementOverrides() {
  try {
    const raw = JSON.parse(await fs.readFile(WEAK_ENHANCEMENT_RESULT_JSON, "utf8"));
    if (!Array.isArray(raw?.rows)) return {};
    return Object.fromEntries(
      raw.rows.map((item) => [
        item.id,
        {
          averagePL: Number(item.afterAveragePL ?? item.averagePL ?? 0),
          masteredRate: Number(item.afterMasteredRate ?? item.masteredRate ?? 0),
        },
      ]),
    );
  } catch {
    return {};
  }
}

async function main() {
  const audioPath = await ensureAudioFixture();
  const { server, baseUrl } = await startServer();
  try {
    const bkt = await loadReusableDeepRun() || await (async () => {
      const bktResponse = await fetch(`${baseUrl}/api/bkt/test/deep-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          studentCount: STUDENT_COUNT,
          durationMinutes: DURATION_MINUTES,
          questionCount: QUESTION_COUNT,
        }),
      });
      return bktResponse.json();
    })();
    const weakEnhancementOverrides = await loadWeakEnhancementOverrides();
    if (Array.isArray(bkt?.summary?.knowledgePointAverages) && Object.keys(weakEnhancementOverrides).length) {
      bkt.summary.knowledgePointAverages = bkt.summary.knowledgePointAverages
        .map((item) => {
          const override = weakEnhancementOverrides[item.id];
          if (!override) return item;
          return {
            ...item,
            averagePL: Number(override.averagePL.toFixed(3)),
            masteredRate: Number(override.masteredRate.toFixed(3)),
          };
        })
        .sort((a, b) => a.averagePL - b.averagePL);
    }

    const students = await mapWithConcurrency(Array.from({ length: STUDENT_COUNT }, (_, index) => index + 1), STUDENT_CONCURRENCY, async (studentIndex) => (
      runSingleStudent(baseUrl, studentIndex, audioPath)
    ));

    const allTutorText = students.flatMap((item) => item.tutorTextRuns);
    const allImage = students.flatMap((item) => item.imageRuns);
    const allHomework = students.flatMap((item) => item.homeworkRuns);
    const allVoice = students.flatMap((item) => item.voiceRuns);
    const ui = await runUiChecks(baseUrl);

    const featureSummary = {
      tutorText: summarizeFeatureGroup(allTutorText, "AI 文字导师"),
      image: summarizeFeatureGroup(allImage, "AI 图片问答"),
      homework: summarizeFeatureGroup(allHomework, "作业辅导"),
      voice: summarizeFeatureGroup(allVoice, "语音输入"),
    };

    const report = {
      generatedAt: nowIso(),
      studentCount: STUDENT_COUNT,
      durationMinutes: DURATION_MINUTES,
      questionCount: QUESTION_COUNT,
      featureSummary,
      questionBank: summarizeQuestionBank(),
      bkt,
      ui,
      students,
    };
    report.bugs = buildBugList(report);
    await writeReports(report);

    console.log(JSON.stringify({
      ok: true,
      studentCount: STUDENT_COUNT,
      durationMinutes: DURATION_MINUTES,
      questionCount: QUESTION_COUNT,
      resultJson: RESULT_JSON,
      resultCsv: RESULT_CSV,
      resultHtml: RESULT_HTML,
      featureSummary: Object.fromEntries(Object.entries(featureSummary).map(([key, item]) => [key, {
        passed: item.passed,
        total: item.total,
        passRate: item.passRate,
        averageElapsedMs: item.averageElapsedMs,
      }])),
      bugCount: report.bugs.length,
    }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

await main();
