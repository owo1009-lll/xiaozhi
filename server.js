import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const ANALYTICS_FILE = path.join(DATA_DIR, "teacher-analytics.json");

app.use(express.json({ limit: "15mb" }));

function buildHomeworkReviewFallback(payload = {}) {
  const text = String(payload.text || "").trim();
  const images = Array.isArray(payload.images) ? payload.images : [];
  const rhythm = payload.rhythmSubmission && typeof payload.rhythmSubmission === "object" ? payload.rhythmSubmission : null;
  const staff = payload.staffSubmission && typeof payload.staffSubmission === "object" ? payload.staffSubmission : null;
  const submissionTypes = [];
  if (text) submissionTypes.push("文字说明");
  if (images.length) submissionTypes.push("拍照上传");
  if (rhythm?.measures?.some((measure) => Array.isArray(measure) && measure.length)) submissionTypes.push("节奏编辑");
  if (staff?.notes?.length) submissionTypes.push("五线谱修正");

  const mistakes = [];
  const suggestions = [];

  if (!text && !images.length && !rhythm?.measures?.flat?.().length && !staff?.notes?.length) {
    mistakes.push("当前提交内容为空，无法判断作业完成情况。");
    suggestions.push("至少补充文字说明、拍照内容、节奏输入或五线谱修正中的一项。");
  }

  if (rhythm) {
    const noteCount = rhythm.measures.flatMap((measure) => measure || []).length;
    if (noteCount < 4) mistakes.push("节奏内容偏少，当前不足以构成完整的 1 到 2 小节练习。");
    suggestions.push("检查拍号是否匹配本课要求，并确认是否包含休止、附点或连音等关键元素。");
  }

  if (staff) {
    if (!staff.notes?.length) {
      mistakes.push("五线谱修正区尚未录入音符位置。");
    } else {
      suggestions.push("核对谱号、升降记号和每个音符所在的线间位置，避免把音高写错一格。");
    }
  }

  if (images.length) {
    suggestions.push("教师复核时会优先查看拍照内容，请确保照片清晰、完整，并包含整条谱例或整段节奏。");
  }

  if (text.length > 0 && text.length < 30) {
    mistakes.push("文字说明较短，概念解释可能不够完整。");
  }

  return [
    `完成度评价：当前已提交 ${submissionTypes.length ? submissionTypes.join("、") : "基础内容"}，系统已记录作业。`,
    `错误说明：${mistakes.length ? mistakes.join(" ") : "暂未发现明显缺项，但仍需教师复核具体记谱正确性。"} `,
    `修改建议：${suggestions.length ? suggestions.join(" ") : "建议补充更多作业细节，便于后续批改与讲评。"}`
  ].join("\n");
}

async function readAnalyticsStore() {
  try {
    const raw = await fs.readFile(ANALYTICS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.records) ? parsed : { records: [] };
  } catch {
    return { records: [] };
  }
}

async function writeAnalyticsStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ANALYTICS_FILE, JSON.stringify(store, null, 2), "utf8");
}

