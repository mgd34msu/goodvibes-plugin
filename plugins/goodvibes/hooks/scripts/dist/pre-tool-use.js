/* Bundled with esbuild */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// src/shared/gitignore.ts
var init_gitignore = __esm({
  "src/shared/gitignore.ts"() {
    "use strict";
  }
});

// src/shared/hook-io.ts
import { stdin } from "process";
function isValidHookInput(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value;
  return typeof obj.session_id === "string" && typeof obj.cwd === "string" && typeof obj.hook_event_name === "string";
}
async function readHookInput() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString());
  if (!isValidHookInput(parsed)) {
    throw new Error("Invalid hook input structure");
  }
  return parsed;
}
function blockTool(reason) {
  console.error(reason);
  process.exit(2);
}

// src/shared/file-utils.ts
import { exec as execCallback } from "child_process";
import { promisify } from "util";

// src/shared/constants.ts
import * as path from "path";
function resolvePluginRootFromDirname(dirname) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return process.env.CLAUDE_PLUGIN_ROOT;
  }
  if (dirname !== void 0 && dirname.includes("hooks")) {
    const hooksIndex = dirname.indexOf("hooks");
    if (hooksIndex > 0) {
      return dirname.substring(0, hooksIndex - 1);
    }
  }
  const devPluginPath = path.join(process.cwd(), "plugins", "goodvibes");
  return devPluginPath;
}
function resolvePluginRoot() {
  const currentDirname = typeof __dirname !== "undefined" ? __dirname : void 0;
  return resolvePluginRootFromDirname(currentDirname);
}
var PLUGIN_ROOT = resolvePluginRoot();
var PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var CACHE_DIR = path.join(PLUGIN_ROOT, ".cache");
var ANALYTICS_FILE = path.join(CACHE_DIR, "analytics.json");

// src/shared/file-utils.ts
var exec = promisify(execCallback);

// src/shared/config.ts
var STDIN_TIMEOUT_MS = parseInt(
  process.env.GOODVIBES_STDIN_TIMEOUT_MS ?? "1000",
  10
);

// src/shared/index.ts
init_gitignore();

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

// src/pre-tool-use/subagent-blockers.ts
var TOOL_REPLACEMENTS = {
  Read: {
    replacement: "precision_read",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_read '{
  "files": ["path/to/file1.ts", "path/to/file2.ts"],
  "extract": "full",
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: extract modes (full/outline/lines), line ranges, output modes (minimal/standard/verbose)"
  },
  Edit: {
    replacement: "precision_edit",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_edit '{
  "edits": [
    {"file": "path/to/file.ts", "find": "original", "replace": "replacement"}
  ],
  "transaction": {"mode": "atomic", "rollback_on_fail": true},
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: atomic transactions, validation, hints, batch edits"
  },
  Write: {
    replacement: "precision_write",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_write '{
  "files": [
    {"path": "path/to/file.ts", "content": "file content here"}
  ],
  "transaction": {"mode": "atomic"},
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: create/overwrite operations, multiple files, atomic transactions, validation"
  },
  Glob: {
    replacement: "precision_glob",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_glob '{
  "patterns": ["**/*.ts", "**/*.tsx"],
  "exclude": ["**/*.test.ts"],
  "output": {"mode": "minimal"}
}'`,
    capabilities: "Supports: multiple patterns, exclusions, filters, output modes"
  },
  Grep: {
    replacement: "precision_grep",
    usage: `mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{
  "queries": [
    {"pattern": "searchPattern", "glob": "**/*.ts"}
  ],
  "output": {"mode": "files_only"}
}'`,
    capabilities: "Supports: batch queries, regex patterns, file filtering, context control, output modes"
  }
};
var BLOCKED_NATIVE_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep"
];
function formatBlockMessage(toolName, replacement) {
  const toolPath = `plugin_goodvibes_precision-engine/${replacement.replacement}`;
  return `BLOCKED: '${toolName}' - MANDATORY: Use ${toolPath} instead.
CRITICAL: If multiple tool uses are planned, "discover -> batch" process is MANDATORY:
mcp-cli info plugin_goodvibes_precision-engine/discover
mcp-cli info plugin_goodvibes_batch-engine/batch

** ${toolPath} **TOOL INFO: 
${replacement.usage}

TOOL INFO: ${replacement.capabilities}
MORE INFO: mcp-cli info ${toolPath}

`;
}
function isBlockedNativeTool(toolName) {
  return BLOCKED_NATIVE_TOOLS.includes(toolName);
}

