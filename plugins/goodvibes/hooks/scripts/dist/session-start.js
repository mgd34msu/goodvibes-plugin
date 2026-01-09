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
var LOCKFILES = [
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
  "bun.lockb"
];
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
async function validateRegistries() {
  const registries = [
    "skills/_registry.yaml",
    "agents/_registry.yaml",
    "tools/_registry.yaml"
  ];
  const results = await Promise.all(
    registries.map(async (reg) => ({
      reg,
      exists: await fileExists(path3.join(PLUGIN_ROOT, reg))
    }))
  );
  const missing = results.filter((result) => !result.exists).map((result) => result.reg);
  return { valid: missing.length === 0, missing };
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
function createResponse(options = {}) {
  const response = {
    continue: true
  };
  if (options.systemMessage !== void 0) {
    response.systemMessage = options.systemMessage;
  }
  if (options.additionalContext !== void 0) {
    response.additionalContext = options.additionalContext;
  }
  return response;
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
async function saveAnalytics(analytics) {
  await ensureCacheDir();
  await fs3.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
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
function updateSessionState(state, updates) {
  return updateNestedState(state, "session", updates);
}

// src/state/session.ts
function initializeSession(state, sessionId) {
  return {
    ...state,
    session: {
      ...state.session,
      id: sessionId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    files: {
      ...state.files,
      modifiedThisSession: [],
      createdThisSession: []
    }
  };
}

// src/context/stack-detector.ts
import * as fs5 from "fs/promises";
import * as path5 from "path";
var stackCache = /* @__PURE__ */ new Map();
var CACHE_TTL = 5 * 60 * 1e3;
var MAX_CACHE_ENTRIES = 50;
var PRUNE_INTERVAL = 60 * 1e3;
var PRUNE_THRESHOLD = 40;
var lastPruneTime = 0;
function pruneCache() {
  const now = Date.now();
  const timeSinceLastPrune = now - lastPruneTime;
  if (timeSinceLastPrune < PRUNE_INTERVAL && stackCache.size < PRUNE_THRESHOLD && stackCache.size < MAX_CACHE_ENTRIES) {
    return;
  }
  lastPruneTime = now;
  for (const [key, value] of stackCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      stackCache.delete(key);
    }
  }
  if (stackCache.size >= MAX_CACHE_ENTRIES) {
    const entries = Array.from(stackCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const toRemove = entries.slice(0, stackCache.size - MAX_CACHE_ENTRIES + 1);
    for (const [key] of toRemove) {
      stackCache.delete(key);
    }
  }
}
var STACK_INDICATORS = {
  "next.config": "Next.js",
  "nuxt.config": "Nuxt",
  "svelte.config": "SvelteKit",
  "astro.config": "Astro",
  "remix.config": "Remix",
  "vite.config": "Vite",
  "angular.json": "Angular",
  "vue.config": "Vue CLI",
  "prisma/schema.prisma": "Prisma",
  "drizzle.config": "Drizzle",
  "tailwind.config": "Tailwind CSS",
  "vitest.config": "Vitest",
  "jest.config": "Jest",
  "playwright.config": "Playwright",
  "turbo.json": "Turborepo",
  "pnpm-workspace.yaml": "pnpm workspaces",
  "tsconfig.json": "TypeScript"
};
var LOCKFILE_TO_PM = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lockb": "bun"
};
async function detectStack(cwd) {
  const cached = stackCache.get(cwd);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  const frameworks = [];
  let packageManager = null;
  let hasTypeScript = false;
  let isStrict = false;
  for (const [indicator, name] of Object.entries(STACK_INDICATORS)) {
    const checkPath = path5.join(cwd, indicator);
    const checks = await Promise.all([
      fileExists(checkPath),
      fileExists(checkPath + ".js"),
      fileExists(checkPath + ".ts"),
      fileExists(checkPath + ".mjs")
    ]);
    if (checks.some((exists) => exists)) {
      frameworks.push(name);
      if (name === "TypeScript") {
        hasTypeScript = true;
      }
    }
  }
  for (const lockfile of LOCKFILES) {
    if (await fileExists(path5.join(cwd, lockfile))) {
      packageManager = LOCKFILE_TO_PM[lockfile];
      break;
    }
  }
  const tsconfigPath = path5.join(cwd, "tsconfig.json");
  if (await fileExists(tsconfigPath)) {
    try {
      const content = await fs5.readFile(tsconfigPath, "utf-8");
      const config = JSON.parse(content);
      if (typeof config === "object" && config !== null && "compilerOptions" in config) {
        const compilerOptions = config.compilerOptions;
        isStrict = compilerOptions?.strict === true;
      }
    } catch (error) {
      debug("stack-detector: Failed to parse tsconfig.json", error);
    }
  }
  const result = { frameworks, packageManager, hasTypeScript, isStrict };
  pruneCache();
  stackCache.set(cwd, { result, timestamp: now });
  return result;
}
function formatStackInfo(info) {
  if (!info || typeof info !== "object") {
    return "";
  }
  const parts = [];
  if (info.frameworks && info.frameworks.length > 0) {
    parts.push(`Stack: ${info.frameworks.join(", ")}`);
  }
  if (info.hasTypeScript) {
    parts.push(`TypeScript: ${info.isStrict ? "strict" : "not strict"}`);
  }
  if (info.packageManager) {
    parts.push(`Package Manager: ${info.packageManager}`);
  }
  return parts.join("\n");
}

// src/context/git-context.ts
import { exec as execCallback2 } from "child_process";
import * as fs6 from "fs/promises";
import * as path6 from "path";
import { promisify as promisify2 } from "util";
var exec2 = promisify2(execCallback2);
var GIT_DETACHED_HEAD = "detached";
async function execGit(command, cwd) {
  try {
    const { stdout } = await exec2(command, {
      cwd,
      encoding: "utf-8",
      timeout: 3e4,
      maxBuffer: 1024 * 1024
    });
    return stdout.trim();
  } catch (error) {
    debug(`git-context: Git command failed: ${command}`, error);
    return null;
  }
}
async function directoryExists(dirPath) {
  try {
    await fs6.access(dirPath);
    return true;
  } catch (error) {
    debug("git-context failed", { error: String(error) });
    return false;
  }
}
async function getGitContext(cwd) {
  const gitDir = path6.join(cwd, ".git");
  const isRepo = await directoryExists(gitDir);
  if (!isRepo) {
    return {
      isRepo: false,
      branch: null,
      hasUncommittedChanges: false,
      uncommittedFileCount: 0,
      lastCommit: null,
      recentCommits: [],
      aheadBehind: null
    };
  }
  const [branch, status, lastCommit, recentCommitsRaw, abRaw] = await Promise.all([
    execGit("git branch --show-current", cwd),
    execGit("git status --porcelain", cwd),
    execGit('git log -1 --format="%s (%ar)"', cwd),
    execGit('git log -5 --format="- %s"', cwd),
    execGit("git rev-list --left-right --count HEAD...@{u}", cwd)
  ]);
  const uncommittedFiles = (status ?? "").split("\n").filter(Boolean);
  const recentCommits = recentCommitsRaw ? recentCommitsRaw.split("\n") : [];
  let aheadBehind = null;
  if (abRaw) {
    const [ahead, behind] = abRaw.split("	").map(Number);
    aheadBehind = { ahead, behind };
  }
  return {
    isRepo: true,
    branch,
    hasUncommittedChanges: uncommittedFiles.length > 0,
    uncommittedFileCount: uncommittedFiles.length,
    lastCommit,
    recentCommits,
    aheadBehind
  };
}
function formatGitContext(context) {
  if (!context.isRepo) {
    return "Git: Not a git repository";
  }
  const parts = [];
  parts.push(`Git: ${context.branch ?? GIT_DETACHED_HEAD} branch`);
  if (context.hasUncommittedChanges) {
    parts.push(`${context.uncommittedFileCount} uncommitted files`);
  }
  if (context.aheadBehind) {
    if (context.aheadBehind.ahead > 0) {
      parts.push(`${context.aheadBehind.ahead} ahead`);
    }
    if (context.aheadBehind.behind > 0) {
      parts.push(`${context.aheadBehind.behind} behind`);
    }
  }
  if (context.lastCommit) {
    parts.push(`
Last: "${context.lastCommit}"`);
  }
  return parts.join(", ");
}

// src/context/environment.ts
import * as fs7 from "fs/promises";
import * as path7 from "path";
function parseEnvVars(content) {
  const vars = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/i);
    if (match) {
      vars.push(match[1]);
    }
  }
  return vars;
}
async function checkEnvStatus(cwd) {
  const envPath = path7.join(cwd, ".env");
  const envLocalPath = path7.join(cwd, ".env.local");
  const envExamplePath = path7.join(cwd, ".env.example");
  const [hasEnvPathExists, hasEnvLocalExists, hasEnvExampleExists] = await Promise.all([
    fileExists(envPath),
    fileExists(envLocalPath),
    fileExists(envExamplePath)
  ]);
  const hasEnvFile = hasEnvPathExists || hasEnvLocalExists;
  const hasEnvExample = hasEnvExampleExists;
  let missingVars = [];
  const warnings = [];
  if (hasEnvExample) {
    const exampleContent = await fs7.readFile(envExamplePath, "utf-8");
    const requiredVars = parseEnvVars(exampleContent);
    let definedVars = [];
    if (hasEnvLocalExists) {
      definedVars = parseEnvVars(await fs7.readFile(envLocalPath, "utf-8"));
    } else if (hasEnvPathExists) {
      definedVars = parseEnvVars(await fs7.readFile(envPath, "utf-8"));
    }
    missingVars = requiredVars.filter((v) => !definedVars.includes(v));
    if (missingVars.length > 0) {
      warnings.push(`Missing env vars: ${missingVars.join(", ")}`);
    }
  }
  return { hasEnvFile, hasEnvExample, missingVars, warnings };
}
function formatEnvStatus(status) {
  const parts = [];
  if (status.hasEnvFile) {
    parts.push("Environment: .env present");
  } else if (status.hasEnvExample) {
    parts.push("Environment: .env.example exists but no .env file");
  }
  if (status.warnings.length > 0) {
    parts.push(`Warning: ${status.warnings.join(", ")}`);
  }
  return parts.join("\n");
}

// src/context/todo-scanner.ts
import * as fs8 from "fs/promises";
import * as path8 from "path";
var TODO_PATTERNS = ["FIXME", "BUG", "TODO", "HACK", "XXX"];
var FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
var SKIP_DIRS = [
  "node_modules",
  "dist",
  ".git",
  "coverage",
  ".goodvibes",
  "__tests__",
  "test",
  "tests"
];
var DEFAULT_TODO_LIMIT = 10;
var MAX_TODO_TEXT_LENGTH = 60;
async function getFiles(dir, extensions, skipDirs) {
  const files = [];
  try {
    const entries = await fs8.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path8.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          files.push(...await getFiles(fullPath, extensions, skipDirs));
        }
      } else if (entry.isFile()) {
        const ext = path8.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    debug("Directory scan skipped", { error: String(error) });
  }
  return files;
}
async function scanFile(filePath, patterns) {
  const results = [];
  try {
    const content = await fs8.readFile(filePath, "utf-8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of patterns) {
        const regex = new RegExp(`\\b${pattern}:`, "i");
        if (regex.test(line)) {
          results.push({
            type: pattern,
            file: filePath,
            line: i + 1,
            text: line.trim()
          });
          break;
        }
      }
    }
  } catch (error) {
    debug("File scan skipped", { error: String(error) });
  }
  return results;
}
async function scanTodos(cwd, limit = DEFAULT_TODO_LIMIT) {
  const results = [];
  const files = await getFiles(cwd, FILE_EXTENSIONS, SKIP_DIRS);
  for (const file of files) {
    if (results.length >= limit) {
      break;
    }
    const relativePath = path8.relative(cwd, file).replace(/\\/g, "/");
    const todos = await scanFile(file, TODO_PATTERNS);
    for (const todo of todos) {
      if (results.length >= limit) {
        break;
      }
      results.push({
        ...todo,
        file: relativePath
      });
    }
  }
  return results;
}
function formatTodos(todos) {
  if (todos.length === 0) {
    return "";
  }
  const lines = ["TODOs in code:"];
  for (const todo of todos) {
    lines.push(
      `- ${todo.type}: ${todo.file}:${todo.line} - ${todo.text.slice(0, MAX_TODO_TEXT_LENGTH)}`
    );
  }
  return lines.join("\n");
}

