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

// src/subagent-start/index.ts
import * as path9 from "path";

// src/shared/config.ts
import * as fs3 from "fs/promises";
import * as path4 from "path";

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
var QUALITY_GATES = [
  {
    name: "TypeScript",
    check: "npx tsc --noEmit",
    autoFix: null,
    blocking: true
  },
  {
    name: "ESLint",
    check: "npx eslint . --max-warnings=0",
    autoFix: "npx eslint . --fix",
    blocking: true
  },
  {
    name: "Prettier",
    check: "npx prettier --check .",
    autoFix: "npx prettier --write .",
    blocking: false
  },
  { name: "Tests", check: "npm test", autoFix: null, blocking: true }
];
function getDefaultSharedConfig() {
  return {
    telemetry: {
      enabled: true,
      anonymize: true
    },
    quality: {
      gates: QUALITY_GATES,
      autoFix: true
    },
    memory: {
      enabled: true,
      maxEntries: 100
    },
    checkpoints: {
      enabled: true,
      triggers: CHECKPOINT_TRIGGERS
    }
  };
}
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
async function loadSharedConfig(cwd) {
  const configPath = path4.join(cwd, ".goodvibes", "settings.json");
  const defaults = getDefaultSharedConfig();
  if (!await fileExists(configPath)) {
    return defaults;
  }
  try {
    const content = await fs3.readFile(configPath, "utf-8");
    const userConfig = JSON.parse(content);
    if (typeof userConfig === "object" && userConfig !== null) {
      const configObj = userConfig;
      const config = "goodvibes" in configObj && typeof configObj.goodvibes === "object" && configObj.goodvibes !== null ? configObj.goodvibes : configObj;
      return deepMerge(defaults, config);
    }
    return defaults;
  } catch (error) {
    debug("loadSharedConfig failed", { error: String(error) });
    return defaults;
  }
}

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
import * as fs4 from "fs/promises";
async function ensureCacheDir() {
  if (!await fileExists(CACHE_DIR)) {
    await fs4.mkdir(CACHE_DIR, { recursive: true });
  }
}
async function loadAnalytics() {
  await ensureCacheDir();
  if (await fileExists(ANALYTICS_FILE)) {
    try {
      const content = await fs4.readFile(ANALYTICS_FILE, "utf-8");
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
  await fs4.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
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
import * as fs5 from "fs/promises";
import * as path5 from "path";

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
  const goodvibesDir = path5.join(cwd, ".goodvibes");
  const statePath = path5.join(goodvibesDir, STATE_FILE);
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
  const statePath = path5.join(cwd, ".goodvibes", STATE_FILE);
  const stateDir = path5.dirname(statePath);
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

// src/subagent-stop/telemetry.ts
import * as fs6 from "fs/promises";
import * as path6 from "path";
function isTrackingsRecord(value) {
  return typeof value === "object" && value !== null;
}
var TRACKING_FILE = "state/agent-tracking.json";
async function saveAgentTracking(cwd, tracking) {
  await ensureGoodVibesDir(cwd);
  const trackingPath = path6.join(cwd, ".goodvibes", TRACKING_FILE);
  let trackings = {};
  if (await fileExists(trackingPath)) {
    try {
      const parsed = JSON.parse(await fs6.readFile(trackingPath, "utf-8"));
      if (isTrackingsRecord(parsed)) {
        trackings = parsed;
      }
    } catch (error) {
      debug("telemetry operation failed", { error: String(error) });
    }
  }
  trackings[tracking.agent_id] = tracking;
  await fs6.writeFile(trackingPath, JSON.stringify(trackings, null, 2));
}

// src/telemetry/agents.ts
import { exec as execCallback2 } from "child_process";
import * as fs7 from "fs/promises";
import * as path7 from "path";
import { promisify as promisify2 } from "util";
var exec2 = promisify2(execCallback2);
var STALE_AGENT_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
function isActiveAgentsState(value) {
  return typeof value === "object" && value !== null && "agents" in value && "last_updated" in value && typeof value.agents === "object" && typeof value.last_updated === "string";
}
function getActiveAgentsFilePath(goodVibesDir, stateDir) {
  return path7.join(goodVibesDir, stateDir, "active-agents.json");
}
async function getGitInfo(cwd) {
  const result = {};
  try {
    const { stdout: branch } = await exec2("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 3e4,
      maxBuffer: 1024 * 1024
    });
    result.branch = branch.trim();
  } catch (error) {
    debug(
      "Git branch unavailable:",
      error instanceof Error ? error.message : "unknown"
    );
  }
  try {
    const { stdout: commit } = await exec2("git rev-parse --short HEAD", {
      cwd,
      encoding: "utf-8",
      timeout: 3e4,
      maxBuffer: 1024 * 1024
    });
    result.commit = commit.trim();
  } catch (error) {
    debug(
      "Git commit unavailable:",
      error instanceof Error ? error.message : "unknown"
    );
  }
  return result;
}
function deriveProjectName(cwd) {
  const dirName = path7.basename(cwd);
  if (dirName.match(/^[a-f0-9]{8,}$/i) || dirName === "tmp" || dirName === "temp") {
    const parentDir = path7.basename(path7.dirname(cwd));
    if (parentDir && parentDir !== "." && parentDir !== "/") {
      return parentDir;
    }
  }
  return dirName || "unknown-project";
}
async function loadActiveAgents(activeAgentsFile) {
  if (await fileExists(activeAgentsFile)) {
    try {
      const content = await fs7.readFile(activeAgentsFile, "utf-8");
      const parsed = JSON.parse(content);
      if (isActiveAgentsState(parsed)) {
        return parsed;
      }
    } catch (error) {
      logError("loadActiveAgents", error);
    }
  }
  return {
    agents: {},
    last_updated: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function saveActiveAgents(activeAgentsFile, state) {
  try {
    state.last_updated = (/* @__PURE__ */ new Date()).toISOString();
    await fs7.writeFile(activeAgentsFile, JSON.stringify(state, null, 2));
  } catch (error) {
    logError("saveActiveAgents", error);
  }
}
async function cleanupStaleAgents(activeAgentsFile) {
  const state = await loadActiveAgents(activeAgentsFile);
  const now = Date.now();
  let removed = 0;
  for (const [agentId, entry] of Object.entries(state.agents)) {
    const startedAt = new Date(entry.started_at).getTime();
    if (now - startedAt > STALE_AGENT_MAX_AGE_MS) {
      delete state.agents[agentId];
      removed++;
    }
  }
  if (removed > 0) {
    await saveActiveAgents(activeAgentsFile, state);
    debug("Cleaned up " + removed + " stale agent entries");
  }
  return removed;
}

// src/subagent-start/context-injection.ts
import * as path8 from "path";

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

// src/subagent-start/context-injection.ts
async function buildSubagentContext(cwd, agentType, _sessionId) {
  const _sharedConfig = await loadSharedConfig(cwd);
  const automationConfig = getDefaultConfig();
  const projectName = path8.basename(cwd);
  const contextParts = [];
  contextParts.push(`[GoodVibes] Project: ${projectName}`);
  contextParts.push(`Mode: ${automationConfig.automation.mode}`);
  if (agentType.includes("backend")) {
    contextParts.push(
      "Remember: Write-local only. All changes must be in the project root."
    );
  }
  if (agentType.includes("test")) {
    contextParts.push(
      "Remember: Tests must actually verify behavior, not just exist."
    );
  }
  if (agentType.includes("brutal-reviewer")) {
    contextParts.push("Remember: Be brutally honest. Score out of 10.");
  }
  return {
    additionalContext: contextParts.join("\n")
  };
}

// src/subagent-start/index.ts
function createResponse2(options) {
  const response = {
    continue: true
  };
  if (options?.systemMessage) {
    response.systemMessage = options.systemMessage;
  }
  if (options?.additionalContext) {
    response.additionalContext = options.additionalContext;
  }
  return response;
}
async function runSubagentStartHook() {
  try {
    debug("SubagentStart hook starting");
    const rawInput = await readHookInput();
    debug("Raw input shape:", Object.keys(rawInput || {}));
    const input = rawInput;
    const agentId = input.agent_id || input.subagent_id || "agent_" + Date.now();
    const agentType = input.agent_type || input.subagent_type || "unknown";
    const taskDescription = input.task_description || input.task || "";
    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id || "";
    const TASK_PREVIEW_LENGTH = 100;
    debug("SubagentStart received input", {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      task_preview: taskDescription?.substring(0, TASK_PREVIEW_LENGTH),
      cwd
    });
    const goodvibesDir = path9.join(cwd, ".goodvibes");
    const stateDir = path9.join(goodvibesDir, "state");
    const activeAgentsFile = getActiveAgentsFilePath(goodvibesDir, stateDir);
    await cleanupStaleAgents(activeAgentsFile);
    const gitInfo = await getGitInfo(cwd);
    debug("Git info", gitInfo);
    const projectName = deriveProjectName(cwd);
    debug("Project name", projectName);
    const tracking = {
      agent_id: agentId,
      agent_type: agentType,
      session_id: sessionId,
      project: cwd,
      project_name: projectName,
      git_branch: gitInfo.branch,
      git_commit: gitInfo.commit,
      started_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveAgentTracking(cwd, tracking);
    debug("Saved agent tracking", { agent_id: agentId });
    const analytics = await loadAnalytics();
    if (analytics) {
      const TASK_MAX_LENGTH = 200;
      analytics.subagents_spawned = analytics.subagents_spawned || [];
      analytics.subagents_spawned.push({
        type: agentType,
        task: taskDescription?.substring(0, TASK_MAX_LENGTH),
        started_at: tracking.started_at
      });
      await saveAnalytics(analytics);
    }
    const state = await loadState(cwd);
    if (!state.session.id && sessionId) {
      state.session.id = sessionId;
      state.session.startedAt = (/* @__PURE__ */ new Date()).toISOString();
      await saveState(cwd, state);
    }
    const subagentContext = await buildSubagentContext(
      cwd,
      agentType,
      sessionId
    );
    const reminders = [];
    const stackInfo = analytics?.detected_stack;
    if (stackInfo) {
      reminders.push("Detected stack: " + JSON.stringify(stackInfo));
    }
    if (gitInfo.branch) {
      reminders.push("Git branch: " + gitInfo.branch);
    }
    reminders.push("Project: " + projectName);
    let additionalContext;
    if (subagentContext.additionalContext) {
      additionalContext = subagentContext.additionalContext + "\n\n" + reminders.join("\n");
    } else {
      additionalContext = "[GoodVibes Project Context]\n" + reminders.join("\n");
    }
    const goodvibesAgents = [
      "goodvibes:factory",
      "goodvibes:skill-creator",
      "goodvibes:backend-engineer",
      "goodvibes:content-platform",
      "goodvibes:devops-deployer",
      "goodvibes:frontend-architect",
      "goodvibes:fullstack-integrator",
      "goodvibes:test-engineer",
      "goodvibes:brutal-reviewer",
      "goodvibes:workflow-planner"
    ];
    let systemMessage;
    if (goodvibesAgents.includes(agentType)) {
      systemMessage = "[GoodVibes] Agent " + agentType + " starting. Project: " + projectName + (gitInfo.branch ? ", Branch: " + gitInfo.branch : "");
    } else {
      debug("Non-GoodVibes agent started: " + agentType);
    }
    respond(
      createResponse2({
        systemMessage,
        additionalContext
      })
    );
  } catch (error) {
    logError("SubagentStart main", error);
    respond(createResponse2());
  }
}
if (!isTestEnvironment()) {
  runSubagentStartHook().catch((error) => {
    logError("SubagentStart uncaught", error);
    respond(createResponse2());
  });
}
