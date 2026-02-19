/**
 * DossierGenerator — Agent context package generator for precision-engine v2.
 *
 * Builds a structured JSON context package ("dossier") that agents receive
 * alongside orchestrator instructions. The dossier is a supplement to — not
 * a replacement for — the orchestrator's natural language task description.
 *
 * Phase 5H implementation.
 */

import { readFile } from 'fs/promises';
import * as path from 'path';
import type { ProjectIndex } from './project-index.js';

// ───────────────────────────────────────────────────────────────────────────
// Sub-interfaces
// ───────────────────────────────────────────────────────────────────────────

/**
 * What the agent is expected to do.
 */
export interface DossierTask {
  /** Natural language description of the task. */
  description: string;
  /** Measurable criteria for success. */
  acceptance_criteria: string[];
  /** File or directory paths in scope for this task. */
  scope: string[];
}

/**
 * How the agent must work — tool constraints, quality bar, budget limits.
 */
export interface DossierConstraints {
  /** Tool usage mandate (e.g. "precision_engine only, DPB pattern mandatory"). */
  tools: string;
  /** Quality bar description. */
  quality: string;
  /** Token and cost budget limits (null = unlimited). */
  budget: {
    max_tokens: number | null;
    max_cost: number | null;
  };
}

/**
 * A decision entry from `.goodvibes/memory/decisions.json`.
 */
export interface DossierDecision {
  id: string;
  what: string;
  why: string;
}

/**
 * A pattern entry from `.goodvibes/memory/patterns.json`.
 */
export interface DossierPattern {
  name: string;
  description: string;
}

/**
 * A failure entry from `.goodvibes/memory/failures.json`.
 */
export interface DossierFailure {
  error: string;
  resolution: string;
}

/**
 * Memory and prior results injected into the dossier.
 */
export interface DossierContext {
  /** Relevant architectural decisions. */
  decisions: DossierDecision[];
  /** Relevant coding patterns. */
  patterns: DossierPattern[];
  /** Relevant past failures to avoid repeating. */
  failures: DossierFailure[];
  /** Output from dependency agents, passed through verbatim. */
  prior_results: unknown[];
}

/**
 * A key file entry in the project summary.
 */
export interface DossierKeyFile {
  path: string;
  tokens: number;
  role: string;
}

/**
 * Project-level context derived from the ProjectIndex.
 */
export interface DossierProject {
  /** Technology stack identifiers. */
  stack: string[];
  /** Human-readable summary of the project index. */
  index_summary: string;
  /** Key files sorted by token count descending, max 10. */
  key_files: DossierKeyFile[];
}

/**
 * Optional output format specification.
 * When null, the agent responds naturally and the orchestrator interprets.
 */
export interface DossierOutputFormat {
  /** Format type (e.g. "json", "markdown", "structured"). */
  type: string;
  /** JSON schema or description of the expected output shape. */
  schema: unknown;
}

/**
 * The complete agent dossier — structured JSON supplement to orchestrator instructions.
 */
export interface AgentDossier {
  task: DossierTask;
  constraints: DossierConstraints;
  context: DossierContext;
  project: DossierProject;
  reminders: string[];
  output_format: DossierOutputFormat | null;
}

// ───────────────────────────────────────────────────────────────────────────
// DossierOptions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Input options for DossierGenerator.generate().
 */