// src/context/health-checker.ts
import * as fs9 from "fs/promises";
import * as path9 from "path";
async function checkProjectHealth(cwd) {
  const checks = [];
  const hasNodeModules = await fileExists(path9.join(cwd, "node_modules"));
  const hasPackageJson = await fileExists(path9.join(cwd, "package.json"));
  if (hasPackageJson && !hasNodeModules) {
    checks.push({
      check: "dependencies",
      status: "warning",
      message: "node_modules missing - run install"
    });
  }
  const lockfileChecks = await Promise.all(
    LOCKFILES.map(async (f) => ({
      file: f,
      exists: await fileExists(path9.join(cwd, f))
    }))
  );
  const foundLockfiles = lockfileChecks.filter(({ exists }) => exists).map(({ file }) => file);
  if (foundLockfiles.length > 1) {
    checks.push({
      check: "lockfiles",
      status: "warning",
      message: `Multiple lockfiles found: ${foundLockfiles.join(", ")}`
    });
  }
  const tsconfigPath = path9.join(cwd, "tsconfig.json");
  if (await fileExists(tsconfigPath)) {
    try {
      const content = await fs9.readFile(tsconfigPath, "utf-8");
      const config = JSON.parse(content);
      const compilerOptions = typeof config === "object" && config !== null && "compilerOptions" in config ? config.compilerOptions : void 0;
      if (!compilerOptions?.strict) {
        checks.push({
          check: "typescript",
          status: "info",
          message: "TypeScript strict mode is off"
        });
      }
    } catch (error) {
      debug("health-checker: Failed to parse tsconfig.json", error);
    }
  }
  return { checks };
}
function formatHealthStatus(status) {
  if (status.checks.length === 0) {
    return "Health: All good";
  }
  const lines = ["Health:"];
  for (const check of status.checks) {
    const icon = check.status === "warning" ? "[!]" : check.status === "error" ? "[X]" : "[i]";
    lines.push(`${icon} ${check.message}`);
  }
  return lines.join("\n");
}

