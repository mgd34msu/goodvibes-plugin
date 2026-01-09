/* Bundled with esbuild */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/shared/gitignore.ts
var gitignore_exports = {};
__export(gitignore_exports, {
  SECURITY_GITIGNORE_ENTRIES: () => SECURITY_GITIGNORE_ENTRIES,
  ensureSecureGitignore: () => ensureSecureGitignore
});
import * as fs from "fs/promises";
import * as path2 from "path";
async function ensureSecureGitignore(cwd) {
  const gitignorePath = path2.join(cwd, ".gitignore");
  let content = "";
  try {
    await fs.access(gitignorePath);
    content = await fs.readFile(gitignorePath, "utf-8");
  } catch {
  }
  const entriesToAdd = [];
  for (const [section, patterns] of Object.entries(
    SECURITY_GITIGNORE_ENTRIES
  )) {
    const missing = patterns.filter((pattern) => !content.includes(pattern));
    if (missing.length > 0) {
      entriesToAdd.push(`
# ${section}`);
      entriesToAdd.push(...missing);
    }
  }
  if (entriesToAdd.length > 0) {
    const newContent = content.trimEnd() + "\n" + entriesToAdd.join("\n") + "\n";
    await fs.writeFile(gitignorePath, newContent);
  }
}
var SECURITY_GITIGNORE_ENTRIES;
var init_gitignore = __esm({
  "src/shared/gitignore.ts"() {
    "use strict";
    SECURITY_GITIGNORE_ENTRIES = {
      "GoodVibes plugin state": [".goodvibes/"],
      "Environment files": [".env", ".env.local", ".env.*.local", "*.env"],
      "Secret files": [
        "*.pem",
        "*.key",
        "credentials.json",
        "secrets.json",
        "service-account*.json"
      ],
      "Cloud credentials": [".aws/", ".gcp/", "kubeconfig"],
      "Database files": ["*.db", "*.sqlite", "*.sqlite3", "prisma/*.db"],
      "Log files": ["*.log", "logs/"]
    };
  }
});

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import * as fs2 from "fs/promises";
import * as path3 from "path";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
var PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(process.cwd(), "..");
var PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var CACHE_DIR = path.join(PLUGIN_ROOT, ".cache");
var ANALYTICS_FILE = path.join(CACHE_DIR, "analytics.json");

