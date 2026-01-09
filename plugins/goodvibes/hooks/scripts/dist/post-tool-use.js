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

// src/post-tool-use/index.ts
import * as fs7 from "fs/promises";
import * as path6 from "path";

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import * as fs2 from "fs/promises";
import * as path3 from "path";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
var PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(process.cwd(), "..");
var PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
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
    return error.stdout?.toString() ?? error.stderr?.toString() ?? error.message ?? "Unknown error";
  }
  return String(error);
}

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "100",
  10
);
var CHECKPOINT_TRIGGERS = {
  fileCountThreshold: 5,
  afterAgentComplete: true,
  afterMajorChange: true
};

// src/shared/hook-io.ts
function isTestEnvironment() {
  return (
    /* v8 ignore next */
    process.env.NODE_ENV === "test" || process.env.VITEST === "true" || typeof globalThis.__vitest_worker__ !== "undefined"
  );
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
async function getSessionId() {
  const analytics = await loadAnalytics();
  if (analytics?.session_id) {
    return analytics.session_id;
  }
  return `session_${Date.now()}`;
}
async function logToolUsage(usage) {
  const existingAnalytics = await loadAnalytics();
  const analytics = existingAnalytics ?? {
    session_id: await getSessionId(),
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    tool_usage: [],
    skills_recommended: [],
    validations_run: 0,
    issues_found: 0
  };
  analytics.tool_usage.push(usage);
  await saveAnalytics(analytics);
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

// src/state/persistence.ts
import * as fs4 from "fs/promises";
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
    const content = await fs4.readFile(statePath, "utf-8");
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
    await fs4.mkdir(stateDir, { recursive: true });
  }
  try {
    const tempPath = statePath + ".tmp";
    await fs4.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs4.rename(tempPath, statePath);
  } catch (error) {
    debug("Failed to save state", error);
    if (throwOnError) {
      throw error;
    }
  }
}

// src/state/updaters.ts
function updateNestedState(state, key, updates) {
  return {
    ...state,
    [key]: { ...state[key], ...updates }
  };
}
function updateTestState(state, updates) {
  return updateNestedState(state, "tests", updates);
}
function updateBuildState(state, updates) {
  return updateNestedState(state, "build", updates);
}

// src/types/config.ts
function getDefaultConfig() {
  return {
    automation: {
      enabled: true,
      mode: "default",
      testing: {
        runAfterFileChange: true,
        runBeforeCommit: true,
        runBeforeMerge: true,
        testCommand: "npm test",
        maxRetries: 3
      },
      building: {
        runAfterFileThreshold: 5,
        runBeforeCommit: true,
        runBeforeMerge: true,
        buildCommand: "npm run build",
        typecheckCommand: "npx tsc --noEmit",
        maxRetries: 3
      },
      git: {
        autoFeatureBranch: true,
        autoCheckpoint: true,
        autoMerge: true,
        checkpointThreshold: 5,
        mainBranch: "main"
      },
      recovery: {
        maxRetriesPerError: 3,
        logFailures: true,
        skipAfterMaxRetries: true
      }
    }
  };
}

// src/post-tool-use/dev-server-monitor.ts
var DEV_SERVER_PATTERNS = [
  /npm run dev/,
  /npm start/,
  /yarn dev/,
  /pnpm dev/,
  /next dev/,
  /vite/,
  /node.*server/
];
function isDevServerCommand(command) {
  return DEV_SERVER_PATTERNS.some((pattern) => pattern.test(command));
}
function registerDevServer(state, pid, command, port) {
  state.devServers[pid] = {
    command,
    port,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastError: null
  };
}
function recordDevServerError(state, pid, error) {
  if (state.devServers[pid]) {
    state.devServers[pid].lastError = error;
  }
}
var ERROR_PATTERNS = [
  /Error: (.+)/,
  /Unhandled Runtime Error: (.+)/,
  /TypeError: (.+)/,
  /ReferenceError: (.+)/,
  /SyntaxError: (.+)/,
  /Module not found: (.+)/
];
function parseDevServerErrors(output) {
  const errors = [];
  for (const pattern of ERROR_PATTERNS) {
    const matches = output.matchAll(new RegExp(pattern, "g"));
    for (const match of matches) {
      if (match[1]) {
        errors.push(match[1]);
      }
    }
  }
  return errors;
}

