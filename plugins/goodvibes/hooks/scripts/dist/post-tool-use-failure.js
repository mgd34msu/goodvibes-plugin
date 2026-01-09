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

// src/types/errors.ts
var PHASE_RETRY_LIMITS = {
  npm_install: 2,
  typescript_error: 3,
  test_failure: 2,
  build_failure: 2,
  file_not_found: 1,
  git_conflict: 2,
  database_error: 2,
  api_error: 2,
  unknown: 2
};

// src/shared/error-handling-core.ts
var MAX_PHASE = 3;
var DEFAULT_RETRY_LIMIT = 2;
var ERROR_NORMALIZE_MAX_LENGTH = 100;
var SIGNATURE_MAX_LENGTH = 20;
function generateErrorSignature(errorOrToolName, errorMessage) {
  const hasToolName = errorMessage !== void 0;
  const error = hasToolName ? errorMessage : errorOrToolName;
  const toolName = hasToolName ? errorOrToolName : void 0;
  let normalized = error.replace(/[A-Z]:\\[^\s:]+/gi, "<PATH>").replace(/\/[^\s:]+/g, "<PATH>").replace(/:\d+:\d+/g, ":<LINE>:<COL>").replace(/line \d+/gi, "line <LINE>").replace(/\d+/g, "N").replace(/(['"])[^'"]*\1/g, "STR").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, "<TIMESTAMP>").replace(/0x[a-f0-9]+/gi, "<ADDR>").replace(/\s+/g, " ").trim();
  if (toolName) {
    normalized = normalized.slice(0, ERROR_NORMALIZE_MAX_LENGTH).toLowerCase();
    return `${toolName}:${Buffer.from(normalized).toString("base64").slice(0, SIGNATURE_MAX_LENGTH)}`;
  } else {
    normalized = normalized.toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `err_${Math.abs(hash).toString(16)}`;
  }
}
function shouldEscalatePhase(state) {
  const maxPerPhase = PHASE_RETRY_LIMITS[state.category] || DEFAULT_RETRY_LIMIT;
  return state.attemptsThisPhase >= maxPerPhase && state.phase < MAX_PHASE;
}
function hasExhaustedRetries(state) {
  const maxPerPhase = PHASE_RETRY_LIMITS[state.category] || DEFAULT_RETRY_LIMIT;
  return state.phase >= MAX_PHASE && state.attemptsThisPhase >= maxPerPhase;
}
function getRetryLimit(category) {
  return PHASE_RETRY_LIMITS[category] || DEFAULT_RETRY_LIMIT;
}
function getRemainingAttemptsInPhase(state) {
  const limit = getRetryLimit(state.category);
  return Math.max(0, limit - state.attemptsThisPhase);
}
function getPhaseDescription(phase) {
  switch (phase) {
    case 1:
      return "Raw attempts with existing knowledge";
    case 2:
      return "Including official documentation search";
    case 3:
      return "Including community solutions search";
    default:
      return "Unknown phase";
  }
}

// src/automation/fix-loop.ts
var ERROR_PREVIEW_MAX_LENGTH = 200;
var DOCS_CONTENT_MAX_LENGTH = 2e3;
var RECENT_ATTEMPTS_COUNT = 3;
var ERROR_CATEGORY_MATCHERS = [
  {
    category: "npm_install",
    keywords: ["eresolve", "npm", "peer dep"]
  },
  {
    category: "typescript_error",
    compound: [["ts", "error"], ["ts", "type"]]
  },
  {
    category: "test_failure",
    compound: [["test", "fail"]]
  },
  {
    category: "build_failure",
    keywords: ["build", "compile"]
  },
  {
    category: "file_not_found",
    keywords: ["enoent", "not found"]
  },
  {
    category: "git_conflict",
    keywords: ["conflict", "merge"]
  },
  {
    category: "database_error",
    keywords: ["database", "prisma", "sql"]
  },
  {
    category: "api_error",
    keywords: ["api", "fetch", "request"]
  }
];
function matchesCompoundRule(lower, rule) {
  return rule.every((keyword) => lower.includes(keyword));
}
function matchesCategoryMatcher(lower, matcher) {
  if (matcher.keywords?.some((keyword) => lower.includes(keyword))) {
    return true;
  }
  if (matcher.compound?.some((rule) => matchesCompoundRule(lower, rule))) {
    return true;
  }
  return false;
}
function categorizeError(errorMessage) {
  const lower = errorMessage.toLowerCase();
  for (const matcher of ERROR_CATEGORY_MATCHERS) {
    if (matchesCategoryMatcher(lower, matcher)) {
      return matcher.category;
    }
  }
  return "unknown";
}
function createErrorState(signature, category) {
  return {
    signature,
    category,
    phase: 1,
    attemptsThisPhase: 0,
    totalAttempts: 0,
    officialDocsSearched: [],
    officialDocsContent: "",
    unofficialDocsSearched: [],
    unofficialDocsContent: "",
    fixStrategiesAttempted: []
  };
}
function buildFixContext(state, error) {
  const parts = [];
  parts.push(`[GoodVibes Fix Loop - Phase ${state.phase}/${MAX_PHASE}]`);
  parts.push(`Error: ${error.slice(0, ERROR_PREVIEW_MAX_LENGTH)}`);
  parts.push(`Attempt: ${state.attemptsThisPhase + 1} this phase`);
  parts.push(`Total attempts: ${state.totalAttempts}`);
  if (state.phase >= 2 && state.officialDocsContent) {
    parts.push("\n--- Official Documentation ---");
    parts.push(state.officialDocsContent.slice(0, DOCS_CONTENT_MAX_LENGTH));
  }
  if (state.phase >= MAX_PHASE && state.unofficialDocsContent) {
    parts.push("\n--- Community Solutions ---");
    parts.push(state.unofficialDocsContent.slice(0, DOCS_CONTENT_MAX_LENGTH));
  }
  if (state.fixStrategiesAttempted.length > 0) {
    parts.push("\n--- Previously Attempted (failed) ---");
    for (const attempt of state.fixStrategiesAttempted.slice(
      -RECENT_ATTEMPTS_COUNT
    )) {
      parts.push(`- ${attempt.strategy}`);
    }
    parts.push("Try a DIFFERENT approach.");
  }
  return parts.join("\n");
}

// src/memory/failures.ts
import * as path5 from "path";

// src/memory/parser.ts
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

// src/memory/parser.ts
async function ensureMemoryFile(filePath, header) {
  if (!await fileExists(filePath)) {
    const dir = path4.dirname(filePath);
    if (!await fileExists(dir)) {
      await fs3.mkdir(dir, { recursive: true });
    }
    await fs3.writeFile(filePath, header);
  }
}
async function appendMemoryEntry(filePath, entry) {
  await fs3.appendFile(filePath, entry);
}

// src/memory/failures.ts
var FAILURES_HEADER = `# Failed Approaches

This file records approaches that were tried and failed.
Reference this to avoid repeating unsuccessful strategies.

---

`;
async function writeFailure(cwd, failure) {
  const filePath = path5.join(cwd, ".goodvibes", "memory", "failures.md");
  await ensureMemoryFile(filePath, FAILURES_HEADER);
  const entry = formatFailure(failure);
  await appendMemoryEntry(filePath, entry);
}
function formatFailure(failure) {
  let md = `
## ${failure.approach}

`;
  md += `**Date:** ${failure.date}
`;
  md += "\n**Reason:**\n";
  md += `${failure.reason}
`;
  if (failure.context) {
    md += "\n**Context:**\n";
    md += `${failure.context}
`;
  }
  if (failure.suggestion) {
    md += "\n**Suggestion:**\n";
    md += `${failure.suggestion}
`;
  }
  md += "\n---\n";
  return md;
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
import * as path6 from "path";

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
  const goodvibesDir = path6.join(cwd, ".goodvibes");
  const statePath = path6.join(goodvibesDir, STATE_FILE);
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
  const statePath = path6.join(cwd, ".goodvibes", STATE_FILE);
  const stateDir = path6.dirname(statePath);
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

// src/state/error-tracking.ts
function trackError(state, signature, errorState) {
  return {
    ...state,
    errors: {
      ...state.errors,
      [signature]: errorState
    }
  };
}
function getErrorState(state, signature) {
  return state.errors[signature];
}

// src/post-tool-use-failure/error-categories.ts
var ERROR_CATEGORY_MAP = {
  npm_install: ["missing_import", "npm_error"],
  typescript_error: [
    "typescript_type_error",
    "typescript_config_error",
    "type_mismatch"
  ],
  test_failure: ["test_failure"],
  build_failure: ["build_failure"],
  file_not_found: ["file_not_found"],
  git_conflict: ["git_error"],
  database_error: ["database_error"],
  api_error: ["api_error"],
  unknown: [
    "undefined_reference",
    "lint_error",
    "permission_error",
    "resource_error",
    "syntax_error"
  ]
};

// src/post-tool-use-failure/recovery-patterns.ts
var RECOVERY_PATTERNS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TypeScript Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "typescript_type_error",
    description: "TypeScript type checking error",
    patterns: [
      /TS\d+:/,
      /Type '.*' is not assignable to type/,
      /Property '.*' does not exist on type/,
      /Cannot find name '.*'/,
      /Argument of type '.*' is not assignable/,
      /Object is possibly 'undefined'/,
      /Object is possibly 'null'/
    ],
    suggestedFix: "Run `npx tsc --noEmit` to identify all type errors. Check that types are correctly imported and match expected signatures.",
    severity: "high"
  },
  {
    category: "typescript_config_error",
    description: "TypeScript configuration error",
    patterns: [
      /Cannot find module '.*' or its corresponding type declarations/,
      /Could not find a declaration file for module/,
      /error TS6059:/,
      /tsconfig\.json/
    ],
    suggestedFix: "Check tsconfig.json configuration. Ensure module resolution settings match your import style. You may need to install @types/* packages.",
    severity: "medium"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Import/Module Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "missing_import",
    description: "Missing module or import error",
    patterns: [
      /Cannot find module '.*'/,
      /Module not found/,
      /Unable to resolve path/,
      /import .* from '.*' failed/,
      /ENOENT.*node_modules/
    ],
    suggestedFix: "Run `npm install` to ensure all dependencies are installed. Check that the import path is correct and the package exists in package.json.",
    severity: "high"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Type Mismatch Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "type_mismatch",
    description: "Type mismatch or incompatible types",
    patterns: [
      /Expected \d+ arguments?, but got \d+/,
      /Type '.*' has no properties in common with type/,
      /The types of '.*' are incompatible/,
      /Conversion of type '.*' to type '.*' may be a mistake/
    ],
    suggestedFix: "Check function signatures and ensure arguments match. Review type definitions and update interface if needed.",
    severity: "medium"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Runtime Reference Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "undefined_reference",
    description: "Undefined or null reference error",
    patterns: [
      /ReferenceError: (.*) is not defined/,
      /TypeError: Cannot read propert(y|ies) of undefined/,
      /TypeError: Cannot read propert(y|ies) of null/,
      /TypeError: (.*) is not a function/,
      /'.*' is used before being assigned/
    ],
    suggestedFix: "Add null checks or optional chaining (?.). Ensure variables are properly initialized before use.",
    severity: "high"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Linting Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "lint_error",
    description: "ESLint or Prettier linting error",
    patterns: [
      /eslint:/,
      /\d+ error(s)? and \d+ warning(s)?/,
      /Parsing error:/,
      /prettier.*check.*failed/i,
      /@typescript-eslint/,
      /no-unused-vars/,
      /prefer-const/
    ],
    suggestedFix: "Run `npx eslint . --fix` to auto-fix linting issues. For Prettier errors, run `npx prettier --write .`.",
    severity: "low"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Test Failures
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "test_failure",
    description: "Test suite or assertion failure",
    patterns: [
      /FAIL\s+.*\.test\./,
      /Test Suites:.*failed/,
      /AssertionError/,
      /Expected.*Received/,
      /expect\(.*\)\.(to|not)/,
      /vitest|jest|mocha/i
    ],
    suggestedFix: "Review the test output to understand the assertion failure. Check if the implementation matches the expected behavior or if the test needs updating.",
    severity: "high"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Build Failures
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "build_failure",
    description: "Build or compilation failure",
    patterns: [
      /Build failed/i,
      /Compilation failed/,
      /error during build/i,
      /vite.*error/i,
      /webpack.*error/i,
      /rollup.*error/i,
      /esbuild.*error/i,
      /next build.*failed/i
    ],
    suggestedFix: "Check the build output for specific errors. Common issues include missing dependencies, invalid imports, or configuration errors.",
    severity: "critical"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // NPM/Package Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "npm_error",
    description: "NPM package or dependency error",
    patterns: [
      /npm ERR!/,
      /ERESOLVE/,
      /peer dep/i,
      /Could not resolve dependency/,
      /ENOENT.*package\.json/,
      /Missing script/
    ],
    suggestedFix: "Try `npm install --legacy-peer-deps` for peer dependency conflicts. Check package.json for missing or malformed entries.",
    severity: "medium"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // File System Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "file_not_found",
    description: "File or directory not found",
    patterns: [
      /ENOENT/,
      /no such file or directory/i,
      /File not found/i,
      /Cannot open file/i
    ],
    suggestedFix: "Verify the file path exists. Check for typos in the path and ensure the file has been created.",
    severity: "medium"
  },
  {
    category: "permission_error",
    description: "File system permission denied",
    patterns: [
      /EACCES/,
      /Permission denied/i,
      /EPERM/,
      /operation not permitted/i
    ],
    suggestedFix: "Check file permissions. You may need to run with elevated privileges or fix file ownership.",
    severity: "high"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Git Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "git_error",
    description: "Git operation error",
    patterns: [
      /fatal: not a git repository/,
      /error: failed to push/,
      /CONFLICT.*Merge conflict/,
      /git.*rejected/,
      /Your branch is behind/
    ],
    suggestedFix: "Resolve any merge conflicts manually. Pull latest changes with `git pull` before pushing.",
    severity: "medium"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Database Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "database_error",
    description: "Database connection or query error",
    patterns: [
      /ECONNREFUSED.*:\d+/,
      /Connection refused/i,
      /prisma.*error/i,
      /drizzle.*error/i,
      /migration.*failed/i,
      /P\d{4}:/
    ],
    suggestedFix: "Ensure the database server is running. Check connection string in environment variables. Run pending migrations.",
    severity: "high"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // API/Network Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "api_error",
    description: "API request or network error",
    patterns: [
      /fetch.*failed/i,
      /ETIMEDOUT/,
      /ECONNRESET/,
      /Network Error/i,
      /HTTP \d{3}/,
      /status code (4|5)\d{2}/
    ],
    suggestedFix: "Check API endpoint URL and network connectivity. Verify authentication tokens are valid and not expired.",
    severity: "medium"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Resource/Memory Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "resource_error",
    description: "Memory or resource exhaustion",
    patterns: [
      /JavaScript heap out of memory/,
      /ENOMEM/,
      /EMFILE.*too many open files/,
      /Maximum call stack size exceeded/
    ],
    suggestedFix: "Increase Node.js memory limit with `NODE_OPTIONS=--max-old-space-size=4096`. Check for memory leaks or infinite recursion.",
    severity: "critical"
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // Syntax Errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    category: "syntax_error",
    description: "JavaScript or TypeScript syntax error",
    patterns: [
      /SyntaxError:/,
      /Unexpected token/,
      /Unexpected identifier/,
      /Missing semicolon/,
      /Unterminated string/
    ],
    suggestedFix: "Check for typos, missing brackets, or incorrect syntax. Use an editor with syntax highlighting to identify issues.",
    severity: "high"
  }
];

// src/post-tool-use-failure/pattern-matcher.ts
function findMatchingPattern(category, errorMessage) {
  const patternCategories = ERROR_CATEGORY_MAP[category] || [];
  for (const pattern of RECOVERY_PATTERNS) {
    if (patternCategories.includes(pattern.category)) {
      for (const regex of pattern.patterns) {
        if (regex.test(errorMessage)) {
          return pattern;
        }
      }
    }
  }
  for (const pattern of RECOVERY_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(errorMessage)) {
        return pattern;
      }
    }
  }
  return null;
}
function getSuggestedFix(category, errorMessage, errorState) {
  const pattern = findMatchingPattern(category, errorMessage);
  if (!pattern) {
    return "Review the error message carefully. Check logs for more details. Try isolating the problem step by step.";
  }
  let suggestion = pattern.suggestedFix;
  if (errorState.phase >= 2 && errorState.fixStrategiesAttempted.length > 0) {
    suggestion += "\n\nNote: Previous fix attempts failed. Try a different approach or check documentation for alternatives.";
  }
  return suggestion;
}

