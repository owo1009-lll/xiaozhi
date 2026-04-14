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

app.use(express.json({ limit: "25mb" }));

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getOpenAIBaseUrl() {
  return safeString(process.env.OPENAI_BASE_URL).replace(/\/+$/, "");
}

function isOpenAICompatibleMode() {
  const baseUrl = getOpenAIBaseUrl();
  return Boolean(baseUrl) && !/api\.openai\.com/i.test(baseUrl);
}

function isDashScopeCompatibleMode() {
  return isOpenAICompatibleMode() && /dashscope(-intl|-us)?\.aliyuncs\.com/i.test(getOpenAIBaseUrl());
}

function getDashScopeApiOrigin() {
  try {
    return new URL(getOpenAIBaseUrl()).origin;
  } catch {
    return "";
  }
}

function getDashScopeVisionModel() {
  return process.env.DASHSCOPE_VISION_MODEL || "qwen-vl-plus";
}

function getDashScopeAsrModel() {
  return process.env.DASHSCOPE_ASR_MODEL || "paraformer-v2";
}

function hasImageMessages(messages = []) {
  return messages.some((message) => Boolean(message?.imageDataUrl));
}

function getExtensionFromMimeType(mimeType, fallback = "bin") {
  const normalized = safeString(mimeType).toLowerCase();
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
  };
  return map[normalized] || fallback;
}