app.get("/api/health", (req, res) => {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();

  res.json({
    ok: true,
    provider,
    model: provider === "gemini"
      ? process.env.GEMINI_MODEL || "gemini-2.5-flash"
      : process.env.OPENAI_MODEL || "gpt-5-mini",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    geminiBaseUrl: provider === "gemini"
      ? (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com")
      : undefined,
  });
});

app.post("/api/analytics", async (req, res) => {
  const payload = req.body || {};
  if (!payload.studentId || !payload.lessonId) {
    return res.status(400).json({ error: "studentId and lessonId are required." });
  }

  const store = await readAnalyticsStore();
  const now = new Date().toISOString();
  const record = {
    studentId: String(payload.studentId),
    studentLabel: String(payload.studentLabel || payload.studentId),
    lessonId: String(payload.lessonId),
    lessonTitle: String(payload.lessonTitle || ""),
    source: String(payload.source || "lesson"),
    section: String(payload.section || ""),
    score: Number(payload.score || 0),
    rating: Number(payload.rating || 0),
    studyMinutes: Number(payload.studyMinutes || 0),
    interactions: Number(payload.interactions || 0),
    errors: Number(payload.errors || 0),
    errorTypes: payload.errorTypes && typeof payload.errorTypes === "object" ? payload.errorTypes : {},
    homeworkSeconds: Number(payload.homeworkSeconds || 0),
    homeworkSubmitted: Boolean(payload.homeworkSubmitted),
    homeworkLength: Number(payload.homeworkLength || 0),
    homeworkText: String(payload.homeworkText || ""),
    homeworkImages: Array.isArray(payload.homeworkImages) ? payload.homeworkImages : [],
    homeworkImageCount: Number(payload.homeworkImageCount || 0),
    homeworkRhythmData: payload.homeworkRhythmData && typeof payload.homeworkRhythmData === "object" ? payload.homeworkRhythmData : null,
    homeworkStaffData: payload.homeworkStaffData && typeof payload.homeworkStaffData === "object" ? payload.homeworkStaffData : null,
    aiHomeworkFeedback: String(payload.aiHomeworkFeedback || ""),
    submissionTypes: Array.isArray(payload.submissionTypes) ? payload.submissionTypes : [],
    lastExplanation: String(payload.lastExplanation || ""),
    updatedAt: now,
  };

  const existingIndex = store.records.findIndex((item) =>
    item.studentId === record.studentId &&
    item.lessonId === record.lessonId &&
    item.source === record.source
  );

  if (existingIndex >= 0) {
    store.records[existingIndex] = { ...store.records[existingIndex], ...record };
  } else {
    store.records.push({ createdAt: now, ...record });
  }

  await writeAnalyticsStore(store);
  res.json({ ok: true });
});

app.post("/api/homework-review", async (req, res) => {
  const payload = req.body || {};
  const lessonTitle = String(payload.lessonTitle || "当前课时");
  const homeworkPrompt = String(payload.homeworkPrompt || "");
  const text = String(payload.text || "");
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 4) : [];
  const rhythmSubmission = payload.rhythmSubmission && typeof payload.rhythmSubmission === "object" ? payload.rhythmSubmission : null;
  const staffSubmission = payload.staffSubmission && typeof payload.staffSubmission === "object" ? payload.staffSubmission : null;

  const summaryText = [
    `课时：${lessonTitle}`,
    homeworkPrompt ? `作业要求：${homeworkPrompt}` : "",
    text ? `学生文字说明：${text}` : "学生未填写文字说明。",
    rhythmSubmission ? `节奏提交：${JSON.stringify(rhythmSubmission)}` : "未提交节奏编辑内容。",
    staffSubmission ? `五线谱修正：${JSON.stringify(staffSubmission)}` : "未提交五线谱修正内容。",
  ].filter(Boolean).join("\n");

  const system = "你是一位大学乐理教师，正在对学生课后作业做初评。请只用中文输出三段：1. 完成度评价 2. 错误说明 3. 修改建议。重点检查节奏型、拍号匹配、五线谱音位、谱号、升降记号和概念解释是否清楚。";

  const reviewMessages = [
    { role: "user", content: summaryText },
    ...images.map((item, index) => ({
      role: "user",
      content: `作业图片 ${index + 1}`,
      imageDataUrl: item?.dataUrl || "",
    })).filter((item) => item.imageDataUrl),
  ];

  try {
    if ((process.env.AI_PROVIDER || "openai").toLowerCase() === "gemini") {
      if (!process.env.GEMINI_API_KEY) {
        return res.json({ ok: true, text: buildHomeworkReviewFallback(payload), mode: "fallback" });
      }
      const text = await createGeminiResponse({ system, messages: reviewMessages, maxTokens: 1200 });
      return res.json({ ok: true, text, mode: "ai" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.json({ ok: true, text: buildHomeworkReviewFallback(payload), mode: "fallback" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: system,
      input: reviewMessages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.imageDataUrl
          ? [
              { type: "input_text", text: String(message.content || "") },
              { type: "input_image", image_url: String(message.imageDataUrl) },
            ]
          : [{ type: "input_text", text: String(message.content || "") }],
      })),
      max_output_tokens: 1200,
    });

    return res.json({
      ok: true,
      text: response.output_text || buildHomeworkReviewFallback(payload),
      mode: response.output_text ? "ai" : "fallback",
    });
  } catch (error) {
    console.error("Homework review request failed:", error);
    return res.json({
      ok: true,
      text: buildHomeworkReviewFallback(payload),
      mode: "fallback",
      detail: error.message || "Unknown error",
    });
  }
});

