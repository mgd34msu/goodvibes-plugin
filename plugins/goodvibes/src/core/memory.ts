import * as fs from "fs/promises";
import * as path from "path";
import { getMemoryDir, MEMORY_FILES, SUBDIRS } from "./paths.js";

/**
 * Generates a timestamp-based ID with the given prefix.
 * Format: prefix_YYYYMMDD_HHMMSS
 */
function generateId(prefix: "dec" | "pat" | "fail"): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  // Add milliseconds and random suffix for uniqueness
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `${prefix}_${year}${month}${day}_${hours}${minutes}${seconds}${ms}${random}`;
}

/**
 * Represents a recorded decision.
 */
export interface Decision {
  /** Unique decision identifier - Format: dec_YYYYMMDD_HHMMSS */
  id: string;
  /** ISO timestamp when made */
  date: string;
  /** Category of decision */
  category: "library" | "architecture" | "pattern" | "convention";
  /** Brief description of what was decided */
  what: string;
  /** Rationale for the decision */
  why: string;
  /** Affected files/directories */
  scope: string[];
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Current status */
  status: "active" | "superseded" | "reverted";
}

/**
 * Represents a discovered code pattern.
 */
export interface Pattern {
  /** Unique pattern identifier - Format: pat_YYYYMMDD_HHMMSS */
  id: string;
  /** Pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** When to use this pattern */
  when_to_use: string;
  /** Example file paths where pattern is found */
  example_files: string[];
  /** Keywords for categorization */
  keywords: string[];
}

/**
 * Represents a recorded failure.
 */
export interface Failure {
  /** Unique failure identifier - Format: fail_YYYYMMDD_HHMMSS */
  id: string;
  /** ISO timestamp when occurred */
  date: string;
  /** Error message */
  error: string;
  /** Context when failure occurred */
  context: string;
  /** Root cause analysis */
  root_cause: string;
  /** How it was resolved */
  resolution: string;
  /** How to prevent in future */
  prevention: string;
  /** Keywords for categorization */
  keywords: string[];
}

/**
 * Configuration for the memory system.
 */
export interface MemoryConfig {
  /** Directory to store memory files */
  storage_dir: string;
  /** Maximum decisions to keep */
  max_decisions: number;
  /** Maximum patterns to keep */
  max_patterns: number;
  /** Maximum failures to keep */
  max_failures: number;
  /** Whether to auto-save on changes */
  auto_save: boolean;
}

/**
 * Search options for querying memory.
 */
export interface MemorySearchOptions {
  /** Tags to filter by */
  tags?: string[];
  /** File path to filter by */
  file?: string;
  /** Date range start */
  since?: Date;
  /** Date range end */
  until?: Date;
  /** Maximum results */
  limit?: number;
  /** Text search query */
  query?: string;
}

/** Default configuration */
const DEFAULT_CONFIG: MemoryConfig = {
  storage_dir: path.join(".goodvibes", SUBDIRS.memory),
  max_decisions: 1000,
  max_patterns: 500,
  max_failures: 500,
  auto_save: true,
};

/**
 * Cross-session memory system for decisions, patterns, and failures.
 */
export class Memory {
  private config: MemoryConfig;
  private projectRoot: string;
  private decisions: Map<string, Decision>;
  private patterns: Map<string, Pattern>;
  private failures: Map<string, Failure>;
  private loaded: boolean = false;

  /**
   * Creates a new Memory instance.
   */
  constructor(projectRoot: string, config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.projectRoot = projectRoot;
    this.decisions = new Map();
    this.patterns = new Map();
    this.failures = new Map();
  }

  /**
   * Gets the full storage directory path.
   */
  private getStoragePath(): string {
    return getMemoryDir(this.projectRoot);
  }

