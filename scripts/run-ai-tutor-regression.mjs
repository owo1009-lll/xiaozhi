import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app } from "../server.js";
import { AI_TUTOR_BAD_PATTERNS, AI_TUTOR_REGRESSION_CASES } from "./ai-tutor-regression-set.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const RESULT_JSON = path.join(DATA_DIR, "ai-tutor-regression-latest.json");
const RESULT_CSV = path.join(DATA_DIR, "ai-tutor-regression-latest.csv");
const FIXTURE_SCRIPT = path.join(ROOT, "scripts", "generate-ai-tutor-regression-fixtures.ps1");

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

function runPowershellScript(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", filePath], {
      cwd: ROOT,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell script failed with code ${code}`));
    });
    child.on("error", reject);
  });
}

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
}

function toCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function evaluateCase(testCase, response) {
  const text = String(response?.text || "");
  const normalized = normalizeText(text);
  const matchedKeywords = (testCase.expectedAny || []).filter((keyword) => normalized.includes(normalizeText(keyword)));
  const badPatterns = AI_TUTOR_BAD_PATTERNS.filter((pattern) => normalized.includes(normalizeText(pattern)));
  const passed = matchedKeywords.length > 0 && badPatterns.length === 0 && text.trim().length >= 24;
  return {
    passed,
    matchedKeywords,
    badPatterns,
  };
}

async function runCase(baseUrl, testCase) {
  const messages = [{ role: "user", content: testCase.prompt }];
  if (testCase.imageFile) {
    const imagePath = path.join(ROOT, "public", "regression-images", testCase.imageFile);
    const imageBuffer = await fs.readFile(imagePath);
    messages[0].imageDataUrl = toDataUrl(imageBuffer, getMimeType(imagePath));
    messages[0].imageName = testCase.imageFile;
  }

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system: "你是一位大学乐理课程教师。请始终用中文回复，优先做定义、规则和例子解释。",
      maxTokens: testCase.imageFile ? 260 : 220,
      messages,
    }),
  });
  const payload = await response.json();
  const evaluation = evaluateCase(testCase, payload);
  return {
    ...testCase,
    status: response.status,
    elapsedMs: Number(payload.elapsedMs || (Date.now() - startedAt)),
    cached: Boolean(payload.cached),
    modelUsed: payload.modelUsed || "",
    retried: Boolean(payload.retried),
    reply: String(payload.text || payload.error || ""),
    ...evaluation,
  };
}

function summarizeResults(results) {
  const total = results.length;
  const passed = results.filter((item) => item.passed).length;
  const byCategory = Object.fromEntries(
    [...new Set(results.map((item) => item.category))].map((category) => {
      const subset = results.filter((item) => item.category === category);
      return [category, {
        total: subset.length,
        passed: subset.filter((item) => item.passed).length,
        averageElapsedMs: subset.length ? Math.round(subset.reduce((sum, item) => sum + item.elapsedMs, 0) / subset.length) : 0,
      }];
    }),
  );
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total ? Number((passed / total).toFixed(4)) : 0,
    averageElapsedMs: total ? Math.round(results.reduce((sum, item) => sum + item.elapsedMs, 0) / total) : 0,
    cachedCount: results.filter((item) => item.cached).length,
    retriedCount: results.filter((item) => item.retried).length,
    byCategory,
    failures: results.filter((item) => !item.passed).map((item) => ({
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      reply: item.reply,
      matchedKeywords: item.matchedKeywords,
      badPatterns: item.badPatterns,
      modelUsed: item.modelUsed,
      elapsedMs: item.elapsedMs,
    })),
  };
}

async function writeReports(report) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RESULT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const header = [
    "id",
    "category",
    "status",
    "passed",
    "elapsedMs",
    "cached",
    "retried",
    "modelUsed",
    "expectedAny",
    "matchedKeywords",
    "badPatterns",
    "prompt",
    "reply",
  ];
  const rows = [header.join(",")];
  for (const item of report.results) {
    rows.push([
      item.id,
      item.category,
      item.status,
      item.passed,
      item.elapsedMs,
      item.cached,
      item.retried,
      item.modelUsed,
      (item.expectedAny || []).join(" | "),
      (item.matchedKeywords || []).join(" | "),
      (item.badPatterns || []).join(" | "),
      item.prompt,
      item.reply,
    ].map(toCsvValue).join(","));
  }
  await fs.writeFile(RESULT_CSV, `\uFEFF${rows.join("\n")}\n`, "utf8");
}

await runPowershellScript(FIXTURE_SCRIPT);

const { server, baseUrl } = await startServer();

try {
  const results = [];
  for (const testCase of AI_TUTOR_REGRESSION_CASES) {
    results.push(await runCase(baseUrl, testCase));
  }
  const summary = summarizeResults(results);
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      baseUrl,
      caseCount: AI_TUTOR_REGRESSION_CASES.length,
    },
    summary,
    results,
  };
  await writeReports(report);
  console.log(JSON.stringify({
    resultJson: RESULT_JSON,
    resultCsv: RESULT_CSV,
    summary,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