// src/post-tool-use-failure/research-hints.ts
var RESEARCH_HINTS = {
  typescript_type_error: {
    official: ["typescriptlang.org error reference", "typescript handbook"],
    community: ["stackoverflow typescript", "github typescript discussions"]
  },
  typescript_config_error: {
    official: ["typescriptlang.org/tsconfig", "typescript module resolution"],
    community: ["stackoverflow tsconfig", "github typescript issues"]
  },
  missing_import: {
    official: ["npmjs.com package documentation", "package README"],
    community: ["stackoverflow module not found", "github package issues"]
  },
  type_mismatch: {
    official: ["typescript generics documentation", "typescript utility types"],
    community: ["stackoverflow typescript types"]
  },
  undefined_reference: {
    official: ["MDN JavaScript reference"],
    community: ["stackoverflow null undefined"]
  },
  lint_error: {
    official: ["eslint.org rules", "prettier.io documentation"],
    community: ["stackoverflow eslint"]
  },
  test_failure: {
    official: ["vitest.dev/guide", "jestjs.io/docs", "testing-library.com"],
    community: ["stackoverflow testing", "github testing framework issues"]
  },
  build_failure: {
    official: ["vite.dev/guide", "webpack.js.org", "next.js docs"],
    community: ["stackoverflow build errors", "github build tool issues"]
  },
  npm_error: {
    official: ["npmjs.com documentation", "package changelog"],
    community: ["stackoverflow npm", "github npm issues"]
  },
  file_not_found: {
    official: [],
    community: []
  },
  permission_error: {
    official: ["nodejs.org fs documentation"],
    community: ["stackoverflow permissions"]
  },
  git_error: {
    official: ["git-scm.com documentation"],
    community: ["stackoverflow git"]
  },
  database_error: {
    official: ["prisma.io/docs", "database provider docs"],
    community: ["stackoverflow database errors", "github ORM issues"]
  },
  api_error: {
    official: ["API provider documentation", "MDN fetch API"],
    community: ["stackoverflow API errors"]
  },
  resource_error: {
    official: ["nodejs.org memory documentation"],
    community: ["stackoverflow node memory"]
  },
  syntax_error: {
    official: ["MDN JavaScript reference", "typescriptlang.org"],
    community: ["stackoverflow syntax error"]
  }
};
var CATEGORY_TO_HINT_MAP = {
  npm_install: "npm_error",
  typescript_error: "typescript_type_error",
  test_failure: "test_failure",
  build_failure: "build_failure",
  file_not_found: "file_not_found",
  git_conflict: "git_error",
  database_error: "database_error",
  api_error: "api_error",
  unknown: "undefined_reference"
};
function getResearchHints(category, errorMessage, phase) {
  const patternCategory = CATEGORY_TO_HINT_MAP[category] || "unknown";
  const hints = RESEARCH_HINTS[patternCategory] || {
    official: ["official documentation"],
    community: ["stackoverflow", "github issues"]
  };
  const result = {
    official: [],
    community: []
  };
  if (phase >= 2) {
    result.official = [...hints.official];
  }
  if (phase >= 3) {
    result.community = [...hints.community];
  }
  return result;
}