export interface DossierOptions {
  /** Task definition — required. */
  task: {
    description: string;
    acceptance_criteria?: string[];
    scope?: string[];
  };
  /** Override default constraints. */
  constraints?: Partial<DossierConstraints>;
  /** Output from dependency agents. */
  prior_results?: unknown[];
  /** Exact output format spec, or null for natural response. */
  output_format?: DossierOutputFormat | null;
  /** Additional project-specific reminders. */
  extra_reminders?: string[];
  /** Whether to query .goodvibes/memory/ files (default: true). */
  include_memory?: boolean;
  /** Whether to include project index summary (default: true). */
  include_project?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Default values
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_CONSTRAINTS: DossierConstraints = {
  tools: 'precision_engine only, DPB pattern mandatory',
  quality: 'Enterprise-grade, no mocks, no placeholders',
  budget: {
    max_tokens: null,
    max_cost: null,
  },
};

/**
 * Standard SUBAGENT-PROTOCOL reminders included in every dossier.
 */
const BASE_REMINDERS = [
  'Use precision_engine tools, not native (Read, Write, Edit, Grep, Glob, WebFetch)',
  'Follow strict DPB loops: D (single discover call) → P (plan, zero calls) → B (single batched call)',
  'precision_exec is for build/test/deploy ONLY (npm run, npx, git) — NEVER for file search/read',
  'Check .goodvibes/memory/ for patterns, decisions, and failures before implementing',
  'Always use .js extensions for ESM imports',
  'NEVER enable sandbox mode — only explicit user authorization can activate it',
  'Sandbox mode is OFF by default — precision tools can access any path',
  'Batch independent operations together — target 3 tool calls per DPB cycle',
] as const;

// ───────────────────────────────────────────────────────────────────────────
// Memory file shapes (for JSON parsing)
// ───────────────────────────────────────────────────────────────────────────

interface DecisionsJson {
  decisions?: Array<{
    id?: string;
    what?: string;
    why?: string;
    scope?: string[];
    [key: string]: unknown;
  }>;
}

interface PatternsJson {
  patterns?: Array<{
    id?: string;
    name?: string;
    description?: string;
    keywords?: string[];
    applies_to?: string[];
    [key: string]: unknown;
  }>;
}

interface FailuresJson {
  failures?: Array<{
    error?: string;
    resolution?: string;
    keywords?: string[];
    scope?: string[];
    date?: string;
    [key: string]: unknown;
  }>;
}

// ───────────────────────────────────────────────────────────────────────────
// DossierGenerator
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generates structured agent dossiers by combining task options with
 * automatically-injected memory context and project index summaries.
 *
 * Usage:
 *   const generator = new DossierGenerator(projectIndex, memoryDir);
 *   const dossier = await generator.generate(options);
 *   const prompt = generator.formatForPrompt(dossier);
 */
export class DossierGenerator {
  private readonly index: ProjectIndex;
  private readonly memoryDir: string;

  /**
   * @param index - ProjectIndex instance for project summary generation.
   * @param memoryDir - Path to .goodvibes/memory/ directory. Defaults to
   *   `.goodvibes/memory` relative to process.cwd().
   */
  constructor(index: ProjectIndex, memoryDir?: string) {
    this.index = index;
    this.memoryDir = path.resolve(memoryDir ?? path.join(process.cwd(), '.goodvibes', 'memory'));
  }

  /**
   * Generate a complete agent dossier from the provided options.
   *
   * Automatically queries memory files and the project index unless
   * `include_memory` or `include_project` are explicitly set to false.
   */
  async generate(options: DossierOptions): Promise<AgentDossier> {
    const scope = options.task.scope ?? [];
    const description = options.task.description;

    // Build task
    const task: DossierTask = {
      description,
      acceptance_criteria: options.task.acceptance_criteria ?? [],
      scope,
    };

    // Merge constraints with defaults
    const constraints: DossierConstraints = {
      ...DEFAULT_CONSTRAINTS,
      ...options.constraints,
      budget: {
        ...DEFAULT_CONSTRAINTS.budget,
        ...options.constraints?.budget,
      },
    };

    // Inject memory context (graceful degradation if files missing)
    const includeMemory = options.include_memory !== false;
    const context = includeMemory
      ? await this.injectMemory(scope, description)
      : emptyContext();

    // Apply prior results
    context.prior_results = options.prior_results ?? [];

    // Build project summary
    const includeProject = options.include_project !== false;
    const project = includeProject
      ? this.getProjectSummary(scope)
      : emptyProject();

    // Combine reminders
    const reminders = [
      ...this.getDefaultReminders(),
      ...(options.extra_reminders ?? []),
    ];

    return {
      task,
      constraints,
      context,
      project,
      reminders,
      output_format: options.output_format ?? null,
    };
  }

