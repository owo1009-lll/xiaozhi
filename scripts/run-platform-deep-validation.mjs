import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";
import { app } from "../server.js";
import { getQuestionsForLesson } from "../src/musicaiQuestionBank.js";
import { getBktKnowledgePoints, getKnowledgePointsForLesson } from "../src/musicaiKnowledge.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts");
const REPORT_TAG = String(process.env.REPORT_TAG || "").trim().replace(/[^\w-]+/g, "-");
const RESULT_SUFFIX = REPORT_TAG ? `-${REPORT_TAG}` : "-latest";
const RESULT_JSON = path.join(DATA_DIR, `platform-deep-validation${RESULT_SUFFIX}.json`);
const RESULT_CSV = path.join(DATA_DIR, `platform-deep-validation${RESULT_SUFFIX}.csv`);
const RESULT_HTML = path.join(DATA_DIR, `platform-deep-validation${RESULT_SUFFIX}.html`);

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

function sample(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function rotatePick(items, index, count) {
  return Array.from({ length: count }, (_, offset) => items[(index + offset) % items.length]);
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
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

function toCsvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const LESSON_SEQUENCE = [
  { id: "L1", title: "音的性质与乐音体系", tutorPrompt: "请用大学乐理课堂口吻解释音的四种性质，并举一个 A4=440Hz 的例子。", expectedAny: ["音高", "音值", "音量", "音色", "440"] },
  { id: "L2", title: "音组、律制与等音", tutorPrompt: "请解释中央 C、十二平均律和等音的关系。", expectedAny: ["中央 C", "十二平均律", "等音"] },
  { id: "L3", title: "谱号与谱表", tutorPrompt: "请解释高音谱号、低音谱号和中央 C 在大谱表中的位置。", expectedAny: ["高音谱号", "低音谱号", "中央 C"] },
  { id: "L4", title: "音符、休止符与附点", tutorPrompt: "请解释四分音符、附点四分音符和连音线的区别。", expectedAny: ["四分音符", "附点", "连音线"] },
  { id: "L5", title: "装饰音", tutorPrompt: "请解释颤音、波音和倚音的差别。", expectedAny: ["颤音", "波音", "倚音"] },
  { id: "L6", title: "演奏符号与术语", tutorPrompt: "请解释 p、f、crescendo 和 Allegro。", expectedAny: ["p", "f", "渐强", "Allegro"] },
  { id: "L7", title: "反复与缩写记号", tutorPrompt: "请解释 D.C.、D.S.、Coda 和 Fine 的用法。", expectedAny: ["D.C.", "D.S.", "Coda", "Fine"] },
  { id: "L8", title: "音乐术语", tutorPrompt: "请比较 dolce、cantabile、andante 和 adagio。", expectedAny: ["dolce", "cantabile", "andante", "adagio"] },
  { id: "L9", title: "节拍与拍号", tutorPrompt: "请解释 3/4 和 6/8 的差别，并说明单拍子与复拍子的区别。", expectedAny: ["3/4", "6/8", "单拍子", "复拍子"] },
  { id: "L10", title: "音值组合", tutorPrompt: "请解释附点、三连音和跨小节连音线在音值组合中的作用。", expectedAny: ["附点", "三连音", "连音线"] },
  { id: "L11", title: "切分音", tutorPrompt: "请解释什么是切分音，以及重音迁移为什么重要。", expectedAny: ["切分音", "重音迁移"] },
  { id: "L12", title: "综合诊断", tutorPrompt: "请说明综合诊断课为什么要整合前面所有知识点来定位薄弱环节。", expectedAny: ["综合", "知识点", "薄弱"] },
];

const IMAGE_CASES = [
  { lessonId: "L3", prompt: "请结合图片解释这个谱号和定音线。", expectedAny: ["高音谱号", "G", "第二线"], imageFile: "fixture-01-treble.png" },
  { lessonId: "L3", prompt: "请根据图片说明这个谱号代表什么。", expectedAny: ["低音谱号", "F", "第四线"], imageFile: "fixture-02-bass.png" },
  { lessonId: "L4", prompt: "请解释图里的附点音符时值。", expectedAny: ["附点", "1.5", "一拍半"], imageFile: "fixture-03-dot-note.png" },
  { lessonId: "L9", prompt: "请根据图片解释这个拍号的强弱规律。", expectedAny: ["4/4", "强拍"], imageFile: "fixture-04-meter.png" },
  { lessonId: "L1", prompt: "请说明图片里展示的全音和半音关系。", expectedAny: ["半音", "全音"], imageFile: "fixture-05-semitone.png" },
  { lessonId: "L2", prompt: "请解释图片中的等音概念。", expectedAny: ["等音", "C#", "Db"], imageFile: "fixture-06-enharmonic.png" },
  { lessonId: "L6", prompt: "请解释图片中的力度记号。", expectedAny: ["力度", "p", "f"], imageFile: "fixture-07-dynamics.png" },
  { lessonId: "L7", prompt: "请解释图里的反复记号。", expectedAny: ["D.C.", "Fine", "反复"], imageFile: "fixture-08-repeat.png" },
  { lessonId: "L11", prompt: "请根据图片解释什么是切分音。", expectedAny: ["切分", "重音"], imageFile: "fixture-09-syncopation.png" },
  { lessonId: "L2", prompt: "请根据图片说明中央 C 的常见记法。", expectedAny: ["中央 C", "C4"], imageFile: "fixture-10-middle-c.png" },
];

const HOMEWORK_CASES = LESSON_SEQUENCE.map((lesson, index) => ({
  lessonId: lesson.id,
  lessonTitle: lesson.title,
  homeworkPrompt: `请批改第 ${index + 1} 课的作业，并指出最常见错误与修改建议。`,
  text: `这是第 ${index + 1} 课《${lesson.title}》的课后作业。请从完成度、准确性、规范性和教学建议四个角度给出反馈。`,
  evaluationType: ["L3", "L4", "L5", "L9", "L10", "L11"].includes(lesson.id)
    ? (["L4", "L9", "L10", "L11"].includes(lesson.id) ? "rhythm" : "notation")
    : "theory",
}));

function looksBrokenText(text) {
  const value = String(text || "");
  if (!value.trim()) return true;
  if (value.includes("${") || value.includes("undefined") || value.includes("null")) return true;
  if (value.includes("\uFFFD")) return true;
  const mojibakeMatches = value.match(/[鈥銆鐨鍦浠璇鏄闊鎷瀛涔]/g) || [];
  return mojibakeMatches.length >= 8;
}

function inspectQuestionBank() {
  const lessons = LESSON_SEQUENCE.map((lesson) => {
    const questions = getQuestionsForLesson(lesson.id);
    const broken = [];
    const invalid = [];
    for (const question of questions) {
      if (looksBrokenText(question.prompt) || looksBrokenText(question.explanation) || question.options.some((item) => looksBrokenText(item))) {
        broken.push(question.id);
      }
      if (!question.knowledgePointId || !question.options.includes(question.answer) || question.options.length < 3) {
        invalid.push(question.id);
      }
      if (lesson.id === "L12" && /^L12_/.test(String(question.knowledgePointId))) {
        invalid.push(`${question.id}:diagnostic-mapping`);
      }
    }
    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      questionCount: questions.length,
      knowledgePointCount: new Set(questions.map((item) => item.knowledgePointId)).size,
      brokenQuestionIds: broken,
      invalidQuestionIds: invalid,
    };
  });

  return {
    lessons,
    summary: {
      totalQuestions: lessons.reduce((sum, item) => sum + item.questionCount, 0),
      brokenCount: lessons.reduce((sum, item) => sum + item.brokenQuestionIds.length, 0),
      invalidCount: lessons.reduce((sum, item) => sum + item.invalidQuestionIds.length, 0),
    },
  };
}

async function callTutor(baseUrl, lessonCase, imageCase = null) {
  const lessonPoints = getKnowledgePointsForLesson(lessonCase.id === "L12" ? imageCase?.lessonId || lessonCase.id : lessonCase.id);
  const contextText = lessonPoints
    .slice(0, 6)
    .map((point, index) => `${index + 1}. ${point.title}：${(point.subConcepts || []).slice(0, 2).join("；")}`)
    .join("\n");
  const tutorSystem = lessonCase.id === "L12"
    ? `你是一位大学乐理课程教师。当前课程：${lessonCase.title}。\n请始终用中文回复，说明要清楚、准确、简洁。\n这是综合诊断课，不要逐条背诵全部知识点；请优先说明综合诊断目的、如何整合前 11 课知识点、如何定位薄弱项，以及下一步复习建议。\n课程内容：\n本课是综合诊断课。请整合前 11 课的核心知识点，重点帮助学生定位薄弱知识点、解释错误原因、给出复习顺序与下一步建议。`
    : `你是一位大学乐理课程教师。当前课程：${lessonCase.title}。\n请始终用中文回复，说明要清楚、准确、简洁。\n课程内容：\n${contextText}`;
  const message = {
    role: "user",
    content: imageCase?.prompt || lessonCase.prompt,
  };
  if (imageCase) {
    const imagePath = path.join(ROOT, "public", "regression-images", imageCase.imageFile);
    const imageBuffer = await fs.readFile(imagePath);
    message.imageDataUrl = toDataUrl(imageBuffer, getMimeType(imagePath));
    message.imageName = imageCase.imageFile;
  }
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: tutorSystem,
      maxTokens: imageCase ? 280 : 220,
      messages: [message],
    }),
  });
  const payload = await response.json();
  const reply = String(payload.text || payload.error || "");
  const expectedAny = imageCase?.expectedAny || lessonCase.expectedAny;
  return {
    ok: response.ok,
    lessonId: imageCase?.lessonId || lessonCase.id,
    type: imageCase ? "image" : "text",
    prompt: message.content,
    reply,
    elapsedMs: Number(payload.elapsedMs || (Date.now() - startedAt)),
    cached: Boolean(payload.cached),
    modelUsed: payload.modelUsed || "",
    passed: response.ok && expectedAny.some((keyword) => normalizeText(reply).includes(normalizeText(keyword))),
  };
}