// src/context/folder-analyzer.ts
import * as path10 from "path";
async function analyzeFolderStructure(cwd) {
  const hasSrcDir = await fileExists(path10.join(cwd, "src"));
  const srcDir = hasSrcDir ? "src" : ".";
  const srcPath = path10.join(cwd, srcDir);
  const [
    hasFeatures,
    hasModules,
    hasComponents,
    hasHooks,
    hasUtils,
    hasApp,
    hasPages,
    hasApiInSrc,
    hasServerInSrc,
    hasApiRoot
  ] = await Promise.all([
    fileExists(path10.join(srcPath, "features")),
    fileExists(path10.join(srcPath, "modules")),
    fileExists(path10.join(srcPath, "components")),
    fileExists(path10.join(srcPath, "hooks")),
    fileExists(path10.join(srcPath, "utils")),
    fileExists(path10.join(srcPath, "app")),
    fileExists(path10.join(srcPath, "pages")),
    fileExists(path10.join(srcPath, "api")),
    fileExists(path10.join(srcPath, "server")),
    fileExists(path10.join(cwd, "api"))
  ]);
  let pattern = "unknown";
  if (hasFeatures) {
    pattern = "feature-based";
  } else if (hasModules) {
    pattern = "module-based";
  } else if (hasComponents && hasHooks && hasUtils) {
    pattern = "layer-based";
  }
  let routing = null;
  if (hasApp) {
    routing = "App Router";
  } else if (hasPages) {
    routing = "Pages Router";
  }
  const hasApi = hasApiInSrc || hasServerInSrc || hasApiRoot;
  return { srcDir, pattern, routing, hasApi };
}
function formatFolderAnalysis(analysis) {
  const parts = [];
  if (analysis.pattern !== "unknown") {
    parts.push(`Structure: ${analysis.pattern}`);
  }
  if (analysis.routing) {
    parts.push(analysis.routing);
  }
  if (analysis.hasApi) {
    parts.push("has API layer");
  }
  return parts.length > 0 ? parts.join(", ") : "";
}