  /**
   * Query `.goodvibes/memory/` files for relevant decisions, patterns, and failures.
   *
   * Filtering rules:
   * - Decisions: scope-overlap filter, most recent 5
   * - Patterns: keyword match against task description, most relevant 3
   * - Failures: keyword match against scope + description, most recent 3
   *
   * All reads are gracefully degraded — missing or malformed files produce
   * empty arrays rather than errors.
   */
  async injectMemory(scope: string[], description: string): Promise<DossierContext> {
    const [decisionsRaw, patternsRaw, failuresRaw] = await Promise.all([
      this.readJsonFile<DecisionsJson>(path.join(this.memoryDir, 'decisions.json')),
      this.readJsonFile<PatternsJson>(path.join(this.memoryDir, 'patterns.json')),
      this.readJsonFile<FailuresJson>(path.join(this.memoryDir, 'failures.json')),
    ]);

    const descWords = tokenizeText(description);
    const scopeWords = scope.flatMap(tokenizeText);
    const allQueryWords = new Set([...descWords, ...scopeWords]);

    // Decisions — filter by scope overlap, take most recent 5
    const decisions = (decisionsRaw?.decisions ?? [])
      .filter((d) => {
        if (!d.scope || d.scope.length === 0) return true; // no scope filter = always include
        return d.scope.some((s) => scope.some((taskScope) => scopesOverlap(s, taskScope)));
      })
      .slice(-5)  // most recent 5 (assume array is chronological)
      .map((d): DossierDecision => ({
        id: d.id ?? '',
        what: d.what ?? '',
        why: d.why ?? '',
      }));

    // Patterns — filter by keyword match against task description, take top 3
    const patterns = (patternsRaw?.patterns ?? [])
      .map((p) => {
        const keywords = [...(p.keywords ?? []), ...(p.applies_to ?? [])];
        const score = keywords.filter((k) => allQueryWords.has(k.toLowerCase())).length;
        return { p, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ p }): DossierPattern => ({
        name: p.name ?? p.id ?? '',
        description: p.description ?? '',
      }));

    // Failures — filter by keyword match against scope + description, take most recent 3
    const failures = (failuresRaw?.failures ?? [])
      .filter((f) => {
        const fWords = [
          ...(f.keywords ?? []).map((k: string) => k.toLowerCase()),
          ...(f.scope ?? []).flatMap(tokenizeText),
        ];
        if (fWords.length === 0) return true; // no keywords = always include
        return fWords.some((w) => allQueryWords.has(w));
      })
      .slice(-3)  // most recent 3
      .map((f): DossierFailure => ({
        error: f.error ?? '',
        resolution: f.resolution ?? '',
      }));

    return {
      decisions,
      patterns,
      failures,
      prior_results: [],
    };
  }

  /**
   * Build a project summary from the ProjectIndex.
   *
   * Reads:
   * - Type counts for the index_summary string
   * - All files (or scope-filtered files) for key_files list
   *
   * Gracefully degrades if the index is not loaded (returns empty summary).
   */
  getProjectSummary(scope: string[]): DossierProject {
    const stack = this.detectStack();
    const typeCounts = this.index.getTypeCounts();
    const allFiles = this.index.getFiles();

    if (allFiles.length === 0) {
      return emptyProject(stack);
    }

    // Build index_summary: "X TS files, Y components, ~Z tokens total"
    const tsCount = (typeCounts['ts'] ?? 0) + (typeCounts['tsx'] ?? 0);
    const componentCount = allFiles.filter((f) =>
      categorizeFileRole(f.p) === 'component',
    ).length;
    const totalTokens = allFiles.reduce((sum, f) => sum + (f.tokens ?? 0), 0);
    const summaryParts: string[] = [];
    if (tsCount > 0) summaryParts.push(`${tsCount} TS files`);
    if (componentCount > 0) summaryParts.push(`${componentCount} components`);
    summaryParts.push(`~${formatTokenCount(totalTokens)} tokens total`);
    const index_summary = summaryParts.join(', ');

    // Key files — scope-filtered if scope provided, else all files
    const candidateFiles =
      scope.length > 0
        ? scope.flatMap((s) => this.index.getFilesByPrefix(s))
        : allFiles;

    // Deduplicate (scope prefixes may overlap)
    const seen = new Set<string>();
    const dedupedFiles = candidateFiles.filter((f) => {
      if (seen.has(f.p)) return false;
      seen.add(f.p);
      return true;
    });

    const key_files = dedupedFiles
      .sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0))
      .slice(0, 10)
      .map((f): DossierKeyFile => ({
        path: f.p,
        tokens: f.tokens ?? 0,
        role: categorizeFileRole(f.p),
      }));

