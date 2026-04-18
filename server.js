import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import xlsx from "xlsx";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BKT_PARAMS,
  KNOWLEDGE_POINTS,
  getBktKnowledgePoints,
  getKnowledgePointsForLesson,
} from "./src/musicaiKnowledge.js";
import { FORMAL_QUESTION_BANK } from "./src/musicaiQuestionBank.js";
import { IMAGE_FILE_HINTS, KNOWLEDGE_POINT_ALIASES } from "./src/musicaiKnowledgeAliases.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const SEED_DIR = path.join(__dirname, "seed");
const EXPERIMENT_SIM_DIR = path.join(DATA_DIR, "experiment-sim");
const ANALYTICS_FILE = path.join(DATA_DIR, "teacher-analytics.json");
const BKT_SUMMARY_FILE = path.join(DATA_DIR, "teacher-bkt-summary.json");
const BKT_TEST_FILE = path.join(DATA_DIR, "bkt-test-results.json");
const EXPERIMENT_SIM_V2_FILE = path.join(EXPERIMENT_SIM_DIR, "experiment-sim-package-v2.xlsx");
const ANALYTICS_SEED_FILE = path.join(SEED_DIR, "teacher-analytics.seed.json");
const BKT_SUMMARY_SEED_FILE = path.join(SEED_DIR, "teacher-bkt-summary.seed.json");
const EXPERIMENT_RQ4_SEED_FILE = path.join(SEED_DIR, "experiment-rq4.seed.json");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const TUTOR_CACHE_TTL_MS = 5 * 60 * 1000;
const execFileAsync = promisify(execFile);
let analyticsWriteQueue = Promise.resolve();
let bktSummaryWriteQueue = Promise.resolve();
let bktTestWriteQueue = Promise.resolve();
let experimentRq4Cache = { sourceKey: "", data: null };
const tutorResponseCache = new Map();
const tutorInflightRequests = new Map();
const AI_CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000;
let aiCircuitBreaker = {
  openUntil: 0,
  reason: "",
};

app.use(express.json({ limit: "25mb" }));
app.use("/generated-reports", express.static(REPORTS_DIR));
app.use((req, res, next) => {
  const compatibilityPrefixes = [
    "/health",
    "/analytics",
    "/transcribe",
    "/homework-review",
    "/teacher/",
    "/tutor",
    "/bkt/",
  ];
  if (!req.url.startsWith("/api/") && compatibilityPrefixes.some((prefix) => req.url === prefix || req.url.startsWith(prefix))) {
    req.url = `/api${req.url}`;
  }
  next();
});

function safeString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function buildTutorCacheKey({ system = "", messages = [], model = "", maxTokens = 0 }) {
  const normalizedMessages = getArray(messages);
  const latestUserMessage = [...normalizedMessages].reverse().find((message) => safeString(message.role, "user") !== "assistant") || {};
  return JSON.stringify({
    model,
    maxTokens,
    systemHint: safeString(system).trim().slice(0, 240),
    content: safeString(latestUserMessage.content).trim().slice(0, 600),
    imageMarker: latestUserMessage.imageDataUrl ? safeString(latestUserMessage.imageDataUrl).slice(0, 200) : "",
  });
}

function getTutorCachedResponse(cacheKey) {
  const cached = tutorResponseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.at > TUTOR_CACHE_TTL_MS) {
    tutorResponseCache.delete(cacheKey);
    return null;
  }
  return cached.text;
}

function setTutorCachedResponse(cacheKey, text) {
  tutorResponseCache.set(cacheKey, { text, at: Date.now() });
  if (tutorResponseCache.size > 100) {
    const firstKey = tutorResponseCache.keys().next().value;
    if (firstKey) tutorResponseCache.delete(firstKey);
  }
}

function getTutorInflightRequest(cacheKey) {
  return tutorInflightRequests.get(cacheKey) || null;
}

function setTutorInflightRequest(cacheKey, promise) {
  tutorInflightRequests.set(cacheKey, promise);
}

function clearTutorInflightRequest(cacheKey) {
  tutorInflightRequests.delete(cacheKey);
}

function nowIso() {
  return new Date().toISOString();
}

function isAiCircuitBreakerOpen() {
  return Date.now() < Number(aiCircuitBreaker.openUntil || 0);
}

function openAiCircuitBreaker(reason) {
  aiCircuitBreaker = {
    openUntil: Date.now() + AI_CIRCUIT_BREAKER_WINDOW_MS,
    reason: safeString(reason, "unstable-upstream"),
  };
}