  /**
   * Ensures the storage directory exists.
   */
  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.getStoragePath(), { recursive: true });
  }

  /**
   * Loads memory from disk.
   */
  async load(): Promise<void> {
    await this.ensureStorageDir();

    // Load decisions
    try {
      const decisionsPath = path.join(this.getStoragePath(), MEMORY_FILES.decisions);
      const data = await fs.readFile(decisionsPath, "utf8");
      const decisions: Decision[] = JSON.parse(data);
      this.decisions = new Map(decisions.map((d) => [d.id, d]));
    } catch {
      // File doesn't exist or is invalid, start fresh
      this.decisions = new Map();
    }

    // Load patterns
    try {
      const patternsPath = path.join(this.getStoragePath(), MEMORY_FILES.patterns);
      const data = await fs.readFile(patternsPath, "utf8");
      const patterns: Pattern[] = JSON.parse(data);
      this.patterns = new Map(patterns.map((p) => [p.id, p]));
    } catch {
      this.patterns = new Map();
    }

    // Load failures
    try {
      const failuresPath = path.join(this.getStoragePath(), MEMORY_FILES.failures);
      const data = await fs.readFile(failuresPath, "utf8");
      const failures: Failure[] = JSON.parse(data);
      this.failures = new Map(failures.map((f) => [f.id, f]));
    } catch {
      this.failures = new Map();
    }

    this.loaded = true;
  }

  /**
   * Saves memory to disk.
   */
  async save(): Promise<void> {
    await this.ensureStorageDir();

    // Save decisions
    const decisionsPath = path.join(this.getStoragePath(), MEMORY_FILES.decisions);
    await fs.writeFile(
      decisionsPath,
      JSON.stringify(Array.from(this.decisions.values()), null, 2),
      "utf8"
    );

    // Save patterns
    const patternsPath = path.join(this.getStoragePath(), MEMORY_FILES.patterns);
    await fs.writeFile(
      patternsPath,
      JSON.stringify(Array.from(this.patterns.values()), null, 2),
      "utf8"
    );

    // Save failures
    const failuresPath = path.join(this.getStoragePath(), MEMORY_FILES.failures);
    await fs.writeFile(
      failuresPath,
      JSON.stringify(Array.from(this.failures.values()), null, 2),
      "utf8"
    );
  }

  /**
   * Auto-saves if configured.
   */
  private async autoSave(): Promise<void> {
    if (this.config.auto_save) {
      await this.save();
    }
  }

  // ============ Decision Methods ============

  /**
   * Records a new decision.
   */
  async recordDecision(
    what: string,
    why: string,
    category: Decision["category"],
    options: {
      scope?: string[];
      confidence?: Decision["confidence"];
      status?: Decision["status"];
    } = {}
  ): Promise<Decision> {
    const record: Decision = {
      id: generateId("dec"),
      date: new Date().toISOString(),
      category,
      what,
      why,
      scope: options.scope || [],
      confidence: options.confidence || "medium",
      status: options.status || "active",
    };

    this.decisions.set(record.id, record);
    this.pruneDecisions();
    await this.autoSave();

    return record;
  }

  /**
   * Updates a decision's status.
   */
  async updateDecisionStatus(
    id: string,
    status: Decision["status"]
  ): Promise<boolean> {
    const decision = this.decisions.get(id);
    if (!decision) return false;

    decision.status = status;
    await this.autoSave();
    return true;
  }

  /**
   * Gets a decision by ID.
   */
  getDecision(id: string): Decision | undefined {
    return this.decisions.get(id);
  }

  /**
   * Searches decisions.
   */
  searchDecisions(options: MemorySearchOptions = {}): Decision[] {
    let results = Array.from(this.decisions.values());

    // Filter by file (check scope)
    if (options.file) {
      results = results.filter((d) => d.scope.includes(options.file!));
    }

    // Filter by date range
    if (options.since) {
      results = results.filter(
        (d) => new Date(d.date) >= options.since!
      );
    }
    if (options.until) {
      results = results.filter(
        (d) => new Date(d.date) <= options.until!
      );
    }

    // Text search
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (d) =>
          d.what.toLowerCase().includes(query) ||
          d.why.toLowerCase().includes(query) ||
          d.category.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    results.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Prunes old decisions to stay within limit.
   */
  private pruneDecisions(): void {
    if (this.decisions.size <= this.config.max_decisions) return;

    const sorted = Array.from(this.decisions.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const toDelete = sorted.slice(this.config.max_decisions);
    for (const decision of toDelete) {
      this.decisions.delete(decision.id);
    }
  }

  // ============ Pattern Methods ============

  /**
   * Records a new pattern.
   */
  async recordPattern(
    name: string,
    description: string,
    when_to_use: string,
    options: {
      example_files?: string[];
      keywords?: string[];
    } = {}
  ): Promise<Pattern> {
    const record: Pattern = {
      id: generateId("pat"),
      name,
      description,
      when_to_use,
      example_files: options.example_files || [],
      keywords: options.keywords || [],
    };

    this.patterns.set(record.id, record);
    this.prunePatterns();
    await this.autoSave();

    return record;
  }


  /**
   * Gets a pattern by ID.
   */
  getPattern(id: string): Pattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Gets a pattern by name.
   */
  getPatternByName(name: string): Pattern | undefined {
    for (const pattern of this.patterns.values()) {
      if (pattern.name === name) return pattern;
    }
    return undefined;
  }

  /**
   * Searches patterns.
   */
  searchPatterns(options: MemorySearchOptions = {}): Pattern[] {
    let results = Array.from(this.patterns.values());

    // Filter by tags (using keywords)
    if (options.tags && options.tags.length > 0) {
      results = results.filter((p) =>
        options.tags!.some((tag) => p.keywords.includes(tag))
      );
    }

    // Filter by file (check example_files)
    if (options.file) {
      results = results.filter((p) => p.example_files.includes(options.file!));
    }

    // Text search
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.when_to_use.toLowerCase().includes(query)
      );
    }

    // Sort by name (alphabetical)
    results.sort((a, b) => a.name.localeCompare(b.name));

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Prunes old patterns to stay within limit.
   */
  private prunePatterns(): void {
    if (this.patterns.size <= this.config.max_patterns) return;

    // Keep patterns by name (alphabetical order)
    const sorted = Array.from(this.patterns.values()).sort(
      (a, b) => a.name.localeCompare(b.name)
    );

    const toDelete = sorted.slice(this.config.max_patterns);
    for (const pattern of toDelete) {
      this.patterns.delete(pattern.id);
    }
  }

  // ============ Failure Methods ============

  /**
   * Records a new failure.
   */
  async recordFailure(
    error: string,
    context: string,
    root_cause: string,
    resolution: string,
    prevention: string,
    options: {
      keywords?: string[];
    } = {}
  ): Promise<Failure> {
    const record: Failure = {
      id: generateId("fail"),
      date: new Date().toISOString(),
      error,
      context,
      root_cause,
      resolution,
      prevention,
      keywords: options.keywords || [],
    };

    this.failures.set(record.id, record);
    this.pruneFailures();
    await this.autoSave();

    return record;
  }


  /**
   * Gets a failure by ID.
   */
  getFailure(id: string): Failure | undefined {
    return this.failures.get(id);
  }

  /**
   * Searches failures.
   */
  searchFailures(options: MemorySearchOptions = {}): Failure[] {
    let results = Array.from(this.failures.values());

    // Filter by tags (using keywords)
    if (options.tags && options.tags.length > 0) {
      results = results.filter((f) =>
        options.tags!.some((tag) => f.keywords.includes(tag))
      );
    }

    // Filter by date range
    if (options.since) {
      results = results.filter(
        (f) => new Date(f.date) >= options.since!
      );
    }
    if (options.until) {
      results = results.filter(
        (f) => new Date(f.date) <= options.until!
      );
    }

    // Text search
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (f) =>
          f.error.toLowerCase().includes(query) ||
          f.context.toLowerCase().includes(query) ||
          f.root_cause.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    results.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Finds similar failures based on error message.
   */
  findSimilarFailures(error: string): Failure[] {
    const errorSubstring = error.slice(0, 50).toLowerCase();
    return Array.from(this.failures.values())
      .filter((f) => f.error.toLowerCase().includes(errorSubstring))
      .slice(0, 10);
  }

  /**
   * Prunes old failures to stay within limit.
   */
  private pruneFailures(): void {
    if (this.failures.size <= this.config.max_failures) return;

    const sorted = Array.from(this.failures.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const toDelete = sorted.slice(this.config.max_failures);
    for (const failure of toDelete) {
      this.failures.delete(failure.id);
    }
  }

  // ============ Utility Methods ============

  /**
   * Gets statistics about the memory store.
   */
  getStats(): {
    decisions: number;
    patterns: number;
    failures: number;
    active_decisions: number;
    superseded_decisions: number;
  } {
    const decisions = Array.from(this.decisions.values());

    return {
      decisions: this.decisions.size,
      patterns: this.patterns.size,
      failures: this.failures.size,
      active_decisions: decisions.filter((d) => d.status === "active").length,
      superseded_decisions: decisions.filter((d) => d.status === "superseded").length,
    };
  }

  /**
   * Clears all memory.
   */
  async clear(): Promise<void> {
    this.decisions.clear();
    this.patterns.clear();
    this.failures.clear();
    await this.save();
  }

  /**
   * Gets the configuration.
   */
  getConfig(): MemoryConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<MemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Checks if memory has been loaded from disk.
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}