async function getDashScopeUploadPolicy(model) {
  const origin = getDashScopeApiOrigin();
  if (!origin) {
    throw new Error("DashScope base URL is invalid.");
  }

  const response = await fetch(`${origin}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data) {
    throw new Error(data?.message || data?.error?.message || `Failed to get DashScope upload policy: ${response.status}`);
  }
  return data.data;
}

async function uploadBufferToDashScope({ buffer, mimeType, fileName, model }) {
  const policyData = await getDashScopeUploadPolicy(model);
  const safeName = safeString(fileName, `upload-${Date.now()}.${getExtensionFromMimeType(mimeType)}`).replace(/[^\w.\-]/g, "_");
  const key = `${policyData.upload_dir}/${safeName}`;
  const form = new FormData();
  form.set("OSSAccessKeyId", policyData.oss_access_key_id);
  form.set("Signature", policyData.signature);
  form.set("policy", policyData.policy);
  form.set("x-oss-object-acl", policyData.x_oss_object_acl);
  form.set("x-oss-forbid-overwrite", policyData.x_oss_forbid_overwrite);
  form.set("key", key);
  form.set("success_action_status", "200");
  form.set("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), safeName);

  const uploadResponse = await fetch(policyData.upload_host, {
    method: "POST",
    body: form,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(detail || `Failed to upload file to DashScope: ${uploadResponse.status}`);
  }

  return `oss://${key}`;
}

async function uploadDataUrlToDashScope(dataUrl, { model, fileNamePrefix }) {
  const parsed = dataUrlToBuffer(dataUrl);
  const extension = getExtensionFromMimeType(parsed.mimeType, "bin");
  return uploadBufferToDashScope({
    buffer: parsed.buffer,
    mimeType: parsed.mimeType,
    fileName: `${fileNamePrefix || "upload"}-${Date.now()}.${extension}`,
    model,
  });
}

async function createDashScopeCompatibleResponse({ system, messages = [], maxTokens = 1000, modelOverride, timeoutMs }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const baseUrl = getOpenAIBaseUrl();
  const hasImages = hasImageMessages(messages);
  const model = modelOverride || (hasImages ? getDashScopeVisionModel() : getOpenAIModel());
  const supportsImages = /vl|vision|ocr|omni/i.test(model);

  const normalizedMessages = [];
  let needsOssResolve = false;

  if (system) {
    normalizedMessages.push({ role: "system", content: safeString(system) });
  }

  for (const message of messages) {
    const role = message.role === "assistant" ? "assistant" : "user";
    if (supportsImages && role !== "assistant" && message.imageDataUrl) {
      const imageUrl = message.imageDataUrl.startsWith("data:")
        ? await uploadDataUrlToDashScope(message.imageDataUrl, {
            model,
            fileNamePrefix: "vision-input",
          })
        : String(message.imageDataUrl);
      if (imageUrl.startsWith("oss://")) {
        needsOssResolve = true;
      }
      normalizedMessages.push({
        role,
        content: [
          { type: "text", text: safeString(message.content, "请结合这张图片回答。") },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
      continue;
    }

    normalizedMessages.push({
      role,
      content: safeString(message.content),
    });
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(Number(timeoutMs) || getTutorTimeoutMs()),
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      ...(needsOssResolve ? { "X-DashScope-OssResourceResolve": "enable" } : {}),
    },
    body: JSON.stringify({
      model,
      messages: normalizedMessages,
      temperature: 0.7,
      max_tokens: Number(maxTokens) || 1000,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `DashScope request failed with status ${response.status}`);
  }
  return safeString(data?.choices?.[0]?.message?.content).trim();
}

async function transcribeWithDashScope({ audioDataUrl, fileName, mimeType }) {
  const origin = getDashScopeApiOrigin();
  const model = getDashScopeAsrModel();
  const parsed = dataUrlToBuffer(audioDataUrl);
  const extension = getExtensionFromMimeType(mimeType || parsed.mimeType, "webm");
  const ossUrl = await uploadBufferToDashScope({
    buffer: parsed.buffer,
    mimeType: mimeType || parsed.mimeType || "audio/webm",
    fileName: safeString(fileName, `voice-${Date.now()}.${extension}`),
    model,
  });

  const submitResponse = await fetch(`${origin}/api/v1/services/audio/asr/transcription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable",
    },
    body: JSON.stringify({
      model,
      input: {
        file_urls: [ossUrl],
      },
      parameters: {
        language_hints: ["zh", "en"],
      },
    }),
  });
  const submitData = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok) {
    throw new Error(submitData?.message || submitData?.error?.message || `DashScope ASR submit failed: ${submitResponse.status}`);
  }

  const taskId = safeString(submitData?.output?.task_id);
  if (!taskId) {
    throw new Error("DashScope ASR task_id is missing.");
  }

  for (let index = 0; index < 25; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 1200 : 1500));
    const resultResponse = await fetch(`${origin}/api/v1/tasks/${taskId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });
    const resultData = await resultResponse.json().catch(() => ({}));
    if (!resultResponse.ok) {
      throw new Error(resultData?.message || resultData?.error?.message || `DashScope ASR polling failed: ${resultResponse.status}`);
    }

    const taskStatus = safeString(resultData?.output?.task_status);
    if (taskStatus === "FAILED") {
      throw new Error("DashScope ASR task failed.");
    }

    const transcriptionUrl = safeString(resultData?.output?.results?.[0]?.transcription_url);
    if (taskStatus === "SUCCEEDED" && transcriptionUrl) {
      const transcriptionResponse = await fetch(transcriptionUrl);
      const transcriptionData = await transcriptionResponse.json().catch(() => ({}));
      const text = getArray(transcriptionData?.transcripts)
        .map((item) => safeString(item?.text))
        .filter(Boolean)
        .join("\n")
        .trim();
      return text;
    }
  }

  throw new Error("DashScope ASR timed out.");
}

function getOpenAIClient() {
  const baseURL = getOpenAIBaseUrl() || undefined;
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL,
  });
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-5-mini";
}

function getTutorModel() {
  return process.env.OPENAI_TUTOR_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
}

function getTutorTimeoutMs() {
  const value = Number(process.env.OPENAI_TUTOR_TIMEOUT_MS || 20000);
  return Number.isFinite(value) && value > 0 ? value : 20000;
}

function extractOpenAITextFromChatCompletion(response) {
  return safeString(response?.choices?.[0]?.message?.content).trim();
}

async function createOpenAITextResponse({ system, messages = [], maxTokens = 1000, modelOverride, timeoutMs }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (isDashScopeCompatibleMode()) {
    return createDashScopeCompatibleResponse({ system, messages, maxTokens, modelOverride, timeoutMs });
  }

  const client = getOpenAIClient();
  const model = modelOverride || getOpenAIModel();

  if (isOpenAICompatibleMode()) {
    const supportsImages = /vl|vision/i.test(model);
    const response = await client.chat.completions.create({
      model,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...messages.map((message) => {
          if (supportsImages && message.imageDataUrl && message.role !== "assistant") {
            return {
              role: message.role === "assistant" ? "assistant" : "user",
              content: [
                { type: "text", text: safeString(message.content) },
                { type: "image_url", image_url: { url: String(message.imageDataUrl) } },
              ],
            };
          }
          return {
            role: message.role === "assistant" ? "assistant" : "user",
            content: safeString(message.content),
          };
        }),
      ],
      temperature: 0.7,
      max_tokens: Number(maxTokens) || 1000,
    });
    return extractOpenAITextFromChatCompletion(response);
  }

  const response = await client.responses.create({
    model,
    instructions: system,
    input: messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.imageDataUrl && message.role !== "assistant"
        ? [
            { type: "input_text", text: safeString(message.content) },
            { type: "input_image", image_url: String(message.imageDataUrl) },
          ]
        : [{ type: "input_text", text: safeString(message.content) }],
    })),
    max_output_tokens: Number(maxTokens) || 1000,
  });
  return safeString(response.output_text).trim();
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasRhythmContent(rhythmSubmission) {
  return Boolean(rhythmSubmission?.measures?.some((measure) => Array.isArray(measure) && measure.length));
}