// src/shared/logging.ts
function debug(message, data) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  if (data !== void 0) {
    console.error(
      `[GoodVibes ${timestamp}] ${message}:`,
      JSON.stringify(data, null, 2)
    );
  } else {
    console.error(`[GoodVibes ${timestamp}] ${message}`);
  }
}
function logError(context, error) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : void 0;
  console.error(`[GoodVibes ${timestamp}] ERROR in ${context}: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

// src/shared/file-utils.ts
var exec = promisify(execCallback);
async function fileExists(filePath) {
  try {
    await fs2.access(filePath);
    return true;
  } catch (error) {
    debug(`File access check failed for ${filePath}: ${error}`);
    return false;
  }
}
async function ensureGoodVibesDir(cwd) {
  const goodvibesDir = path3.join(cwd, ".goodvibes");
  if (!await fileExists(goodvibesDir)) {
    await fs2.mkdir(goodvibesDir, { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "memory"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "state"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "logs"), { recursive: true });
    await fs2.mkdir(path3.join(goodvibesDir, "telemetry"), { recursive: true });
    const { ensureSecureGitignore: ensureSecureGitignore2 } = await Promise.resolve().then(() => (init_gitignore(), gitignore_exports));
    await ensureSecureGitignore2(cwd);
  }
  return goodvibesDir;
}
function isExecError(error) {
  return error !== null && typeof error === "object";
}
function extractErrorOutput(error) {
  if (isExecError(error)) {
    return error.stdout?.toString() || error.stderr?.toString() || error.message || "Unknown error";
  }
  return String(error);
}

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "100",
  10
);

// src/shared/hook-io.ts
function isTestEnvironment() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true" || typeof globalThis.__vitest_worker__ !== "undefined";
}
function isValidHookInput(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return typeof obj.session_id === "string" && typeof obj.cwd === "string" && typeof obj.hook_event_name === "string";
}
async function readHookInput() {
  return new Promise((resolve3, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        if (!isValidHookInput(parsed)) {
          reject(new Error("Invalid hook input structure"));
          return;
        }
        resolve3(parsed);
      } catch {
        reject(new Error("Failed to parse hook input from stdin"));
      }
    });
    process.stdin.on("error", reject);
    setTimeout(() => {
      if (!data) {
        reject(
          new Error(
            "Hook input timeout: no data received within configured timeout"
          )
        );
      }
    }, STDIN_TIMEOUT_MS);
  });
}
function formatResponse(response) {
  return JSON.stringify(response);
}
function respond(response, block = false) {
  console.log(formatResponse(response));
  process.exit(block ? 2 : 0);
}

// src/shared/index.ts
init_gitignore();

// src/shared/analytics.ts
import * as fs3 from "fs/promises";
async function ensureCacheDir() {
  if (!await fileExists(CACHE_DIR)) {
    await fs3.mkdir(CACHE_DIR, { recursive: true });
  }
}
async function loadAnalytics() {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs3.readFile(ANALYTICS_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (typeof parsed === "object" && parsed !== null && "session_id" in parsed) {
        return parsed;
      }
      return null;
    } catch (error) {
      debug("loadAnalytics failed", { error: String(error) });
      return null;
    }
  }
  return null;
}
async function saveAnalytics(analytics) {
  await ensureCacheDir();
  await fs3.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}

// src/shared/transcript.ts
import * as fs4 from "fs/promises";
var TRANSCRIPT_SUMMARY_MAX_LENGTH = 500;
async function parseTranscript(transcriptPath) {
  const toolsUsed = /* @__PURE__ */ new Set();
  const filesModified = [];
  let lastAssistantMessage = "";
  try {
    const content = await fs4.readFile(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (typeof event !== "object" || event === null) {
          continue;
        }
        const eventObj = event;
        if (eventObj.type === "tool_use" && typeof eventObj.name === "string") {
          toolsUsed.add(eventObj.name);
          if (["Write", "Edit"].includes(eventObj.name)) {
            const input = eventObj.input;
            if (input?.file_path && typeof input.file_path === "string") {
              filesModified.push(input.file_path);
            }
          }
        }
        if (eventObj.role === "assistant" && eventObj.content) {
          lastAssistantMessage = typeof eventObj.content === "string" ? eventObj.content : JSON.stringify(eventObj.content);
        }
      } catch (error) {
        debug("parseTranscript line parse failed", { error: String(error) });
      }
    }
  } catch (error) {
    debug("parseTranscript read failed", { error: String(error) });
  }
  return {
    toolsUsed: Array.from(toolsUsed),
    filesModified: [...new Set(filesModified)],
    summary: lastAssistantMessage.slice(0, TRANSCRIPT_SUMMARY_MAX_LENGTH)
  };
}

// src/shared/keywords-data.json
var keywords_data_default = {
  stackKeywords: {
    frameworks_frontend: [
      "react",
      "nextjs",
      "next.js",
      "vue",
      "nuxt",
      "svelte",
      "sveltekit",
      "angular",
      "solid",
      "solidjs",
      "qwik",
      "astro",
      "remix",
      "gatsby"
    ],
    frameworks_backend: ["express", "fastify", "hono", "koa", "nest", "nestjs"],
    languages: ["typescript", "javascript", "python", "rust", "go", "golang"],
    databases: [
      "postgresql",
      "postgres",
      "mysql",
      "sqlite",
      "mongodb",
      "redis",
      "supabase",
      "firebase",
      "turso"
    ],
    orms: ["prisma", "drizzle", "typeorm", "sequelize", "knex", "kysely"],
    api: ["rest", "graphql", "trpc", "grpc", "websocket", "socket.io"],
    auth: ["clerk", "nextauth", "auth.js", "lucia", "auth0", "jwt", "oauth"],
    ui: [
      "tailwind",
      "tailwindcss",
      "shadcn",
      "radix",
      "chakra",
      "mantine",
      "mui"
    ],
    state: ["zustand", "redux", "jotai", "recoil", "mobx", "valtio"],
    testing: ["vitest", "jest", "playwright", "cypress", "testing-library"],
    build: ["vite", "webpack", "esbuild", "rollup", "turbopack", "bun"],
    devops: [
      "docker",
      "kubernetes",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "railway"
    ],
    ai: ["openai", "anthropic", "claude", "gpt", "llm", "langchain", "vercel-ai"]
  },
  transcriptKeywords: {
    frameworks: [
      "react",
      "next",
      "nextjs",
      "vue",
      "angular",
      "svelte",
      "remix",
      "astro",
      "express",
      "fastify",
      "hono",
      "koa",
      "nest",
      "nestjs",
      "django",
      "flask",
      "fastapi",
      "rails",
      "laravel",
      "spring",
      "springboot"
    ],
    databases: [
      "postgres",
      "postgresql",
      "mysql",
      "mariadb",
      "sqlite",
      "mongodb",
      "mongo",
      "redis",
      "dynamodb",
      "supabase",
      "planetscale",
      "turso",
      "neon",
      "prisma",
      "drizzle",
      "kysely",
      "typeorm",
      "sequelize"
    ],
    auth: [
      "auth",
      "authentication",
      "authorization",
      "oauth",
      "jwt",
      "session",
      "clerk",
      "auth0",
      "nextauth",
      "lucia",
      "passport",
      "login",
      "signup",
      "password",
      "token"
    ],
    testing: [
      "test",
      "testing",
      "jest",
      "vitest",
      "mocha",
      "chai",
      "playwright",
      "cypress",
      "puppeteer",
      "unit test",
      "integration test",
      "e2e",
      "coverage"
    ],
    api: [
      "api",
      "rest",
      "graphql",
      "trpc",
      "grpc",
      "endpoint",
      "route",
      "handler",
      "middleware",
      "openapi",
      "swagger",
      "apollo"
    ],
    devops: [
      "docker",
      "kubernetes",
      "k8s",
      "terraform",
      "ansible",
      "ci",
      "cd",
      "pipeline",
      "deploy",
      "deployment",
      "aws",
      "gcp",
      "azure",
      "vercel",
      "netlify",
      "railway",
      "github actions",
      "gitlab ci"
    ],
    frontend: [
      "css",
      "tailwind",
      "styled-components",
      "sass",
      "scss",
      "component",
      "ui",
      "ux",
      "responsive",
      "animation",
      "form",
      "modal",
      "table",
      "button",
      "input"
    ],
    state: [
      "state",
      "redux",
      "zustand",
      "jotai",
      "recoil",
      "mobx",
      "context",
      "provider",
      "store"
    ],
    typescript: [
      "typescript",
      "type",
      "interface",
      "generic",
      "enum",
      "zod",
      "yup",
      "io-ts",
      "validation",
      "schema"
    ],
    performance: [
      "performance",
      "optimization",
      "cache",
      "caching",
      "lazy",
      "bundle",
      "minify",
      "compress",
      "speed"
    ],
    security: [
      "security",
      "xss",
      "csrf",
      "sql injection",
      "sanitize",
      "encrypt",
      "hash",
      "ssl",
      "https",
      "cors"
    ],
    files: [
      "file",
      "upload",
      "download",
      "stream",
      "buffer",
      "read",
      "write",
      "create",
      "delete",
      "modify"
    ]
  }
};

// src/shared/keywords.ts
var STACK_KEYWORD_CATEGORIES = keywords_data_default.stackKeywords;
var TRANSCRIPT_KEYWORD_CATEGORIES = keywords_data_default.transcriptKeywords;
var ALL_STACK_KEYWORDS = Object.values(
  STACK_KEYWORD_CATEGORIES
).flat();
var ALL_TRANSCRIPT_KEYWORDS = Object.values(
  TRANSCRIPT_KEYWORD_CATEGORIES
).flat();
var ALL_KEYWORDS = [
  .../* @__PURE__ */ new Set([...ALL_STACK_KEYWORDS, ...ALL_TRANSCRIPT_KEYWORDS])
];
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var STACK_KEYWORD_REGEX_MAP = new Map(
  ALL_STACK_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
  ])
);
var TRANSCRIPT_KEYWORD_REGEX_MAP = new Map(
  ALL_TRANSCRIPT_KEYWORDS.map((keyword) => [
    keyword,
    new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i")
  ])
);
var MAX_EXTRACTED_KEYWORDS = 50;
function extractStackKeywords(text) {
  const found = /* @__PURE__ */ new Set();
  const lowerText = text.toLowerCase();
  for (const keyword of ALL_STACK_KEYWORDS) {
    if (STACK_KEYWORD_REGEX_MAP.get(keyword)?.test(lowerText)) {
      found.add(keyword);
    }
  }
  return Array.from(found).slice(0, MAX_EXTRACTED_KEYWORDS);
}

// src/state/persistence.ts
import * as fs5 from "fs/promises";
import * as path4 from "path";

// src/types/state.ts
function createDefaultState() {
  return {
    session: {
      id: "",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      mode: "default",
      featureDescription: null
    },
    errors: {},
    tests: {
      lastFullRun: null,
      lastQuickRun: null,
      passingFiles: [],
      failingFiles: [],
      pendingFixes: []
    },
    build: {
      lastRun: null,
      status: "unknown",
      errors: [],
      fixAttempts: 0
    },
    git: {
      mainBranch: "main",
      currentBranch: "main",
      featureBranch: null,
      featureStartedAt: null,
      featureDescription: null,
      checkpoints: [],
      pendingMerge: false
    },
    files: {
      modifiedSinceCheckpoint: [],
      modifiedThisSession: [],
      createdThisSession: []
    },
    devServers: {}
  };
}

// src/state/persistence.ts
var STATE_FILE = "state/hooks-state.json";
async function loadState(cwd, options = {}) {
  const { throwOnError = false } = options;
  const goodvibesDir = path4.join(cwd, ".goodvibes");
  const statePath = path4.join(goodvibesDir, STATE_FILE);
  if (!await fileExists(statePath)) {
    return createDefaultState();
  }
  try {
    const content = await fs5.readFile(statePath, "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && "session" in parsed) {
      return parsed;
    }
    return createDefaultState();
  } catch (error) {
    debug("Failed to load state, using defaults", error);
    if (throwOnError) {
      throw error;
    }
    return createDefaultState();
  }
}
async function saveState(cwd, state, options = {}) {
  const { throwOnError = false } = options;
  await ensureGoodVibesDir(cwd);
  const statePath = path4.join(cwd, ".goodvibes", STATE_FILE);
  const stateDir = path4.dirname(statePath);
  if (!await fileExists(stateDir)) {
    await fs5.mkdir(stateDir, { recursive: true });
  }
  try {
    const tempPath = statePath + ".tmp";
    await fs5.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs5.rename(tempPath, statePath);
  } catch (error) {
    debug("Failed to save state", error);
    if (throwOnError) {
      throw error;
    }
  }
}

// src/automation/build-runner.ts
import { exec as exec2 } from "child_process";
import { promisify as promisify2 } from "util";
var execAsync = promisify2(exec2);
var TYPECHECK_COMMAND = "npx tsc --noEmit";
async function runTypeCheck(cwd) {
  try {
    await execAsync(TYPECHECK_COMMAND, { cwd, timeout: 12e4 });
    return { passed: true, summary: "Type check passed", errors: [] };
  } catch (error) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: "Type errors found",
      errors: parseBuildErrors(output)
    };
  }
}
function parseBuildErrors(output) {
  const errors = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/(.+)\((\d+),\d+\):\s*error\s*TS\d+:\s*(.+)/);
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        message: match[3]
      });
    }
  }
  return errors;
}

// src/post-tool-use/file-tracker.ts
function trackFileModification(state, filePath) {
  const modifiedSession = new Set(state.files.modifiedThisSession);
  const modifiedCheckpoint = new Set(state.files.modifiedSinceCheckpoint);
  modifiedSession.add(filePath);
  modifiedCheckpoint.add(filePath);
  return {
    ...state,
    files: {
      ...state.files,
      modifiedThisSession: Array.from(modifiedSession),
      modifiedSinceCheckpoint: Array.from(modifiedCheckpoint)
    }
  };
}

// src/subagent-stop/output-validation.ts
async function validateAgentOutput(cwd, transcriptPath, state) {
  const transcriptData = await parseTranscript(transcriptPath);
  const errors = [];
  let updatedState = state;
  for (const file of transcriptData.filesModified) {
    updatedState = trackFileModification(updatedState, file);
  }
  const tsFiles = transcriptData.filesModified.filter(
    (f) => f.endsWith(".ts") || f.endsWith(".tsx")
  );
  if (tsFiles.length > 0) {
    const buildResult = await runTypeCheck(cwd);
    if (!buildResult.passed) {
      errors.push(
        `Type errors after agent work: ${buildResult.errors.length} errors`
      );
    }
  }
  return {
    valid: errors.length === 0,
    filesModified: transcriptData.filesModified,
    errors,
    state: updatedState
  };
}

// src/subagent-stop/telemetry.ts
import * as fs6 from "fs/promises";
import * as path5 from "path";
function isTrackingsRecord(value) {
  return typeof value === "object" && value !== null;
}
var TRACKING_FILE = "state/agent-tracking.json";
async function getAgentTracking(cwd, agentId) {
  const trackingPath = path5.join(cwd, ".goodvibes", TRACKING_FILE);
  if (!await fileExists(trackingPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(await fs6.readFile(trackingPath, "utf-8"));
    if (isTrackingsRecord(parsed)) {
      return parsed[agentId] ?? null;
    }
    return null;
  } catch (error) {
    debug("getAgentTracking failed", { error: String(error) });
    return null;
  }
}
async function removeAgentTracking(cwd, agentId) {
  const trackingPath = path5.join(cwd, ".goodvibes", TRACKING_FILE);
  if (!await fileExists(trackingPath)) {
    return;
  }
  try {
    const parsed = JSON.parse(await fs6.readFile(trackingPath, "utf-8"));
    if (isTrackingsRecord(parsed)) {
      delete parsed[agentId];
      await fs6.writeFile(trackingPath, JSON.stringify(parsed, null, 2));
    }
  } catch (error) {
    debug("telemetry operation failed", { error: String(error) });
  }
}
async function writeTelemetryEntry(cwd, entry) {
  await ensureGoodVibesDir(cwd);
  const now = /* @__PURE__ */ new Date();
  const fileName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.jsonl`;
  const telemetryPath = path5.join(cwd, ".goodvibes", "telemetry", fileName);
  await fs6.appendFile(telemetryPath, JSON.stringify(entry) + "\n");
}
async function buildTelemetryEntry(tracking, transcriptPath, status) {
  const transcriptData = await parseTranscript(transcriptPath);
  const allText = transcriptData.summary + " " + transcriptData.filesModified.join(" ");
  const keywords = extractStackKeywords(allText);
  const agentName = tracking.agent_type.split(":").pop() || tracking.agent_type;
  if (!keywords.includes(agentName)) {
    keywords.unshift(agentName);
  }
  const endedAt = (/* @__PURE__ */ new Date()).toISOString();
  const startedAt = new Date(tracking.started_at);
  const duration_ms = new Date(endedAt).getTime() - startedAt.getTime();
  return {
    event: "subagent_complete",
    agent_id: tracking.agent_id,
    agent_type: tracking.agent_type,
    session_id: tracking.session_id,
    project: tracking.project,
    project_name: tracking.project_name,
    git_branch: tracking.git_branch,
    git_commit: tracking.git_commit,
    started_at: tracking.started_at,
    ended_at: endedAt,
    duration_ms,
    status,
    keywords,
    files_modified: transcriptData.filesModified,
    tools_used: transcriptData.toolsUsed,
    summary: transcriptData.summary
  };
}