    return { stack, index_summary, key_files };
  }

  /**
   * Returns the standard SUBAGENT-PROTOCOL reminders.
   * These are included in every dossier.
   */
  getDefaultReminders(): string[] {
    // Defensive copy — prevents callers from mutating the shared constant
    return [...BASE_REMINDERS];
  }

  /**
   * Format a dossier for inclusion in an agent prompt.
   *
   * Returns:
   *   --- AGENT DOSSIER ---
   *   {minified JSON}
   */
  formatForPrompt(dossier: AgentDossier): string {
    // Separator line, minified JSON on second line, trailing newline
    return `--- AGENT DOSSIER ---\n${JSON.stringify({ dossier })}\n`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Read and parse a JSON file, returning null on any error.
   * Ensures graceful degradation when memory files are missing or malformed.
   */
  private async readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Detect the project stack from type counts in the project index.
   * Returns an array of stack identifiers (e.g. ["typescript", "react"]).
   */
  private detectStack(): string[] {
    const typeCounts = this.index.getTypeCounts();
    const stack: string[] = [];
    if (typeCounts['ts'] || typeCounts['tsx']) stack.push('typescript');
    if (typeCounts['tsx']) stack.push('react');
    if (typeCounts['py']) stack.push('python');
    if (typeCounts['go']) stack.push('go');
    if (typeCounts['rs']) stack.push('rust');
    return stack;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Module-level helpers
// ───────────────────────────────────────────────────────────────────────────

/** Returns an empty DossierContext with no memory entries. */
function emptyContext(): DossierContext {
  return { decisions: [], patterns: [], failures: [], prior_results: [] };
}

/** Returns an empty DossierProject (graceful degradation). */
function emptyProject(stack: string[] = []): DossierProject {
  return { stack, index_summary: 'Project index not available', key_files: [] };
}

/**
 * Tokenize text into lowercase words for keyword matching.
 * Splits on non-alphanumeric characters, filters short tokens.
 */
function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Check whether two scope strings overlap.
 * A scope overlap exists when one is a path prefix of the other.
 */
function scopesOverlap(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\/+$/, '');
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.startsWith(nb + path.sep) || nb.startsWith(na + path.sep);
}

/**
 * Assign a human-readable role to a file based on its path.
 */
function categorizeFileRole(filePath: string): string {
  const lower = filePath.toLowerCase();
  // Specific patterns first — before generic .tsx catch-all
  if (lower.includes('/api/') || lower.includes('route.')) return 'api';
  if (lower.includes('middleware')) return 'middleware';
  if (lower.includes('layout.')) return 'layout';
  if (lower.includes('page.')) return 'page';
  if (lower.includes('component') || lower.includes('/components/')) return 'component';
  if (lower.endsWith('.tsx')) return 'component'; // Only AFTER specific checks
  if (lower.includes('test') || lower.includes('spec')) return 'test';
  if (lower.includes('config') || lower.includes('.config.')) return 'config';
  if (lower.includes('util') || lower.includes('helper') || lower.includes('lib/')) return 'utility';
  if (lower.includes('type') || lower.includes('interface')) return 'types';
  if (lower.includes('hook') || lower.startsWith('use')) return 'hook';
  if (lower.includes('handler')) return 'handler';
  if (lower.includes('schema')) return 'types';
  if (lower.includes('state') || lower.includes('store')) return 'state';
  if (lower.includes('auth')) return 'auth';
  if (lower.includes('db') || lower.includes('database') || lower.includes('prisma')) return 'database';
  return 'source';
}

/**
 * Format a large token count with a human-readable suffix.
 */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