// src/post-tool-use-failure/retry-tracker.ts
import * as fs6 from "fs/promises";
import * as path7 from "path";

// src/types/retry.ts
function isRetryEntry(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value;
  return typeof entry.signature === "string" && typeof entry.attempts === "number" && typeof entry.lastAttempt === "string" && typeof entry.phase === "number";
}
function isRetryData(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.values(value).every(isRetryEntry);
}
function isErrorState(value) {
  return value !== null && typeof value === "object" && "category" in value && "phase" in value && "attemptsThisPhase" in value;
}

// src/post-tool-use-failure/retry-tracker.ts
function getRetriesPath(cwd) {
  return path7.join(cwd, ".goodvibes", "state", "retries.json");
}
async function loadRetries(cwd) {
  const retriesPath = getRetriesPath(cwd);
  try {
    await fs6.access(retriesPath);
  } catch {
    return {};
  }
  try {
    const content = await fs6.readFile(retriesPath, "utf-8");
    const parsed = JSON.parse(content);
    return isRetryData(parsed) ? parsed : {};
  } catch (error) {
    debug("loadRetries failed", { error: String(error) });
    return {};
  }
}
async function writeRetries(retriesPath, retries) {
  try {
    await fs6.writeFile(retriesPath, JSON.stringify(retries, null, 2));
  } catch (error) {
    debug("writeRetryData failed", { error: String(error) });
  }
}
async function saveRetry(stateOrCwd, signature, errorStateOrPhase) {
  let cwd;
  let phase;
  if (typeof stateOrCwd === "string") {
    cwd = stateOrCwd;
    phase = typeof errorStateOrPhase === "number" ? errorStateOrPhase : 1;
  } else {
    cwd = process.cwd();
    if (isErrorState(errorStateOrPhase)) {
      phase = errorStateOrPhase.phase;
      stateOrCwd.errors[signature] = errorStateOrPhase;
    } else {
      phase = 1;
    }
  }
  await ensureGoodVibesDir(cwd);
  const retriesPath = getRetriesPath(cwd);
  const retries = await loadRetries(cwd);
  const existing = retries[signature];
  retries[signature] = {
    signature,
    attempts: existing ? existing.attempts + 1 : 1,
    lastAttempt: (/* @__PURE__ */ new Date()).toISOString(),
    phase: existing ? Math.max(existing.phase, phase) : phase
  };
  await writeRetries(retriesPath, retries);
}
async function getRetryCount(cwd, signature) {
  const retries = await loadRetries(cwd);
  return retries[signature]?.attempts ?? 0;
}
async function getCurrentPhase(cwd, signature) {
  const retries = await loadRetries(cwd);
  return retries[signature]?.phase ?? 1;
}
async function shouldEscalatePhase2(cwdOrErrorState, signature, currentPhase, category = "unknown") {
  if (typeof cwdOrErrorState === "string") {
    const retries = await loadRetries(cwdOrErrorState);
    const entry = retries[signature];
    if (!entry) {
      return false;
    }
    const limit = PHASE_RETRY_LIMITS[category];
    return entry.attempts >= limit && (currentPhase ?? entry.phase) < MAX_PHASE;
  }
  return isErrorState(cwdOrErrorState) ? shouldEscalatePhase(cwdOrErrorState) : false;
}
async function hasExhaustedRetries2(cwdOrErrorState, signature, category = "unknown") {
  if (typeof cwdOrErrorState === "string") {
    const retries = await loadRetries(cwdOrErrorState);
    const entry = retries[signature];
    if (!entry) {
      return false;
    }
    const limit = PHASE_RETRY_LIMITS[category];
    return entry.phase >= MAX_PHASE && entry.attempts >= limit;
  }
  return isErrorState(cwdOrErrorState) ? hasExhaustedRetries(cwdOrErrorState) : false;
}
function getPhaseDescription2(phase) {
  return getPhaseDescription(phase);
}
async function getRemainingAttempts(cwdOrErrorState, signature, category = "unknown") {
  const limit = PHASE_RETRY_LIMITS[category];
  if (typeof cwdOrErrorState === "string") {
    const retries = await loadRetries(cwdOrErrorState);
    const entry = retries[signature];
    return entry ? Math.max(0, limit - entry.attempts) : limit;
  }
  return isErrorState(cwdOrErrorState) ? getRemainingAttemptsInPhase(cwdOrErrorState) : limit;
}
function generateErrorSignature2(error, toolName) {
  return generateErrorSignature(error, toolName);
}

