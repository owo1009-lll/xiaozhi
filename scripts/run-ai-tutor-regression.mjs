import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { app } from "../server.js";
import {
  AI_TUTOR_BAD_PATTERNS,
  AI_TUTOR_REGRESSION_CASES,
  AI_TUTOR_REGRESSION_SYSTEM,
} from "./ai-tutor-regression-set.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const IMAGE_DIR = path.join(ROOT, "public", "regression-images");
const RESULT_JSON = path.join(DATA_DIR, "ai-tutor-regression-latest.json");
const RESULT_CSV = path.join(DATA_DIR, "ai-tutor-regression-latest.csv");
const RESULT_MD = path.join(DATA_DIR, "ai-tutor-regression-latest.md");
const FIXTURE_SCRIPT = path.join(ROOT, "scripts", "generate-ai-tutor-regression-fixtures.ps1");

function parseArgs(argv) {
  const options = {
    baseUrl: "",
    category: "",
    caseId: "",
    failFast: false,
    skipFixtures: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--public") {
      options.baseUrl = "https://yuelizhixue.xyz";
    } else if (arg === "--base-url") {
      options.baseUrl = String(argv[index + 1] || "").replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--category") {
      options.category = String(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--case") {
      options.caseId = String(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--fail-fast") {
      options.failFast = true;
    } else if (arg === "--skip-fixtures") {
      options.skipFixtures = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  if (process.env.AI_TUTOR_TEST_BASE_URL && !options.baseUrl) {
    options.baseUrl = process.env.AI_TUTOR_TEST_BASE_URL.replace(/\/+$/, "");
  }
  return options;
}

function printHelp() {
  console.log(`
AI tutor regression test

Usage:
  npm run test:ai-tutor
  node scripts/run-ai-tutor-regression.mjs --public
  node scripts/run-ai-tutor-regression.mjs --base-url https://yuelizhixue.xyz
  node scripts/run-ai-tutor-regression.mjs --category image-homework
  node scripts/run-ai-tutor-regression.mjs --case IMG_HOMEWORK_EQUAL_ERROR

Options:
  --public          Test https://yuelizhixue.xyz instead of starting a local server.
  --base-url URL    Test an existing deployment or local server.
  --category NAME   Run only one category.
  --case ID         Run only one test case.
  --skip-fixtures   Do not regenerate image fixtures before running.
  --fail-fast       Stop after the first failed case.
`);
}

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
  return String(text || "")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function includesNormalized(text, keyword) {
  return normalizeText(text).includes(normalizeText(keyword));
}

function toCsvValue(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getVisionModelUsed(modelUsed) {
  return /vl|vision|ocr|omni/i.test(String(modelUsed || ""));
}

function evaluateCase(testCase, payload, status) {
  const text = String(payload?.text || payload?.detail || payload?.error || "");
  const expectedAll = testCase.expectedAll || [];
  const expectedAny = testCase.expectedAny || [];
  const forbiddenPatterns = [...AI_TUTOR_BAD_PATTERNS, ...(testCase.forbiddenAny || [])];
  const matchedAll = expectedAll.filter((keyword) => includesNormalized(text, keyword));
  const missingAll = expectedAll.filter((keyword) => !includesNormalized(text, keyword));
  const matchedAny = expectedAny.filter((keyword) => includesNormalized(text, keyword));
  const matchedForbidden = forbiddenPatterns.filter((keyword) => includesNormalized(text, keyword));
  const minChars = Number(testCase.minChars || 20);
  const lengthOk = text.trim().length >= minChars;
  const statusOk = status >= 200 && status < 300;
  const expectedAllOk = missingAll.length === 0;
  const expectedAnyOk = expectedAny.length === 0 || matchedAny.length > 0;
  const forbiddenOk = matchedForbidden.length === 0;
  const visionOk = !testCase.requireVisionModel || getVisionModelUsed(payload?.modelUsed);
  const passed = statusOk && lengthOk && expectedAllOk && expectedAnyOk && forbiddenOk && visionOk;

  return {
    passed,
    statusOk,
    lengthOk,
    expectedAllOk,
    expectedAnyOk,
    forbiddenOk,
    visionOk,
    matchedAll,
    missingAll,
    matchedAny,
    matchedForbidden,
  };
}

async function buildMessages(testCase) {
  const messages = [{ role: "user", content: testCase.prompt }];
  if (testCase.imageFile) {
    const imagePath = path.join(IMAGE_DIR, testCase.imageFile);
    const imageBuffer = await fs.readFile(imagePath);
    messages[0].imageDataUrl = toDataUrl(imageBuffer, getMimeType(imagePath));
    messages[0].imageName = testCase.imageFile;
  }
  return messages;
}

async function runCase(baseUrl, testCase) {
  const messages = await buildMessages(testCase);
  const startedAt = Date.now();
  let status = 0;
  let payload = {};
  try {
    const response = await fetch(`${baseUrl}/api/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: AI_TUTOR_REGRESSION_SYSTEM,
        maxTokens: testCase.imageFile ? 460 : 240,
        messages,
      }),
    });
    status = response.status;
    payload = await response.json().catch(async () => ({ error: await response.text() }));
  } catch (error) {
    payload = { error: error?.message || "request failed" };
  }

  const evaluation = evaluateCase(testCase, payload, status);
  return {
    ...testCase,
    status,
    elapsedMs: Number(payload.elapsedMs || (Date.now() - startedAt)),
    cached: Boolean(payload.cached),
    modelUsed: payload.modelUsed || "",
    retried: Boolean(payload.retried),
    reply: String(payload.text || payload.detail || payload.error || ""),
    ...evaluation,
  };
}

function summarizeResults(results) {
  const total = results.length;
  const passed = results.filter((item) => item.passed).length;
  const categories = [...new Set(results.map((item) => item.category))];
  const byCategory = Object.fromEntries(categories.map((category) => {
    const subset = results.filter((item) => item.category === category);
    return [category, {
      total: subset.length,
      passed: subset.filter((item) => item.passed).length,
      failed: subset.filter((item) => !item.passed).length,
      averageElapsedMs: subset.length ? Math.round(subset.reduce((sum, item) => sum + item.elapsedMs, 0) / subset.length) : 0,
    }];
  }));
  return {
    total,
    passed,
    failed: total - passed,
    passRate: total ? Number((passed / total).toFixed(4)) : 0,
    averageElapsedMs: total ? Math.round(results.reduce((sum, item) => sum + item.elapsedMs, 0) / total) : 0,
    cachedCount: results.filter((item) => item.cached).length,
    retriedCount: results.filter((item) => item.retried).length,
    visionCaseCount: results.filter((item) => item.requireVisionModel).length,
    visionModelPassCount: results.filter((item) => item.requireVisionModel && item.visionOk).length,
    byCategory,
    failures: results.filter((item) => !item.passed).map((item) => ({
      id: item.id,
      category: item.category,
      prompt: item.prompt,
      status: item.status,
      modelUsed: item.modelUsed,
      elapsedMs: item.elapsedMs,
      missingAll: item.missingAll,
      matchedAny: item.matchedAny,
      matchedForbidden: item.matchedForbidden,
      visionOk: item.visionOk,
      reply: item.reply,
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
    "expectedAll",
    "expectedAny",
    "missingAll",
    "matchedAny",
    "matchedForbidden",
    "visionOk",
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
      item.expectedAll || [],
      item.expectedAny || [],
      item.missingAll || [],
      item.matchedAny || [],
      item.matchedForbidden || [],
      item.visionOk,
      item.prompt,
      item.reply,
    ].map(toCsvValue).join(","));
  }
  await fs.writeFile(RESULT_CSV, `\uFEFF${rows.join("\n")}\n`, "utf8");

  const md = [
    "# AI Tutor Regression Latest",
    "",
    `Generated at: ${report.generatedAt}`,
    `Base URL: ${report.environment.baseUrl}`,
    "",
    "## Summary",
    "",
    `- Total: ${report.summary.total}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Pass rate: ${report.summary.passRate}`,
    `- Average elapsed: ${report.summary.averageElapsedMs} ms`,
    `- Vision model pass: ${report.summary.visionModelPassCount}/${report.summary.visionCaseCount}`,
    "",
    "## Failures",
    "",
    ...(report.summary.failures.length
      ? report.summary.failures.map((item) => `- ${item.id} (${item.category}): ${item.reply.slice(0, 160).replace(/\n/g, " ")}`)
      : ["No failures."]),
    "",
  ].join("\n");
  await fs.writeFile(RESULT_MD, md, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.skipFixtures) {
    await runPowershellScript(FIXTURE_SCRIPT);
  }

  const selectedCases = AI_TUTOR_REGRESSION_CASES
    .filter((item) => !options.category || item.category === options.category)
    .filter((item) => !options.caseId || item.id === options.caseId);

  if (!selectedCases.length) {
    throw new Error("No regression cases selected.");
  }

  let server = null;
  let baseUrl = options.baseUrl;
  if (!baseUrl) {
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  }

  try {
    const results = [];
    for (const testCase of selectedCases) {
      const result = await runCase(baseUrl, testCase);
      results.push(result);
      const marker = result.passed ? "PASS" : "FAIL";
      console.log(`${marker} ${result.id} [${result.category}] ${result.status} ${result.modelUsed || "no-model"} ${result.elapsedMs}ms`);
      if (!result.passed) {
        console.log(`  reply: ${result.reply.slice(0, 260).replace(/\n/g, " ")}`);
        console.log(`  missingAll: ${(result.missingAll || []).join(" | ") || "-"}`);
        console.log(`  matchedForbidden: ${(result.matchedForbidden || []).join(" | ") || "-"}`);
        console.log(`  visionOk: ${result.visionOk}`);
        if (options.failFast) break;
      }
    }

    const summary = summarizeResults(results);
    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        baseUrl,
        caseCount: selectedCases.length,
        category: options.category || "all",
        caseId: options.caseId || "all",
      },
      summary,
      results,
    };

    await writeReports(report);
    console.log(JSON.stringify({
      resultJson: RESULT_JSON,
      resultCsv: RESULT_CSV,
      resultMarkdown: RESULT_MD,
      summary,
    }, null, 2));

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