// src/automation/test-runner.ts
import { exec as exec3 } from "child_process";
import * as fs7 from "fs";
import { promisify as promisify3 } from "util";
var execAsync2 = promisify3(exec3);
var FAILURE_CONTEXT_LINES = 5;
function findTestsForFile(sourceFile) {
  const testPatterns = [
    sourceFile.replace(/\.tsx?$/, ".test.ts"),
    sourceFile.replace(/\.tsx?$/, ".test.tsx"),
    sourceFile.replace(/\.tsx?$/, ".spec.ts"),
    sourceFile.replace(/\.tsx?$/, ".spec.tsx"),
    sourceFile.replace(/src\/(.*)\.tsx?$/, "src/__tests__/$1.test.ts"),
    sourceFile.replace(/src\/(.*)\.tsx?$/, "tests/$1.test.ts")
  ];
  return testPatterns.filter((pattern) => fs7.existsSync(pattern));
}
async function runTests(testFiles, cwd) {
  if (testFiles.length === 0) {
    return { passed: true, summary: "No tests to run", failures: [] };
  }
  try {
    const fileArgs = testFiles.join(" ");
    await execAsync2(`npm test -- ${fileArgs}`, {
      cwd,
      timeout: 3e5
    });
    return {
      passed: true,
      summary: `${testFiles.length} test files passed`,
      failures: []
    };
  } catch (error) {
    const output = extractErrorOutput(error);
    return {
      passed: false,
      summary: "Tests failed",
      failures: parseTestFailures(output)
    };
  }
}
function parseTestFailures(output) {
  const failures = [];
  const lines = output.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const failMatch = line.match(/FAIL\s+(.+\.test\.[tj]sx?)/);
    if (failMatch) {
      failures.push({
        testFile: failMatch[1],
        testName: "unknown",
        error: lines.slice(i, i + FAILURE_CONTEXT_LINES).join("\n")
      });
    }
  }
  return failures;
}