// src/post-tool-use-failure/response-builder.ts
function buildResearchHintsMessage(hints, phase) {
  if (phase === 1) {
    return "";
  }
  const parts = [];
  if (phase >= 2 && hints.official.length > 0) {
    parts.push("[Phase 2] Search official documentation:");
    for (const hint of hints.official) {
      parts.push(`  - ${hint}`);
    }
  }
  if (phase >= 3 && hints.community.length > 0) {
    parts.push("[Phase 3] Search community solutions:");
    for (const hint of hints.community) {
      parts.push(`  - ${hint}`);
    }
  }
  return parts.join("\n");
}
async function buildFixLoopResponse(options) {
  const { errorState, retryCount, pattern, category, suggestedFix, researchHints, exhausted } = options;
  const responseParts = [];
  const phaseDesc = getPhaseDescription2(errorState.phase);
  responseParts.push(
    `[GoodVibes Fix Loop - Phase ${errorState.phase}/3: ${phaseDesc}]`
  );
  const remaining = await getRemainingAttempts(errorState);
  responseParts.push(
    `Attempt ${retryCount + 1} (${remaining} remaining this phase)`
  );
  responseParts.push("");
  if (pattern) {
    responseParts.push(`Detected: ${pattern.category.replace(/_/g, " ")}`);
  } else {
    responseParts.push(`Category: ${category}`);
  }
  responseParts.push("");
  responseParts.push("Suggested fix:");
  responseParts.push(suggestedFix);
  if (researchHints) {
    responseParts.push("");
    responseParts.push(researchHints);
  }
  const MAX_RECENT_ATTEMPTS = 3;
  if (errorState.fixStrategiesAttempted.length > 0) {
    responseParts.push("");
    responseParts.push("Previously attempted (failed):");
    for (const attempt of errorState.fixStrategiesAttempted.slice(
      -MAX_RECENT_ATTEMPTS
    )) {
      responseParts.push(`  - ${attempt.strategy}`);
    }
    responseParts.push("Try a DIFFERENT approach.");
  }
  if (exhausted) {
    responseParts.push("");
    responseParts.push("[WARNING] All fix phases exhausted. Consider:");
    responseParts.push("  - Manual debugging");
    responseParts.push("  - Asking the user for help");
    responseParts.push("  - Reverting recent changes");
  }
  return responseParts.join("\n");
}