// src/pre-tool-use/json-auto-escape.ts
var VALID_JSON_ESCAPES = /* @__PURE__ */ new Set([
  '"',
  // quote
  "\\",
  // backslash
  "/",
  // forward slash
  "b",
  // backspace
  "f",
  // form feed
  "n",
  // newline
  "r",
  // carriage return
  "t",
  // tab
  "u"
  // unicode (must be followed by 4 hex digits)
]);
var BACKSLASH = "\\";
function fixJsonEscaping(jsonString) {
  try {
    JSON.parse(jsonString);
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  } catch (e) {
  }
  let result = "";
  let inString = false;
  let fixCount = 0;
  let i = 0;
  while (i < jsonString.length) {
    const char = jsonString[i];
    const nextChar = jsonString[i + 1];
    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && jsonString[j] === BACKSLASH) {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      i++;
      continue;
    }
    if (inString && char === BACKSLASH) {
      if (nextChar === void 0) {
        result += char;
        i++;
        continue;
      }
      if (!VALID_JSON_ESCAPES.has(nextChar)) {
        result += BACKSLASH + BACKSLASH;
        fixCount++;
        i++;
        continue;
      }
      if (nextChar === "u") {
        const hex = jsonString.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += BACKSLASH + BACKSLASH;
          fixCount++;
          i++;
          continue;
        }
      }
    }
    result += char;
    i++;
  }
  try {
    JSON.parse(result);
    return { fixed: result, wasFixed: fixCount > 0, fixCount };
  } catch (e) {
    return { fixed: jsonString, wasFixed: false, fixCount: 0 };
  }
}
function extractMcpCliJson(command) {
  const mcpCallMatch = /mcp-cli\s+call\s+([\w_-]+\/[\w_-]+)(.*)$/i.exec(command);
  if (!mcpCallMatch) {
    return null;
  }
  const serverTool = mcpCallMatch[1];
  const argsSection = mcpCallMatch[2].trim();
  const inlineMatch = /['"]([{\[].*)['"]\s*$/.exec(argsSection);
  if (inlineMatch) {
    return {
      json: inlineMatch[1],
      format: "inline",
      serverTool
    };
  }
  if (/\s+-\s*$/.test(argsSection) || /<</.test(command) || /\|/.test(command)) {
    return {
      json: "",
      format: "stdin",
      serverTool
    };
  }
  if (/--json-file/.test(argsSection)) {
    return {
      json: "",
      format: "file",
      serverTool
    };
  }
  return null;
}
function checkAndFixMcpCliJson(command) {
  const extracted = extractMcpCliJson(command);
  if (!extracted || !extracted.json || extracted.format !== "inline") {
    return null;
  }
  const { json, serverTool } = extracted;
  const result = fixJsonEscaping(json);
  if (result.wasFixed) {
    const correctedCommand = `mcp-cli call ${serverTool} '${result.fixed}'`;
    return `JSON escape error detected in mcp-cli call.

Invalid escape sequences found: ${result.fixCount}
Common issue: Regex patterns like . d w need double escaping in JSON.

Fixed command:
${correctedCommand}

Please use the corrected command above.
`;
  }
  return null;
}

// src/pre-tool-use.ts
async function main() {
  const input = await readHookInput();
  const toolName = input.tool_name ?? "";
  if (toolName === "Bash") {
    const command = input.tool_input?.command || "";
    const jsonFixMessage = checkAndFixMcpCliJson(command);
    if (jsonFixMessage) {
      blockTool(jsonFixMessage);
    }
  }
  if (isBlockedNativeTool(toolName)) {
    const replacement = TOOL_REPLACEMENTS[toolName];
    if (replacement) {
      blockTool(formatBlockMessage(toolName, replacement));
    }
  }
  process.exit(0);
}
main();
/* v8 ignore next 2 -- @preserve __dirname is always defined in Node.js CJS */