function hasStaffContent(staffSubmission) {
  return Boolean(staffSubmission?.notes?.length);
}

function hasPianoContent(pianoSubmission) {
  return Boolean(pianoSubmission?.notes?.length);
}

function getSubmissionTypes(payload = {}) {
  const types = [];
  if (safeString(payload.text).trim()) types.push("文字说明");
  if (getArray(payload.images).length) types.push("拍照上传");
  if (hasRhythmContent(payload.rhythmSubmission)) types.push("节奏编辑");
  if (hasStaffContent(payload.staffSubmission)) types.push("五线谱修正");
  if (hasPianoContent(payload.pianoSubmission)) types.push("钢琴输入");
  if (safeString(payload.voiceTranscript).trim() || payload.audioSubmission?.name) types.push("语音输入");
  return types;
}

function getRhythmIssues(rhythmSubmission) {
  if (!rhythmSubmission?.measures) return [];
  const [top, bottom] = String(rhythmSubmission.meter || "4/4").split("/");
  const beats = Number(top || 4) * (4 / Number(bottom || 4));
  const issues = [];
  rhythmSubmission.measures.forEach((measure = [], index) => {
    if (!measure.length) {
      issues.push(`第 ${index + 1} 小节为空`);
      return;
    }
    const duration = measure.reduce((sum, item) => sum + Number(item?.duration || 0), 0);
    if (duration < beats) issues.push(`第 ${index + 1} 小节拍数不足`);
    if (duration > beats) issues.push(`第 ${index + 1} 小节拍数超出`);
    const last = measure[measure.length - 1];
    if (last?.tieToNext && index === rhythmSubmission.measures.length - 1) {
      issues.push(`第 ${index + 1} 小节末尾连音缺少后续音符`);
    }
  });
  return issues;
}