// src/post-tool-use-failure/index.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function runPostToolUseFailureHook() {
  try {
    debug("PostToolUseFailure hook starting");
    const input = await readHookInput();
    const cwd = input.cwd || PROJECT_ROOT;
    const toolName = input.tool_name || "unknown";
    let errorMessage = "Unknown error";
    if (isRecord(input)) {
      errorMessage = typeof input.error === "string" ? input.error : "Unknown error";
    }
    const ERROR_PREVIEW_LENGTH = 200;
    debug("PostToolUseFailure received input", {
      tool_name: toolName,
      error: errorMessage.slice(0, ERROR_PREVIEW_LENGTH)
    });
    let state = await loadState(cwd);
    const signature = generateErrorSignature2(errorMessage, toolName);
    debug("Error signature", { signature });
    const category = categorizeError(errorMessage);
    debug("Error category", { category });
    let errorState = getErrorState(state, signature);
    const currentPhase = await getCurrentPhase(cwd, signature);
    const retryCount = await getRetryCount(cwd, signature);
    if (!errorState) {
      errorState = createErrorState(signature, category);
      debug("Created new error state", { phase: errorState.phase });
    } else {
      const clampedPhase = Math.max(1, Math.min(3, currentPhase));
      errorState = {
        ...errorState,
        phase: clampedPhase
      };
      debug("Existing error state", {
        phase: errorState.phase,
        attemptsThisPhase: errorState.attemptsThisPhase,
        totalAttempts: errorState.totalAttempts
      });
    }
    const shouldEscalate = await shouldEscalatePhase2(errorState);
    if (shouldEscalate && errorState.phase < 3) {
      const nextPhase = errorState.phase + 1;
      errorState = {
        ...errorState,
        phase: nextPhase,
        attemptsThisPhase: 0
      };
      debug("Escalated to phase", { phase: errorState.phase });
    }
    const pattern = findMatchingPattern(category, errorMessage);
    debug("Matching pattern", {
      found: !!pattern,
      category: pattern?.category
    });
    const suggestedFix = getSuggestedFix(category, errorMessage, errorState);
    const _fixContext = buildFixContext(errorState, errorMessage);
    const effectiveCategory = pattern?.category ?? category;
    const hints = getResearchHints(effectiveCategory, errorMessage, errorState.phase);
    const researchHints = buildResearchHintsMessage(hints, errorState.phase);
    errorState = {
      ...errorState,
      attemptsThisPhase: errorState.attemptsThisPhase + 1,
      totalAttempts: errorState.totalAttempts + 1
    };
    state = trackError(state, signature, errorState);
    await saveRetry(cwd, signature, errorState.phase);
    const exhausted = await hasExhaustedRetries2(errorState);
    if (exhausted) {
      debug("All phases exhausted, logging to memory");
      const ERROR_WHAT_LENGTH = 100;
      const failure = {
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        approach: `${toolName} failed: ${errorMessage.slice(0, ERROR_WHAT_LENGTH)}`,
        reason: `Exhausted ${errorState.totalAttempts} attempts across 3 phases`,
        suggestion: "Manual intervention required"
      };
      try {
        await writeFailure(cwd, failure);
      } catch (writeError) {
        debug("Failed to write failure to memory", {
          error: String(writeError)
        });
      }
    }
    await saveState(cwd, state);
    const analytics = await loadAnalytics();
    if (analytics) {
      analytics.tool_failures ??= [];
      analytics.tool_failures.push({
        tool: toolName,
        error: errorMessage,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      analytics.issues_found++;
      await saveAnalytics(analytics);
    }
    const additionalContext = await buildFixLoopResponse({
      errorState,
      retryCount,
      pattern,
      category,
      suggestedFix,
      researchHints,
      exhausted
    });
    respond(createResponse({ systemMessage: additionalContext }));
  } catch (error) {
    logError("PostToolUseFailure main", error);
    respond(createResponse());
  }
}
if (!isTestEnvironment()) {
  runPostToolUseFailureHook().catch((error) => {
    logError("PostToolUseFailure uncaught", error);
    respond(createResponse());
  });
}