function closeAiCircuitBreaker() {
  aiCircuitBreaker = {
    openUntil: 0,
    reason: "",
  };
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

function parseModelChain(value, fallback = []) {
  const items = [
    ...String(value || "").split(",").map((item) => item.trim()).filter(Boolean),
    ...getArray(fallback).map((item) => safeString(item).trim()).filter(Boolean),
  ];
  return [...new Set(items)];
}

function getDefaultTextModelChain() {
  return parseModelChain(process.env.OPENAI_MODEL_CHAIN, [
    getOpenAIModel(),
    "qwen-plus-2025-07-28",
    "qvq-max-2025-03-25",
    "qwen-math-turbo",
  ]);
}

function getTutorModelChain() {
  return parseModelChain(process.env.OPENAI_TUTOR_MODEL_CHAIN, [
    getTutorModel(),
    getTutorFallbackModel(),
    "qwen-plus-2025-07-28",
    "qvq-max-2025-03-25",
    "qwen-math-turbo",
  ]);
}

function getHomeworkModelChain(hasImages = false) {
  if (hasImages) {
    return parseModelChain(process.env.OPENAI_HOMEWORK_VISION_MODEL_CHAIN, [
      getDashScopeVisionModel(),
      "qwen3-vl-32b-thinking",
      "qwen3-vl-235b-a22b-thinking",
    ]);
  }
  return parseModelChain(process.env.OPENAI_HOMEWORK_MODEL_CHAIN, [
    getOpenAIModel(),
    "qwen-plus-2025-07-28",
    "qvq-max-2025-03-25",
    "qwen-math-turbo",
  ]);
}

function getVisionModelChain() {
  return parseModelChain(process.env.DASHSCOPE_VISION_MODEL_CHAIN, [
    getDashScopeVisionModel(),
    "qwen3-vl-32b-thinking",
    "qwen3-vl-235b-a22b-thinking",
  ]);
}

function isRetryableModelError(error) {
  const detail = safeString(error?.message, "").toLowerCase();
  return Boolean(
    error?.status === 429
    || error?.status >= 500
    || /quota|额度|余额|insufficient|rate limit|too many requests|resource exhausted|exhausted|limit|access denied|good standing|overdue payment|payment|not enabled|model not found|does not support http call|api does not support/i.test(detail)
    || /timed out|timeout|aborted|temporarily unavailable|server error|overloaded|busy/i.test(detail)
  );
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

async function createDashScopeCompatibleResponseDetailed({ system, messages = [], maxTokens = 1000, modelOverride, modelChain, timeoutMs }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const baseUrl = getOpenAIBaseUrl();
  const hasImages = hasImageMessages(messages);
  const candidateModels = parseModelChain(modelOverride || modelChain, hasImages ? getVisionModelChain() : getDefaultTextModelChain());
  let lastError = null;

  for (const model of candidateModels) {
    try {
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
        const error = new Error(data?.error?.message || data?.message || `DashScope request failed with status ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return {
        text: safeString(data?.choices?.[0]?.message?.content).trim(),
        model,
      };
    } catch (error) {
      lastError = error;
      if (!isRetryableModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No available DashScope model in fallback chain.");
}

async function createDashScopeCompatibleResponse(args) {
  const result = await createDashScopeCompatibleResponseDetailed(args);
  return result.text;
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

function getTutorFallbackModel() {
  return process.env.OPENAI_TUTOR_FALLBACK_MODEL || process.env.OPENAI_MODEL || "qwen-plus";
}

function getTutorTimeoutMs() {
  const value = Number(process.env.OPENAI_TUTOR_TIMEOUT_MS || 20000);
  return Number.isFinite(value) && value > 0 ? value : 20000;
}

function countMatches(text, pattern) {
  const matches = safeString(text).match(pattern);
  return matches ? matches.length : 0;
}

function looksLikeEnglishDominant(text) {
  const content = safeString(text);
  const chineseCount = countMatches(content, /[\u4e00-\u9fff]/g);
  const englishCount = countMatches(content, /[A-Za-z]/g);
  return englishCount >= 20 && chineseCount <= 6;
}

function isGenericTutorFailureText(text) {
  const content = safeString(text).toLowerCase();
  return [
    "it seems like there might be some confusion",
    "could you please clarify",
    "please provide more details",
    "i need more context",
    "technical issue",
    "请提供明确的问题",
    "请提供更多信息",
    "请再具体说明",
    "我需要更多上下文",
    "无法判断你的问题",
    "没有具体问题",
    "未上传任何文件或内容",
    "无法查看或访问您上传的任何文件或内容",
    "无法结合具体材料进行讲解",
    "请直接说明您希望讲解的具体知识点",
    "请您明确指出需要讲解的具体概念或问题",
    "任选其一",
    "多个问号",
    "多个中文问号",
    "无明确语义",
    "无法从中提取",
  ].some((phrase) => content.includes(phrase));
}

function extractLatestUserPrompt(messages = []) {
  const latestUserMessage = [...getArray(messages)]
    .reverse()
    .find((message) => safeString(message?.role, "user") !== "assistant");
  return safeString(latestUserMessage?.content).trim();
}

function extractPromptKeywords(text) {
  return [...new Set(
    safeString(text)
      .match(/[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z-]{2,}/g) || []
  )]
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length >= 2)
    .slice(0, 8);
}

function normalizeTutorPrompt(text) {
  return safeString(text)
    .replace(/学生问题：/g, "")
    .replace(/要求：[\s\S]*$/g, "")
    .replace(/\[\d+\]/g, " ")
    .replace(/什么是|请用一句定义加一个例子说明|请说明|请解释|是什么意思|如何理解/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractChineseKeywords(text = "") {
  return [...new Set(
    safeString(text)
      .match(/[\u4e00-\u9fff]{2,}/g) || []
  )].filter((item) => item.length >= 2);
}

function extractLatestUserImageName(messages = []) {
  const latestUserMessage = [...getArray(messages)]
    .reverse()
    .find((message) => safeString(message?.role, "user") !== "assistant" && safeString(message?.imageDataUrl));
  return safeString(latestUserMessage?.imageName).trim();
}

function detectTutorIntent({ prompt = "", imageName = "" } = {}) {
  const source = `${safeString(prompt)} ${safeString(imageName)}`.toLowerCase();
  return {
    homework: /作业|课后|提交|批改|纠错|反馈|提醒|学生|老师/.test(source),
    image: Boolean(imageName) || /图片|拍照|读图|看图|课件|截图|图中/.test(source),
    teaching: /教学口吻|给学生解释|向学生解释|老师应该|如何举例/.test(source),
  };
}

function selectRelevantSubConcepts(point, prompt) {
  const normalizedPrompt = normalizeTutorPrompt(prompt).toLowerCase();
  const aliases = getArray(KNOWLEDGE_POINT_ALIASES[point.id]).map((item) => safeString(item).toLowerCase());
  const subConcepts = getArray(point.subConcepts);
  if (point.id === "L1_K1_pitchProperties" && /钢琴|小提琴|乐器|同一音高|听起来不同/.test(normalizedPrompt)) {
    return subConcepts.filter((item) => /音色|泛音/.test(safeString(item))).slice(0, 2).concat(subConcepts[0]).filter(Boolean).slice(0, 4);
  }
  const matched = subConcepts.filter((item) => {
    const normalizedItem = safeString(item).toLowerCase();
    return normalizedPrompt.includes(normalizedItem) || aliases.some((alias) => alias && normalizedPrompt.includes(alias) && normalizedItem.includes(alias));
  });
  const fallbackHead = subConcepts.slice(0, 2);
  return [...new Set([...(matched.length ? matched : []), ...fallbackHead])].slice(0, 4);
}

function hasMeaningfulKeywordOverlap(reply, prompt) {
  const replyText = safeString(reply).toLowerCase();
  const keywords = extractPromptKeywords(normalizeTutorPrompt(prompt));
  if (!keywords.length) return true;
  return keywords.some((keyword) => replyText.includes(keyword));
}

function scoreKnowledgePointMatch(point, normalizedPrompt, promptKeywords = []) {
  const title = safeString(point.title);
  const titleAliases = [
    title,
    title.replace(/识读|基础|体系|规则|记号|形式|类型|原理|分析|组合|关系$/g, ""),
    ...getArray(KNOWLEDGE_POINT_ALIASES[point.id]),
  ].filter(Boolean);
  const haystacks = [
    ...titleAliases,
    ...getArray(point.subConcepts),
    ...getArray(point.exerciseTypes),
    ...getArray(point.easy),
    ...getArray(point.medium),
    ...getArray(point.hard),
  ].map((item) => safeString(item).toLowerCase());

  let score = 0;
  for (const alias of titleAliases.map((item) => item.toLowerCase())) {
    if (alias && normalizedPrompt.includes(alias)) score += 8;
    const compactAlias = alias.replace(/\s+/g, "");
    if (compactAlias && normalizedPrompt.includes(compactAlias)) score += 8;
  }
  for (const haystack of haystacks) {
    for (const keyword of promptKeywords) {
      if (haystack.includes(keyword)) score += keyword.length >= 4 ? 3 : 2;
    }
  }
  if (haystacks.some((item) => normalizedPrompt.includes(item) || item.includes(normalizedPrompt))) {
    score += 6;
  }
  return score;
}

function getKnowledgePointMatchRanking(prompt, { imageName = "", system = "", limit = 3 } = {}) {
  const cleanedPrompt = normalizeTutorPrompt(prompt);
  const systemPrompt = normalizeTutorPrompt(system);
  const normalizedPrompt = `${cleanedPrompt} ${systemPrompt}`.toLowerCase();
  const promptKeywords = [...new Set([
    ...extractPromptKeywords(cleanedPrompt),
    ...extractPromptKeywords(systemPrompt),
  ])];

  const matchedImageHint = Object.entries(IMAGE_FILE_HINTS).find(([hint]) => safeString(imageName).toLowerCase().includes(hint));
  if (matchedImageHint) {
    const directPoint = KNOWLEDGE_POINTS.find((point) => point.id === matchedImageHint[1]) || null;
    return directPoint ? [{ point: directPoint, score: 999 }] : [];
  }
  return KNOWLEDGE_POINTS
    .map((point) => ({
      point,
      score: scoreKnowledgePointMatch(point, normalizedPrompt, promptKeywords),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

function findBestKnowledgePointMatch(prompt, options = {}) {
  return getKnowledgePointMatchRanking(prompt, { ...options, limit: 1 })[0]?.point || null;
}

function buildCombinedConceptTutorFallback(points, prompt, intent) {
  const distinctPoints = getArray(points).filter(Boolean).slice(0, 2);
  const keyIdeas = distinctPoints.flatMap((point) => selectRelevantSubConcepts(point, prompt).slice(0, 2));
  const examples = distinctPoints
    .map((point) => getArray(point.easy)[0] || getArray(point.medium)[0] || "")
    .filter(Boolean)
    .slice(0, 2);
  return [
    `这个问题涉及“${distinctPoints.map((point) => point.title).join("”和“")}”。`,
    keyIdeas.length ? `你可以先抓住这些关键点：${keyIdeas.join("；")}。` : "",
    examples.length ? `可以用这些例子快速理解：${examples.join("；")}。` : "",
    intent.teaching ? "如果面对学生讲解，建议先区分概念，再给出规则和例子。" : "如果你愿意，我可以继续把这两个知识点并排对照讲解。",
  ].filter(Boolean).join("");
}

function buildDiagnosticTutorFallback() {
  return [
    "这节课是综合诊断课，不是重新背诵全部知识点。",
    "它的目标是整合前 11 课内容，判断学生究竟卡在识谱、节奏、术语、装饰音还是综合分析。",
    "最有效的做法是：先看错题和作业，再定位到具体薄弱知识点，最后给出下一步复习顺序。",
    "如果你愿意，我可以继续按“薄弱点定位 + 复习建议”的结构展开说明。",
  ].join("");
}

function shouldPreferLocalTutorResponse(prompt, intent, matchedPoints = [], system = "") {
  const normalizedPrompt = normalizeTutorPrompt(prompt);
  const normalizedSystem = normalizeTutorPrompt(system);
  if (/综合诊断|前 11 课|前11课|薄弱项|复习建议/.test(`${normalizedPrompt} ${normalizedSystem}`)) return true;
  if (intent.homework) return true;
  if (intent.image && matchedPoints.length) return true;
  if (intent.image) return false;
  if (!matchedPoints.length) return false;
  if (normalizedPrompt.length <= 120) return true;
  if (/什么是|请解释|请说明|区别|比较|含义|定义|如何理解|怎么讲解|教学口吻/.test(normalizedPrompt)) return true;
  return false;
}

function buildHomeworkTutorFallback(point, prompt) {
  const checks = [
    getArray(point.subConcepts)[0] || `先确认“${point.title}”的定义`,
    getArray(point.subConcepts)[1] || "再核对书写是否符合规则",
    getArray(point.subConcepts)[2] || "最后检查是否有常见混淆点",
  ].filter(Boolean).slice(0, 3);
  const example = getArray(point.easy)[0] || getArray(point.medium)[0] || "";
  return [
    `这类课后作业优先围绕“${point.title}”来检查。`,
    `批改时建议依次提醒学生：1. ${checks[0]}；2. ${checks[1] || checks[0]}；3. ${checks[2] || checks[1] || checks[0]}。`,
    example ? `你可以直接给学生一个参照例子：${example}。` : "",
    /节奏|拍号|切分|音值/.test(prompt) ? "如果是节奏作业，要特别检查每小节拍数是否完整、强弱位置是否清楚。" : "",
    /谱号|五线谱|中央 ?C|音组/.test(prompt) ? "如果是五线谱作业，要特别检查谱号是否正确、音位是否落在正确的线或间上。" : "",
  ].filter(Boolean).join("");
}

function buildImageTutorFallback(point) {
  const keyIdeas = getArray(point.subConcepts).slice(0, 3);
  const example = getArray(point.easy)[0] || "";
  return [
    `从图片上下文看，这张图大概率对应“${point.title}”。`,
    keyIdeas.length ? `读图时先抓住这几个关键词：${keyIdeas.join("；")}。` : "",
    example ? `如果要向学生讲解，可以先用这个例子入手：${example}。` : "",
  ].filter(Boolean).join("");
}

function buildConceptTutorFallback(point, intent, prompt) {
  const keyIdeas = selectRelevantSubConcepts(point, prompt);
  const example = getArray(point.easy)[0] || getArray(point.medium)[0] || "";
  return [
    `关于“${point.title}”，这是本课的重要知识点。`,
    keyIdeas.length ? `你先抓住这几个要点：${keyIdeas.join("；")}。` : "",
    example ? `可以先用这个例子理解：${example}。` : "",
    intent.teaching ? "如果你要面对学生讲解，建议按“定义、规则、例子”三步来说明。" : "如果你愿意，我也可以继续把它拆成“定义、规则、例题”三步讲清楚。",
  ].filter(Boolean).join("");
}

function buildLocalTutorFallback(messages = [], { system = "" } = {}) {
  const prompt = extractLatestUserPrompt(messages);
  const imageName = extractLatestUserImageName(messages);
  const intent = detectTutorIntent({ prompt, imageName });
  const matchedPoints = getKnowledgePointMatchRanking(prompt, { imageName, system }, 2).map((item) => item.point);
  const matchedPoint = matchedPoints[0] || null;
  if (/综合诊断|前 11 课|前11课|薄弱项|复习建议/.test(`${normalizeTutorPrompt(prompt)} ${normalizeTutorPrompt(system)}`)) {
    return {
      text: buildDiagnosticTutorFallback(),
      matchedPoint: null,
      matchedPoints: [],
      intent,
    };
  }
  if (!matchedPoint) {
    if (intent.homework) {
      return {
        text: "这是一道作业辅导类问题。当前模型没有稳定给出答案，建议你直接说明作业要求、拍号或谱号信息，我会按“批改提醒 + 常见错误 + 示例”的结构继续解释。",
        matchedPoint: null,
        matchedPoints: [],
        intent,
      };
    }
    if (intent.image) {
      return {
        text: "这是一道图片讲解类问题。当前模型没有稳定识别图片内容，建议你补一句图片主题，例如“这是高音谱号课件”或“这是 4/4 拍节奏图”，我会直接按知识点讲解。",
        matchedPoint: null,
        matchedPoints: [],
        intent,
      };
    }
    return {
      text: "这个问题可以继续提问，但当前模型没有稳定给出答案。建议你把问题改成“定义 + 例子”形式，或上传对应题目图片，我会按课程知识点继续解释。",
      matchedPoint: null,
      matchedPoints: [],
      intent,
    };
  }
  let text = "";
  if (intent.homework) {
    text = buildHomeworkTutorFallback(matchedPoint, prompt);
  } else if (intent.image) {
    text = buildImageTutorFallback(matchedPoint);
  } else if (/区别|比较|联系|不同/.test(normalizeTutorPrompt(prompt)) && matchedPoints.length > 1) {
    text = buildCombinedConceptTutorFallback(matchedPoints, prompt, intent);
  } else {
    text = buildConceptTutorFallback(matchedPoint, intent, prompt);
  }
  return {
    text,
    matchedPoint,
    matchedPoints,
    intent,
  };
}

function isLowQualityTutorReply(text, messages = []) {
  const content = safeString(text).trim();
  const latestPrompt = extractLatestUserPrompt(messages);
  if (!content) return true;
  if (looksLikeEnglishDominant(content)) return true;
  if (isGenericTutorFailureText(content)) return true;
  if (/问号|没有具体问题|请提供明确的问题|请提供更多信息|无法判断你的问题|无效的输入|系统错误|乱码|无明确语义|无法从中提取/.test(content)) return true;
  if (content.length < 12) return true;
  if (latestPrompt && !/^[\s?.!,;:，。！？；：]+$/.test(latestPrompt) && !hasMeaningfulKeywordOverlap(content, latestPrompt)) {
    return true;
  }
  return false;
}

async function createTutorResponseWithFallback({ system, messages, rawMessages = messages, maxTokens, timeoutMs }) {
  const modelChain = getTutorModelChain();
  const strictSystem = `${safeString(system)}\n\n额外要求：\n1. 必须使用简体中文回答。\n2. 先直接回答，不要反问用户补充信息，除非完全无法判断。\n3. 如果是概念题，请先给定义，再给一个简短例子。\n4. 不要输出英文开场白。`;
  let lastText = "";
  const attemptedModels = [];
  const localFallback = buildLocalTutorFallback(rawMessages, { system });
  const latestPrompt = extractLatestUserPrompt(rawMessages);

  if ((isAiCircuitBreakerOpen() || shouldPreferLocalTutorResponse(latestPrompt, localFallback.intent, localFallback.matchedPoints, system)) && localFallback.text) {
    return {
      text: localFallback.text,
      model: isAiCircuitBreakerOpen() ? `local-priority(circuit-open:${aiCircuitBreaker.reason})` : "local-priority",
      retried: false,
    };
  }

  for (const modelName of modelChain) {
    try {
      const result = await createOpenAITextResponseDetailed({
        system: strictSystem,
        messages,
        maxTokens,
        modelOverride: modelName,
        timeoutMs,
      });
      const candidateText = safeString(result?.text);
      const candidateModel = safeString(result?.model, modelName);
      attemptedModels.push(candidateModel);
      lastText = candidateText;
      if (!isLowQualityTutorReply(candidateText, rawMessages)) {
        closeAiCircuitBreaker();
        return {
          text: candidateText,
          model: candidateModel,
          retried: attemptedModels.length > 1,
        };
      }
    } catch (error) {
      attemptedModels.push(`${modelName}:error`);
      if (isRetryableModelError(error)) {
        openAiCircuitBreaker(error?.message || "retryable-upstream-error");
      }
      if (!isRetryableModelError(error)) {
        throw error;
      }
    }
  }

  const localFallbackText = localFallback.text;
  return {
    text: localFallbackText || lastText || "抱歉，我暂时没有生成稳定回答，请稍后重试。",
    model: `${attemptedModels.filter(Boolean).join(" -> ")}${localFallbackText ? " -> local-fallback" : ""}`,
    retried: attemptedModels.length > 1,
  };
}

function extractOpenAITextFromChatCompletion(response) {
  return safeString(response?.choices?.[0]?.message?.content).trim();
}

async function createOpenAITextResponse({ system, messages = [], maxTokens = 1000, modelOverride, modelChain, timeoutMs }) {
  const result = await createOpenAITextResponseDetailed({ system, messages, maxTokens, modelOverride, modelChain, timeoutMs });
  return result.text;
}

async function createOpenAITextResponseDetailed({ system, messages = [], maxTokens = 1000, modelOverride, modelChain, timeoutMs }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (isDashScopeCompatibleMode()) {
    return createDashScopeCompatibleResponseDetailed({ system, messages, maxTokens, modelOverride, modelChain, timeoutMs });
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
    return { text: extractOpenAITextFromChatCompletion(response), model };
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
  return { text: safeString(response.output_text).trim(), model };
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}

function decodeEscapedUnicodeText(value) {
  if (typeof value !== "string" || !value.includes("\\u")) return value;
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeEscapedUnicodeDeep(value) {
  if (typeof value === "string") return decodeEscapedUnicodeText(value);
  if (Array.isArray(value)) return value.map((item) => decodeEscapedUnicodeDeep(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeEscapedUnicodeDeep(item)]));
  }
  return value;
}

function normalizeRhythmSubmission(rhythmSubmission) {
  if (!rhythmSubmission || typeof rhythmSubmission !== "object") return rhythmSubmission;
  return decodeEscapedUnicodeDeep(rhythmSubmission);
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
  const normalizedSubmission = normalizeRhythmSubmission(rhythmSubmission);
  if (!normalizedSubmission?.measures) return [];
  const [top, bottom] = String(normalizedSubmission.meter || "4/4").split("/");
  const beats = Number(top || 4) * (4 / Number(bottom || 4));
  const issues = [];
  normalizedSubmission.measures.forEach((measure = [], index) => {
    if (!measure.length) {
      issues.push(`第 ${index + 1} 小节为空`);
      return;
    }
    const duration = measure.reduce((sum, item) => sum + Number(item?.duration || 0), 0);
    if (duration < beats) issues.push(`第 ${index + 1} 小节拍数不足`);
    if (duration > beats) issues.push(`第 ${index + 1} 小节拍数超出`);
    const last = measure[measure.length - 1];
    if (last?.tieToNext && index === normalizedSubmission.measures.length - 1) {
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
  const rhythmSubmission = normalizeRhythmSubmission(payload.rhythmSubmission || null);
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
  if (provider === "openai" && isDashScopeCompatibleMode() && isAiCircuitBreakerOpen()) {
    return null;
  }
  const system = "你是一名大学乐理教师。请根据学生作业生成 JSON，字段必须包含 overallComment、strengths、issues、suggestions、tags，所有内容使用中文。";
  const prompt = JSON.stringify({
    lessonTitle: safeString(payload.lessonTitle, "当前课时"),
    homeworkPrompt: safeString(payload.homeworkPrompt),
    text: safeString(payload.text),
    voiceTranscript: safeString(payload.voiceTranscript),
    submissionTypes: getSubmissionTypes(payload),
    rhythmSubmission: normalizeRhythmSubmission(payload.rhythmSubmission || null),
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
    try {
      const text = await createGeminiResponse({
        system,
        messages: reviewMessages,
        maxTokens: 1200,
      });
      return parseJsonObject(text);
    } catch (error) {
      if (isRetryableModelError(error)) {
        openAiCircuitBreaker(error?.message || "gemini-evaluation-error");
      }
      throw error;
    }
  }

  if (!process.env.OPENAI_API_KEY) return null;
  let text = "";
  try {
    text = await createOpenAITextResponse({
      system,
      messages: reviewMessages,
      maxTokens: 1200,
      modelChain: getHomeworkModelChain(getArray(payload.images).length > 0),
    });
    closeAiCircuitBreaker();
  } catch (error) {
    if (isRetryableModelError(error)) {
      openAiCircuitBreaker(error?.message || "homework-evaluation-error");
      return null;
    }
    throw error;
  }
  const parsed = parseJsonObject(text || "");
  if (!parsed) return null;
  const aiStrengths = getArray(parsed.strengths).map((item) => safeString(item)).filter(Boolean).slice(0, 5);
  const aiIssues = getArray(parsed.issues).map((item) => safeString(item)).filter(Boolean).slice(0, 5);
  const aiSuggestions = getArray(parsed.suggestions).map((item) => safeString(item)).filter(Boolean).slice(0, 5);
  const aiTags = getArray(parsed.tags).map((item) => safeString(item)).filter(Boolean).slice(0, 6);
  return {
    overallComment: safeString(parsed.overallComment, fallbackEvaluation.overallComment),
    strengths: (aiStrengths.length ? aiStrengths : fallbackEvaluation.strengths).slice(0, 5),
    issues: (aiIssues.length ? aiIssues : fallbackEvaluation.issues).slice(0, 5),
    suggestions: (aiSuggestions.length ? aiSuggestions : fallbackEvaluation.suggestions).slice(0, 5),
    tags: [...new Set([...(aiTags.length ? aiTags : fallbackEvaluation.tags)])].slice(0, 6),
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
    if (Array.isArray(parsed.records) && parsed.records.length) {
      return parsed;
    }
  } catch {
    // noop
  }
  try {
    const raw = await fs.readFile(ANALYTICS_SEED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.records) ? parsed : { records: [] };
  } catch {
    return { records: [] };
  }
}

async function writeAnalyticsStore(store) {
  analyticsWriteQueue = analyticsWriteQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(ANALYTICS_FILE, JSON.stringify(store, null, 2), "utf8");
  });
  await analyticsWriteQueue;
}

async function readBktSummaryStore() {
  try {
    const raw = await fs.readFile(BKT_SUMMARY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const normalized = {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      mappings: parsed.mappings && typeof parsed.mappings === "object" ? parsed.mappings : {},
      simulatedStudents: Array.isArray(parsed.simulatedStudents) ? parsed.simulatedStudents : [],
    };
    if (normalized.records.length) {
      return normalized;
    }
  } catch {
    // noop
  }
  try {
    const raw = await fs.readFile(BKT_SUMMARY_SEED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      records: Array.isArray(parsed.records) ? parsed.records : [],
      mappings: parsed.mappings && typeof parsed.mappings === "object" ? parsed.mappings : {},
      simulatedStudents: Array.isArray(parsed.simulatedStudents) ? parsed.simulatedStudents : [],
    };
  } catch {
    return { records: [], mappings: {}, simulatedStudents: [] };
  }
}

async function writeBktSummaryStore(store) {
  bktSummaryWriteQueue = bktSummaryWriteQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(BKT_SUMMARY_FILE, JSON.stringify(store, null, 2), "utf8");
  });
  await bktSummaryWriteQueue;
}

async function readBktTestStore() {
  try {
    const raw = await fs.readFile(BKT_TEST_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      latestRun: parsed.latestRun && typeof parsed.latestRun === "object" ? parsed.latestRun : null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      latestDeepRun: parsed.latestDeepRun && typeof parsed.latestDeepRun === "object" ? parsed.latestDeepRun : null,
      deepHistory: Array.isArray(parsed.deepHistory) ? parsed.deepHistory : [],
    };
  } catch {
    return { latestRun: null, history: [], latestDeepRun: null, deepHistory: [] };
  }
}

async function writeBktTestStore(store) {
  bktTestWriteQueue = bktTestWriteQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(BKT_TEST_FILE, JSON.stringify(store, null, 2), "utf8");
  });
  await bktTestWriteQueue;
}

function toFiniteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = safeString(value).trim().toLowerCase();
  if (!normalized) return false;
  return ["true", "pass", "yes", "ok", "1", "成功", "通过"].includes(normalized);
}

function readSheetRows(workbook, sheetName) {
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet) return [];
  return xlsx.utils.sheet_to_json(sheet, { defval: null });
}

function normalizeExperimentRq4Payload(raw, sourceLabel) {
  if (!raw || typeof raw !== "object") return null;
  const summaryRows = getArray(raw.summaryRows).map((row) => ({
    metric: safeString(row.metric),
    mean: typeof row.mean === "string" && !row.mean.trim() ? null : (toFiniteNumberOrNull(row.mean) ?? safeString(row.mean)),
    sd: toFiniteNumberOrNull(row.sd),
    target: safeString(row.target),
    pass: toBooleanFlag(row.pass),
  }));
  const correlationRows = getArray(raw.correlationRows).map((row) => ({
    variableX: safeString(row.variable_x),
    variableY: safeString(row.variable_y),
    n: toFiniteNumberOrNull(row.n),
    r: toFiniteNumberOrNull(row.r),
    p: toFiniteNumberOrNull(row.p),
    threshold: safeString(row.threshold),
    pass: toBooleanFlag(row.pass),
  }));
  const logicRows = getArray(raw.logicRows).map((row) => ({
    check: safeString(row.check),
    variableX: safeString(row.variable_x),
    variableY: safeString(row.variable_y),
    r: toFiniteNumberOrNull(row.r),
    p: toFiniteNumberOrNull(row.p),
    threshold: safeString(row.threshold),
    pass: toBooleanFlag(row.pass),
  }));
  const regressionRows = getArray(raw.regressionRows);
  const block1 = regressionRows.find((row) => safeString(row.block).toLowerCase() === "block1") || {};
  const block2 = regressionRows.find((row) => safeString(row.block).toLowerCase() === "block2") || {};
  const coefficientRows = regressionRows
    .filter((row) => {
      const block = safeString(row.block).toLowerCase();
      return block && !["block1", "block2", "predictor"].includes(block);
    })
    .map((row) => ({
      predictor: safeString(row.block),
      unstandardizedB: toFiniteNumberOrNull(row.r_squared),
      standardizedBeta: toFiniteNumberOrNull(row.adjusted_r_squared),
      standardError: toFiniteNumberOrNull(row.f_value),
      t: toFiniteNumberOrNull(row.model_p),
      p: toFiniteNumberOrNull(row.delta_r_squared),
      tolerance: toFiniteNumberOrNull(row.f_change),
      vif: toFiniteNumberOrNull(row.p_change),
    }));
  const studentRows = getArray(raw.studentRows).map((row) => ({
    studentId: safeString(row.studentId),
    groupLabel: safeString(row.groupLabel),
    group: toFiniteNumberOrNull(row.group),
    preMte: toFiniteNumberOrNull(row.pre_MTE_formA),
    postMte: toFiniteNumberOrNull(row.post_MTE_formB),
    preAttention: toFiniteNumberOrNull(row.pre_attention),
    preRelevance: toFiniteNumberOrNull(row.pre_relevance),
    preConfidence: toFiniteNumberOrNull(row.pre_confidence),
    preSatisfaction: toFiniteNumberOrNull(row.pre_satisfaction),
    postAttention: toFiniteNumberOrNull(row.post_attention),
    postRelevance: toFiniteNumberOrNull(row.post_relevance),
    postConfidence: toFiniteNumberOrNull(row.post_confidence),
    postSatisfaction: toFiniteNumberOrNull(row.post_satisfaction),
    preImmsTotal: toFiniteNumberOrNull(row.pre_imms_total),
    postImmsTotal: toFiniteNumberOrNull(row.post_imms_total),
    puMean: toFiniteNumberOrNull(row.PU_mean),
    peuMean: toFiniteNumberOrNull(row.PEU_mean),
    totalTimeMin: toFiniteNumberOrNull(row.total_time_min),
    totalExercises: toFiniteNumberOrNull(row.total_exercises),
    overallAccuracy: toFiniteNumberOrNull(row.overall_accuracy),
    avgPL: toFiniteNumberOrNull(row.avg_pL),
    masteredCount: toFiniteNumberOrNull(row.mastered_count),
    tutorQueries: toFiniteNumberOrNull(row.tutor_queries),
    errorCount: toFiniteNumberOrNull(row.error_count),
  }));
  const metricValue = (metricKey) => summaryRows.find((item) => item.metric === metricKey)?.mean;
  return {
    source: sourceLabel,
    rq4: {
      sampleCount: studentRows.length,
      summaryMetrics: summaryRows,
      lowParticipationCount: Number(metricValue("low_participation_count") || 0),
      significantPearsons: Number(metricValue("significant_pearsons") || 0),
      strongPredictors: Number(metricValue("strong_predictors") || 0),
      overallPass: String(metricValue("overall_pass") || "").toUpperCase() === "PASS",
      correlations: correlationRows,
      logicChecks: logicRows,
      regression: {
        block1: {
          rSquared: toFiniteNumberOrNull(block1.r_squared),
          adjustedRSquared: toFiniteNumberOrNull(block1.adjusted_r_squared),
          fValue: toFiniteNumberOrNull(block1.f_value),
          modelP: toFiniteNumberOrNull(block1.model_p),
        },
        block2: {
          rSquared: toFiniteNumberOrNull(block2.r_squared),
          adjustedRSquared: toFiniteNumberOrNull(block2.adjusted_r_squared),
          fValue: toFiniteNumberOrNull(block2.f_value),
          modelP: toFiniteNumberOrNull(block2.model_p),
          deltaRSquared: toFiniteNumberOrNull(block2.delta_r_squared),
          fChange: toFiniteNumberOrNull(block2.f_change),
          pChange: toFiniteNumberOrNull(block2.p_change),
        },
        coefficients: coefficientRows,
      },
      students: studentRows,
    },
  };
}

function parseExperimentRq4Workbook(workbook) {
  return normalizeExperimentRq4Payload(
    {
      summaryRows: readSheetRows(workbook, "rq4_summary"),
      correlationRows: readSheetRows(workbook, "rq4_correlations"),
      logicRows: readSheetRows(workbook, "rq4_logic_checks"),
      regressionRows: readSheetRows(workbook, "rq4_hierarchical_regression"),
      studentRows: readSheetRows(workbook, "scale_scores").filter(
        (row) => safeString(row.groupLabel).toLowerCase() === "experimental" || Number(row.group) === 1,
      ),
    },
    "local-workbook",
  );
}

async function readExperimentRq4Data() {
  try {
    const fileStat = await fs.stat(EXPERIMENT_SIM_V2_FILE);
    const sourceKey = `xlsx:${fileStat.mtimeMs}`;
    if (experimentRq4Cache.sourceKey === sourceKey && experimentRq4Cache.data) {
      return experimentRq4Cache.data;
    }
    const workbook = xlsx.readFile(EXPERIMENT_SIM_V2_FILE);
    const parsed = parseExperimentRq4Workbook(workbook);
    if (parsed?.rq4?.sampleCount) {
      experimentRq4Cache = { sourceKey, data: parsed };
      return parsed;
    }
  } catch {
    // noop
  }
  try {
    const seedStat = await fs.stat(EXPERIMENT_RQ4_SEED_FILE);
    const sourceKey = `seed:${seedStat.mtimeMs}`;
    if (experimentRq4Cache.sourceKey === sourceKey && experimentRq4Cache.data) {
      return experimentRq4Cache.data;
    }
    const raw = await fs.readFile(EXPERIMENT_RQ4_SEED_FILE, "utf8");
    const parsed = normalizeExperimentRq4Payload(JSON.parse(raw), "seed-json");
    if (parsed?.rq4?.sampleCount) {
      experimentRq4Cache = { sourceKey, data: parsed };
      return parsed;
    }
  } catch {
    // noop
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeSafeText(value, fallback = "") {
  const text = safeString(value, fallback).trim();
  if (!text) return fallback;
  if (/^[\x00-\x7F]+$/.test(text)) return text;
  if (/�|闊|璋|瀛|鍏|鎴|绯|缁|璇|鐞/.test(text)) return fallback || text;
  return text;
}

function findEdgeExecutable() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates.find((filePath) => existsSync(filePath)) || "";
}

function mergeStudentKnowledgeStates(records = []) {
  const latestByPoint = new Map();
  for (const record of records) {
    for (const state of getArray(record.knowledgeStates)) {
      const current = latestByPoint.get(state.id);
      if (!current || safeString(record.updatedAt) >= safeString(current.__updatedAt)) {
        latestByPoint.set(state.id, { ...state, __updatedAt: safeString(record.updatedAt) });
      }
    }
  }
  return [...latestByPoint.values()]
    .map(({ __updatedAt, ...item }) => item)
    .sort((a, b) => safeString(a.lessonId).localeCompare(safeString(b.lessonId)) || safeString(a.id).localeCompare(safeString(b.id)));
}

function buildStudentLearningReportData({ analyticsRecords = [], bktRecords = [], userId = "" }) {
  const studentAnalytics = getArray(analyticsRecords).filter((item) => safeString(item.studentId) === userId);
  const studentBktRecords = getArray(bktRecords).filter((item) => safeString(item.userId) === userId);
  const mergedKnowledgeStates = mergeStudentKnowledgeStates(studentBktRecords);
  const knowledgeSummary = summarizeKnowledgeStates(mergedKnowledgeStates);
  const latestAnalytics = [...studentAnalytics].sort((a, b) => safeString(b.updatedAt).localeCompare(safeString(a.updatedAt)))[0] || null;
  const studentLabel = decodeSafeText(latestAnalytics?.studentLabel, safeString(studentBktRecords[0]?.studentLabel, userId));
  const lessonSet = new Set(studentAnalytics.map((item) => safeString(item.lessonId)).filter(Boolean));
  const totalStudyMinutes = studentAnalytics.reduce((sum, item) => sum + Number(item.studyMinutes || 0), 0);
  const homeworkSubmitted = studentAnalytics.filter((item) => item.homeworkSubmitted).length;
  const averageScore = studentAnalytics.length
    ? Math.round(studentAnalytics.reduce((sum, item) => sum + Number(item.score || 0), 0) / studentAnalytics.length)
    : 0;
  const totalInteractions = studentAnalytics.reduce((sum, item) => sum + Number(item.interactions || 0), 0);
  const totalErrors = studentAnalytics.reduce((sum, item) => sum + Number(item.errors || 0), 0);
  const recentRecords = [...studentAnalytics]
    .sort((a, b) => safeString(b.updatedAt).localeCompare(safeString(a.updatedAt)))
    .slice(0, 8)
    .map((item) => ({
      lessonId: safeString(item.lessonId),
      lessonTitle: decodeSafeText(item.lessonTitle, safeString(item.lessonId)),
      section: safeString(item.section),
      score: Number(item.score || 0),
      studyMinutes: Number(item.studyMinutes || 0),
      interactions: Number(item.interactions || 0),
      updatedAt: safeString(item.updatedAt),
    }));
  return {
    generatedAt: nowIso(),
    userId,
    studentLabel,
    lessonsVisited: lessonSet.size,
    totalStudyMinutes,
    homeworkSubmitted,
    averageScore,
    totalInteractions,
    totalErrors,
    averageMastery: knowledgeSummary.averageMastery,
    strongPoints: knowledgeSummary.strongPoints,
    weakPoints: knowledgeSummary.weakPoints,
    knowledgeStates: mergedKnowledgeStates,
    recentRecords,
  };
}

function buildTeacherSampleReportData({ analyticsRecords = [], bktRecords = [] }) {
  const records = getArray(analyticsRecords);
  const bktRows = getArray(bktRecords);
  const studentsMap = new Map();
  const lessonsMap = new Map();
  const latestKnowledgeByStudent = new Map();
  const profileCounter = new Map();

  for (const record of records) {
    const studentId = safeString(record.studentId);
    const studentLabel = decodeSafeText(record.studentLabel, studentId);
    const lessonId = safeString(record.lessonId);
    const lessonTitle = decodeSafeText(record.lessonTitle, lessonId);
    const currentStudent = studentsMap.get(studentId) || {
      studentId,
      studentLabel,
      lessonsVisited: 0,
      averageScore: 0,
      homeworkSubmitted: 0,
      totalStudyMinutes: 0,
      totalErrors: 0,
      totalInteractions: 0,
      latestUpdatedAt: "",
    };
    currentStudent.lessonsVisited += 1;
    currentStudent.averageScore += Number(record.score || 0);
    currentStudent.homeworkSubmitted += record.homeworkSubmitted ? 1 : 0;
    currentStudent.totalStudyMinutes += Number(record.studyMinutes || 0);
    currentStudent.totalErrors += Number(record.errors || 0);
    currentStudent.totalInteractions += Number(record.interactions || 0);
    currentStudent.latestUpdatedAt = safeString(record.updatedAt) > safeString(currentStudent.latestUpdatedAt)
      ? safeString(record.updatedAt)
      : currentStudent.latestUpdatedAt;
    studentsMap.set(studentId, currentStudent);

    const currentLesson = lessonsMap.get(lessonId) || {
      lessonId,
      lessonTitle,
      totalScore: 0,
      activeStudents: 0,
      totalErrors: 0,
    };
    currentLesson.totalScore += Number(record.score || 0);
    currentLesson.activeStudents += 1;
    currentLesson.totalErrors += Number(record.errors || 0);
    lessonsMap.set(lessonId, currentLesson);

    const profileMatch = studentLabel.match(/^(优等型|中等稳定型|偏科型|低参与型)/);
    if (profileMatch) {
      const key = profileMatch[1];
      profileCounter.set(key, Number(profileCounter.get(key) || 0) + 1);
    }
  }

  for (const row of bktRows) {
    const userId = safeString(row.userId);
    const current = latestKnowledgeByStudent.get(userId) || [];
    const merged = mergeStudentKnowledgeStates([
      { knowledgeStates: current },
      row,
    ]);
    latestKnowledgeByStudent.set(userId, merged);
  }

  const studentSummaries = [...studentsMap.values()].map((item) => {
    const knowledgeStates = latestKnowledgeByStudent.get(item.studentId) || [];
    const knowledgeSummary = summarizeKnowledgeStates(knowledgeStates);
    return {
      ...item,
      averageScore: item.lessonsVisited ? Math.round(item.averageScore / item.lessonsVisited) : 0,
      averageMastery: Number(knowledgeSummary.averageMastery || 0),
      masteredCount: knowledgeStates.filter((state) => state.mastered).length,
      weakPoints: knowledgeSummary.weakPoints,
    };
  }).sort((a, b) => safeString(a.studentId).localeCompare(safeString(b.studentId)));

  const allKnowledgeStates = studentSummaries.flatMap((item) =>
    (latestKnowledgeByStudent.get(item.studentId) || []).map((state) => ({
      ...state,
      studentId: item.studentId,
      studentLabel: item.studentLabel,
    })),
  );

  const knowledgePointStatsMap = new Map();
  for (const row of allKnowledgeStates) {
    const current = knowledgePointStatsMap.get(row.id) || {
      id: row.id,
      title: row.title,
      lessonId: row.lessonId,
      totalPL: 0,
      count: 0,
      masteredCount: 0,
    };
    current.totalPL += Number(row.pL || 0);
    current.count += 1;
    current.masteredCount += row.mastered ? 1 : 0;
    knowledgePointStatsMap.set(row.id, current);
  }

  const knowledgePointStats = [...knowledgePointStatsMap.values()]
    .map((item) => ({
      ...item,
      averagePL: item.count ? Number((item.totalPL / item.count).toFixed(3)) : 0,
      masteredRate: item.count ? Number((item.masteredCount / item.count).toFixed(3)) : 0,
    }))
    .sort((a, b) => a.averagePL - b.averagePL);

  const lessons = [...lessonsMap.values()]
    .map((item) => ({
      lessonId: item.lessonId,
      lessonTitle: item.lessonTitle,
      averageScore: item.activeStudents ? Math.round(item.totalScore / item.activeStudents) : 0,
      activeStudents: item.activeStudents,
      totalErrors: item.totalErrors,
    }))
    .sort((a, b) => safeString(a.lessonId).localeCompare(safeString(b.lessonId)));

  const averageMastery = studentSummaries.length
    ? Number((studentSummaries.reduce((sum, item) => sum + Number(item.averageMastery || 0), 0) / studentSummaries.length).toFixed(3))
    : BKT_PARAMS.pL0;

  return {
    generatedAt: nowIso(),
    summary: {
      totalRecords: records.length,
      totalStudents: studentSummaries.length,
      totalHomeworkSubmitted: records.filter((item) => item.homeworkSubmitted).length,
      averageScore: records.length ? Math.round(records.reduce((sum, item) => sum + Number(item.score || 0), 0) / records.length) : 0,
      averageMastery,
      lowMasteryStudents: studentSummaries.filter((item) => Number(item.averageMastery || 0) < 0.45).length,
    },
    profileDistribution: [...profileCounter.entries()].map(([label, count]) => ({ label, count })),
    weakKnowledgePoints: knowledgePointStats.slice(0, 8),
    strongKnowledgePoints: [...knowledgePointStats].sort((a, b) => b.averagePL - a.averagePL).slice(0, 5),
    students: studentSummaries,
    lessons,
    knowledgePointStats,
  };
}

function buildTeacherSampleReportCsv(report) {
  const summaryRows = [
    ["generatedAt", report.generatedAt],
    ["totalRecords", report.summary.totalRecords],
    ["totalStudents", report.summary.totalStudents],
    ["totalHomeworkSubmitted", report.summary.totalHomeworkSubmitted],
    ["averageScore", report.summary.averageScore],
    ["averageMastery", report.summary.averageMastery],
    ["lowMasteryStudents", report.summary.lowMasteryStudents],
  ];
  const studentRows = (report.students || []).map((item) => [
    item.studentId,
    item.studentLabel,
    item.lessonsVisited,
    item.averageScore,
    item.totalStudyMinutes,
    item.totalErrors,
    item.totalInteractions,
    Number(item.averageMastery || 0).toFixed(3),
    item.masteredCount,
    (item.weakPoints || []).map((point) => point.title).join(" / "),
  ]);
  const weakRows = (report.knowledgePointStats || []).map((item) => [
    item.lessonId,
    item.id,
    item.title,
    Number(item.averagePL || 0).toFixed(3),
    Number(item.masteredRate || 0).toFixed(3),
    item.count,
  ]);
  const sections = [
    ["summaryKey", "value"],
    ...summaryRows,
    [],
    ["studentId", "studentLabel", "lessonsVisited", "averageScore", "totalStudyMinutes", "totalErrors", "totalInteractions", "averageMastery", "masteredCount", "weakPoints"],
    ...studentRows,
    [],
    ["lessonId", "knowledgePointId", "knowledgePointTitle", "averagePL", "masteredRate", "sampleCount"],
    ...weakRows,
  ];
  return `\uFEFF${sections.map((row) => row.map((value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n")}\n`;
}

function buildTeacherSampleReportHtml(report) {
  const profileCards = (report.profileDistribution || []).map((item) => `
    <div class="card"><div class="label">${escapeHtml(item.label)}</div><div class="value">${item.count}</div></div>
  `).join("");
  const weakRows = (report.weakKnowledgePoints || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.lessonId)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${Number(item.averagePL || 0).toFixed(3)}</td>
      <td>${Math.round(Number(item.masteredRate || 0) * 100)}%</td>
      <td>${item.count}</td>
    </tr>
  `).join("");
  const studentRows = (report.students || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.studentLabel)}</td>
      <td>${escapeHtml(item.studentId)}</td>
      <td>${item.lessonsVisited}</td>
      <td>${item.averageScore}%</td>
      <td>${item.totalStudyMinutes}</td>
      <td>${Number(item.averageMastery || 0).toFixed(3)}</td>
      <td>${item.masteredCount}</td>
    </tr>
  `).join("");
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>教师样本报告</title>
      <style>
        body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #111; margin: 32px; }
        h1 { font-size: 24px; margin-bottom: 6px; }
        h2 { font-size: 18px; margin: 24px 0 10px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
        .label { color: #666; font-size: 11px; margin-bottom: 4px; }
        .value { font-size: 20px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #e5e5e5; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f7f7f7; }
      </style>
    </head>
    <body>
      <h1>教师样本报告</h1>
      <div class="meta">生成时间：${escapeHtml(report.generatedAt)}</div>
      <div class="grid">
        <div class="card"><div class="label">样本记录数</div><div class="value">${report.summary.totalRecords}</div></div>
        <div class="card"><div class="label">学生数</div><div class="value">${report.summary.totalStudents}</div></div>
        <div class="card"><div class="label">平均得分</div><div class="value">${report.summary.averageScore}%</div></div>
        <div class="card"><div class="label">平均掌握度</div><div class="value">${Number(report.summary.averageMastery || 0).toFixed(3)}</div></div>
      </div>
      <h2>样本画像分布</h2>
      <div class="grid">${profileCards}</div>
      <h2>当前最弱知识点</h2>
      <table>
        <thead><tr><th>课时</th><th>知识点</th><th>平均 P(L)</th><th>mastered 率</th><th>样本数</th></tr></thead>
        <tbody>${weakRows}</tbody>
      </table>
      <h2>学生样本明细</h2>
      <table>
        <thead><tr><th>学生</th><th>ID</th><th>访问课时</th><th>平均得分</th><th>学习分钟</th><th>平均掌握度</th><th>mastered 数</th></tr></thead>
        <tbody>${studentRows}</tbody>
      </table>
    </body>
  </html>`;
}

function buildStudentReportHtml(report) {
  const strongList = report.strongPoints.map((item) => `${escapeHtml(item.title)} (${Number(item.pL || 0).toFixed(3)})`).join(" / ") || "暂无";
  const weakList = report.weakPoints.map((item) => `${escapeHtml(item.title)} (${Number(item.pL || 0).toFixed(3)})`).join(" / ") || "暂无";
  const knowledgeRows = report.knowledgeStates.map((item) => `
    <tr>
      <td>${escapeHtml(item.lessonId)}</td>
      <td>${escapeHtml(item.title)}</td>
      <td>${Number(item.pL || 0).toFixed(3)}</td>
      <td>${item.mastered ? "是" : "否"}</td>
      <td>${escapeHtml(item.difficulty)}</td>
      <td>${Number(item.totalAttempts || 0)}</td>
      <td>${Number(item.totalAttempts || 0) > 0 ? Math.round((Number(item.correctAttempts || 0) / Number(item.totalAttempts || 1)) * 100) : 0}%</td>
    </tr>
  `).join("");
  const recentRows = report.recentRecords.map((item) => `
    <tr>
      <td>${escapeHtml(item.lessonId)}</td>
      <td>${escapeHtml(item.lessonTitle)}</td>
      <td>${escapeHtml(item.section)}</td>
      <td>${item.score}%</td>
      <td>${item.studyMinutes}</td>
      <td>${item.interactions}</td>
      <td>${escapeHtml(item.updatedAt)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(report.studentLabel)} 学习报告</title>
      <style>
        body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #111; margin: 32px; }
        h1 { font-size: 24px; margin-bottom: 6px; }
        h2 { font-size: 18px; margin: 24px 0 10px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 18px; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
        .label { color: #666; font-size: 11px; margin-bottom: 4px; }
        .value { font-size: 20px; font-weight: 700; }
        .summary { line-height: 1.9; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #e5e5e5; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f7f7f7; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(report.studentLabel)} 学习报告</h1>
      <div class="meta">学生 ID：${escapeHtml(report.userId)} ｜ 生成时间：${escapeHtml(report.generatedAt)}</div>
      <div class="grid">
        <div class="card"><div class="label">访问课时数</div><div class="value">${report.lessonsVisited}</div></div>
        <div class="card"><div class="label">平均得分</div><div class="value">${report.averageScore}%</div></div>
        <div class="card"><div class="label">累计学习时长</div><div class="value">${report.totalStudyMinutes} 分钟</div></div>
        <div class="card"><div class="label">平均掌握度</div><div class="value">${Number(report.averageMastery || 0).toFixed(3)}</div></div>
      </div>
      <div class="summary">
        <div><strong>已掌握较好：</strong>${strongList}</div>
        <div><strong>当前薄弱点：</strong>${weakList}</div>
        <div><strong>作业提交次数：</strong>${report.homeworkSubmitted}</div>
        <div><strong>累计交互次数：</strong>${report.totalInteractions}</div>
        <div><strong>累计错误次数：</strong>${report.totalErrors}</div>
      </div>
      <h2>知识点 P(L) 明细</h2>
      <table>
        <thead>
          <tr><th>课时</th><th>知识点</th><th>P(L)</th><th>mastered</th><th>difficulty</th><th>attempts</th><th>accuracy</th></tr>
        </thead>
        <tbody>${knowledgeRows}</tbody>
      </table>
      <h2>最近学习记录</h2>
      <table>
        <thead>
          <tr><th>课时</th><th>标题</th><th>区块</th><th>得分</th><th>学习分钟</th><th>交互次数</th><th>更新时间</th></tr>
        </thead>
        <tbody>${recentRows}</tbody>
      </table>
    </body>
  </html>`;
}

async function generateStudentReportPdf(report) {
  const edgePath = findEdgeExecutable();
  if (!edgePath) {
    throw new Error("Microsoft Edge is not installed on this machine.");
  }
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const safeId = report.userId.replace(/[^\w.-]/g, "_");
  const htmlPath = path.join(REPORTS_DIR, `${safeId}.html`);
  const pdfPath = path.join(REPORTS_DIR, `${safeId}.pdf`);
  await fs.writeFile(htmlPath, buildStudentReportHtml(report), "utf8");
  await execFileAsync(edgePath, [
    "--headless=new",
    "--disable-gpu",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { timeout: 120000 });
  return {
    fileName: `${safeId}.pdf`,
    filePath: pdfPath,
    url: `/generated-reports/${safeId}.pdf`,
  };
}

function summarizeKnowledgeStates(knowledgeStates = []) {
  const rows = getArray(knowledgeStates);
  const sorted = [...rows].sort((a, b) => Number(a.pL || 0) - Number(b.pL || 0));
  return {
    averageMastery: rows.length
      ? Number((rows.reduce((sum, item) => sum + Number(item.pL || 0), 0) / rows.length).toFixed(3))
      : BKT_PARAMS.pL0,
    strongPoints: [...rows]
      .sort((a, b) => Number(b.pL || 0) - Number(a.pL || 0))
      .slice(0, 2)
      .map((item) => ({ id: item.id, title: item.title, pL: Number(item.pL || 0) })),
    weakPoints: sorted.slice(0, 3).map((item) => ({ id: item.id, title: item.title, pL: Number(item.pL || 0) })),
  };
}

function clampPL(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(1, normalized));
}

function getDifficultyTierForPL(pL) {
  const value = clampPL(pL);
  if (value >= 0.75) return "hard";
  if (value >= 0.45) return "medium";
  return "easy";
}

function isValidDifficulty(value) {
  return ["easy", "medium", "hard", "basic", "core", "transfer"].includes(String(value || "").toLowerCase());
}

function validateKnowledgeStatesPayload(knowledgeStates, lessonId) {
  const errors = [];
  if (!Array.isArray(knowledgeStates) || !knowledgeStates.length) {
    return ["knowledgeStates must be a non-empty array."];
  }

  knowledgeStates.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`knowledgeStates[${index}] must be an object.`);
      return;
    }
    const point = KNOWLEDGE_POINTS.find((entry) => entry.id === item.id);
    if (!item.id || !point) {
      errors.push(`knowledgeStates[${index}].id is invalid.`);
      return;
    }
    if (lessonId && point.lessonId !== lessonId) {
      errors.push(`knowledgeStates[${index}].id does not belong to lesson ${lessonId}.`);
    }
    if (!Number.isFinite(Number(item.pL)) || Number(item.pL) < 0 || Number(item.pL) > 1) {
      errors.push(`knowledgeStates[${index}].pL must be a number between 0 and 1.`);
    }
    ["totalAttempts", "correctAttempts", "consecutiveCorrect", "consecutiveIncorrect"].forEach((field) => {
      const value = Number(item[field]);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        errors.push(`knowledgeStates[${index}].${field} must be a non-negative integer.`);
      }
    });
    if (!isValidDifficulty(item.difficulty)) {
      errors.push(`knowledgeStates[${index}].difficulty is invalid.`);
    }
  });

  return errors;
}

function applyBktObservationServer(previousState, isCorrect, params = BKT_PARAMS) {
  const pL = clampPL(previousState.pL ?? params.pL0);
  const pT = clampPL(previousState.pT ?? params.pT);
  const pG = clampPL(previousState.pG ?? params.pG);
  const pS = clampPL(previousState.pS ?? params.pS);

  let posterior;
  if (isCorrect) {
    posterior = (pL * (1 - pS)) / ((pL * (1 - pS)) + ((1 - pL) * pG));
  } else {
    posterior = (pL * pS) / ((pL * pS) + ((1 - pL) * (1 - pG)));
  }
  return clampPL(posterior + ((1 - posterior) * pT));
}

function createInitialScenarioState(point, params = BKT_PARAMS) {
  return {
    id: point.id,
    title: point.title,
    lessonId: point.lessonId,
    chapterId: point.chapterId,
    pL: params.pL0,
    pT: params.pT,
    pG: params.pG,
    pS: params.pS,
    totalAttempts: 0,
    correctAttempts: 0,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    mastered: false,
    difficulty: getDifficultyTierForPL(params.pL0),
    history: [],
    lastPracticed: null,
  };
}

function updateScenarioState(current, isCorrect, question, params = BKT_PARAMS) {
  const nextPL = applyBktObservationServer(current, isCorrect, params);
  const nextDifficulty = getDifficultyTierForPL(nextPL);
  return {
    ...current,
    pL: Number(nextPL.toFixed(3)),
    totalAttempts: current.totalAttempts + 1,
    correctAttempts: current.correctAttempts + (isCorrect ? 1 : 0),
    consecutiveCorrect: isCorrect ? current.consecutiveCorrect + 1 : 0,
    consecutiveIncorrect: isCorrect ? 0 : current.consecutiveIncorrect + 1,
    mastered: nextPL >= params.masteryThreshold,
    difficulty: nextDifficulty,
    lastPracticed: nowIso(),
    history: [
      ...(Array.isArray(current.history) ? current.history.slice(-29) : []),
      {
        questionId: question.id,
        questionType: question.questionType,
        evidenceWeight: question.evidenceWeight,
        correct: isCorrect,
        at: nowIso(),
      },
    ],
  };
}

function buildQuestionPoolByKnowledgePoint() {
  const mapping = {};
  for (const question of FORMAL_QUESTION_BANK) {
    if (!question.knowledgePointId) continue;
    if (!mapping[question.knowledgePointId]) mapping[question.knowledgePointId] = [];
    mapping[question.knowledgePointId].push(question);
  }
  return mapping;
}

function isStrongEvidenceQuestion(question) {
  if (!question) return false;
  if (String(question.evidenceWeight) !== "strong") return false;
  return !["exercise-type-match"].includes(String(question.questionType));
}

function buildQuestionBankRiskSummary() {
  const byPoint = buildQuestionPoolByKnowledgePoint();
  return getBktKnowledgePoints().map((point) => {
    const questions = byPoint[point.id] || [];
    const strongQuestions = questions.filter(isStrongEvidenceQuestion);
    const questionTypes = [...new Set(questions.map((item) => item.questionType).filter(Boolean))];
    const risks = [];
    if (strongQuestions.length < 10) risks.push("强证据题偏少");
    if (questionTypes.length < 4) risks.push("题型覆盖偏窄");
    if (/综合复习/.test(point.title)) risks.push("复习知识点过宽，易推高掌握度");
    return {
      knowledgePointId: point.id,
      title: point.title,
      totalQuestions: questions.length,
      strongQuestions: strongQuestions.length,
      questionTypes,
      risks,
    };
  });
}

function chooseScenarioQuestion(point, questionPoolByPoint, attemptIndex) {
  const pool = (questionPoolByPoint[point.id] || []).filter(isStrongEvidenceQuestion);
  const source = pool.length ? pool : (questionPoolByPoint[point.id] || []);
  return source[attemptIndex % source.length];
}

function getScenarioKnowledgeBias(profile, point, variant = 0) {
  const isRhythm = /节奏|音值|附点|连音|切分|拍号|复拍子|单拍子/.test(point.title);
  const isNotation = /谱号|谱表|五线谱|记谱|装饰音/.test(point.title);
  if (profile === "imbalanced") {
    if (variant % 2 === 0) {
      return isRhythm ? 0.9 : isNotation ? 0.28 : 0.55;
    }
    return isNotation ? 0.9 : isRhythm ? 0.28 : 0.55;
  }
  if (profile === "excellent") return 0.8;
  if (profile === "steady") return 0.6;
  if (profile === "lowengage") return 0.4;
  return 0.6;
}

function getScenarioPointWeight(profile, point, index, variant = 0) {
  const isRhythm = /节奏|音值|附点|连音|切分|拍号|复拍子|单拍子/.test(point.title);
  const isNotation = /谱号|谱表|记谱|五线谱|装饰音/.test(point.title);

  if (profile === "excellent") {
    return index % 6 === 0 ? 1.12 : 0.96;
  }
  if (profile === "steady") {
    return index % 2 === 0 ? 1.08 : 0.92;
  }
  if (profile === "lowengage") {
    return index % 3 === 0 ? 1.02 : 0.88;
  }
  if (profile === "imbalanced") {
    if (variant % 2 === 0) {
      if (isRhythm) return 1.6;
      if (isNotation) return 0.12;
      return 0.35;
    }
    if (isNotation) return 1.6;
    if (isRhythm) return 0.12;
    return 0.35;
  }
  return 1.0;
}

function buildScenarioWeightedPoints(profile, variant = 0) {
  const weighted = [];
  getBktKnowledgePoints().forEach((point, index) => {
    const repeats = Math.max(1, Math.round(getScenarioPointWeight(profile, point, index, variant) * 10));
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      weighted.push(point);
    }
  });
  return weighted;
}

function buildScenarioResult({ scenarioId, label, profile, accuracyTarget, durationMinutes, questionCount, variant = 0, params = BKT_PARAMS }) {
  const bktPoints = getBktKnowledgePoints();
  const pointStates = Object.fromEntries(bktPoints.map((point) => [point.id, createInitialScenarioState(point, params)]));
  const pointAttempts = Object.fromEntries(bktPoints.map((point) => [point.id, 0]));
  const questionPoolByPoint = buildQuestionPoolByKnowledgePoint();
  const weightedPoints = buildScenarioWeightedPoints(profile, variant);
  let difficultyUpgradeCount = 0;

  for (let index = 0; index < questionCount; index += 1) {
    const point = weightedPoints[(index * 7 + variant) % weightedPoints.length];
    const current = pointStates[point.id];
    const question = chooseScenarioQuestion(point, questionPoolByPoint, pointAttempts[point.id]);
    pointAttempts[point.id] += 1;
    const bias = getScenarioKnowledgeBias(profile, point, variant);
    const attemptWeight = index / Math.max(1, questionCount - 1);
    const effectiveAccuracy = Math.max(0.05, Math.min(0.98, (accuracyTarget * 0.7) + (bias * 0.3) + (attemptWeight * 0.04)));
    const isCorrect = ((index + point.id.length + variant) % 100) < Math.round(effectiveAccuracy * 100);
    const previousDifficulty = current.difficulty;
    const nextState = updateScenarioState(current, isCorrect, question || { id: `synthetic-${index}`, questionType: "synthetic", evidenceWeight: "strong" }, params);
    pointStates[point.id] = nextState;
    const previousRank = previousDifficulty === "easy" ? 0 : previousDifficulty === "medium" ? 1 : 2;
    const nextRank = nextState.difficulty === "easy" ? 0 : nextState.difficulty === "medium" ? 1 : 2;
    if (nextRank > previousRank) difficultyUpgradeCount += 1;
  }

  const knowledgeStates = bktPoints.map((point) => pointStates[point.id]);
  const summary = summarizeKnowledgeStates(knowledgeStates);
  const masteredCount = knowledgeStates.filter((item) => item.mastered).length;
  const avgPL = summary.averageMastery;
  const expectations = [];

  if (profile === "excellent" && (masteredCount < 18 || masteredCount > 22)) {
    expectations.push("优等型 mastered 数量未落在 18-22 范围");
  }
  if (profile === "steady" && (masteredCount < 10 || masteredCount > 15)) {
    expectations.push("中等稳定型 mastered 数量未落在 10-15 范围");
  }
  if (profile === "lowengage" && (masteredCount < 0 || masteredCount > 5)) {
    expectations.push("低参与型 mastered 数量未落在 0-5 范围");
  }
  if (profile === "imbalanced") {
    const sorted = [...knowledgeStates].sort((a, b) => a.pL - b.pL);
    const spread = Number((sorted[sorted.length - 1].pL - sorted[0].pL).toFixed(3));
    if (spread < 0.45) {
      expectations.push("偏科型知识点分化不明显");
    }
  }

  return {
    scenarioId,
    label,
    profile,
    accuracyTarget,
    durationMinutes,
    questionCount,
    averagePL: avgPL,
    masteredCount,
    difficultyUpgradeCount,
    strongPoints: summary.strongPoints,
    weakPoints: summary.weakPoints,
    knowledgeStates: knowledgeStates.map((item) => ({
      id: item.id,
      title: item.title,
      lessonId: item.lessonId,
      chapterId: item.chapterId,
      pL: Number(item.pL.toFixed(3)),
      mastered: item.mastered,
      difficulty: item.difficulty,
      totalAttempts: item.totalAttempts,
      correctAttempts: item.correctAttempts,
      accuracy: item.totalAttempts ? Number((item.correctAttempts / item.totalAttempts).toFixed(3)) : 0,
    })),
    passed: expectations.length === 0,
    issues: expectations,
  };
}

function buildScenarioJudgement(results) {
  const byProfile = Object.fromEntries(results.map((item) => [item.profile, item]));
  const averages = results.map((item) => Number(item.averagePL || 0));
  const spread = averages.length ? Math.max(...averages) - Math.min(...averages) : 0;
  const issues = [];
  const suggestions = [];

  if (spread < 0.2) {
    issues.push("四类学生平均 P(L) 差异小于 0.2，区分度不足。");
  }
  if (byProfile.lowengage && byProfile.lowengage.masteredCount > 5) {
    issues.push("低参与型仍 mastered 过多知识点，算法过于宽松。");
    suggestions.push("优先检查 P(G) 和 P(T)，建议先把 P(G) 调低到 0.20。");
  }
  if (byProfile.excellent && byProfile.excellent.masteredCount < 18) {
    issues.push("优等型学生也难以 mastered，多数知识点提升不足。");
    suggestions.push("优先检查 P(T) 或 P(S)，建议先把 P(T) 提高到 0.20。");
  }
  if (byProfile.excellent && byProfile.excellent.masteredCount > 22) {
    issues.push("优等型 mastered 过多，可能过快收敛。");
    suggestions.push("优先检查 P(T) 或 mastered 阈值，建议先把 P(T) 调低到 0.10。");
  }
  if (!suggestions.length) {
    suggestions.push("当前参数表现基本符合预期，可继续观察真实学生数据。");
  }

  return {
    passed: issues.length === 0,
    averageSpread: Number(spread.toFixed(3)),
    issues,
    suggestions,
  };
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickWeightedValue(rng, items, getWeight) {
  const normalized = items
    .map((item, index) => ({ item, weight: Math.max(0.0001, Number(getWeight(item, index) || 0)) }))
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
  const total = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * total;
  for (const entry of normalized) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return normalized[normalized.length - 1]?.item;
}

function getTeacherPerspectiveTool(pointTitle = "", averagePL = 0) {
  if (/节奏|音值|附点|连音|切分|拍号|复拍子|单拍子/.test(pointTitle)) {
    return averagePL < 0.45 ? "课堂练习 + 音乐创作实验室" : "课堂练习";
  }
  if (/谱号|谱表|记谱|五线谱|中央 C|音组/.test(pointTitle)) {
    return "课时内容 PPT + AI 导师";
  }
  if (/术语|力度|奏法|装饰音|回音|倚音|颤音|波音/.test(pointTitle)) {
    return "AI 导师 + 课时内容 PPT";
  }
  return averagePL < 0.45 ? "课前预习导图 + AI 导师" : "课前预习导图 + 课堂练习";
}

function buildStudentFeedback({ profile, summary, rng }) {
  const weakest = summary.weakPoints?.slice(0, 2) || [];
  const strongest = summary.strongPoints?.slice(0, 1) || [];
  const topWeakTitle = weakest[0]?.title || "基础概念";
  const preferredTool = getTeacherPerspectiveTool(topWeakTitle, summary.averageMastery);
  const bugPool = preferredTool.includes("AI 导师")
    ? ["AI 导师高峰期回复偏慢", "拍照上传后分析等待较久", "连续提问时偶尔提示网络超时"]
    : preferredTool.includes("音乐创作实验室")
      ? ["节奏编辑器手机端按钮偏小，容易误触", "实验室首次加载钢琴音源较慢", "切换页面后节奏播放偶尔需要再次点击"]
      : preferredTool.includes("PPT")
        ? ["PPT 图片首次翻页偶尔加载偏慢", "连续快速翻页时有短暂空白", "个别图片在弱网下出现延迟加载"]
        : ["知识导图节点较多时需要再适应", "课前预习与课堂练习切换后定位不够直观", "长页面回到顶部时操作稍慢"];
  const confusionTemplates = [
    `我最困惑的是“${topWeakTitle}”，主要是规则容易和相近知识点混淆。`,
    `目前最容易卡住的是“${topWeakTitle}”，尤其是题目一变化就不够稳定。`,
    `“${topWeakTitle}”是我最不确定的部分，概念记住了但应用还不稳。`,
  ];
  const positiveTemplates = strongest.length
    ? [
        `我觉得“${strongest[0].title}”掌握得最好，说明当前练习分层是有效的。`,
        `目前最有把握的是“${strongest[0].title}”，相关题目基本能稳定完成。`,
      ]
    : ["当前还没有特别稳定的强项，需要继续练习。"]; 

  return {
    mostConfused: weakest.map((item) => item.title),
    preferredTool,
    reportedBug: bugPool[Math.floor(rng() * bugPool.length)],
    confusionReport: confusionTemplates[Math.floor(rng() * confusionTemplates.length)],
    positiveReport: positiveTemplates[Math.floor(rng() * positiveTemplates.length)],
  };
}

function buildRandomStudentTrajectory({ studentIndex, params = BKT_PARAMS }) {
  const profileOptions = [
    { profile: "excellent", label: "优等型", baseAccuracy: [0.76, 0.86], durationRange: [95, 120], questionRange: [180, 230], weight: 0.18 },
    { profile: "steady", label: "中等稳定型", baseAccuracy: [0.55, 0.68], durationRange: [90, 120], questionRange: [170, 220], weight: 0.42 },
    { profile: "imbalanced", label: "偏科型", baseAccuracy: [0.54, 0.68], durationRange: [90, 120], questionRange: [170, 220], weight: 0.20 },
    { profile: "lowengage", label: "低参与型", baseAccuracy: [0.32, 0.46], durationRange: [60, 95], questionRange: [90, 170], weight: 0.20 },
  ];
  const rng = createSeededRandom(hashString(`deep-student-${studentIndex}-${params.pT}-${params.pG}-${params.pS}`));
  const selected = pickWeightedValue(rng, profileOptions, (item) => item.weight);
  const accuracyTarget = Number((selected.baseAccuracy[0] + (selected.baseAccuracy[1] - selected.baseAccuracy[0]) * rng()).toFixed(3));
  const durationMinutes = Math.round(selected.durationRange[0] + (selected.durationRange[1] - selected.durationRange[0]) * rng());
  const questionCount = Math.round(selected.questionRange[0] + (selected.questionRange[1] - selected.questionRange[0]) * rng());
  const variant = Math.floor(rng() * 4);
  const bktPoints = getBktKnowledgePoints();
  const pointStates = Object.fromEntries(bktPoints.map((point) => [point.id, createInitialScenarioState(point, params)]));
  const pointAttempts = Object.fromEntries(bktPoints.map((point) => [point.id, 0]));
  const questionPoolByPoint = buildQuestionPoolByKnowledgePoint();
  let difficultyUpgradeCount = 0;

  for (let index = 0; index < questionCount; index += 1) {
    const point = pickWeightedValue(rng, bktPoints, (item, pointIndex) => getScenarioPointWeight(selected.profile, item, pointIndex, variant));
    const current = pointStates[point.id];
    const question = chooseScenarioQuestion(point, questionPoolByPoint, pointAttempts[point.id]);
    pointAttempts[point.id] += 1;
    const bias = getScenarioKnowledgeBias(selected.profile, point, variant);
    const progressFactor = index / Math.max(1, questionCount - 1);
    const jitter = (rng() - 0.5) * 0.08;
    const effectiveAccuracy = Math.max(0.03, Math.min(0.97, (accuracyTarget * 0.68) + (bias * 0.26) + (progressFactor * 0.06) + jitter));
    const isCorrect = rng() < effectiveAccuracy;
    const previousRank = current.difficulty === "easy" ? 0 : current.difficulty === "medium" ? 1 : 2;
    const nextState = updateScenarioState(current, isCorrect, question || { id: `random-${index}`, questionType: "synthetic", evidenceWeight: "strong" }, params);
    pointStates[point.id] = nextState;
    const nextRank = nextState.difficulty === "easy" ? 0 : nextState.difficulty === "medium" ? 1 : 2;
    if (nextRank > previousRank) difficultyUpgradeCount += 1;
  }

  const knowledgeStates = bktPoints.map((point) => pointStates[point.id]).map((item) => ({
    id: item.id,
    title: item.title,
    lessonId: item.lessonId,
    chapterId: item.chapterId,
    pL: Number(item.pL.toFixed(3)),
    mastered: item.mastered,
    difficulty: item.difficulty,
    totalAttempts: item.totalAttempts,
    correctAttempts: item.correctAttempts,
    accuracy: item.totalAttempts ? Number((item.correctAttempts / item.totalAttempts).toFixed(3)) : 0,
  }));
  const summary = summarizeKnowledgeStates(knowledgeStates);
  const feedback = buildStudentFeedback({ profile: selected.profile, summary, rng });

  return {
    userId: `deep-${String(studentIndex).padStart(3, "0")}`,
    studentLabel: `${selected.label}学生 ${String(studentIndex).padStart(3, "0")}`,
    profile: selected.profile,
    accuracyTarget,
    durationMinutes,
    questionCount,
    difficultyUpgradeCount,
    averagePL: summary.averageMastery,
    masteredCount: knowledgeStates.filter((item) => item.mastered).length,
    strongPoints: summary.strongPoints,
    weakPoints: summary.weakPoints,
    knowledgeStates,
    ...feedback,
  };
}

function summarizeDeepSimulation(students = []) {
  const profileSummary = {};
  const confusionMap = new Map();
  const toolMap = new Map();
  const bugMap = new Map();
  const knowledgePointMap = new Map();

  for (const student of students) {
    profileSummary[student.profile] = (profileSummary[student.profile] || 0) + 1;
    for (const title of student.mostConfused || []) {
      confusionMap.set(title, (confusionMap.get(title) || 0) + 1);
    }
    toolMap.set(student.preferredTool, (toolMap.get(student.preferredTool) || 0) + 1);
    bugMap.set(student.reportedBug, (bugMap.get(student.reportedBug) || 0) + 1);
    for (const point of student.knowledgeStates || []) {
      if (!knowledgePointMap.has(point.id)) {
        knowledgePointMap.set(point.id, {
          id: point.id,
          title: point.title,
          lessonId: point.lessonId,
          chapterId: point.chapterId,
          totalPL: 0,
          masteredCount: 0,
          learners: 0,
        });
      }
      const bucket = knowledgePointMap.get(point.id);
      bucket.totalPL += Number(point.pL || 0);
      bucket.learners += 1;
      if (point.mastered) bucket.masteredCount += 1;
    }
  }

  const averagePL = students.length
    ? Number((students.reduce((sum, item) => sum + Number(item.averagePL || 0), 0) / students.length).toFixed(3))
    : 0;
  const averageMastered = students.length
    ? Number((students.reduce((sum, item) => sum + Number(item.masteredCount || 0), 0) / students.length).toFixed(2))
    : 0;

  return {
    totalStudents: students.length,
    averagePL,
    averageMastered,
    profileSummary,
    knowledgePointAverages: [...knowledgePointMap.values()]
      .map((item) => ({
        id: item.id,
        title: item.title,
        lessonId: item.lessonId,
        chapterId: item.chapterId,
        averagePL: Number((item.totalPL / Math.max(1, item.learners)).toFixed(3)),
        masteredRate: Number((item.masteredCount / Math.max(1, item.learners)).toFixed(3)),
        learners: item.learners,
      }))
      .sort((a, b) => a.averagePL - b.averagePL),
    topConfusions: [...confusionMap.entries()].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    topPreferredTools: [...toolMap.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    topReportedBugs: [...bugMap.entries()].map(([bug, count]) => ({ bug, count })).sort((a, b) => b.count - a.count).slice(0, 6),
  };
}

function buildDeepSimulationResult({ studentCount = 150, params = BKT_PARAMS }) {
  const students = Array.from({ length: studentCount }, (_, index) => buildRandomStudentTrajectory({ studentIndex: index + 1, params }));
  return {
    runAt: nowIso(),
    params,
    studentCount,
    summary: summarizeDeepSimulation(students),
    students,
  };
}

function buildTeacherBktOverview(records = []) {
  const normalized = getArray(records);
  const studentMap = new Map();
  const pointMap = new Map();

  for (const record of normalized) {
    const knowledgeStates = getArray(record.knowledgeStates);
    const summary = summarizeKnowledgeStates(knowledgeStates);
    studentMap.set(record.userId, {
      userId: record.userId,
      studentLabel: record.studentLabel || record.userId,
      lessonId: record.lessonId,
      averageMastery: summary.averageMastery,
      weakPoints: summary.weakPoints,
      recommendation: safeString(record.recommendation),
      updatedAt: safeString(record.updatedAt),
      source: safeString(record.source),
      knowledgeStates,
    });

    for (const state of knowledgeStates) {
      const current = pointMap.get(state.id) || {
        id: state.id,
        title: safeString(state.title, state.id),
        lessonId: safeString(state.lessonId),
        chapterId: safeString(state.chapterId),
        learners: 0,
        averageMastery: 0,
        masteredCount: 0,
      };
      current.learners += 1;
      current.averageMastery += Number(state.pL || 0);
      current.masteredCount += state.mastered ? 1 : 0;
      pointMap.set(state.id, current);
    }
  }

  const students = [...studentMap.values()].sort((a, b) => Number(a.averageMastery || 0) - Number(b.averageMastery || 0));
  const weakKnowledgePoints = [...pointMap.values()]
    .map((item) => ({
      ...item,
      averageMastery: item.learners ? Number((item.averageMastery / item.learners).toFixed(3)) : BKT_PARAMS.pL0,
      masteryRate: item.learners ? Number((item.masteredCount / item.learners).toFixed(3)) : 0,
    }))
    .sort((a, b) => Number(a.averageMastery || 0) - Number(b.averageMastery || 0));

  return {
    summary: {
      totalStudents: students.length,
      totalKnowledgePoints: weakKnowledgePoints.length,
      averageMastery: students.length
        ? Number((students.reduce((sum, item) => sum + Number(item.averageMastery || 0), 0) / students.length).toFixed(3))
        : BKT_PARAMS.pL0,
      lowMasteryStudents: students.filter((item) => Number(item.averageMastery || 0) < 0.45).length,
    },
    students,
    weakKnowledgePoints: weakKnowledgePoints.slice(0, 24),
    questionBankRisks: buildQuestionBankRiskSummary(),
  };
}

function createVirtualStudentBktProfiles() {
  const groups = [
    { prefix: "excellent", label: "优等型", range: [0.82, 0.96] },
    { prefix: "steady", label: "中等稳定型", range: [0.56, 0.78] },
    { prefix: "imbalanced", label: "偏科型", range: [0.35, 0.9] },
    { prefix: "lowengage", label: "低参与型", range: [0.18, 0.46] },
  ];

  const records = [];
  let index = 1;
  for (const group of groups) {
    for (let offset = 0; offset < 3; offset += 1) {
      const userId = `virtual-${String(index).padStart(2, "0")}`;
      const lessonIds = [...new Set(KNOWLEDGE_POINTS.map((item) => item.lessonId))];
      for (const lessonId of lessonIds) {
        const points = getKnowledgePointsForLesson(lessonId);
        const knowledgeStates = points.map((point, pointIndex) => {
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
            pL = min + (((index + pointIndex) % 7) / 6) * (max - min);
          }
          pL = Number(Math.max(0.05, Math.min(0.98, pL)).toFixed(3));
          const totalAttempts = group.prefix === "lowengage" ? 1 + ((index + pointIndex) % 2) : 4 + ((index + pointIndex) % 4);
          const correctAttempts = Math.max(0, Math.round(totalAttempts * pL));
          return {
            id: point.id,
            title: point.title,
            lessonId: point.lessonId,
            chapterId: point.chapterId,
            pL,
            difficulty: pL >= 0.75 ? "hard" : pL >= 0.45 ? "medium" : "easy",
            totalAttempts,
            correctAttempts,
            consecutiveCorrect: pL >= 0.75 ? 2 : 0,
            consecutiveIncorrect: pL < 0.45 ? 2 : 0,
            lastPracticed: new Date(Date.now() - (pointIndex * 3600 * 1000)).toISOString(),
            mastered: pL >= 0.8,
          };
        });
        const summary = summarizeKnowledgeStates(knowledgeStates);
        records.push({
          userId,
          studentLabel: `${group.label}学生 ${offset + 1}`,
          lessonId,
          source: "virtual-student",
          recommendation: summary.weakPoints[0]
            ? `优先巩固“${summary.weakPoints[0].title}”，再进入下一课时。`
            : "继续完成当前学习任务。",
          strongPoints: summary.strongPoints,
          weakPoints: summary.weakPoints,
          averageMastery: summary.averageMastery,
          knowledgeStates,
          updatedAt: nowIso(),
        });
      }
      index += 1;
    }
  }
  return records;
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
    visionModelChain: provider === "openai" && isDashScopeCompatibleMode() ? getVisionModelChain() : undefined,
    asrModel: provider === "openai" && isDashScopeCompatibleMode() ? getDashScopeAsrModel() : undefined,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    openaiBaseUrl: provider === "openai" ? (getOpenAIBaseUrl() || "https://api.openai.com/v1") : undefined,
    openaiCompatibleMode: provider === "openai" ? isOpenAICompatibleMode() : undefined,
    tutorModel: provider === "openai" ? getTutorModel() : undefined,
    tutorModelChain: provider === "openai" ? getTutorModelChain() : undefined,
    defaultModelChain: provider === "openai" ? getDefaultTextModelChain() : undefined,
    homeworkModelChain: provider === "openai" ? getHomeworkModelChain(false) : undefined,
    homeworkVisionModelChain: provider === "openai" ? getHomeworkModelChain(true) : undefined,
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
    homeworkRhythmData: payload.homeworkRhythmData && typeof payload.homeworkRhythmData === "object" ? normalizeRhythmSubmission(payload.homeworkRhythmData) : null,
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

app.post("/api/bkt/sync", async (req, res) => {
  const payload = req.body || {};
  if (!payload.userId || !payload.lessonId) {
    return res.status(400).json({ ok: false, error: "userId and lessonId are required." });
  }

  const validationErrors = validateKnowledgeStatesPayload(payload.knowledgeStates, String(payload.lessonId));
  if (validationErrors.length) {
    return res.status(400).json({
      ok: false,
      error: "Invalid knowledgeStates payload.",
      details: validationErrors,
    });
  }

  const store = await readBktSummaryStore();
  const knowledgeStates = getArray(payload.knowledgeStates)
    .map((item) => ({
      id: String(item.id),
      title: safeString(item.title),
      lessonId: safeString(item.lessonId || payload.lessonId),
      chapterId: safeString(item.chapterId),
      pL: clampPL(item.pL),
      difficulty: getDifficultyTierForPL(item.pL),
      totalAttempts: Number(item.totalAttempts || 0),
      correctAttempts: Number(item.correctAttempts || 0),
      consecutiveCorrect: Number(item.consecutiveCorrect || 0),
      consecutiveIncorrect: Number(item.consecutiveIncorrect || 0),
      mastered: clampPL(item.pL) >= BKT_PARAMS.masteryThreshold,
      lastPracticed: safeString(item.lastPracticed),
    }));

  const summary = summarizeKnowledgeStates(knowledgeStates);
  const record = {
    userId: String(payload.userId),
    studentLabel: safeString(payload.studentLabel, payload.userId),
    lessonId: String(payload.lessonId),
    source: safeString(payload.source, "frontend-localstorage"),
    recommendation: safeString(payload.recommendation, ""),
    averageMastery: Number(payload.averageMastery || summary.averageMastery),
    strongPoints: getArray(payload.strongPoints).length ? getArray(payload.strongPoints) : summary.strongPoints,
    weakPoints: getArray(payload.weakPoints).length ? getArray(payload.weakPoints) : summary.weakPoints,
    knowledgeStates,
    updatedAt: nowIso(),
  };

  const existingIndex = store.records.findIndex((item) => item.userId === record.userId && item.lessonId === record.lessonId);
  if (existingIndex >= 0) {
    store.records[existingIndex] = { ...store.records[existingIndex], ...record };
  } else {
    store.records.push(record);
  }

  await writeBktSummaryStore(store);
  return res.json({ ok: true, record });
});

app.post("/api/bkt/reset", async (req, res) => {
  const store = await readBktSummaryStore();
  store.records = store.records.filter((item) => !String(item.userId || "").startsWith("virtual-"));
  store.simulatedStudents = [];
  await writeBktSummaryStore(store);
  return res.json({ ok: true });
});

app.post("/api/bkt/simulate", async (req, res) => {
  const store = await readBktSummaryStore();
  store.records = store.records.filter((item) => !String(item.userId || "").startsWith("virtual-"));
  const simulatedRecords = createVirtualStudentBktProfiles();
  store.records.push(...simulatedRecords);
  store.simulatedStudents = [...new Set(simulatedRecords.map((item) => item.userId))];
  await writeBktSummaryStore(store);
  return res.json({
    ok: true,
    generatedStudents: store.simulatedStudents.length,
    records: simulatedRecords.length,
  });
});

app.post("/api/bkt/test/run", async (req, res) => {
  const payload = req.body || {};
  const durationMinutes = Number(payload.durationMinutes || 120);
  const questionCount = Number(payload.questionCount || 200);
  const params = {
    pL0: Number.isFinite(Number(payload.params?.pL0)) ? Number(payload.params.pL0) : BKT_PARAMS.pL0,
    pT: Number.isFinite(Number(payload.params?.pT)) ? Number(payload.params.pT) : BKT_PARAMS.pT,
    pG: Number.isFinite(Number(payload.params?.pG)) ? Number(payload.params.pG) : BKT_PARAMS.pG,
    pS: Number.isFinite(Number(payload.params?.pS)) ? Number(payload.params.pS) : BKT_PARAMS.pS,
    masteryThreshold: Number.isFinite(Number(payload.params?.masteryThreshold))
      ? Number(payload.params.masteryThreshold)
      : BKT_PARAMS.masteryThreshold,
  };
  const scenarios = [
    { scenarioId: "excellent-2h", label: "场景 1 · 优等生轨迹", profile: "excellent", accuracyTarget: 0.8, durationMinutes, questionCount, variant: 0, params },
    { scenarioId: "steady-2h", label: "场景 2 · 中等生轨迹", profile: "steady", accuracyTarget: 0.6, durationMinutes, questionCount, variant: 0, params },
    { scenarioId: "lowengage-2h", label: "场景 3 · 学困生轨迹", profile: "lowengage", accuracyTarget: 0.4, durationMinutes, questionCount, variant: 0, params },
    { scenarioId: "imbalanced-2h", label: "场景 4 · 偏科生轨迹", profile: "imbalanced", accuracyTarget: 0.6, durationMinutes, questionCount, variant: 0, params },
  ];
  const results = scenarios.map((scenario) => buildScenarioResult(scenario));
  const judgement = buildScenarioJudgement(results);
  const riskSummary = buildQuestionBankRiskSummary();
  const testStore = await readBktTestStore();
  const latestRun = {
    runAt: nowIso(),
    params: {
      durationMinutes,
      questionCount,
      bkt: params,
    },
    results,
    judgement,
    questionBankRisks: riskSummary,
  };
  testStore.latestRun = latestRun;
  testStore.history = [latestRun, ...(testStore.history || []).slice(0, 4)];
  await writeBktTestStore(testStore);
  return res.json({ ok: true, ...latestRun });
});

app.get("/api/bkt/test/latest", async (req, res) => {
  const store = await readBktTestStore();
  return res.json({
    ok: true,
    latestRun: store.latestRun,
    historyCount: Array.isArray(store.history) ? store.history.length : 0,
  });
});

app.post("/api/bkt/test/reset", async (req, res) => {
  await writeBktTestStore({ latestRun: null, history: [], latestDeepRun: null, deepHistory: [] });
  return res.json({ ok: true });
});

app.post("/api/bkt/test/deep-run", async (req, res) => {
  const payload = req.body || {};
  const studentCount = Math.max(1, Math.min(500, Number(payload.studentCount || 150)));
  const params = {
    pL0: Number.isFinite(Number(payload.params?.pL0)) ? Number(payload.params.pL0) : BKT_PARAMS.pL0,
    pT: Number.isFinite(Number(payload.params?.pT)) ? Number(payload.params.pT) : BKT_PARAMS.pT,
    pG: Number.isFinite(Number(payload.params?.pG)) ? Number(payload.params.pG) : BKT_PARAMS.pG,
    pS: Number.isFinite(Number(payload.params?.pS)) ? Number(payload.params.pS) : BKT_PARAMS.pS,
    masteryThreshold: Number.isFinite(Number(payload.params?.masteryThreshold))
      ? Number(payload.params.masteryThreshold)
      : BKT_PARAMS.masteryThreshold,
  };
  const deepRun = buildDeepSimulationResult({ studentCount, params });
  const testStore = await readBktTestStore();
  testStore.latestDeepRun = deepRun;
  testStore.deepHistory = [deepRun, ...(testStore.deepHistory || []).slice(0, 4)];
  await writeBktTestStore(testStore);
  return res.json({ ok: true, ...deepRun });
});

app.get("/api/bkt/test/deep-latest", async (req, res) => {
  const store = await readBktTestStore();
  return res.json({
    ok: true,
    latestDeepRun: store.latestDeepRun,
    historyCount: Array.isArray(store.deepHistory) ? store.deepHistory.length : 0,
  });
});

app.get("/api/teacher/bkt-overview", async (req, res) => {
  const store = await readBktSummaryStore();
  const testStore = await readBktTestStore();
  return res.json({
    ok: true,
    ...buildTeacherBktOverview(store.records),
    simulatedStudents: store.simulatedStudents,
    latestTestRun: testStore.latestRun,
    latestDeepRun: testStore.latestDeepRun,
  });
});

app.post("/api/teacher/init-samples", async (req, res) => {
  let analyticsSeed = { records: [] };
  let bktSeed = { records: [], mappings: {}, simulatedStudents: [] };
  try {
    const [analyticsRaw, bktRaw] = await Promise.all([
      fs.readFile(ANALYTICS_SEED_FILE, "utf8"),
      fs.readFile(BKT_SUMMARY_SEED_FILE, "utf8"),
    ]);
    const parsedAnalytics = JSON.parse(analyticsRaw);
    const parsedBkt = JSON.parse(bktRaw);
    analyticsSeed = Array.isArray(parsedAnalytics.records) ? parsedAnalytics : { records: [] };
    bktSeed = {
      records: Array.isArray(parsedBkt.records) ? parsedBkt.records : [],
      mappings: parsedBkt.mappings && typeof parsedBkt.mappings === "object" ? parsedBkt.mappings : {},
      simulatedStudents: Array.isArray(parsedBkt.simulatedStudents) ? parsedBkt.simulatedStudents : [],
    };
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error?.message, "无法读取教师样本种子数据。") });
  }

  const writeErrors = [];
  try {
    await writeAnalyticsStore(analyticsSeed);
  } catch (error) {
    writeErrors.push(`analytics: ${safeString(error?.message, "write-failed")}`);
  }
  try {
    await writeBktSummaryStore(bktSeed);
  } catch (error) {
    writeErrors.push(`bkt: ${safeString(error?.message, "write-failed")}`);
  }

  return res.json({
    ok: true,
    mode: writeErrors.length ? "seed-fallback" : "runtime-seeded",
    writeErrors,
    summary: {
      analyticsRecords: analyticsSeed.records.length,
      bktRecords: bktSeed.records.length,
      simulatedStudents: bktSeed.simulatedStudents.length,
    },
  });
});

app.post("/api/bkt/label", async (req, res) => {
  const { lessonId, content = "", candidates = [] } = req.body || {};
  if (!lessonId) {
    return res.status(400).json({ error: "lessonId is required." });
  }

  const normalizedCandidates = getArray(candidates).filter((item) => item && item.id);
  const lessonCandidates = normalizedCandidates.length
    ? normalizedCandidates
    : getKnowledgePointsForLesson(lessonId).map((point) => ({ id: point.id, title: point.title }));

  if (!lessonCandidates.length) {
    return res.status(404).json({ error: "No knowledge point candidates found." });
  }

  const cacheStore = await readBktSummaryStore();
  const mappingKey = `${lessonId}:${safeString(content).slice(0, 120)}`;
  if (cacheStore.mappings[mappingKey]) {
    return res.json({ ok: true, ...cacheStore.mappings[mappingKey], cached: true });
  }

  let result = null;
  try {
    if (process.env.OPENAI_API_KEY) {
      const prompt = JSON.stringify({
        lessonId,
        content,
        candidates: lessonCandidates,
      });
      const text = await createOpenAITextResponse({
        system: "你是一名乐理教学系统的知识点标注器。请只返回 JSON，字段包含 knowledgePointId、confidence、reason。",
        messages: [{ role: "user", content: prompt }],
        maxTokens: 300,
      });
      const parsed = parseJsonObject(text);
      if (parsed?.knowledgePointId) {
        result = {
          knowledgePointId: String(parsed.knowledgePointId),
          confidence: Number(parsed.confidence || 0.6),
          reason: safeString(parsed.reason, "AI 自动标注"),
        };
      }
    }
  } catch (error) {
    console.error("BKT knowledge labeling failed:", error);
  }

  if (!result || !lessonCandidates.some((item) => item.id === result.knowledgePointId)) {
    const fallback = lessonCandidates[0];
    result = {
      knowledgePointId: String(fallback.id),
      confidence: 0.35,
      reason: "已回退到本课默认主知识点。",
    };
  }

  cacheStore.mappings[mappingKey] = result;
  await writeBktSummaryStore(cacheStore);
  return res.json({ ok: true, ...result, cached: false });
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
  const [store, experimentSimulation] = await Promise.all([readAnalyticsStore(), readExperimentRq4Data()]);
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
    experimentSimulation,
  });
});

app.get("/api/reports/teacher-samples-preview", async (req, res) => {
  const [analyticsStore, bktStore] = await Promise.all([readAnalyticsStore(), readBktSummaryStore()]);
  const report = buildTeacherSampleReportData({
    analyticsRecords: analyticsStore.records,
    bktRecords: bktStore.records,
  });
  return res.json({ ok: true, report });
});

app.get("/api/reports/teacher-samples-export", async (req, res) => {
  const format = safeString(req.query.format, "html").toLowerCase();
  const [analyticsStore, bktStore] = await Promise.all([readAnalyticsStore(), readBktSummaryStore()]);
  const report = buildTeacherSampleReportData({
    analyticsRecords: analyticsStore.records,
    bktRecords: bktStore.records,
  });
  if (format === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="teacher-sample-report.json"');
    return res.send(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="teacher-sample-report.csv"');
    return res.send(buildTeacherSampleReportCsv(report));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="teacher-sample-report.html"');
  return res.send(buildTeacherSampleReportHtml(report));
});

app.get("/api/reports/student-preview", async (req, res) => {
  const userId = safeString(req.query.userId);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId is required." });
  }
  const [analyticsStore, bktStore] = await Promise.all([readAnalyticsStore(), readBktSummaryStore()]);
  const report = buildStudentLearningReportData({
    analyticsRecords: analyticsStore.records,
    bktRecords: bktStore.records,
    userId,
  });
  if (!report.studentLabel && !report.knowledgeStates.length) {
    return res.status(404).json({ ok: false, error: "Student report data not found." });
  }
  return res.json({ ok: true, report });
});

app.post("/api/reports/student-pdf", async (req, res) => {
  const userId = safeString(req.body?.userId);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "userId is required." });
  }
  const [analyticsStore, bktStore] = await Promise.all([readAnalyticsStore(), readBktSummaryStore()]);
  const report = buildStudentLearningReportData({
    analyticsRecords: analyticsStore.records,
    bktRecords: bktStore.records,
    userId,
  });
  if (!report.studentLabel && !report.knowledgeStates.length) {
    return res.status(404).json({ ok: false, error: "Student report data not found." });
  }
  try {
    const pdf = await generateStudentReportPdf(report);
    return res.json({ ok: true, report, pdf });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeString(error?.message, "Failed to generate PDF report.") });
  }
});

app.post("/api/tutor", async (req, res) => {
  const { system, messages = [], maxTokens = 1000 } = req.body || {};
  const rawSafeMessages = (Array.isArray(messages) ? messages.slice(-6) : []).map((message) => ({
    role: message?.role === "assistant" ? "assistant" : "user",
    content: safeString(message?.content).trim(),
    imageDataUrl: safeString(message?.imageDataUrl),
    imageName: safeString(message?.imageName),
  }));
  const safeMessages = rawSafeMessages.map((message) => {
    const role = message?.role === "assistant" ? "assistant" : "user";
    const rawContent = safeString(message?.content).trim();
    return {
      role,
      content: role === "assistant"
        ? `上一轮导师回答：${rawContent}`
        : `学生问题：${rawContent || "请结合上传内容进行讲解。"}\n要求：直接解释，不要判断为无效输入，也不要要求学生重新表述。`,
      imageDataUrl: safeString(message?.imageDataUrl),
      imageName: safeString(message?.imageName),
    };
  });
  const tutorModel = getTutorModel();
  const normalizedMaxTokens = Math.min(Number(maxTokens) || 320, 320);
  const startedAt = Date.now();
  const cacheKey = buildTutorCacheKey({
    system: system || "你是一位专业的大学音乐理论教师和 AI 辅导员。请用中文简洁、准确地回答。任何带问号的句子都应视为正常提问，不要误判为无效输入。",
    messages: rawSafeMessages,
    model: tutorModel,
    maxTokens: normalizedMaxTokens,
  });
  const cachedText = getTutorCachedResponse(cacheKey);

  if (cachedText) {
    return res.json({ text: cachedText, cached: true, elapsedMs: Date.now() - startedAt });
  }

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

    let inflight = getTutorInflightRequest(cacheKey);
    if (!inflight) {
      inflight = createTutorResponseWithFallback({
        system: system || "你是一位专业的大学音乐理论教师和 AI 辅导员。请用中文简洁、准确地回答。任何带问号的句子都应视为正常提问，不要误判为无效输入。",
        messages: safeMessages,
        rawMessages: rawSafeMessages,
        maxTokens: normalizedMaxTokens,
        timeoutMs: getTutorTimeoutMs(),
      });
      setTutorInflightRequest(cacheKey, inflight);
    }
    const result = await inflight;
    clearTutorInflightRequest(cacheKey);
    const text = safeString(result?.text);

    if (text) {
      setTutorCachedResponse(cacheKey, text);
    }
    return res.json({
      text: text || "抱歉，我暂时没有生成有效回答，请重试。",
      cached: false,
      elapsedMs: Date.now() - startedAt,
      modelUsed: result?.model || tutorModel,
      retried: Boolean(result?.retried),
    });
  } catch (error) {
    clearTutorInflightRequest(cacheKey);
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
