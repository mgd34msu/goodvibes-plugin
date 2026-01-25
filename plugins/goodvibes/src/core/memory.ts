import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { getMemoryDir, MEMORY_FILES, SUBDIRS } from "./paths.js";

/**
 * Represents a recorded decision.
 */
export interface Decision {
  /** Unique decision identifier */
  id: string;
  /** ISO timestamp when made */
  timestamp: string;
  /** What was decided */
  decision: string;
  /** Why this decision was made */
  rationale: string;
  /** Context when decision was made */
  context: string;
  /** Outcome of the decision (if known) */
  outcome?: "success" | "failure" | "unknown";
  /** Tags for categorization */
  tags: string[];
  /** Related file paths */
  files?: string[];
  /** Session ID when made */
  session_id?: string;
}

/**
 * Represents a discovered code pattern.
 */
export interface Pattern {
  /** Unique pattern identifier */
  id: string;
  /** ISO timestamp when discovered */
  timestamp: string;
  /** Pattern name */
  name: string;
  /** Pattern description */
  description: string;
  /** Example code snippet */
  example: string;
  /** Anti-pattern to avoid */
  anti_pattern?: string;
  /** When to use this pattern */
  use_when: string;
  /** When NOT to use this pattern */
  avoid_when?: string;
  /** Tags for categorization */
  tags: string[];
  /** Related file paths where pattern was found */
  files?: string[];
  /** How many times this pattern has been applied */
  usage_count: number;
}

/**
 * Represents a recorded failure.
 */
export interface Failure {
  /** Unique failure identifier */
  id: string;
  /** ISO timestamp when occurred */
  timestamp: string;
  /** Error type */
  error_type: string;
  /** Error message */
  error_message: string;
  /** Stack trace if available */
  stack_trace?: string;
  /** Context when failure occurred */
  context: string;
  /** Attempted fixes */
  attempted_fixes: AttemptedFix[];
  /** What ultimately resolved it */
  resolution?: string;
  /** Whether it was resolved */
  resolved: boolean;
  /** Tags for categorization */
  tags: string[];
  /** Related file paths */
  files?: string[];
  /** Session ID when occurred */
  session_id?: string;
}

/**
 * Represents an attempted fix for a failure.
 */