function buildHeuristicScores(payload = {}) {
  const context = payload.evaluationContext || {};
  const dimensions = Array.isArray(context.dimensions) && context.dimensions.length
    ? context.dimensions
    : ["完成度", "准确性", "规范性", "表达清晰度", "提交质量"];

  const text = safeString(payload.text).trim();
  const images = getArray(payload.images);
  const rhythmSubmission = payload.rhythmSubmission || null;
  const staffSubmission = payload.staffSubmission || null;
  const pianoSubmission = payload.pianoSubmission || null;
  const voiceTranscript = safeString(payload.voiceTranscript).trim();

  const issues = [];
  const strengths = [];
  const suggestions = [];
  const tags = [];
  const scores = Object.fromEntries(dimensions.map((label) => [label, 72]));
  const submissionTypes = getSubmissionTypes(payload);

  if (!submissionTypes.length) {
    dimensions.forEach((label) => {
      scores[label] = 35;
    });
    issues.push("当前未提交任何可评阅内容");
    suggestions.push("至少补充一种作业形式后再提交");
  } else {
    strengths.push(`已提交：${submissionTypes.join("、")}`);
  }

  if (text.length >= 80) {
    strengths.push("文字说明较完整");
    if (scores["表达清晰度"] != null) scores["表达清晰度"] = 90;
  } else if (text.length > 0) {
    issues.push("文字说明偏简略");
    if (scores["表达清晰度"] != null) scores["表达清晰度"] = 68;
    suggestions.push("补充概念解释、分析步骤或自我反思");
  } else if (scores["表达清晰度"] != null) {
    scores["表达清晰度"] = 60;
  }

  if (images.length) {
    strengths.push("已附作业图片，便于教师复核");
    if (scores["提交质量"] != null) scores["提交质量"] = Math.max(scores["提交质量"], 86);
  } else {
    suggestions.push("建议保留拍照上传，便于教师复核原始作业");
  }

  const rhythmIssues = getRhythmIssues(rhythmSubmission);
  if (hasRhythmContent(rhythmSubmission)) {
    tags.push("节奏作业");
    if (rhythmIssues.length) {
      issues.push(...rhythmIssues);
      if (scores["准确性"] != null) scores["准确性"] = Math.min(scores["准确性"], 64);
      if (scores["时值完整"] != null) scores["时值完整"] = 58;
      if (scores["拍号理解"] != null) scores["拍号理解"] = 62;
      suggestions.push("按拍号逐小节检查时值总和，并确认连音位置");
    } else {
      strengths.push("节奏小节拍数完整");
      if (scores["准确性"] != null) scores["准确性"] = Math.max(scores["准确性"], 88);
      if (scores["时值完整"] != null) scores["时值完整"] = 90;
      if (scores["拍号理解"] != null) scores["拍号理解"] = 88;
    }
  }

  if (hasStaffContent(staffSubmission)) {
    tags.push("五线谱作业");
    if ((staffSubmission.notes || []).length < 3) {
      issues.push("五线谱录入音符较少");
      suggestions.push("补足谱号、音位和音值信息");
    } else {
      strengths.push("已完成五线谱点选修正");
    }
    if (scores["谱号识别"] != null) scores["谱号识别"] = staffSubmission.clef ? 86 : 62;
    if (scores["音位准确"] != null) scores["音位准确"] = (staffSubmission.notes || []).length >= 3 ? 84 : 66;
    if (scores["记谱规范"] != null) scores["记谱规范"] = 80;
  }

  if (hasPianoContent(pianoSubmission)) {
    tags.push("钢琴作业");
    strengths.push("已录入钢琴音高序列");
    if (scores["键位定位"] != null) scores["键位定位"] = 88;
    if (scores["音高判断"] != null) scores["音高判断"] = 86;
  }

  if (voiceTranscript) {
    tags.push("语音作业");
    strengths.push("已提交语音转写内容");
  }

  const evaluationType = safeString(context.evaluationType, "theory");
  if (evaluationType === "theory") {
    if (scores["概念理解"] != null) scores["概念理解"] = text.length >= 50 ? 86 : 70;
    if (scores["术语使用"] != null) scores["术语使用"] = text.length >= 50 ? 82 : 68;
    if (scores["分析深度"] != null) scores["分析深度"] = text.length >= 90 ? 84 : 66;
  }

  if (evaluationType === "mixed") {
    tags.push("综合复习");
    strengths.push("作业包含多模态输入");
    if (scores["综合应用"] != null) scores["综合应用"] = submissionTypes.length >= 3 ? 90 : 76;
    if (scores["知识迁移"] != null) scores["知识迁移"] = text.length >= 60 ? 84 : 72;
    if (scores["问题诊断"] != null) scores["问题诊断"] = hasRhythmContent(rhythmSubmission) || hasStaffContent(staffSubmission) ? 82 : 70;
  }

  const overallScore = Math.round(
    Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, Object.keys(scores).length),
  );

  const overallComment = [
    `本次作业完成度约为 ${overallScore} 分。`,
    submissionTypes.length ? `已提交 ${submissionTypes.join("、")}。` : "尚未形成有效提交。",
    issues.length ? `当前最需要修正的是：${issues[0]}。` : "当前未发现明显结构性缺漏，建议进入教师复核。",
  ].join("");

  if (!suggestions.length) {
    suggestions.push("继续保持当前提交质量，并结合教师反馈做二次修改");
  }
  if (!issues.length) {
    tags.push("待教师复核");
  } else {
    tags.push("需针对性修正");
  }

  return {
    overallComment,
    scores,
    strengths: [...new Set(strengths)].slice(0, 5),
    issues: [...new Set(issues)].slice(0, 5),
    suggestions: [...new Set(suggestions)].slice(0, 5),
    tags: [...new Set(tags)].slice(0, 6),
  };
}