// src/context/empty-project.ts
import * as fs10 from "fs/promises";
var SCAFFOLDING_ONLY = [
  "readme.md",
  "readme",
  "license",
  "license.md",
  ".gitignore",
  ".git"
];
async function isEmptyProject(cwd) {
  try {
    const files = await fs10.readdir(cwd);
    const meaningfulFiles = files.filter((file) => {
      const lower = file.toLowerCase();
      return !SCAFFOLDING_ONLY.includes(lower) && !file.startsWith(".");
    });
    return meaningfulFiles.length === 0;
  } catch (error) {
    debug("empty-project: Failed to read directory", error);
    return true;
  }
}
function formatEmptyProjectContext() {
  return `[GoodVibes SessionStart]
Status: New project (empty directory)

Ready to scaffold. Common starting points:
- "Create a Next.js app with TypeScript and Tailwind"
- "Set up a Node.js API with Express and Prisma"
- "Initialize a React library with Vite"

I'll detect your stack automatically as you build.`;
}

// src/context/port-checker.ts
import { exec as exec3 } from "child_process";
import * as os from "os";
import { promisify as promisify3 } from "util";
var execAsync = promisify3(exec3);
var COMMON_DEV_PORTS = [
  3e3,
  3001,
  4e3,
  5e3,
  5173,
  8e3,
  8080,
  8888
];
var COMMAND_TIMEOUT = 1e4;
var TASKLIST_TIMEOUT = 5e3;
async function parseWindowsNetstat(output, ports) {
  const portMap = /* @__PURE__ */ new Map();
  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Proto")) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) {
      continue;
    }
    const localAddr = parts[1];
    const state = parts[3];
    if (state !== "LISTENING") {
      continue;
    }
    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) {
      continue;
    }
    const port = parseInt(portMatch[1], 10);
    if (ports.includes(port)) {
      const pid = parts[4];
      let processName = pid ? `PID:${pid}` : void 0;
      if (pid) {
        try {
          const { stdout } = await execAsync(
            `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
            {
              encoding: "utf-8",
              timeout: TASKLIST_TIMEOUT,
              windowsHide: true
            }
          );
          const match = stdout.match(/"([^"]+)"/);
          if (match) {
            processName = match[1].replace(".exe", "");
          }
        } catch (error) {
          debug("parseWindowsNetstat tasklist failed", {
            error: String(error)
          });
        }
      }
      portMap.set(port, processName ?? "unknown");
    }
  }
  return portMap;
}
function parseUnixLsof(output, ports) {
  const portMap = /* @__PURE__ */ new Map();
  const lines = output.split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length < 9) {
      continue;
    }
    const command = parts[0];
    const name = parts[parts.length - 1];
    const portMatch = name.match(/:(\d+)/);
    if (!portMatch) {
      continue;
    }
    const port = parseInt(portMatch[1], 10);
    if (ports.includes(port) && !portMap.has(port)) {
      portMap.set(port, command.toLowerCase());
    }
  }
  return portMap;
}
function parseUnixNetstat(output, ports) {
  const portMap = /* @__PURE__ */ new Map();
  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed?.includes("LISTEN")) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    for (const part of parts) {
      const portMatch = part.match(/:(\d+)$/);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        if (ports.includes(port)) {
          const processMatch = trimmed.match(/(\d+)\/(\S+)/);
          const processName = processMatch ? processMatch[2] : "unknown";
          portMap.set(port, processName);
        }
        break;
      }
    }
  }
  return portMap;
}
async function checkPortsWindows(ports) {
  try {
    const { stdout } = await execAsync("netstat -ano -p TCP", {
      encoding: "utf-8",
      timeout: COMMAND_TIMEOUT,
      windowsHide: true
    });
    return parseWindowsNetstat(stdout, ports);
  } catch (error) {
    debug("checkPortsWindows failed", { error: String(error) });
    return /* @__PURE__ */ new Map();
  }
}
async function checkPortsUnix(ports) {
  try {
    const portsArg = ports.map((port) => `-i:${port}`).join(" ");
    const { stdout } = await execAsync(`lsof ${portsArg} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: COMMAND_TIMEOUT
    });
    return parseUnixLsof(stdout, ports);
  } catch (error) {
    debug("checkPortsUnix lsof failed", { error: String(error) });
    try {
      const { stdout } = await execAsync("netstat -tlnp 2>/dev/null || netstat -tln", {
        encoding: "utf-8",
        timeout: COMMAND_TIMEOUT
      });
      return parseUnixNetstat(stdout, ports);
    } catch (error2) {
      debug("checkPortsUnix netstat failed", { error: String(error2) });
      return /* @__PURE__ */ new Map();
    }
  }
}
async function checkPorts(_cwd) {
  const platform2 = os.platform();
  let activePortsMap;
  if (platform2 === "win32") {
    activePortsMap = await checkPortsWindows(COMMON_DEV_PORTS);
  } else {
    activePortsMap = await checkPortsUnix(COMMON_DEV_PORTS);
  }
  return COMMON_DEV_PORTS.map((port) => ({
    port,
    inUse: activePortsMap.has(port),
    process: activePortsMap.get(port)
  }));
}
function formatPortStatus(ports) {
  const activePorts = ports.filter((port) => port.inUse);
  if (activePorts.length === 0) {
    return "No dev servers detected";
  }
  const portList = activePorts.map((port) => port.process ? `${port.port} (${port.process})` : `${port.port}`).join(", ");
  return `Active ports: ${portList}`;
}