// src/post-tool-use/bash-handler.ts
function handleBashTool(state, input) {
  const toolInput = input.tool_input;
  const command = toolInput?.command;
  const output = toolInput?.output;
  if (!command) {
    return { isDevServer: false, errors: [] };
  }
  if (isDevServerCommand(command)) {
    const pid = `bash_${Date.now()}`;
    registerDevServer(state, pid, command, 3e3);
    debug(`Registered dev server: ${command}`);
    return { isDevServer: true, errors: [] };
  }
  if (output) {
    const errors = parseDevServerErrors(output);
    if (errors.length > 0) {
      for (const pid of Object.keys(state.devServers)) {
        recordDevServerError(state, pid, errors.join("; "));
      }
      return { isDevServer: false, errors };
    }
  }
  return { isDevServer: false, errors: [] };
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

// src/automation/test-runner.ts
import { exec as exec3 } from "child_process";
import * as fs5 from "fs";
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
  return testPatterns.filter((pattern) => fs5.existsSync(pattern));
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

// src/automation/git-operations.ts
import { exec as exec4 } from "child_process";
import { promisify as promisify4 } from "util";

// src/automation/spawn-utils.ts
import { spawn } from "child_process";
function spawnAsync(command, args, options) {
  return new Promise((resolve3) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    const timeoutId = options.timeout ? setTimeout(() => {
      child.kill("SIGTERM");
      resolve3({
        code: null,
        stdout,
        stderr: stderr + "\nProcess timed out"
      });
    }, options.timeout) : (
      /* v8 ignore next -- @preserve defensive: all exported functions always provide timeout */
      null
    );
    child.on("close", (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve3({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve3({ code: null, stdout, stderr: err.message });
    });
  });
}
function sanitizeForGit(input) {
  return input.replace(/[`$\\;"'|&<>(){}[\]!#*?~]/g, "");
}

// src/automation/git-operations.ts
var execAsync3 = promisify4(exec4);
async function execGit(command, cwd) {
  try {
    const { stdout } = await execAsync3(command, {
      cwd,
      encoding: "utf-8",
      timeout: 3e4
    });
    return stdout.trim();
  } catch (error) {
    debug("execGit failed", { command, error: String(error) });
    return null;
  }
}
async function hasUncommittedChanges(cwd) {
  const status = await execGit("git status --porcelain", cwd);
  return status !== null && status.length > 0;
}
async function createCheckpoint(cwd, message) {
  if (!await hasUncommittedChanges(cwd)) {
    return false;
  }
  try {
    const safeMessage = sanitizeForGit(message);
    const commitMessage = `checkpoint: ${safeMessage}

 Auto-checkpoint by GoodVibes`;
    await execAsync3("git add -A", { cwd, timeout: 3e4 });
    const result = await spawnAsync("git", ["commit", "-m", commitMessage], {
      cwd,
      timeout: 3e4
    });
    return result.code === 0;
  } catch (error) {
    debug("createCheckpoint failed", { error: String(error) });
    return false;
  }
}
async function createFeatureBranch(cwd, name) {
  try {
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const branchName = `feature/${safeName}`;
    const result = await spawnAsync("git", ["checkout", "-b", branchName], {
      cwd,
      timeout: 3e4
    });
    return result.code === 0;
  } catch (error) {
    debug("createFeatureBranch failed", { error: String(error) });
    return false;
  }
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
function trackFileCreation(state, filePath) {
  const created = new Set(state.files.createdThisSession);
  created.add(filePath);
  const stateWithCreated = {
    ...state,
    files: {
      ...state.files,
      createdThisSession: Array.from(created)
    }
  };
  return trackFileModification(stateWithCreated, filePath);
}
function clearCheckpointTracking(state) {
  return {
    ...state,
    files: {
      ...state.files,
      modifiedSinceCheckpoint: []
    }
  };
}
function getModifiedFileCount(state) {
  return state.files.modifiedSinceCheckpoint.length;
}

// src/post-tool-use/checkpoint-manager.ts
function shouldCheckpoint(state, _cwd) {
  const fileCount = getModifiedFileCount(state);
  if (fileCount >= CHECKPOINT_TRIGGERS.fileCountThreshold) {
    return { triggered: true, reason: `${fileCount} files modified` };
  }
  return { triggered: false, reason: "" };
}
async function createCheckpointIfNeeded(state, cwd, forcedReason) {
  const trigger = forcedReason ? { triggered: true, reason: forcedReason } : shouldCheckpoint(state, cwd);
  if (!trigger.triggered) {
    return { created: false, message: "", state };
  }
  if (!await hasUncommittedChanges(cwd)) {
    return { created: false, message: "No changes to checkpoint", state };
  }
  const success = await createCheckpoint(cwd, trigger.reason);
  if (success) {
    const updatedState = clearCheckpointTracking(state);
    const finalState = {
      ...updatedState,
      git: {
        ...updatedState.git,
        checkpoints: [
          {
            hash: "",
            // Would need to get from git
            message: trigger.reason,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          },
          ...updatedState.git.checkpoints
        ]
      }
    };
    return {
      created: true,
      message: `Checkpoint: ${trigger.reason}`,
      state: finalState
    };
  }
  return { created: false, message: "Checkpoint failed", state };
}

// src/post-tool-use/git-branch-manager.ts
var BRANCH_NAME_MAX_LENGTH = 50;
function shouldCreateFeatureBranch(state, _cwd) {
  if (state.git.featureBranch) {
    return false;
  }
  if (state.git.currentBranch !== state.git.mainBranch) {
    return false;
  }
  return state.files.createdThisSession.length === 1;
}
async function maybeCreateFeatureBranch(state, cwd, featureName) {
  if (!shouldCreateFeatureBranch(state, cwd)) {
    return { created: false, branchName: null };
  }
  const name = featureName ?? state.session.featureDescription ?? "feature";
  const branchName = `feature/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, BRANCH_NAME_MAX_LENGTH)}`;
  const success = await createFeatureBranch(cwd, name);
  if (success) {
    state.git.featureBranch = branchName;
    state.git.currentBranch = branchName;
    state.git.featureStartedAt = (/* @__PURE__ */ new Date()).toISOString();
    state.git.featureDescription = name;
    return { created: true, branchName };
  }
  return { created: false, branchName: null };
}

// src/post-tool-use/automation-runners.ts
async function maybeRunTests(state, config, filePath, cwd) {
  if (!config.automation.enabled || !config.automation.testing.runAfterFileChange) {
    return { ran: false, result: null, state };
  }
  if (filePath.includes(".test.") || filePath.includes(".spec.")) {
    return { ran: false, result: null, state };
  }
  const testFiles = findTestsForFile(filePath);
  if (testFiles.length === 0) {
    debug(`No tests found for: ${filePath}`);
    return { ran: false, result: null, state };
  }
  debug(`Running tests for: ${filePath}`, { testFiles });
  try {
    const result = await runTests(testFiles, cwd);
    if (result.passed) {
      state = updateTestState(state, {
        lastQuickRun: (/* @__PURE__ */ new Date()).toISOString(),
        passingFiles: [.../* @__PURE__ */ new Set([...state.tests.passingFiles, ...testFiles])],
        failingFiles: state.tests.failingFiles.filter(
          (f) => !testFiles.includes(f)
        )
      });
    } else {
      state = updateTestState(state, {
        lastQuickRun: (/* @__PURE__ */ new Date()).toISOString(),
        failingFiles: [.../* @__PURE__ */ new Set([...state.tests.failingFiles, ...testFiles])],
        passingFiles: state.tests.passingFiles.filter(
          (file) => !testFiles.includes(file)
        ),
        pendingFixes: result.failures.map((failure) => ({
          testFile: failure.testFile,
          error: failure.error,
          fixAttempts: 0
        }))
      });
    }
    return { ran: true, result, state };
  } catch (error) {
    logError("maybeRunTests", error);
    return { ran: false, result: null, state };
  }
}
async function maybeRunBuild(state, config, cwd) {
  if (!config.automation.enabled) {
    return { ran: false, result: null, state };
  }
  const modifiedCount = getModifiedFileCount(state);
  const threshold = config.automation.building.runAfterFileThreshold;
  if (modifiedCount < threshold) {
    debug(
      `Build skipped: ${modifiedCount} files modified (threshold: ${threshold})`
    );
    return { ran: false, result: null, state };
  }
  debug(`Running typecheck after ${modifiedCount} file modifications`);
  try {
    const result = await runTypeCheck(cwd);
    state = updateBuildState(state, {
      lastRun: (/* @__PURE__ */ new Date()).toISOString(),
      status: result.passed ? "passing" : "failing",
      errors: result.errors,
      fixAttempts: result.passed ? 0 : state.build.fixAttempts + 1
    });
    return { ran: true, result, state };
  } catch (error) {
    logError("maybeRunBuild", error);
    return { ran: false, result: null, state };
  }
}
async function maybeCreateCheckpoint(state, config, cwd) {
  if (!config.automation.enabled || !config.automation.git.autoCheckpoint) {
    return { created: false, message: "", state };
  }
  return await createCheckpointIfNeeded(state, cwd);
}
async function maybeCreateBranch(state, config, cwd) {
  if (!config.automation.enabled || !config.automation.git.autoFeatureBranch) {
    return { created: false, branchName: null };
  }
  return await maybeCreateFeatureBranch(state, cwd);
}

// src/post-tool-use/file-automation.ts
function handleFileModification(state, input, toolName) {
  const toolInput = input.tool_input;
  const filePath = toolInput?.file_path;
  if (!filePath) {
    return { tracked: false, filePath: null, state };
  }
  let newState;
  if (toolName === "Write") {
    newState = trackFileCreation(state, filePath);
    debug(`Tracked file creation: ${filePath}`);
  } else {
    newState = trackFileModification(state, filePath);
    debug(`Tracked file modification: ${filePath}`);
  }
  return { tracked: true, filePath, state: newState };
}
async function processFileAutomation(state, config, input, toolName) {
  const messages = [];
  const cwd = input.cwd;
  const trackResult = handleFileModification(state, input, toolName);
  if (!trackResult.tracked || !trackResult.filePath) {
    return { messages, state };
  }
  state = trackResult.state;
  const testResult = await maybeRunTests(
    state,
    config,
    trackResult.filePath,
    cwd
  );
  state = testResult.state;
  if (testResult.ran && testResult.result) {
    if (!testResult.result.passed) {
      messages.push(`Tests failed: ${testResult.result.summary}`);
    }
  }
  const buildResult = await maybeRunBuild(state, config, cwd);
  state = buildResult.state;
  if (buildResult.ran && buildResult.result) {
    if (!buildResult.result.passed) {
      messages.push(`Build check: ${buildResult.result.summary}`);
    }
  }
  const checkpoint = await maybeCreateCheckpoint(state, config, cwd);
  state = checkpoint.state;
  if (checkpoint.created) {
    messages.push(checkpoint.message);
  }
  const branch = await maybeCreateBranch(state, config, cwd);
  if (branch.created && branch.branchName) {
    messages.push(`Created feature branch: ${branch.branchName}`);
  }
  return { messages, state };
}

// src/post-tool-use/mcp-handlers.ts
import * as fs6 from "fs/promises";
import * as path5 from "path";

// src/post-tool-use/response.ts
function createResponse2(systemMessage) {
  return {
    continue: true,
    systemMessage
  };
}
function combineMessages(messages) {
  return messages.length > 0 ? messages.join(" | ") : void 0;
}

// src/post-tool-use/mcp-handlers.ts
async function handleDetectStack(input) {
  try {
    debug("handleDetectStack called", { has_tool_input: !!input.tool_input });
    await ensureCacheDir();
    const cacheFile = path5.join(CACHE_DIR, "detected-stack.json");
    if (input.tool_input) {
      await fs6.writeFile(cacheFile, JSON.stringify(input.tool_input, null, 2));
      debug(`Cached stack detection to ${cacheFile}`);
    }
    await logToolUsage({
      tool: "detect_stack",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    respond(
      createResponse2(
        "Stack detected. Consider using recommend_skills for relevant skill suggestions."
      )
    );
  } catch (error) {
    logError("handleDetectStack", error);
    respond(
      createResponse2(
        `Error caching stack: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
async function handleRecommendSkills(input) {
  try {
    const analytics = await loadAnalytics();
    if (analytics && input.tool_input) {
      const toolInput = input.tool_input;
      if (toolInput.recommendations && Array.isArray(toolInput.recommendations)) {
        const skillPaths = toolInput.recommendations.filter(
          (r) => typeof r === "object" && r !== null && "path" in r && typeof r.path === "string"
        ).map((rec) => rec.path);
        analytics.skills_recommended.push(...skillPaths);
        await saveAnalytics(analytics);
      }
    }
    await logToolUsage({
      tool: "recommend_skills",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}
async function handleSearch(_input) {
  await logToolUsage({
    tool: "search",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    success: true
  });
  respond(createResponse2());
}
async function handleValidateImplementation(input) {
  try {
    const analytics = await loadAnalytics();
    if (analytics) {
      analytics.validations_run += 1;
      const toolInput = input.tool_input;
      if (toolInput?.summary) {
        const summary = toolInput.summary;
        analytics.issues_found += (summary.errors || 0) + (summary.warnings || 0);
      }
      await saveAnalytics(analytics);
    }
    await logToolUsage({
      tool: "validate_implementation",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}
async function handleRunSmokeTest(input) {
  try {
    await logToolUsage({
      tool: "run_smoke_test",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    const toolInput = input.tool_input;
    if (toolInput?.passed === false) {
      const summary = toolInput.summary;
      const failed = summary?.failed ?? 0;
      respond(
        createResponse2(
          `Smoke test: ${failed} check(s) failed. Review output for details.`
        )
      );
      return;
    }
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}
async function handleCheckTypes(input) {
  try {
    const analytics = await loadAnalytics();
    await logToolUsage({
      tool: "check_types",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: true
    });
    const toolInput = input.tool_input;
    if (toolInput?.errors && Array.isArray(toolInput.errors) && analytics) {
      analytics.issues_found += toolInput.errors.length;
      await saveAnalytics(analytics);
      respond(
        createResponse2(
          `TypeScript: ${toolInput.errors.length} type error(s) found.`
        )
      );
      return;
    }
    respond(createResponse2());
  } catch (error) {
    debug("handler failed", { error: String(error) });
    respond(createResponse2());
  }
}

// src/post-tool-use/index.ts
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge(
        result[key],
        source[key]
      );
    } else if (source[key] !== void 0) {
      result[key] = source[key];
    }
  }
  return result;
}
async function loadAutomationConfig(cwd) {
  const configPath = path6.join(cwd, ".goodvibes", "automation.json");
  const defaults = getDefaultConfig();
  if (!await fileExists(configPath)) {
    return defaults;
  }
  try {
    const content = await fs7.readFile(configPath, "utf-8");
    const userConfig = JSON.parse(content);
    if (typeof userConfig === "object" && userConfig !== null) {
      return deepMerge(defaults, userConfig);
    }
    return defaults;
  } catch (error) {
    debug("loadAutomationConfig failed", { error: String(error) });
    return defaults;
  }
}
async function runPostToolUseHook() {
  try {
    const input = await readHookInput();
    debug("PostToolUse hook received input", { tool_name: input.tool_name });
    const cwd = input.cwd;
    let state = await loadState(cwd);
    const config = await loadAutomationConfig(cwd);
    const fullToolName = input.tool_name ?? "";
    const toolName = fullToolName.includes("__") ? fullToolName.split("__").pop() ?? "" : fullToolName;
    debug(`Processing tool: ${toolName} (full: ${fullToolName})`);
    let automationMessages = [];
    switch (toolName) {
      case "Edit":
      case "Write": {
        const result = await processFileAutomation(
          state,
          config,
          input,
          toolName
        );
        state = result.state;
        automationMessages = result.messages;
        break;
      }
      case "Bash": {
        const bashResult = handleBashTool(state, input);
        const MAX_ERRORS_TO_DISPLAY = 3;
        if (bashResult.errors.length > 0) {
          automationMessages.push(
            `Dev server errors detected: ${bashResult.errors.slice(0, MAX_ERRORS_TO_DISPLAY).join(", ")}`
          );
        }
        break;
      }
      // MCP GoodVibes tools
      case "detect_stack":
        await saveState(cwd, state);
        void handleDetectStack(input);
        return;
      case "recommend_skills":
        await saveState(cwd, state);
        void handleRecommendSkills(input);
        return;
      case "search_skills":
      case "search_agents":
      case "search_tools":
        await saveState(cwd, state);
        void handleSearch(input);
        return;
      case "validate_implementation":
        await saveState(cwd, state);
        void handleValidateImplementation(input);
        return;
      case "run_smoke_test":
        await saveState(cwd, state);
        void handleRunSmokeTest(input);
        return;
      case "check_types":
        await saveState(cwd, state);
        void handleCheckTypes(input);
        return;
      default:
        debug(`Tool '${toolName}' - no special handling`);
    }
    await saveState(cwd, state);
    const systemMessage = combineMessages(automationMessages);
    respond(createResponse2(systemMessage));
  } catch (error) {
    logError("PostToolUse main", error);
    respond(
      createResponse2(
        `Hook error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
if (!isTestEnvironment()) {
  runPostToolUseHook().catch((error) => {
    logError("PostToolUse uncaught", error);
    respond(createResponse2(`Uncaught error: ${String(error)}`));
  });
}
/* v8 ignore else -- @preserve defensive check: match[1] is always truthy with (.+) patterns */
/* v8 ignore else -- @preserve defensive: all exported functions always provide timeout */