function formatEvaluationAsText(evaluation) {
  if (!evaluation) return "系统已记录作业，等待教师复核。";
  return [
    `完成度评价：${evaluation.overallComment || "已生成作业评价。"}`,
    `错误说明：${evaluation.issues?.length ? evaluation.issues.join("；") : "暂未发现明显错误，建议教师继续复核。"}`,
    `修改建议：${evaluation.suggestions?.length ? evaluation.suggestions.join("；") : "继续保持当前完成质量。"}`,
  ].join("\n");
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function buildAiEvaluation(payload, fallbackEvaluation) {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const system = "你是一名大学乐理教师。请根据学生作业生成 JSON，字段必须包含 overallComment、strengths、issues、suggestions、tags，所有内容使用中文。";
  const prompt = JSON.stringify({
    lessonTitle: safeString(payload.lessonTitle, "当前课时"),
    homeworkPrompt: safeString(payload.homeworkPrompt),
    text: safeString(payload.text),
    voiceTranscript: safeString(payload.voiceTranscript),
    submissionTypes: getSubmissionTypes(payload),
    rhythmSubmission: payload.rhythmSubmission || null,
    staffSubmission: payload.staffSubmission || null,
    pianoSubmission: payload.pianoSubmission || null,
    imageCount: getArray(payload.images).length,
    dimensions: payload.evaluationContext?.dimensions || [],
  });
  const reviewMessages = [
    { role: "user", content: prompt },
    ...getArray(payload.images).slice(0, 4).map((image, index) => ({
      role: "user",
      content: `这是学生提交的作业图片 ${index + 1}，请结合图片进行评阅。`,
      imageDataUrl: safeString(image?.dataUrl),
    })),
  ].filter((message) => safeString(message.content) || message.imageDataUrl);

  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) return null;
    const text = await createGeminiResponse({
      system,
      messages: reviewMessages,
      maxTokens: 1200,
    });
    return parseJsonObject(text);
  }

  if (!process.env.OPENAI_API_KEY) return null;
  const text = await createOpenAITextResponse({
    system,
    messages: reviewMessages,
    maxTokens: 1200,
  });
  const parsed = parseJsonObject(text || "");
  if (!parsed) return null;
  return {
    overallComment: safeString(parsed.overallComment, fallbackEvaluation.overallComment),
    strengths: getArray(parsed.strengths).map((item) => safeString(item)).filter(Boolean).slice(0, 5),
    issues: getArray(parsed.issues).map((item) => safeString(item)).filter(Boolean).slice(0, 5),
    suggestions: getArray(parsed.suggestions).map((item) => safeString(item)).filter(Boolean).slice(0, 5),
    tags: getArray(parsed.tags).map((item) => safeString(item)).filter(Boolean).slice(0, 6),
  };
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("audioDataUrl is invalid.");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
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
    visionModel: provider === "openai" && isDashScopeCompatibleMode() ? getDashScopeVisionModel() : undefined,
    asrModel: provider === "openai" && isDashScopeCompatibleMode() ? getDashScopeAsrModel() : undefined,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    openaiBaseUrl: provider === "openai" ? (getOpenAIBaseUrl() || "https://api.openai.com/v1") : undefined,
    openaiCompatibleMode: provider === "openai" ? isOpenAICompatibleMode() : undefined,
    tutorModel: provider === "openai" ? getTutorModel() : undefined,
    tutorTimeoutMs: provider === "openai" ? getTutorTimeoutMs() : undefined,
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
    lessonTitle: safeString(payload.lessonTitle),
    source: String(payload.source || "lesson"),
    section: safeString(payload.section),
    score: Number(payload.score || 0),
    rating: Number(payload.rating || 0),
    studyMinutes: Number(payload.studyMinutes || 0),
    interactions: Number(payload.interactions || 0),
    errors: Number(payload.errors || 0),
    errorTypes: payload.errorTypes && typeof payload.errorTypes === "object" ? payload.errorTypes : {},
    homeworkSeconds: Number(payload.homeworkSeconds || 0),
    homeworkSubmitted: Boolean(payload.homeworkSubmitted),
    homeworkLength: Number(payload.homeworkLength || 0),
    homeworkText: safeString(payload.homeworkText),
    homeworkImages: getArray(payload.homeworkImages),
    homeworkImageCount: Number(payload.homeworkImageCount || 0),
    homeworkRhythmData: payload.homeworkRhythmData && typeof payload.homeworkRhythmData === "object" ? payload.homeworkRhythmData : null,
    homeworkStaffData: payload.homeworkStaffData && typeof payload.homeworkStaffData === "object" ? payload.homeworkStaffData : null,
    homeworkPianoData: payload.homeworkPianoData && typeof payload.homeworkPianoData === "object" ? payload.homeworkPianoData : null,
    homeworkVoiceTranscript: safeString(payload.homeworkVoiceTranscript),
    homeworkAudioMeta: payload.homeworkAudioMeta && typeof payload.homeworkAudioMeta === "object" ? payload.homeworkAudioMeta : null,
    aiHomeworkFeedback: safeString(payload.aiHomeworkFeedback),
    evaluationScores: payload.evaluationScores && typeof payload.evaluationScores === "object" ? payload.evaluationScores : null,
    evaluationTags: getArray(payload.evaluationTags),
    evaluationComment: safeString(payload.evaluationComment),
    submissionTypes: getArray(payload.submissionTypes),
    lastExplanation: safeString(payload.lastExplanation),
    updatedAt: now,
  };

  const existingIndex = store.records.findIndex((item) =>
    item.studentId === record.studentId &&
    item.lessonId === record.lessonId &&
    item.source === record.source,
  );

  if (existingIndex >= 0) {
    store.records[existingIndex] = { ...store.records[existingIndex], ...record };
  } else {
    store.records.push({ createdAt: now, ...record });
  }

  await writeAnalyticsStore(store);
  res.json({ ok: true });
});