async function callHomeworkReview(baseUrl, homeworkCase) {
  const response = await fetch(`${baseUrl}/api/homework-review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lessonTitle: homeworkCase.lessonTitle,
      homeworkPrompt: homeworkCase.homeworkPrompt,
      text: homeworkCase.text,
      images: [],
      evaluationContext: {
        evaluationType: homeworkCase.evaluationType,
        dimensions: ["完成度", "准确性", "规范性", "表达清晰度", "提交质量"],
      },
    }),
  });
  const payload = await response.json();
  const evaluation = payload.evaluation || {};
  return {
    ok: response.ok,
    lessonId: homeworkCase.lessonId,
    overallComment: String(evaluation.overallComment || payload.text || ""),
    strengths: evaluation.strengths || [],
    issues: evaluation.issues || [],
    suggestions: evaluation.suggestions || [],
    passed: response.ok && Boolean(evaluation.overallComment) && Array.isArray(evaluation.suggestions) && evaluation.suggestions.length > 0,
    mode: payload.mode || "",
  };
}

function summarizeAiRuns(runs) {
  const groups = ["text", "image", "homework"];
  const byType = Object.fromEntries(groups.map((type) => {
    const subset = runs.filter((item) => item.type === type);
    return [type, {
      total: subset.length,
      passed: subset.filter((item) => item.passed).length,
      averageElapsedMs: subset.length ? Math.round(subset.reduce((sum, item) => sum + Number(item.elapsedMs || 0), 0) / subset.length) : 0,
      failures: subset.filter((item) => !item.passed).slice(0, 8),
    }];
  }));
  return {
    total: runs.length,
    passed: runs.filter((item) => item.passed).length,
    passRate: runs.length ? Number((runs.filter((item) => item.passed).length / runs.length).toFixed(4)) : 0,
    byType,
  };
}

async function runUiChecks(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  const uiSummary = { desktop: {}, mobile: {}, issues: [] };

  async function inspect(context, mode) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 45000 });
    for (const text of ["音的性质与乐音体系", "音的性质", "第1课"]) {
      const locator = page.getByText(text, { exact: false }).first();
      if (await locator.count()) {
        try {
          await locator.click({ timeout: 3000 });
          break;
        } catch {}
      }
    }
    await page.waitForTimeout(1500);
    const aiTutorVisible = await page.getByText("AI 导师", { exact: false }).first().isVisible().catch(() => false);
    const preInfo = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      chipTabsOverflow: (() => {
        const el = document.querySelector(".chip-tabs");
        return el ? el.scrollWidth > el.clientWidth : false;
      })(),
    }));

    const contentTab = page.getByText("内容呈现", { exact: false }).first();
    if (await contentTab.count()) {
      await contentTab.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }

    let pptLightboxWorks = false;
    const pptImage = page.locator("img").filter({ hasText: "" }).nth(0);
    const allImages = page.locator("img");
    const imageCount = await allImages.count();
    for (let i = 0; i < Math.min(imageCount, 6); i += 1) {
      const candidate = allImages.nth(i);
      try {
        await candidate.click({ timeout: 1500 });
        await page.waitForTimeout(300);
        const lightbox = await page.locator("button", { hasText: "×" }).first().isVisible().catch(() => false);
        if (lightbox) {
          pptLightboxWorks = true;
          await page.keyboard.press("Escape").catch(() => {});
          break;
        }
      } catch {}
    }

    const practiceTab = page.getByText("课堂练习", { exact: false }).first();
    if (await practiceTab.count()) {
      await practiceTab.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    const practiceInfo = await page.evaluate(() => {
      const layout = document.querySelector(".lesson-layout");
      const stack = document.querySelector(".section-stack");
      return {
        hasLessonLayout: Boolean(layout),
        hasSectionStack: Boolean(stack),
      };
    });

    const homeworkTab = page.getByText("课后作业", { exact: false }).first();
    if (await homeworkTab.count()) {
      await homeworkTab.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    const guideToggle = await page.getByRole("button", { name: /作业规范/ }).first().isVisible().catch(() => false);
    const contactToggle = await page.getByRole("button", { name: /联系说明/ }).first().isVisible().catch(() => false);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, `platform-ui-check-${mode}.png`), fullPage: true });

    uiSummary[mode] = {
      consoleErrors,
      aiTutorVisible,
      pptLightboxWorks,
      preInfo,
      practiceInfo,
      guideToggle,
      contactToggle,
    };
    if (consoleErrors.length) uiSummary.issues.push(`${mode} 端存在控制台错误`);
    if (!aiTutorVisible) uiSummary.issues.push(`${mode} 端未找到 AI 导师入口`);
    if (mode === "mobile" && preInfo.scrollWidth > preInfo.innerWidth) uiSummary.issues.push("移动端存在横向溢出");
    if (!pptLightboxWorks) uiSummary.issues.push(`${mode} 端 PPT 放大未触发`);
    if (!practiceInfo.hasSectionStack || practiceInfo.hasLessonLayout) uiSummary.issues.push(`${mode} 端课堂练习布局仍可能是旧双栏结构`);
    if (!guideToggle || !contactToggle) uiSummary.issues.push(`${mode} 端课后作业说明开关不可见`);
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
  return uiSummary;
}

function aggregateStudentFeedback(deepRun) {
  const summary = deepRun.summary || {};
  const sampleStudents = (deepRun.students || []).slice(0, 12).map((student) => ({
    userId: student.userId,
    profile: student.profile,
    confusionReport: student.confusionReport,
    positiveReport: student.positiveReport,
    reportedBug: student.reportedBug,
  }));
  return {
    topConfusions: summary.topConfusions || [],
    topPreferredTools: summary.topPreferredTools || [],
    topReportedBugs: summary.topReportedBugs || [],
    sampleStudents,
  };
}

function buildBugList({ questionBank, ai, ui, deepRun }) {
  const bugs = [];
  if (questionBank.summary.brokenCount > 0) {
    bugs.push({ severity: "high", area: "题库", title: "题库存在乱码或坏字符串", detail: `共检测到 ${questionBank.summary.brokenCount} 道题文本异常。` });
  }
  if (questionBank.summary.invalidCount > 0) {
    bugs.push({ severity: "high", area: "题库", title: "题库存在结构性异常", detail: `共检测到 ${questionBank.summary.invalidCount} 条题目选项、答案或知识点映射异常。` });
  }
  if (ai.byType.image.total && ai.byType.image.passed / ai.byType.image.total < 0.8) {
    bugs.push({ severity: "high", area: "AI 图片问答", title: "图片问答通过率偏低", detail: `图片问答通过率仅 ${(100 * ai.byType.image.passed / ai.byType.image.total).toFixed(1)}%。` });
  }
  if (ai.byType.text.total && ai.byType.text.averageElapsedMs > 3500) {
    bugs.push({ severity: "medium", area: "AI 导师", title: "文字问答平均耗时偏高", detail: `文字问答平均耗时 ${ai.byType.text.averageElapsedMs} ms。` });
  }
  if (ai.byType.homework.total && ai.byType.homework.passed / ai.byType.homework.total < 0.9) {
    bugs.push({ severity: "medium", area: "作业辅导", title: "作业辅导稳定性不足", detail: `作业辅导通过率仅 ${(100 * ai.byType.homework.passed / ai.byType.homework.total).toFixed(1)}%。` });
  }
  for (const issue of ui.issues || []) {
    bugs.push({ severity: "medium", area: "UI", title: issue, detail: "来自本地桌面/移动端自动检查。" });
  }
  const weakest = (deepRun.summary?.knowledgePointAverages || []).slice(0, 5);
  if (weakest.length) {
    bugs.push({
      severity: "low",
      area: "教学内容",
      title: "部分知识点长期偏弱",
      detail: weakest.map((item) => `${item.title}(${item.averagePL})`).join("、"),
    });
  }
  return bugs;
}

function buildReportHtml(report) {
  const knowledgeRows = (report.deepRun.summary.knowledgePointAverages || []).map((item) => `
    <tr>
      <td>${item.id}</td>
      <td>${item.title}</td>
      <td>${item.averagePL}</td>
      <td>${Math.round(item.masteredRate * 100)}%</td>
    </tr>
  `).join("");
  const bugRows = report.bugs.map((bug) => `
    <tr>
      <td>${bug.severity}</td>
      <td>${bug.area}</td>
      <td>${bug.title}</td>
      <td>${bug.detail}</td>
    </tr>
  `).join("");
  const aiBars = Object.entries(report.ai.summary.byType).map(([type, item]) => `
    <div class="bar-row">
      <span>${type}</span>
      <div class="bar"><div class="fill" style="width:${item.total ? (item.passed / item.total) * 100 : 0}%"></div></div>
      <span>${item.passed}/${item.total}</span>
    </div>
  `).join("");
  const knowledgeBars = (report.deepRun.summary.knowledgePointAverages || []).map((item) => `
    <div class="bar-row">
      <span>${item.title}</span>
      <div class="bar"><div class="fill" style="width:${item.averagePL * 100}%"></div></div>
      <span>${item.averagePL}</span>
    </div>
  `).join("");
  return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>平台深度验证报告</title>
    <style>
      body { font-family: Arial, "Microsoft YaHei", sans-serif; margin: 24px; color: #111; }
      h1,h2 { margin: 0 0 12px; }
      .section { margin-top: 28px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 12px; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 14px; background: #fafafa; }
      .bar-row { display: grid; grid-template-columns: 240px 1fr 80px; gap: 10px; align-items: center; margin-bottom: 8px; }
      .bar { height: 12px; background: #eee; border-radius: 999px; overflow: hidden; }
      .fill { height: 100%; background: #111; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
      .mono { font-family: Consolas, monospace; }
    </style>
  </head>
  <body>
    <h1>平台深度验证报告</h1>
    <div class="mono">生成时间：${report.generatedAt}</div>
    <div class="section cards">
      <div class="card"><strong>学生数</strong><div>${report.deepRun.studentCount}</div></div>
      <div class="card"><strong>模拟时长</strong><div>${report.simulation.durationMinutes} 分钟</div></div>
      <div class="card"><strong>总题量/人</strong><div>${report.simulation.questionCountPerStudent}</div></div>
      <div class="card"><strong>AI 总通过率</strong><div>${Math.round(report.ai.summary.passRate * 100)}%</div></div>
    </div>
    <div class="section">
      <h2>AI 通过率</h2>
      ${aiBars}
    </div>
    <div class="section">
      <h2>知识点平均 P(L)</h2>
      ${knowledgeBars}
    </div>
    <div class="section">
      <h2>缺陷清单</h2>
      <table><thead><tr><th>级别</th><th>领域</th><th>问题</th><th>说明</th></tr></thead><tbody>${bugRows}</tbody></table>
    </div>
    <div class="section">
      <h2>知识点明细</h2>
      <table><thead><tr><th>ID</th><th>知识点</th><th>P(L)</th><th>Mastered 率</th></tr></thead><tbody>${knowledgeRows}</tbody></table>
    </div>
  </body></html>`;
}

async function writeReports(report) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const csvRows = [[
    "section",
    "name",
    "value1",
    "value2",
    "value3",
  ].join(",")];
  for (const item of report.deepRun.summary.knowledgePointAverages || []) {
    csvRows.push(["knowledge", item.title, item.averagePL, item.masteredRate, item.learners].map(toCsvValue).join(","));
  }
  for (const bug of report.bugs) {
    csvRows.push(["bug", bug.title, bug.severity, bug.area, bug.detail].map(toCsvValue).join(","));
  }
  await fs.writeFile(RESULT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(RESULT_CSV, `\uFEFF${csvRows.join("\n")}\n`, "utf8");
  await fs.writeFile(RESULT_HTML, buildReportHtml(report), "utf8");
}

async function main() {
  const { server, baseUrl } = await startServer();
  try {
    const simulation = {
      studentCount: Math.max(1, Math.min(500, Number(process.env.STUDENT_COUNT || 100))),
      durationMinutes: Math.max(30, Math.min(240, Number(process.env.DURATION_MINUTES || 120))),
      questionCountPerStudent: Math.max(60, Math.min(400, Number(process.env.QUESTION_COUNT || 240))),
    };
    const questionBank = inspectQuestionBank();

    const deepResponse = await fetch(`${baseUrl}/api/bkt/test/deep-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentCount: simulation.studentCount,
        durationMinutes: simulation.durationMinutes,
        questionCount: simulation.questionCountPerStudent,
      }),
    });
    const deepJson = await deepResponse.json();
    const deepRun = { ...deepJson, students: deepJson.students || [], summary: deepJson.summary || {} };

    const lessonCases = LESSON_SEQUENCE;
    const aiJobs = Array.from({ length: simulation.studentCount }, (_, studentIndex) => ({ studentIndex: studentIndex + 1 }));
    const aiRunsNested = await mapWithConcurrency(aiJobs, 6, async ({ studentIndex }) => {
      const rng = createSeededRandom(hashString(`platform-deep-${studentIndex}`));
      const textLessons = rotatePick(lessonCases, studentIndex % lessonCases.length, 3);
      const imageCase = IMAGE_CASES[studentIndex % IMAGE_CASES.length];
      const homeworkCase = HOMEWORK_CASES[studentIndex % HOMEWORK_CASES.length];
      const result = [];
      for (const lessonCase of textLessons) {
        result.push(await callTutor(baseUrl, lessonCase));
      }
      result.push(await callTutor(baseUrl, lessonCases.find((item) => item.id === imageCase.lessonId) || lessonCases[0], imageCase));
      const homeworkRun = await callHomeworkReview(baseUrl, homeworkCase);
      result.push({ ...homeworkRun, type: "homework", prompt: homeworkCase.homeworkPrompt, elapsedMs: 0 });
      return {
        studentId: `platform-${String(studentIndex).padStart(3, "0")}`,
        profile: sample(rng, ["excellent", "steady", "imbalanced", "lowengage"]),
        runs: result,
      };
    });
    const aiRuns = aiRunsNested.flatMap((item) => item.runs);
    const ai = { summary: summarizeAiRuns(aiRuns), studentRuns: aiRunsNested };

    const ui = await runUiChecks(baseUrl);
    const feedback = aggregateStudentFeedback(deepRun);
    const bugs = buildBugList({ questionBank, ai: ai.summary, ui, deepRun });

    const report = {
      generatedAt: nowIso(),
      environment: { baseUrl, node: process.version, platform: process.platform },
      simulation,
      questionBank,
      deepRun,
      ai,
      ui,
      feedback,
      bugs,
    };
    await writeReports(report);
    console.log(JSON.stringify({
      resultJson: RESULT_JSON,
      resultCsv: RESULT_CSV,
      resultHtml: RESULT_HTML,
      bugCount: bugs.length,
      aiPassRate: ai.summary.passRate,
      studentCount: simulation.studentCount,
    }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

await main();
