"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/state/project-indexer.ts
var import_promises2 = require("fs/promises");
var import_path = __toESM(require("path"), 1);

// src/state/project-index.ts
var import_promises = require("fs/promises");
var path = __toESM(require("path"), 1);
var import_fs = require("fs");
var FORMAT_HINT = 'tree: { "directory/": { "file.ext": token_count } }';
var ProjectIndex = class _ProjectIndex {
  static {
    __name(this, "ProjectIndex");
  }
  /** Self-documenting format hint written to disk so agents can parse the index without prior knowledge. */
  static FORMAT_HINT = FORMAT_HINT;
  static instance = null;
  index = null;
  // Internal flat list for efficient binary search operations
  files = [];
  loaded = false;
  dirty = false;
  flushTimer = null;
  indexPath;
  constructor() {
    this.indexPath = path.join(process.cwd(), ".goodvibes", "project-index.json");
  }
  /**
   * Get the singleton instance.
   */
  static getInstance() {
    if (!_ProjectIndex.instance) {
      _ProjectIndex.instance = new _ProjectIndex();
    }
    return _ProjectIndex.instance;
  }
  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (_ProjectIndex.instance?.flushTimer) {
      clearTimeout(_ProjectIndex.instance.flushTimer);
    }
    _ProjectIndex.instance = null;
  }
  /**
   * Flatten a v4 tree object into a sorted FileEntry array.
   */
  static flattenTree(tree) {
    const entries = [];
    for (const [dir, files] of Object.entries(tree)) {
      for (const [name, tokens] of Object.entries(files)) {
        const p = dir ? `${dir}/${name}` : name;
        entries.push({ p, tokens });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }
  /**
   * Flatten a v3 tree (array-of-objects) into a sorted FileEntry array.
   * Used during v3→v4 migration.
   */
  static flattenTreeV3(tree) {
    const entries = [];
    for (const [dir, fileEntries] of Object.entries(tree)) {
      for (const entry of fileEntries) {
        const p = dir ? `${dir}/${entry.name}` : entry.name;
        entries.push({ p, tokens: entry.tokens });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }
  /**
   * Flatten a v2 tree (string arrays) into a sorted FileEntry array.
   * Used during v2→v4 migration where no token data is available.
   */
  static flattenTreeV2(tree) {
    const entries = [];
    for (const [dir, filenames] of Object.entries(tree)) {
      for (const name of filenames) {
        const p = dir ? `${dir}/${name}` : name;
        entries.push({ p, tokens: 0 });
      }
    }
    entries.sort((a, b) => a.p.localeCompare(b.p));
    return entries;
  }
  /**
   * Convert an internal FileEntry array back to v4 tree format for disk write.
   */
  static entriesToTree(entries) {
    const tree = {};
    for (const entry of entries) {
      const slashIdx = entry.p.lastIndexOf("/");
      const dir = slashIdx === -1 ? "" : entry.p.substring(0, slashIdx);
      const name = slashIdx === -1 ? entry.p : entry.p.substring(slashIdx + 1);
      if (!tree[dir])
        tree[dir] = {};
      tree[dir][name] = entry.tokens;
    }
    for (const key of Object.keys(tree)) {
      const sorted = {};
      for (const name of Object.keys(tree[key]).sort()) {
        sorted[name] = tree[key][name];
      }
      tree[key] = sorted;
    }
    return tree;
  }
  /**
   * Load index from disk if not already loaded.
   */
  async load() {
    if (this.loaded)
      return;
    try {
      if ((0, import_fs.existsSync)(this.indexPath)) {
        const content = await (0, import_promises.readFile)(this.indexPath, "utf-8");
        const parsed = JSON.parse(content);
        if (!parsed) {
          this.index = null;
          this.files = [];
        } else if (parsed.version === 4) {
          this.index = parsed;
          this.files = _ProjectIndex.flattenTree(parsed.tree || {});
          if (!this.index._format) {
            this.index._format = _ProjectIndex.FORMAT_HINT;
            this.markDirty();
          }
        } else if (parsed.version === 3) {
          const v3 = parsed;
          const v3tree = v3.tree || {};
          this.files = _ProjectIndex.flattenTreeV3(v3tree);
          const v4tree = _ProjectIndex.entriesToTree(this.files);
          this.index = {
            _format: _ProjectIndex.FORMAT_HINT,
            version: 4,
            created_at: v3.created_at,
            updated_at: v3.updated_at,
            project_root: v3.project_root,
            stats: v3.stats,
            tree: v4tree
          };
          this.markDirty();
        } else if (parsed.version === 2) {
          const v2 = parsed;
          const v2tree = v2.tree || {};
          this.files = _ProjectIndex.flattenTreeV2(v2tree);
          const v4tree = _ProjectIndex.entriesToTree(this.files);
          this.index = {
            _format: _ProjectIndex.FORMAT_HINT,
            version: 4,
            created_at: v2.created_at,
            updated_at: v2.updated_at,
            project_root: v2.project_root,
            stats: {
              total_files: v2.stats.total_files,
              total_dirs: v2.stats.total_dirs,
              index_duration_ms: v2.stats.index_duration_ms
            },
            tree: v4tree
          };
          this.markDirty();
        } else if (parsed.version === 1) {
          const legacy = parsed;
          this.files = (legacy.files || []).map((f) => ({ p: f.p, tokens: 0 }));
          this.files.sort((a, b) => a.p.localeCompare(b.p));
          const tree = _ProjectIndex.entriesToTree(this.files);
          this.index = {
            _format: _ProjectIndex.FORMAT_HINT,
            version: 4,
            created_at: legacy.created_at,
            updated_at: legacy.updated_at,
            project_root: legacy.project_root,
            stats: {
              total_files: legacy.stats.total_files,
              total_dirs: legacy.stats.total_dirs,
              index_duration_ms: legacy.stats.index_duration_ms
            },
            tree
          };
          this.markDirty();
        } else {
          console.error(`[ProjectIndex] Unsupported index version: ${parsed?.version}`);
          this.index = null;
          this.files = [];
        }
      } else {
        this.index = null;
        this.files = [];
      }
    } catch (error) {
      console.error("[ProjectIndex] Failed to load index:", error);
      this.index = null;
      this.files = [];
    }
    this.loaded = true;
  }
  /**
   * Get the loaded index, loading from disk if needed.
   */
  async getIndexLoaded() {
    await this.load();
    return this.index;
  }
  /**
   * Get the current index without loading from disk.
   */
  getIndex() {
    return this.index;
  }
  /**
   * Get the internal flat files list (for queries).
   */
  getFiles() {
    return this.files;
  }
  /**
   * Get summary statistics from the index.
   */
  getStats() {
    if (!this.index)
      return null;
    return this.index.stats;
  }
  /**
   * Add or update a file entry in the index.
   * @param relativePath - Path relative to project root
   * @param tokens - Estimated token count (optional; 0 if unknown)
   */
  upsertFile(relativePath, tokens = 0) {
    if (!this.index)
      return;
    const newEntry = { p: relativePath, tokens };
    const existingIndex = this.findEntryIndex(relativePath);
    if (existingIndex >= 0) {
      this.files[existingIndex] = newEntry;
    } else {
      this.insertSorted(newEntry);
      this.index.stats.total_files++;
    }
    this.index.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.markDirty();
  }
  /**
   * Alias for upsertFile (used after edits — tokens unknown, keeps existing or sets 0).
   */
  touchFile(relativePath) {
    const existingIdx = this.findEntryIndex(relativePath);
    const existingTokens = existingIdx >= 0 ? this.files[existingIdx].tokens : 0;
    this.upsertFile(relativePath, existingTokens);
  }
  /**
   * Remove a file from the index.
   * Note: stats.total_dirs may be stale until the next flush (500ms debounce).
   */
  removeFile(relativePath) {
    if (!this.index)
      return;
    const idx = this.findEntryIndex(relativePath);
    if (idx >= 0) {
      this.files.splice(idx, 1);
      this.index.stats.total_files--;
      this.index.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      this.markDirty();
    }
  }
  /**
   * Get files filtered by type (derived from extension).
   */
  getFilesByType(type) {
    return this.files.filter((f) => categorizeFileType(f.p) === type);
  }
  /**
   * Get files matching a path prefix.
   */
  getFilesByPrefix(prefix) {
    const files = this.files;
    let left = 0;
    let right = files.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (files[mid].p < prefix) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    const result = [];
    for (let i = left; i < files.length && files[i].p.startsWith(prefix); i++) {
      result.push(files[i]);
    }
    return result;
  }
  /**
   * Get file type breakdown (derived from extension).
   */
  getTypeCounts() {
    const counts = {};
    for (const file of this.files) {
      const type = categorizeFileType(file.p);
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }
  /**
   * Find the index of a file entry by path using binary search.
   * Returns -1 if not found.
   */
  findEntryIndex(p) {
    const files = this.files;
    let left = 0;
    let right = files.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = files[mid].p < p ? -1 : files[mid].p > p ? 1 : 0;
      if (cmp === 0) {
        return mid;
      } else if (cmp < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return -1;
  }
  /**
   * Insert an entry maintaining sorted order.
   */
  insertSorted(entry) {
    const files = this.files;
    let left = 0;
    let right = files.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (files[mid].p < entry.p) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    files.splice(left, 0, entry);
  }
  /**
   * Mark the index as dirty and schedule a debounced flush.
   */
  markDirty() {
    this.dirty = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flush().catch((error) => {
        console.error("[ProjectIndex] Flush failed:", error);
      });
    }, 500);
  }
  /**
   * Flush the index to disk atomically.
   */
  async flush() {
    if (!this.dirty || !this.index)
      return;
    try {
      await (0, import_promises.mkdir)(path.dirname(this.indexPath), { recursive: true });
      const tree = _ProjectIndex.entriesToTree(this.files);
      const indexToWrite = {
        ...this.index,
        version: this.index.version,
        stats: {
          ...this.index.stats,
          total_dirs: Object.keys(tree).length
        },
        tree
      };
      const tempPath = this.indexPath + ".tmp";
      await (0, import_promises.writeFile)(tempPath, JSON.stringify(indexToWrite) + "\n", "utf-8");
      await (0, import_promises.rename)(tempPath, this.indexPath);
      this.dirty = false;
    } catch (error) {
      console.error("[ProjectIndex] Failed to flush index:", error);
    } finally {
      this.flushTimer = null;
    }
  }
  /**
   * Force an immediate flush (useful for cleanup/shutdown).
   */
  async forceFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
};
function categorizeFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  switch (ext) {
    case "ts":
    case "tsx":
      return "ts";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "js";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "md";
    case "css":
    case "scss":
    case "less":
      return "css";
    case "html":
    case "htm":
      return "html";
    case "py":
      return "py";
    case "go":
      return "go";
    case "rs":
      return "rs";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return "other";
  }
}
__name(categorizeFileType, "categorizeFileType");
var projectIndex = ProjectIndex.getInstance();

// src/state/project-indexer.ts
var defaultLogger = {
  debug(msg, data) {
    const suffix = data ? " " + JSON.stringify(data) : "";
    process.stderr.write(`[project-indexer] ${msg}${suffix}
`);
  },
  error(msg, err) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[project-indexer] ERROR ${msg}: ${detail}
`);
  }
};
var INDEX_EXCLUSION_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".goodvibes",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "__pycache__",
  ".cache",
  ".turbo",
  ".vercel",
  ".netlify",
  "coverage",
  ".nyc_output",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  "venv",
  ".venv",
  "target",
  // Test directories
  "__tests__",
  "__mocks__",
  "__fixtures__",
  "__snapshots__",
  // IDE/editor
  ".vscode",
  ".idea"
]);
var EXCLUDED_SUFFIXES = [
  // Multi-part extensions (check before single-part)
  ".test.ts",
  ".spec.ts",
  ".test.tsx",
  ".spec.tsx",
  ".test.js",
  ".spec.js",
  ".test.jsx",
  ".spec.jsx",
  ".d.ts",
  ".d.mts",
  ".d.cts",
  ".stories.ts",
  ".stories.tsx",
  ".stories.js",
  ".stories.jsx",
  ".stories.mdx",
  ".min.js",
  ".min.css",
  ".tsbuildinfo",
  // Single-part extensions
  ".map",
  // Media/binary
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".mp4",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot"
];
var EXCLUDED_FILENAMES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  ".DS_Store",
  "Thumbs.db"
]);
var globRegexCache = /* @__PURE__ */ new Map();
var globDstarCache = /* @__PURE__ */ new Map();
function parseGitignore(content) {
  const patterns = [];
  for (const line of content.split("\n")) {
    let raw = line;
    raw = raw.replace(/(?<!\\) +$/, "");
    if (!raw || raw.startsWith("#"))
      continue;
    const negated = raw.startsWith("!");
    if (negated)
      raw = raw.slice(1);
    if (raw.startsWith("\\#"))
      raw = raw.slice(1);
    const anchored = raw.startsWith("/");
    if (anchored)
      raw = raw.slice(1);
    const dirOnly = raw.endsWith("/");
    if (dirOnly)
      raw = raw.slice(0, -1);
    if (!raw)
      continue;
    patterns.push({ negated, anchored, dirOnly, raw });
  }
  return patterns;
}
__name(parseGitignore, "parseGitignore");
function matchGlob(pattern, name) {
  let regex = globRegexCache.get(pattern);
  if (!regex) {
    let regexStr = "";
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === "*") {
        regexStr += "[^/]*";
      } else if (ch === "?") {
        regexStr += "[^/]";
      } else {
        regexStr += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      }
    }
    regex = new RegExp(`^${regexStr}$`);
    globRegexCache.set(pattern, regex);
  }
  return regex.test(name);
}
__name(matchGlob, "matchGlob");
function isGitignored(patterns, relativePath, isDir) {
  const segments = relativePath.split("/");
  const name = segments[segments.length - 1];
  let ignored = false;
  for (const p of patterns) {
    if (p.dirOnly && !isDir) {
      let parentMatch = false;
      for (let s = 0; s < segments.length - 1; s++) {
        const parentPath = segments.slice(0, s + 1).join("/");
        const parentName = segments[s];
        if (p.raw.includes("/")) {
          if (p.anchored) {
            parentMatch = matchGlob(p.raw, parentPath);
          } else {
            parentMatch = matchGlob(p.raw, parentPath) || parentPath === p.raw;
          }
        } else {
          parentMatch = matchGlob(p.raw, parentName);
        }
        if (parentMatch)
          break;
      }
      if (!parentMatch)
        continue;
      ignored = !p.negated;
      continue;
    }
    let matches = false;
    if (p.raw.includes("/")) {
      if (p.raw.includes("**")) {
        let cached = globDstarCache.get(p.raw);
        if (!cached) {
          const regexStr = p.raw.split("**").map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")).join(".*");
          cached = [new RegExp(`^${regexStr}$`), new RegExp(`^${regexStr}(/.*)?$`)];
          globDstarCache.set(p.raw, cached);
        }
        matches = cached[0].test(relativePath) || cached[1].test(relativePath);
      } else if (p.anchored) {
        matches = matchGlob(p.raw, relativePath) || relativePath.startsWith(p.raw + "/");
      } else {
        matches = matchGlob(p.raw, relativePath) || relativePath === p.raw || relativePath.startsWith(p.raw + "/");
      }
    } else {
      matches = matchGlob(p.raw, name);
      if (!matches && isDir) {
        for (const seg of segments) {
          if (matchGlob(p.raw, seg)) {
            matches = true;
            break;
          }
        }
      }
    }
    if (matches) {
      ignored = !p.negated;
    }
  }
  return ignored;
}
__name(isGitignored, "isGitignored");
async function loadGitignore(projectDir2) {
  try {
    const gitignorePath = import_path.default.join(projectDir2, ".gitignore");
    const content = await (0, import_promises2.readFile)(gitignorePath, "utf-8");
    return parseGitignore(content);
  } catch {
    return [];
  }
}
__name(loadGitignore, "loadGitignore");
function shouldExclude(name, relativePath, gitignorePatterns, isDir) {
  const segments = relativePath.split(import_path.default.sep);
  for (const segment of segments) {
    if (INDEX_EXCLUSION_DIRS.has(segment)) {
      return true;
    }
  }
  if (!isDir) {
    if (EXCLUDED_FILENAMES.has(name)) {
      return true;
    }
    const lowerName = name.toLowerCase();
    for (const suffix of EXCLUDED_SUFFIXES) {
      if (lowerName.endsWith(suffix)) {
        return true;
      }
    }
  }
  if (gitignorePatterns.length > 0) {
    const normalizedPath = relativePath.split(import_path.default.sep).join("/");
    if (isGitignored(gitignorePatterns, normalizedPath, isDir)) {
      return true;
    }
  }
  return false;
}
__name(shouldExclude, "shouldExclude");
async function buildProjectIndex(projectDir2, logger2 = defaultLogger) {
  globRegexCache = /* @__PURE__ */ new Map();
  globDstarCache = /* @__PURE__ */ new Map();
  const startMs = Date.now();
  const tree = {};
  let isPartial = false;
  let totalFiles = 0;
  try {
    logger2.debug("Building project file index", { projectDir: projectDir2 });
    const gitignorePatterns = await loadGitignore(projectDir2);
    logger2.debug("Loaded gitignore patterns", { count: gitignorePatterns.length });
    const dirEntries = await (0, import_promises2.readdir)(projectDir2, {
      recursive: true,
      withFileTypes: true
    });
    for (const entry of dirEntries) {
      if (Date.now() - startMs > 3e4) {
        logger2.debug("Project indexing timeout - writing partial index");
        isPartial = true;
        break;
      }
      const parent = entry.parentPath ?? entry.path;
      const relativePath = parent ? import_path.default.relative(projectDir2, import_path.default.join(parent, entry.name)) : entry.name;
      const isDir = entry.isDirectory();
      if (shouldExclude(entry.name, relativePath, gitignorePatterns, isDir)) {
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const dirPart = import_path.default.dirname(relativePath);
      const treeKey = dirPart === "." ? "" : dirPart.split(import_path.default.sep).join("/");
      const filename = entry.name;
      let fileSize = 0;
      try {
        const fileStat = await (0, import_promises2.stat)(import_path.default.join(parent, entry.name));
        fileSize = fileStat.size;
      } catch {
      }
      if (!tree[treeKey]) {
        tree[treeKey] = {};
      }
      tree[treeKey][filename] = Math.ceil(fileSize / 4);
      totalFiles++;
    }
    for (const key of Object.keys(tree)) {
      const sorted = {};
      for (const name of Object.keys(tree[key]).sort()) {
        sorted[name] = tree[key][name];
      }
      tree[key] = sorted;
    }
    const totalDirs = Object.keys(tree).length;
    const index = {
      _format: FORMAT_HINT,
      version: 4,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      project_root: projectDir2,
      stats: {
        total_files: totalFiles,
        total_dirs: totalDirs,
        index_duration_ms: Date.now() - startMs,
        ...isPartial && { partial: true }
      },
      tree
    };
    const indexDir = import_path.default.join(projectDir2, ".goodvibes");
    const indexPath = import_path.default.join(indexDir, "project-index.json");
    const tempPath = indexPath + ".tmp";
    await (0, import_promises2.mkdir)(indexDir, { recursive: true });
    await (0, import_promises2.writeFile)(tempPath, JSON.stringify(index) + "\n", "utf-8");
    await (0, import_promises2.rename)(tempPath, indexPath);
    logger2.debug("Project index created", {
      files: totalFiles,
      dirs: totalDirs,
      duration_ms: index.stats.index_duration_ms,
      partial: isPartial
    });
  } catch (error) {
    logger2.error("Project indexing failed", error);
    throw error;
  }
}
__name(buildProjectIndex, "buildProjectIndex");

// src/build-index-cli.ts
var projectDir = process.argv[2] ?? process.cwd();
var logger = {
  debug: (msg) => process.stderr.write(`[build-index] ${msg}
`),
  error: (msg) => process.stderr.write(`[build-index] ERROR: ${msg}
`)
};
buildProjectIndex(projectDir, logger).then(() => {
  process.stderr.write(`[build-index] Done.
`);
  process.exit(0);
}).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[build-index] Failed: ${message}
`);
  process.exit(1);
});
//# sourceMappingURL=build-index.cjs.map