export interface AttemptedFix {
  /** What was tried */
  description: string;
  /** Whether it worked */
  success: boolean;
  /** ISO timestamp when attempted */
  timestamp: string;
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
    decision: string,
    rationale: string,
    context: string,
    options: {
      tags?: string[];
      files?: string[];
      session_id?: string;
    } = {}
  ): Promise<Decision> {
    const record: Decision = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      decision,
      rationale,
      context,
      outcome: "unknown",
      tags: options.tags || [],
      files: options.files,
      session_id: options.session_id,
    };

    this.decisions.set(record.id, record);
    this.pruneDecisions();
    await this.autoSave();

    return record;
  }

  /**
   * Updates a decision's outcome.
   */
  async updateDecisionOutcome(
    id: string,
    outcome: Decision["outcome"]
  ): Promise<boolean> {
    const decision = this.decisions.get(id);
    if (!decision) return false;

    decision.outcome = outcome;
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

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((d) =>
        options.tags!.some((tag) => d.tags.includes(tag))
      );
    }

    // Filter by file
    if (options.file) {
      results = results.filter((d) => d.files?.includes(options.file!));
    }

    // Filter by date range
    if (options.since) {
      results = results.filter(
        (d) => new Date(d.timestamp) >= options.since!
      );
    }
    if (options.until) {
      results = results.filter(
        (d) => new Date(d.timestamp) <= options.until!
      );
    }

    // Text search
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (d) =>
          d.decision.toLowerCase().includes(query) ||
          d.rationale.toLowerCase().includes(query) ||
          d.context.toLowerCase().includes(query)
      );
    }

    // Sort by timestamp (newest first)
    results.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
    example: string,
    use_when: string,
    options: {
      anti_pattern?: string;
      avoid_when?: string;
      tags?: string[];
      files?: string[];
    } = {}
  ): Promise<Pattern> {
    const record: Pattern = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      name,
      description,
      example,
      use_when,
      anti_pattern: options.anti_pattern,
      avoid_when: options.avoid_when,
      tags: options.tags || [],
      files: options.files,
      usage_count: 0,
    };

    this.patterns.set(record.id, record);
    this.prunePatterns();
    await this.autoSave();

    return record;
  }

  /**
   * Increments the usage count for a pattern.
   */
  async incrementPatternUsage(id: string): Promise<boolean> {
    const pattern = this.patterns.get(id);
    if (!pattern) return false;

    pattern.usage_count++;
    await this.autoSave();
    return true;
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

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((p) =>
        options.tags!.some((tag) => p.tags.includes(tag))
      );
    }

    // Filter by file
    if (options.file) {
      results = results.filter((p) => p.files?.includes(options.file!));
    }

    // Text search
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.example.toLowerCase().includes(query)
      );
    }

    // Sort by usage count (most used first)
    results.sort((a, b) => b.usage_count - a.usage_count);

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

    // Keep most recently used patterns
    const sorted = Array.from(this.patterns.values()).sort(
      (a, b) => b.usage_count - a.usage_count
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
    error_type: string,
    error_message: string,
    context: string,
    options: {
      stack_trace?: string;
      tags?: string[];
      files?: string[];
      session_id?: string;
    } = {}
  ): Promise<Failure> {
    const record: Failure = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      error_type,
      error_message,
      context,
      stack_trace: options.stack_trace,
      attempted_fixes: [],
      resolved: false,
      tags: options.tags || [],
      files: options.files,
      session_id: options.session_id,
    };

    this.failures.set(record.id, record);
    this.pruneFailures();
    await this.autoSave();

    return record;
  }

  /**
   * Records an attempted fix for a failure.
   */
  async recordAttemptedFix(
    failure_id: string,
    description: string,
    success: boolean
  ): Promise<boolean> {
    const failure = this.failures.get(failure_id);
    if (!failure) return false;

    failure.attempted_fixes.push({
      description,
      success,
      timestamp: new Date().toISOString(),
    });

    if (success) {
      failure.resolved = true;
      failure.resolution = description;
    }

    await this.autoSave();
    return true;
  }

  /**
   * Marks a failure as resolved.
   */
  async resolveFailure(id: string, resolution: string): Promise<boolean> {
    const failure = this.failures.get(id);
    if (!failure) return false;

    failure.resolved = true;
    failure.resolution = resolution;
    await this.autoSave();
    return true;
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

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((f) =>
        options.tags!.some((tag) => f.tags.includes(tag))
      );
    }

    // Filter by file
    if (options.file) {
      results = results.filter((f) => f.files?.includes(options.file!));
    }

    // Filter by date range
    if (options.since) {
      results = results.filter(
        (f) => new Date(f.timestamp) >= options.since!
      );
    }
    if (options.until) {
      results = results.filter(
        (f) => new Date(f.timestamp) <= options.until!
      );
    }

    // Text search
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (f) =>
          f.error_type.toLowerCase().includes(query) ||
          f.error_message.toLowerCase().includes(query) ||
          f.context.toLowerCase().includes(query)
      );
    }

    // Sort by timestamp (newest first)
    results.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Finds similar failures based on error type and message.
   */
  findSimilarFailures(error_type: string, error_message: string): Failure[] {
    return Array.from(this.failures.values())
      .filter(
        (f) =>
          f.error_type === error_type ||
          f.error_message.includes(error_message.slice(0, 50))
      )
      .slice(0, 10);
  }

  /**
   * Prunes old failures to stay within limit.
   */
  private pruneFailures(): void {
    if (this.failures.size <= this.config.max_failures) return;

    const sorted = Array.from(this.failures.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
    resolved_failures: number;
    successful_decisions: number;
  } {
    const decisions = Array.from(this.decisions.values());
    const failures = Array.from(this.failures.values());

    return {
      decisions: this.decisions.size,
      patterns: this.patterns.size,
      failures: this.failures.size,
      resolved_failures: failures.filter((f) => f.resolved).length,
      successful_decisions: decisions.filter((d) => d.outcome === "success").length,
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