app.post("/api/transcribe", async (req, res) => {
  const { audioDataUrl, fileName, mimeType } = req.body || {};
  if (!audioDataUrl) {
    return res.status(400).json({ error: "audioDataUrl is required." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.json({
      ok: true,
      text: "",
      mode: "fallback",
      detail: "未配置阿里云 API Key，当前仅支持浏览器实时语音识别。",
    });
  }

  try {
    if (isDashScopeCompatibleMode()) {
      const text = await transcribeWithDashScope({ audioDataUrl, fileName, mimeType });
      return res.json({
        ok: true,
        text,
        mode: "aliyun-asr",
      });
    }

    if (isOpenAICompatibleMode()) {
      return res.json({
        ok: true,
        text: "",
        mode: "fallback",
        detail: "当前兼容模式接口未启用语音转写，已保留浏览器实时语音识别。",
      });
    }

    const parsed = dataUrlToBuffer(audioDataUrl);
    const client = getOpenAIClient();
    const file = await OpenAI.toFile(parsed.buffer, fileName || "voice.webm", {
      type: mimeType || parsed.mimeType || "audio/webm",
    });
    const transcript = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    });
    return res.json({
      ok: true,
      text: safeString(transcript.text).trim(),
      mode: "ai",
    });
  } catch (error) {
    console.error("Audio transcription failed:", error);
    return res.json({
      ok: true,
      text: "",
      mode: "fallback",
      detail: error.message || "Audio transcription failed.",
    });
  }
});

app.post("/api/homework-review", async (req, res) => {
  const payload = req.body || {};
  const fallbackEvaluation = buildHeuristicScores(payload);
  let evaluation = fallbackEvaluation;
  let mode = "fallback";

  try {
    const aiEvaluation = await buildAiEvaluation(payload, fallbackEvaluation);
    if (aiEvaluation) {
      evaluation = {
        ...fallbackEvaluation,
        ...aiEvaluation,
        scores: fallbackEvaluation.scores,
      };
      mode = "ai";
    }
  } catch (error) {
    console.error("AI homework evaluation failed:", error);
  }

  return res.json({
    ok: true,
    mode,
    text: formatEvaluationAsText(evaluation),
    evaluation,
  });
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

  return res.json({
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
  const safeMessages = Array.isArray(messages) ? messages.slice(-8) : [];

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

    const text = await createOpenAITextResponse({
      system: system || "你是一位专业的大学音乐理论教师和 AI 辅导员。请用中文简洁、准确地回答。",
      messages: safeMessages,
      maxTokens: Math.min(Number(maxTokens) || 500, 500),
      modelOverride: getTutorModel(),
      timeoutMs: getTutorTimeoutMs(),
    });

    return res.json({ text: text || "抱歉，我暂时没有生成有效回答，请重试。" });
  } catch (error) {
    console.error("AI tutor request failed:", error);
    const detail = error.message || "Unknown error";
    const status = error.status || (/timed out|timeout|aborted/i.test(detail) ? 504 : 500);
    return res.status(status).json({
      error: "AI tutor request failed.",
      detail,
      kind: status === 504
        ? "timeout"
        : /Failed to fetch|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(detail)
          ? "upstream_network"
          : "upstream_error",
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
      throw new Error("当前服务器所在地区无法直接访问 Gemini 官方接口。请在 .env 中配置 GEMINI_BASE_URL 指向第三方 Gemini 接口，或将服务部署到 Gemini 支持地区。");
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