app.get("/api/teacher/overview", async (req, res) => {
  const store = await readAnalyticsStore();
  const records = [...store.records].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const studentsMap = new Map();
  const lessonsMap = new Map();

  for (const record of records) {
    const student = studentsMap.get(record.studentId) || {
      studentId: record.studentId,
      studentLabel: record.studentLabel,
      lessonsVisited: 0,
      averageScore: 0,
      homeworkSubmitted: 0,
      totalStudyMinutes: 0,
      totalErrors: 0,
    };
    student.lessonsVisited += 1;
    student.averageScore += Number(record.score || 0);
    student.homeworkSubmitted += record.homeworkSubmitted ? 1 : 0;
    student.totalStudyMinutes += Number(record.studyMinutes || 0);
    student.totalErrors += Number(record.errors || 0);
    studentsMap.set(record.studentId, student);

    const lesson = lessonsMap.get(record.lessonId) || {
      lessonId: record.lessonId,
      lessonTitle: record.lessonTitle,
      activeStudents: 0,
      averageScore: 0,
      totalErrors: 0,
    };
    lesson.activeStudents += 1;
    lesson.averageScore += Number(record.score || 0);
    lesson.totalErrors += Number(record.errors || 0);
    lessonsMap.set(record.lessonId, lesson);
  }

  const students = [...studentsMap.values()].map((item) => ({
    ...item,
    averageScore: item.lessonsVisited ? Math.round(item.averageScore / item.lessonsVisited) : 0,
  }));

  const lessons = [...lessonsMap.values()].map((item) => ({
    ...item,
    averageScore: item.activeStudents ? Math.round(item.averageScore / item.activeStudents) : 0,
  }));

  res.json({
    ok: true,
    summary: {
      totalRecords: records.length,
      totalStudents: students.length,
      totalHomeworkSubmitted: records.filter((item) => item.homeworkSubmitted).length,
      averageScore: records.length ? Math.round(records.reduce((sum, item) => sum + Number(item.score || 0), 0) / records.length) : 0,
    },
    students,
    lessons,
    records: records.slice(0, 80),
  });
});

app.post("/api/tutor", async (req, res) => {
  const { system, messages = [], maxTokens = 1000 } = req.body || {};
  const safeMessages = Array.isArray(messages) ? messages.slice(-12) : [];

  try {
    if ((process.env.AI_PROVIDER || "openai").toLowerCase() === "gemini") {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
      }

      const text = await createGeminiResponse({ system, messages: safeMessages, maxTokens });
      return res.json({ text });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      instructions: system || "你是一位专业的大学音乐理论教师和 AI 辅导员。请用中文简洁、准确地回答。",
      input: safeMessages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.imageDataUrl && message.role !== "assistant"
          ? [
              { type: "input_text", text: String(message.content || "") },
              { type: "input_image", image_url: String(message.imageDataUrl) },
            ]
          : [{ type: "input_text", text: String(message.content || "") }],
      })),
      max_output_tokens: Number(maxTokens) || 1000,
    });

    res.json({ text: response.output_text || "抱歉，我暂时没有生成有效回答，请重试。" });
  } catch (error) {
    console.error("OpenAI tutor request failed:", error);
    res.status(error.status || 500).json({
      error: "OpenAI tutor request failed.",
      detail: error.message || "Unknown error",
    });
  }
});

async function createGeminiResponse({ system, messages, maxTokens }) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const apiMode = (process.env.GEMINI_API_MODE || "google").toLowerCase();
  const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const contents = messages.map((message) => {
    const parts = [];
    if (message.content) {
      parts.push({ text: `${message.role === "assistant" ? "AI导师" : "学生"}：${String(message.content || "")}` });
    }
    if (message.imageDataUrl && message.role !== "assistant") {
      const match = String(message.imageDataUrl).match(/^data:(.+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        });
      }
    }
    return {
      role: message.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiMode === "google"
        ? { "x-goog-api-key": process.env.GEMINI_API_KEY }
        : { Authorization: `Bearer ${process.env.GEMINI_API_KEY}` }),
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system || "你是一位专业的大学音乐理论教师和 AI 辅导员。请用中文简洁、准确地回答。" }],
      },
      contents: contents.length ? contents : [{
        role: "user",
        parts: [{ text: "请开始辅导。" }],
      }],
      generationConfig: {
        maxOutputTokens: Number(maxTokens) || 1000,
        thinkingConfig: model.startsWith("gemini-3-")
          ? { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || "minimal" }
          : undefined,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const detail = data.error?.message || `Gemini request failed with status ${response.status}`;
    if (detail.includes("User location is not supported for the API use")) {
      throw new Error("当前服务器所在地区无法直接访问 Gemini 官方接口。请在 .env 中配置 `GEMINI_BASE_URL` 指向你的第三方 Gemini 接口，或将服务部署到 Gemini 支持地区。");
    }
    throw new Error(detail);
  }

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim()
    || "抱歉，我暂时没有生成有效回答，请重试。";
}

app.use(express.static(path.join(__dirname, "dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`Music Theory AI Portal listening on http://localhost:${port}`);
  });
}

export { app };
export default app;