// src/memory/decisions.ts
import * as path11 from "path";

// src/memory/parser.ts
import * as fs11 from "fs/promises";
async function parseMemoryFile(filePath, parser) {
  if (!await fileExists(filePath)) {
    return [];
  }
  const content = await fs11.readFile(filePath, "utf-8");
  return parseMemoryContent(content, parser);
}
function parseMemoryContent(content, parser) {
  const results = [];
  const blocks = content.split(/\n## /).slice(1);
  for (const block of blocks) {
    try {
      const entry = parseBlock(block, parser);
      const isValid = parser.validate ? parser.validate(entry) : true;
      if (isValid) {
        const finalEntry = parser.transform ? parser.transform(entry) : entry;
        results.push(finalEntry);
      }
    } catch (error) {
      debug("Skipping malformed memory entry", {
        error: String(error),
        block: block.substring(0, 100)
      });
      continue;
    }
  }
  return results;
}
function handleCodeBlockMarker(line, entry, state, parser) {
  if (!line.startsWith("```")) {
    return false;
  }
  state.inCodeBlock = !state.inCodeBlock;
  if (state.currentSection && parser.fields[state.currentSection] === "code") {
    state.codeContent += line + "\n";
  }
  if (!state.inCodeBlock && state.currentSection) {
    entry[state.currentSection] = state.codeContent.trim();
    state.codeContent = "";
    state.currentSection = null;
  }
  return true;
}
function handleCodeBlockContent(line, state, parser) {
  if (!state.inCodeBlock || !state.currentSection) {
    return false;
  }
  if (parser.fields[state.currentSection] === "code") {
    state.codeContent += line + "\n";
    return true;
  }
  return false;
}
function handleFieldMarker(line, entry, state, parser) {
  const fieldMatch = line.match(/^\*\*([^:]+):\*\*(.*)$/);
  if (!fieldMatch) {
    return false;
  }
  const fieldName = fieldMatch[1].toLowerCase().trim();
  const fieldValue = fieldMatch[2].trim();
  const matchingField = Object.keys(parser.fields).find(
    (key) => key.toLowerCase() === fieldName
  );
  if (!matchingField) {
    return true;
  }
  const fieldType = parser.fields[matchingField];
  if (fieldType === "inline") {
    entry[matchingField] = fieldValue;
  } else {
    state.currentSection = matchingField;
    if (fieldType === "code") {
      state.codeContent = "";
    }
  }
  return true;
}
function handleListContent(line, entry, currentSection) {
  const listValue = line.replace("- ", "").trim();
  const currentValue = entry[currentSection];
  if (Array.isArray(currentValue)) {
    currentValue.push(listValue);
  } else {
    entry[currentSection] = [listValue];
  }
}
function handleTextContent(line, entry, currentSection) {
  const textValue = line.trim() + " ";
  const currentValue = entry[currentSection];
  if (typeof currentValue === "string") {
    entry[currentSection] = currentValue + textValue;
  } else {
    entry[currentSection] = textValue;
  }
}
function handleSectionContent(line, entry, state, parser) {
  if (!state.currentSection) {
    return;
  }
  const fieldType = parser.fields[state.currentSection];
  if (fieldType === "list" && line.startsWith("- ")) {
    handleListContent(line, entry, state.currentSection);
  } else if (fieldType === "text" && line.trim()) {
    handleTextContent(line, entry, state.currentSection);
  }
}
function trimStringFields(entry) {
  for (const field of Object.keys(entry)) {
    const value = entry[field];
    if (typeof value === "string") {
      entry[field] = value.trim();
    }
  }
}
function parseBlock(block, parser) {
  const lines = block.split("\n");
  const entry = {};
  const primaryValue = lines[0]?.trim() || "";
  entry[parser.primaryField] = primaryValue;
  const state = {
    currentSection: null,
    inCodeBlock: false,
    codeContent: ""
  };
  for (const line of lines.slice(1)) {
    if (!state.inCodeBlock && line.trim() === "---") {
      continue;
    }
    if (handleCodeBlockMarker(line, entry, state, parser)) {
      continue;
    }
    if (handleCodeBlockContent(line, state, parser)) {
      continue;
    }
    if (handleFieldMarker(line, entry, state, parser)) {
      continue;
    }
    handleSectionContent(line, entry, state, parser);
  }
  trimStringFields(entry);
  return entry;
}

// src/memory/decisions.ts
async function readDecisions(cwd) {
  const filePath = path11.join(cwd, ".goodvibes", "memory", "decisions.md");
  return parseMemoryFile(filePath, {
    primaryField: "title",
    fields: {
      date: "inline",
      agent: "inline",
      alternatives: "list",
      rationale: "text",
      context: "text"
    },
    validate: (entry) => !!(entry.title && entry.date && entry.rationale),
    transform: (entry) => ({
      title: entry.title,
      date: entry.date,
      alternatives: entry.alternatives ?? [],
      rationale: entry.rationale,
      agent: entry.agent,
      context: entry.context
    })
  });
}

// src/memory/patterns.ts
import * as path12 from "path";
async function readPatterns(cwd) {
  const filePath = path12.join(cwd, ".goodvibes", "memory", "patterns.md");
  return parseMemoryFile(filePath, {
    primaryField: "name",
    fields: {
      date: "inline",
      description: "text",
      example: "code",
      files: "list"
    },
    validate: (entry) => !!(entry.name && entry.date && entry.description),
    transform: (entry) => ({
      name: entry.name,
      date: entry.date,
      description: entry.description,
      example: entry.example,
      files: entry.files
    })
  });
}

// src/memory/failures.ts
import * as path13 from "path";
async function readFailures(cwd) {
  const filePath = path13.join(cwd, ".goodvibes", "memory", "failures.md");
  return parseMemoryFile(filePath, {
    primaryField: "approach",
    fields: {
      date: "inline",
      reason: "text",
      context: "text",
      suggestion: "text"
    },
    validate: (entry) => !!(entry.approach && entry.date && entry.reason),
    transform: (entry) => ({
      approach: entry.approach,
      date: entry.date,
      reason: entry.reason,
      context: entry.context,
      suggestion: entry.suggestion
    })
  });
}

// src/memory/preferences.ts
import * as path14 from "path";
async function readPreferences(cwd) {
  const filePath = path14.join(cwd, ".goodvibes", "memory", "preferences.md");
  return parseMemoryFile(filePath, {
    primaryField: "key",
    fields: {
      value: "inline",
      date: "inline",
      notes: "text"
    },
    validate: (entry) => !!(entry.key && entry.value && entry.date),
    transform: (entry) => ({
      key: entry.key,
      value: entry.value,
      date: entry.date,
      notes: entry.notes
    })
  });
}

// src/memory/search.ts
async function loadProjectMemory(cwd) {
  const [decisions, patterns, failures, preferences] = await Promise.all([
    readDecisions(cwd),
    readPatterns(cwd),
    readFailures(cwd),
    readPreferences(cwd)
  ]);
  return { decisions, patterns, failures, preferences };
}
function formatMemoryContext(memory) {
  const parts = [];
  if (memory.decisions.length > 0) {
    parts.push("Previous Decisions:");
    for (const d of memory.decisions.slice(-5)) {
      parts.push(`- ${d.title} (${d.rationale})`);
    }
  }
  if (memory.patterns.length > 0) {
    parts.push("\nEstablished Patterns:");
    for (const p of memory.patterns.slice(-3)) {
      const desc = p.description.length > 60 ? p.description.substring(0, 60) + "..." : p.description;
      parts.push(`- ${p.name}: ${desc}`);
    }
  }
  if (memory.failures.length > 0) {
    parts.push("\nKnown Failures (avoid):");
    for (const f of memory.failures.slice(-3)) {
      parts.push(`- ${f.approach}: ${f.reason}`);
    }
  }
  return parts.join("\n");
}

// src/session-start/crash-recovery.ts
import * as path15 from "path";

// src/automation/git-operations.ts
import { exec as exec4 } from "child_process";
import { promisify as promisify4 } from "util";
var execAsync2 = promisify4(exec4);
async function execGit2(command, cwd) {
  try {
    const { stdout } = await execAsync2(command, {
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
  const status = await execGit2("git status --porcelain", cwd);
  return status !== null && status.length > 0;
}
async function getUncommittedFiles(cwd) {
  const status = await execGit2("git status --porcelain", cwd);
  if (!status) {
    return [];
  }
  return status.split("\n").filter(Boolean).map((line) => line.slice(3));
}

// src/session-start/crash-recovery.ts
async function checkCrashRecovery(cwd) {
  const stateFile = path15.join(cwd, ".goodvibes", "state", "hooks-state.json");
  if (!await fileExists(stateFile)) {
    return {
      needsRecovery: false,
      previousFeature: null,
      onBranch: null,
      uncommittedFiles: [],
      pendingIssues: [],
      lastCheckpoint: null
    };
  }
  const state = await loadState(cwd);
  const uncommitted = await hasUncommittedChanges(cwd);
  const uncommittedFiles = uncommitted ? await getUncommittedFiles(cwd) : [];
  const onFeatureBranch = state.git.featureBranch !== null;
  const hasPendingFixes = state.tests.pendingFixes.length > 0;
  const failingBuild = state.build.status === "failing";
  const hasModifiedFiles = state.files.modifiedSinceCheckpoint.length > 0;
  const needsRecovery = uncommitted || onFeatureBranch || hasPendingFixes || failingBuild || hasModifiedFiles;
  if (!needsRecovery) {
    return {
      needsRecovery: false,
      previousFeature: null,
      onBranch: null,
      uncommittedFiles: [],
      pendingIssues: [],
      lastCheckpoint: null
    };
  }
  const pendingIssues = [];
  if (hasPendingFixes) {
    pendingIssues.push(`${state.tests.pendingFixes.length} tests need fixes`);
  }
  if (failingBuild) {
    pendingIssues.push("Build is failing");
  }
  if (state.tests.failingFiles.length > 0) {
    pendingIssues.push(`${state.tests.failingFiles.length} test files failing`);
  }
  return {
    needsRecovery: true,
    previousFeature: state.git.featureDescription,
    onBranch: state.git.currentBranch,
    uncommittedFiles,
    pendingIssues,
    lastCheckpoint: state.git.checkpoints[0] || null
  };
}
function formatRecoveryContext(info) {
  if (!info.needsRecovery) {
    return "";
  }
  const parts = [
    "[GoodVibes Recovery]",
    "Previous session ended unexpectedly.",
    ""
  ];
  if (info.onBranch) {
    parts.push(`Branch: ${info.onBranch}`);
  }
  if (info.previousFeature) {
    parts.push(`Feature: ${info.previousFeature}`);
  }
  if (info.lastCheckpoint) {
    parts.push(`Last checkpoint: "${info.lastCheckpoint.message}"`);
  }
  if (info.uncommittedFiles.length > 0) {
    parts.push(`Uncommitted files: ${info.uncommittedFiles.length}`);
  }
  if (info.pendingIssues.length > 0) {
    parts.push("Pending issues:");
    for (const issue of info.pendingIssues) {
      parts.push(`  - ${issue}`);
    }
  }
  parts.push("");
  parts.push("Continuing where you left off...");
  return parts.join("\n");
}

// src/session-start/context-builder.ts
var SECTION_SEPARATOR_LENGTH = 50;
function createEmptyProjectResult(startTime) {
  return {
    additionalContext: formatEmptyProjectContext(),
    summary: "New project (empty directory)",
    isEmptyProject: true,
    hasIssues: false,
    issueCount: 0,
    gatherTimeMs: Date.now() - startTime,
    needsRecovery: false
  };
}
function createFailedContextResult(startTime) {
  return {
    additionalContext: "",
    summary: "Context gathering failed",
    isEmptyProject: false,
    hasIssues: false,
    issueCount: 0,
    gatherTimeMs: Date.now() - startTime,
    needsRecovery: false
  };
}
function formatHeader() {
  return ["[GoodVibes SessionStart]", "=".repeat(SECTION_SEPARATOR_LENGTH), ""];
}
function formatOptionalSection(header, content) {
  if (!content) {
    return [];
  }
  return [`## ${header}`, "", content, ""];
}
function formatRecoverySection(recoveryInfo) {
  if (!recoveryInfo.needsRecovery) {
    return [];
  }
  const recoveryStr = formatRecoveryContext(recoveryInfo);
  return recoveryStr ? [recoveryStr, ""] : [];
}
function formatProjectOverviewSection(stackInfo, folderAnalysis) {
  const parts = ["## Project Overview", ""];
  const stackStr = formatStackInfo(stackInfo);
  if (stackStr) {
    parts.push(stackStr);
  }
  const folderStr = formatFolderAnalysis(folderAnalysis);
  if (folderStr) {
    parts.push(folderStr);
  }
  parts.push("");
  return parts;
}
function formatGitSection(gitContext) {
  const parts = ["## Git Status", ""];
  const gitStr = formatGitContext(gitContext);
  if (gitStr) {
    parts.push(gitStr);
  }
  parts.push("");
  return parts;
}
function formatPortStatusIfActive(portStatus) {
  const portStr = formatPortStatus(portStatus);
  return portStr && portStr !== "No dev servers detected" ? portStr : null;
}
function formatHealthIfWarning(healthStatus) {
  const healthStr = formatHealthStatus(healthStatus);
  return healthStr && healthStr !== "Health: All good" ? healthStr : null;
}
function formatContextSections(recoveryInfo, stackInfo, folderAnalysis, gitContext, envStatus, portStatus, memory, todos, healthStatus) {
  const contextParts = [
    ...formatHeader(),
    ...formatRecoverySection(recoveryInfo),
    ...formatProjectOverviewSection(stackInfo, folderAnalysis),
    ...formatGitSection(gitContext),
    ...formatOptionalSection("Environment", formatEnvStatus(envStatus)),
    ...formatOptionalSection(
      "Dev Servers",
      formatPortStatusIfActive(portStatus)
    ),
    ...formatOptionalSection("Project Memory", formatMemoryContext(memory)),
    ...formatOptionalSection("Code TODOs", formatTodos(todos)),
    ...formatOptionalSection(
      "Health Checks",
      formatHealthIfWarning(healthStatus)
    ),
    "=".repeat(SECTION_SEPARATOR_LENGTH)
  ];
  return contextParts.join("\n");
}
function buildContextSummary(stackInfo, gitContext, issueCount) {
  const summaryParts = [];
  const MAX_FRAMEWORKS_IN_SUMMARY = 3;
  if (stackInfo.frameworks.length > 0) {
    summaryParts.push(
      stackInfo.frameworks.slice(0, MAX_FRAMEWORKS_IN_SUMMARY).join(", ")
    );
  }
  if (gitContext.branch) {
    summaryParts.push(`on ${gitContext.branch}`);
  }
  if (gitContext.hasUncommittedChanges) {
    summaryParts.push(`${gitContext.uncommittedFileCount} uncommitted`);
  }
  if (issueCount > 0) {
    summaryParts.push(`${issueCount} issues`);
  }
  return summaryParts.join(" | ") || "Project analyzed";
}
function calculateIssueCount(healthStatus, envStatus, todos) {
  return healthStatus.checks.filter(
    (c) => c.status === "warning" || c.status === "error"
  ).length + envStatus.warnings.length + todos.length;
}
async function gatherProjectContext(projectDir, recoveryInfo, startTime) {
  const isEmpty = await isEmptyProject(projectDir);
  if (isEmpty) {
    return createEmptyProjectResult(startTime);
  }
  const [
    stackInfo,
    gitContext,
    envStatus,
    todos,
    healthStatus,
    folderAnalysis,
    memory,
    portStatus
  ] = await Promise.all([
    detectStack(projectDir),
    getGitContext(projectDir),
    checkEnvStatus(projectDir),
    scanTodos(projectDir),
    checkProjectHealth(projectDir),
    analyzeFolderStructure(projectDir),
    loadProjectMemory(projectDir),
    checkPorts(projectDir)
  ]);
  const issueCount = calculateIssueCount(healthStatus, envStatus, todos);
  const additionalContext = formatContextSections(
    recoveryInfo,
    stackInfo,
    folderAnalysis,
    gitContext,
    envStatus,
    portStatus,
    memory,
    todos,
    healthStatus
  );
  const summary = buildContextSummary(stackInfo, gitContext, issueCount);
  const result = {
    additionalContext,
    summary,
    isEmptyProject: false,
    hasIssues: issueCount > 0,
    issueCount,
    gatherTimeMs: Date.now() - startTime,
    needsRecovery: recoveryInfo.needsRecovery
  };
  debug(`Context gathered in ${result.gatherTimeMs}ms`, {
    isEmptyProject: result.isEmptyProject,
    hasIssues: result.hasIssues,
    issueCount: result.issueCount,
    needsRecovery: result.needsRecovery
  });
  return result;
}

// src/session-start/response-formatter.ts
var PLUGIN_VERSION = "v2.1.0";
var TOOLS_AVAILABLE = 17;
var SESSION_ID_DISPLAY_LENGTH = 8;
function buildSystemMessage(sessionId, context) {
  const parts = [];
  parts.push(`GoodVibes plugin ${PLUGIN_VERSION} initialized.`);
  parts.push(`${TOOLS_AVAILABLE} tools available.`);
  parts.push(`Session: ${sessionId.slice(-SESSION_ID_DISPLAY_LENGTH)}`);
  if (context.needsRecovery) {
    parts.push("| RECOVERY MODE");
  }
  if (context.isEmptyProject) {
    parts.push("| Empty project detected - scaffolding tools available.");
  } else if (context.summary) {
    parts.push(`| ${context.summary}`);
  }
  if (context.gatherTimeMs > 0) {
    parts.push(`(context: ${context.gatherTimeMs}ms)`);
  }
  return parts.join(" ");
}

// src/session-start/index.ts
var DEFAULT_RECOVERY_INFO = {
  needsRecovery: false,
  previousFeature: null,
  onBranch: null,
  uncommittedFiles: [],
  pendingIssues: [],
  lastCheckpoint: null
};
async function loadPluginState(projectDir) {
  try {
    const state = await loadState(projectDir);
    debug("State loaded", {
      sessionId: state.session.id,
      mode: state.session.mode
    });
    return state;
  } catch (stateError) {
    logError("State loading", stateError);
    return createDefaultState();
  }
}
async function performCrashRecoveryCheck(projectDir) {
  try {
    const recoveryInfo = await checkCrashRecovery(projectDir);
    debug("Crash recovery check", {
      needsRecovery: recoveryInfo.needsRecovery
    });
    return recoveryInfo;
  } catch (recoveryError) {
    logError("Crash recovery check", recoveryError);
    return DEFAULT_RECOVERY_INFO;
  }
}
async function gatherContextSafely(projectDir, recoveryInfo, startTime) {
  debug(`Gathering project context from: ${projectDir}`);
  try {
    return await gatherProjectContext(projectDir, recoveryInfo, startTime);
  } catch (contextError) {
    logError("Context gathering", contextError);
    return createFailedContextResult(startTime);
  }
}
async function savePluginState(projectDir, state) {
  try {
    await saveState(projectDir, state);
    debug("State saved");
  } catch (saveError) {
    logError("State saving", saveError);
  }
}
function initializeAnalytics(sessionId, contextResult) {
  void saveAnalytics({
    session_id: sessionId,
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    tool_usage: [],
    skills_recommended: [],
    validations_run: 0,
    issues_found: contextResult.issueCount,
    detected_stack: {
      isEmptyProject: contextResult.isEmptyProject,
      hasIssues: contextResult.hasIssues,
      gatherTimeMs: contextResult.gatherTimeMs,
      needsRecovery: contextResult.needsRecovery
    }
  });
  debug(`Analytics initialized for session ${sessionId}`);
}
async function runSessionStartHook() {
  const startTime = Date.now();
  try {
    debug("SessionStart hook starting");
    const input = await readHookInput();
    debug("SessionStart received input", {
      session_id: input.session_id,
      hook_event_name: input.hook_event_name
    });
    const projectDir = input.cwd || PROJECT_ROOT;
    debug(`Project directory: ${projectDir}`);
    let state = await loadPluginState(projectDir);
    const sessionId = input.session_id || `session_${Date.now()}`;
    state = initializeSession(state, sessionId);
    await ensureCacheDir();
    debug("Cache directory ensured");
    const { valid, missing } = await validateRegistries();
    debug("Registry validation", { valid, missing });
    if (!valid) {
      respond(
        createResponse({
          systemMessage: `GoodVibes: Warning - Missing registries: ${missing.join(", ")}. Run build-registries script.`
        })
      );
      return;
    }
    const recoveryInfo = await performCrashRecoveryCheck(projectDir);
    const contextResult = await gatherContextSafely(
      projectDir,
      recoveryInfo,
      startTime
    );
    state = updateSessionState(state, {
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await savePluginState(projectDir, state);
    initializeAnalytics(sessionId, contextResult);
    const systemMessage = buildSystemMessage(sessionId, contextResult);
    respond(
      createResponse({
        systemMessage,
        additionalContext: contextResult.additionalContext || void 0
      })
    );
  } catch (error) {
    logError("SessionStart main", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    respond(
      createResponse({ systemMessage: `GoodVibes: Init error - ${message}` })
    );
  }
}
if (!isTestEnvironment()) {
  runSessionStartHook().catch((error) => {
    logError("SessionStart uncaught", error);
    respond(createResponse());
  });
}