// src/subagent-stop/test-verification.ts
async function verifyAgentTests(cwd, filesModified, state) {
  const testsToRun = [];
  for (const file of filesModified) {
    const tests = findTestsForFile(file);
    testsToRun.push(...tests);
  }
  const uniqueTests = [...new Set(testsToRun)];
  if (uniqueTests.length === 0) {
    return { ran: false, passed: true, summary: "No tests for modified files" };
  }
  const result = await runTests(uniqueTests, cwd);
  if (result.passed) {
    state.tests.passingFiles.push(
      ...uniqueTests.filter((test) => !state.tests.passingFiles.includes(test))
    );
  } else {
    for (const failure of result.failures) {
      if (!state.tests.failingFiles.includes(failure.testFile)) {
        state.tests.failingFiles.push(failure.testFile);
      }
      state.tests.pendingFixes.push({
        testFile: failure.testFile,
        error: failure.error,
        fixAttempts: 0
      });
    }
  }
  return {
    ran: true,
    passed: result.passed,
    summary: result.summary
  };
}

// src/subagent-stop/index.ts
function createResponse2(options) {
  const response = {
    continue: true
  };
  if (options?.systemMessage) {
    response.systemMessage = options.systemMessage;
  }
  if (options?.output) {
    response.output = options.output;
  }
  return response;
}
function extractInputFields(input) {
  return {
    agentId: input.agent_id ?? input.subagent_id ?? "",
    agentType: input.agent_type ?? input.subagent_type ?? "unknown",
    transcriptPath: input.agent_transcript_path ?? input.subagent_transcript_path ?? "",
    cwd: input.cwd ?? process.cwd()
  };
}
async function validateAndTest(cwd, transcriptPath, state) {
  if (!transcriptPath) {
    return { validationResult: void 0, testResult: void 0, updatedState: state };
  }
  const validationOutput = await validateAgentOutput(cwd, transcriptPath, state);
  const validationResult = validationOutput;
  const updatedState = validationOutput.state;
  debug("Validation result", {
    valid: validationResult.valid,
    filesModified: validationResult.filesModified.length,
    errors: validationResult.errors.length
  });
  let testResult;
  if (validationResult.filesModified.length > 0) {
    testResult = await verifyAgentTests(cwd, validationResult.filesModified, updatedState);
    debug("Test verification result", {
      ran: testResult.ran,
      passed: testResult.passed,
      summary: testResult.summary
    });
  }
  return { validationResult, testResult, updatedState };
}
async function updateAnalytics(tracking, status) {
  const analytics = await loadAnalytics();
  if (!analytics?.subagents_spawned) {
    return;
  }
  const subagentEntry = analytics.subagents_spawned.find(
    (s) => s.type === tracking.agent_type && s.started_at === tracking.started_at
  );
  if (subagentEntry) {
    subagentEntry.completed_at = (/* @__PURE__ */ new Date()).toISOString();
    subagentEntry.success = status === "completed";
    await saveAnalytics(analytics);
  }
}
function determineStatus(validationResult, testResult) {
  const hasValidationErrors = validationResult?.valid === false;
  const hasTestFailures = testResult?.passed === false;
  return hasValidationErrors || hasTestFailures ? "failed" : "completed";
}
function buildIssuesMessage(agentType, validationResult, testResult) {
  const issues = [];
  if (validationResult && !validationResult.valid) {
    issues.push("Validation errors: " + validationResult.errors.join(", "));
  }
  if (testResult && !testResult.passed) {
    issues.push("Test failures: " + testResult.summary);
  }
  if (issues.length === 0) {
    return void 0;
  }
  return "[GoodVibes] Agent " + agentType + " completed with issues: " + issues.join("; ");
}
async function runSubagentStopHook() {
  try {
    debug("SubagentStop hook starting");
    const rawInput = await readHookInput();
    debug("Raw input shape:", Object.keys(rawInput || {}));
    const input = rawInput;
    const { agentId, agentType, transcriptPath, cwd } = extractInputFields(input);
    debug("SubagentStop received input", {
      agent_id: agentId,
      agent_type: agentType,
      session_id: input.session_id,
      transcript_path: transcriptPath
    });
    let state = await loadState(cwd);
    let validationResult;
    let testResult;
    let telemetryWritten = false;
    let durationMs = 0;
    const tracking = agentId ? await getAgentTracking(cwd, agentId) : null;
    if (tracking) {
      debug("Found matching tracking entry", {
        agent_id: tracking.agent_id,
        agent_type: tracking.agent_type,
        started_at: tracking.started_at
      });
      durationMs = Date.now() - new Date(tracking.started_at).getTime();
      const validated = await validateAndTest(cwd, transcriptPath, state);
      validationResult = validated.validationResult;
      testResult = validated.testResult;
      state = validated.updatedState;
      const status = determineStatus(validationResult, testResult);
      const telemetryEntry = await buildTelemetryEntry(tracking, transcriptPath, status);
      await writeTelemetryEntry(cwd, telemetryEntry);
      telemetryWritten = true;
      debug("Telemetry entry written", {
        agent_id: telemetryEntry.agent_id,
        duration_ms: telemetryEntry.duration_ms,
        status: telemetryEntry.status
      });
      await removeAgentTracking(cwd, agentId);
      debug("Removed agent tracking", { agent_id: agentId });
      await updateAnalytics(tracking, status);
      await saveState(cwd, state);
    } else {
      debug("No matching tracking entry found", { agent_id: agentId, agent_type: agentType });
      const validated = await validateAndTest(cwd, transcriptPath, state);
      validationResult = validated.validationResult;
      testResult = validated.testResult;
      state = validated.updatedState;
      if (transcriptPath) {
        await saveState(cwd, state);
      }
    }
    const systemMessage = buildIssuesMessage(agentType, validationResult, testResult);
    respond(
      createResponse2({
        systemMessage,
        output: {
          validation: validationResult,
          tests: testResult,
          telemetryWritten,
          agentId: agentId || void 0,
          agentType,
          durationMs
        }
      })
    );
  } catch (error) {
    logError("SubagentStop main", error);
    respond(createResponse2());
  }
}
if (!isTestEnvironment()) {
  runSubagentStopHook().catch((error) => {
    logError("SubagentStop uncaught", error);
    respond(createResponse2());
  });
}
