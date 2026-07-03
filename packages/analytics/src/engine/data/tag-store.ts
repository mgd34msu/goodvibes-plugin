/**
 * tag-store.ts — Tag operations layer for the analytics engine.
 *
 * Thin wrapper around GlobalDB tag methods with additional batch operations
 * and local JSONL-based auto-tagging heuristics.
 *
 * All tags are persisted in the global SQLite database and survive process
 * restarts. No module-level state is maintained here.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { GlobalDB } from './global-db.js';
import type { TagEntry } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of JSONL lines to scan from the start of a file. */
const SCAN_HEAD_LINES = 200;

/** Maximum number of JSONL lines to scan from the end of a file. */
const SCAN_TAIL_LINES = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Domain heuristic patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keyword patterns mapped to their inferred domain tag.
 * Each pattern group is evaluated against file paths and conversation text.
 */
const DOMAIN_PATTERNS: ReadonlyArray<{
  tag: string;
  patterns: RegExp[];
  confidence: 'high' | 'medium' | 'low';
}> = [
  {
    tag: 'authentication',
    patterns: [/\bauth\b/i, /\blogin\b/i, /\boauth\b/i, /\bjwt\b/i, /\bpassport\b/i, /\bsession\b.*\bstore\b/i],
    confidence: 'high',
  },
  {
    tag: 'payments',
    patterns: [/\bstripe\b/i, /\bpayment\b/i, /\bcheckout\b/i, /\blemon.?squeezy\b/i, /\bpaddle\b/i, /\binvoice\b/i, /\bsubscription\b/i],
    confidence: 'high',
  },
  {
    tag: 'analytics',
    patterns: [/\banalytics\b/i, /\bdashboard\b/i, /\bmetrics\b/i, /\btelemetry\b/i, /\btracking\b/i],
    confidence: 'high',
  },
  {
    tag: 'devops',
    patterns: [/\bdocker\b/i, /\bkubernetes\b/i, /\bci\b/i, /\bpipeline\b/i, /\.github\/workflows/i, /\bdeploy\b/i, /\bterraform\b/i, /\bhelm\b/i],
    confidence: 'high',
  },
  {
    tag: 'testing',
    patterns: [/\.spec\./i, /\.test\./i, /\bvitest\b/i, /\bjest\b/i, /\bplaywright\b/i, /\bcypress\b/i, /\bcoverage\b/i],
    confidence: 'high',
  },
  {
    tag: 'database',
    patterns: [/\bprisma\b/i, /\bdrizzle\b/i, /\bmigration\b/i, /\/prisma\//i, /\bschema\.prisma\b/i, /\bsqlite\b/i, /\bpostgres\b/i, /\bmysql\b/i],
    confidence: 'high',
  },
  {
    tag: 'multi-tenant',
    patterns: [/\bmulti.?tenant\b/i, /\btenant\b/i, /\borganization\b.*\bslug\b/i, /\bworkspace\b.*\bmember\b/i],
    confidence: 'medium',
  },
  {
    tag: 'revops',
    patterns: [/\brevenue\b/i, /\bbilling\b/i, /\bmrr\b/i, /\bchurn\b/i, /\bltv\b/i],
    confidence: 'medium',
  },
  {
    tag: 'api',
    patterns: [/\btrpc\b/i, /\bgraphql\b/i, /\/api\//i, /\brest\b.*\bendpoint\b/i, /\bwebhook\b/i],
    confidence: 'high',
  },
  {
    tag: 'infrastructure',
    patterns: [/\bnginx\b/i, /\btraefik\b/i, /\.env\b/i, /\bconfig\b.*\bfile\b/i, /\bsecret\b/i],
    confidence: 'low',
  },
];

/**
 * Framework detection patterns evaluated against file paths and package deps.
 */
const FRAMEWORK_PATTERNS: ReadonlyArray<{
  tag: string;
  patterns: RegExp[];
}> = [
  { tag: 'react',      patterns: [/\.tsx$/i, /\breact\b/i, /\bnext\.js\b/i, /\.jsx$/i] },
  { tag: 'vue',        patterns: [/\.vue$/i, /\bvue\b/i, /\bnuxt\b/i] },
  { tag: 'typescript', patterns: [/\.ts$/i, /\btypescript\b/i, /tsconfig/i] },
  { tag: 'nextjs',     patterns: [/\bnext\.config\b/i, /\/app\/.*page\.tsx/i, /next\.js/i] },
  { tag: 'prisma',     patterns: [/\.prisma$/i, /prisma\/schema/i, /\bprisma\b/i] },
  { tag: 'tailwind',   patterns: [/\btailwind\b/i, /tailwind\.config/i, /\bcn\b.*\bclsx\b/i] },
];

/**
 * Activity-type patterns inferred from tool usage in JSONL events.
 */
const ACTIVITY_PATTERNS: ReadonlyArray<{
  tag: string;
  toolPatterns: RegExp[];
  minCount: number;
}> = [
  { tag: 'feature-development', toolPatterns: [/precision_write|precision_edit/i], minCount: 10 },
  { tag: 'refactoring',         toolPatterns: [/precision_edit/i],                 minCount: 20 },
  { tag: 'infrastructure',      toolPatterns: [/precision_exec/i],                 minCount: 15 },
];

// ─────────────────────────────────────────────────────────────────────────────
// TagStore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tag operations layer wrapping GlobalDB tag methods.
 *
 * Provides CRUD operations on session tags backed by the global SQLite DB,
 * plus local heuristic-based auto-tag suggestions from JSONL session files.
 *
 * @example
 * ```ts
 * const store = new TagStore(globalDb);
 * store.addTag('session-abc', 'typescript');
 * const tags = store.getTagsForSession('session-abc');
 * const suggested = store.suggestTags('session-abc', '/path/to/session.jsonl');
 * ```
 */
export class TagStore {
  constructor(private readonly db: GlobalDB) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Core CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a single tag to a session.
   *
   * Silently ignores duplicate (sessionId, tag) pairs.
   *
   * @param sessionId - Target session identifier.
   * @param tag       - Tag string to add (trimmed, lowercased).
   * @param source    - Origin of the tag. Defaults to 'manual'.
   */
  addTag(
    sessionId: string,
    tag: string,
    source: 'manual' | 'auto' = 'manual',
  ): void {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) {return;}
    this.db.addTag(sessionId, normalized, source);
  }

  /**
   * Add multiple tags to a session in a single operation.
   *
   * Duplicates are silently ignored. Empty strings are skipped.
   *
   * @param sessionId - Target session identifier.
   * @param tags      - Array of tag strings to add.
   * @param source    - Origin of the tags. Defaults to 'manual'.
   */
  addTags(
    sessionId: string,
    tags: string[],
    source: 'manual' | 'auto' = 'manual',
  ): void {
    for (const tag of tags) {
      this.addTag(sessionId, tag, source);
    }
  }

  /**
   * Remove a tag from a session.
   *
   * No-op if the tag does not exist on the session.
   *
   * @param sessionId - Target session identifier.
   * @param tag       - Tag string to remove.
   */
  removeTag(sessionId: string, tag: string): void {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) {return;}
    this.db.removeTag(sessionId, normalized);
  }

  /**
   * Retrieve all tags for a session, ordered by creation time.
   *
   * @param sessionId - Session identifier.
   * @returns Array of TagEntry objects.
   */
  getTagsForSession(sessionId: string): TagEntry[] {
    return this.db.getTagsForSession(sessionId);
  }

  /**
   * Retrieve all session IDs that have the given tag.
   *
   * @param tag - Tag string to look up.
   * @returns Array of session ID strings.
   */
  getSessionsByTag(tag: string): string[] {
    const normalized = tag.trim().toLowerCase();
    return this.db.getSessionsByTag(normalized);
  }

  /**
   * List all unique tags with their usage counts across all sessions.
   *
   * @returns Array of `{ tag, count, sessions }` objects, sorted by count descending.
   */
  getAllTags(): Array<{ tag: string; count: number; sessions: string[] }> {
    const rows = this.db.getAllTags();
    return rows.map((row) => ({
      tag: row.tag,
      count: row.count,
      sessions: this.db.getSessionsByTag(row.tag),
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-tagging heuristics
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Suggest descriptive domain tags for a session by analyzing its JSONL file.
   *
   * Uses a local heuristic approach:
   * 1. Reads the first N and last M lines of the JSONL file for efficiency.
   * 2. Scans for framework/language signals in file paths and tool inputs.
   * 3. Infers domain from keywords (auth, payments, analytics, etc.).
   * 4. Detects activity type from tool usage patterns (write-heavy = feature dev).
   *
   * Returns deduplicated, sorted suggestions with confidence levels.
   * Does NOT apply tags automatically — callers confirm before persisting.
   *
   * Note: For higher-quality inference on complex or ambiguous sessions,
   * consider using precision_agent with LLM-based analysis. This heuristic
   * approach is intentionally fast and local.
   *
   * @param sessionId  - Session identifier (used for deduplication against existing tags).
   * @param jsonlPath  - Absolute path to the Claude session JSONL file.
   * @returns Array of `{ tag, confidence }` suggestion objects, sorted by confidence.
   */
  suggestTags(
    sessionId: string,
    jsonlPath: string,
  ): Array<{ tag: string; confidence: 'high' | 'medium' | 'low'; reason: string }> {
    const existing = new Set(
      this.db.getTagsForSession(sessionId).map((t) => t.tag),
    );

    // Collect text corpus from JSONL
    const corpus = this._readJsonlCorpus(jsonlPath);
    if (!corpus) {
      return [];
    }

    const { headText, tailText, toolCounts } = corpus;
    const fullText = `${headText}\n${tailText}`;

    const suggestions = new Map<string, { confidence: 'high' | 'medium' | 'low'; reason: string }>();

    // 1. Framework / language detection
    for (const { tag, patterns } of FRAMEWORK_PATTERNS) {
      if (existing.has(tag)) {continue;}
      const matchedPattern = patterns.find((p) => p.test(fullText));
      if (matchedPattern) {
        suggestions.set(tag, { confidence: 'high', reason: `file paths match ${matchedPattern.source}` });
      }
    }

    // 2. Domain inference
    for (const { tag, patterns, confidence } of DOMAIN_PATTERNS) {
      if (existing.has(tag)) {continue;}
      const matchedPattern = patterns.find((p) => p.test(fullText));
      if (matchedPattern) {
        const existingEntry = suggestions.get(tag);
        // Only overwrite if new confidence is higher
        if (!existingEntry || this._confidenceRank(confidence) > this._confidenceRank(existingEntry.confidence)) {
          suggestions.set(tag, { confidence, reason: `keyword match: ${matchedPattern.source}` });
        }
      }
    }

    // 3. Activity type from tool usage patterns
    for (const { tag, toolPatterns, minCount } of ACTIVITY_PATTERNS) {
      if (existing.has(tag)) {continue;}
      const totalMatchCount = toolPatterns.reduce((sum, p) => {
        for (const [toolName, count] of toolCounts) {
          if (p.test(toolName)) {sum += count;}
        }
        return sum;
      }, 0);
      if (totalMatchCount >= minCount) {
        suggestions.set(tag, {
          confidence: 'medium',
          reason: `${totalMatchCount} matching tool calls`,
        });
      }
    }

    // Sort: high > medium > low, then alphabetically
    const sorted = [...suggestions.entries()]
      .map(([tag, meta]) => ({ tag, ...meta }))
      .sort((a, b) => {
        const rankDiff = this._confidenceRank(b.confidence) - this._confidenceRank(a.confidence);
        return rankDiff !== 0 ? rankDiff : a.tag.localeCompare(b.tag);
      });

    return sorted;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Read and parse a JSONL file, returning a text corpus from head + tail.
   *
   * Extracts file paths and tool names from tool_use events for pattern matching.
   * Returns null if the file does not exist or cannot be read.
   *
   * @param jsonlPath - Absolute path to the JSONL file.
   */
  private _readJsonlCorpus(jsonlPath: string): {
    headText: string;
    tailText: string;
    toolCounts: Map<string, number>;
  } | null {
    if (!existsSync(jsonlPath)) {return null;}

    let rawContent: string;
    try {
      rawContent = readFileSync(jsonlPath, 'utf-8');
    } catch {
      return null;
    }

    const lines = rawContent.split('\n').filter(Boolean);
    const headLines = lines.slice(0, SCAN_HEAD_LINES);
    const tailLines = lines.slice(-SCAN_TAIL_LINES);
    const sampleLines = [...new Set([...headLines, ...tailLines])];

    const toolCounts = new Map<string, number>();

    for (const line of sampleLines) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Count tool usage
      const type = parsed['type'];
      if (type === 'tool_use' || type === 'tool_result') {
        const toolName = String(parsed['name'] ?? parsed['tool_name'] ?? '');
        if (toolName) {
          toolCounts.set(toolName, (toolCounts.get(toolName) ?? 0) + 1);
        }
      }
    }

    return {
      headText: headLines.join('\n'),
      tailText: tailLines.join('\n'),
      toolCounts,
    };
  }

  /**
   * Map confidence level to a numeric rank for sorting.
   *
   * @param confidence - Confidence string.
   * @returns Numeric rank (higher = better).
   */
  private _confidenceRank(confidence: 'high' | 'medium' | 'low'): number {
    switch (confidence) {
      case 'high':   return 3;
      case 'medium': return 2;
      case 'low':    return 1;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSONL path resolution helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the JSONL file path for a Claude session.
 *
 * Claude stores session JSONL files at:
 *   `~/.claude/projects/<project-hash>/<session-id>.jsonl`
 *
 * This function searches all project directories under `~/.claude/projects/`
 * for a file matching the given session ID.
 *
 * @param sessionId   - Claude session identifier.
 * @param jsonlBase   - Base path for Claude JSONL files (default: `~/.claude/projects`).
 * @returns Absolute path to the JSONL file, or null if not found.
 */
export function resolveJsonlPath(
  sessionId: string,
  jsonlBase: string = join(homedir(), '.claude', 'projects'),
): string | null {
  const targetFile = `${sessionId}.jsonl`;

  if (!existsSync(jsonlBase)) {return null;}

  try {
    const projectDirs = readdirSync(jsonlBase).filter((entry) => {
      try {
        return statSync(join(jsonlBase, entry)).isDirectory();
      } catch {
        return false;
      }
    });

    for (const projectDir of projectDirs) {
      const candidate = resolve(join(jsonlBase, projectDir, targetFile));
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Silently return null if the base directory is unreadable
  }

  return null;
}
