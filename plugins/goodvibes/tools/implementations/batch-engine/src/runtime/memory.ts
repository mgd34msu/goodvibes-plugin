/**
 * Memory Manager implementation for Batch Engine
 * @see SPEC-v2 Sections 8.1-8.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  Memory,
  Decision,
  Pattern,
  Failure,
  Preference,
  DecisionCategory,
} from '../interfaces/memory.js';
import type {
  MemoryManager,
  MemoryAPI,
  DecisionFilter,
  PatternFilter,
  FailureFilter,
  MemoryEntry,
  MemoryEntryKind,
} from '../interfaces/memory-api.js';
import type { BatchContext } from '../interfaces/context.js';
import {
  MEMORY_PATHS,
  type MemoryPath,
  type MemoryIndex,
  type MemoryIndexEntry,
  type PreferencesFile,
  EMPTY_INDEX,
  EMPTY_PREFERENCES,
} from '../interfaces/memory-files.js';

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Extract keywords from text for search indexing
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter((word, i, arr) => arr.indexOf(word) === i); // dedupe
}

/**
 * Format a decision as markdown
 */
function formatDecision(decision: Decision): string {
  const lines: string[] = [
    `## Decision: ${decision.what}`,
    `- **ID**: ${decision.id}`,
    `- **Date**: ${decision.timestamp}`,
    `- **Category**: ${decision.category}`,
    `- **Confidence**: ${decision.confidence}`,
    `- **Status**: ${decision.status}`,
    '',
    '### What',
    decision.what,
    '',
    '### Why',
    decision.why,
  ];

  if (decision.files && decision.files.length > 0) {
    lines.push('', '### Scope', `- Files: ${decision.files.join(', ')}`);
  }
  if (decision.symbols && decision.symbols.length > 0) {
    lines.push(`- Symbols: ${decision.symbols.join(', ')}`);
  }
  if (decision.superseded_by) {
    lines.push('', `### Superseded By`, decision.superseded_by);
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

/**
 * Format a pattern as markdown
 */
function formatPattern(pattern: Pattern): string {
  const lines: string[] = [
    `## Pattern: ${pattern.name}`,
    `- **ID**: ${pattern.id}`,
    `- **Date**: ${pattern.timestamp}`,
    `- **Usage Count**: ${pattern.usage_count}`,
    '',
    '### Description',
    pattern.description,
    '',
    '### When to Use',
    pattern.when_to_use,
  ];

  if (pattern.when_not_to_use) {
    lines.push('', '### When NOT to Use', pattern.when_not_to_use);
  }

  if (pattern.examples.length > 0) {
    lines.push('', '### Examples');
    for (const example of pattern.examples) {
      lines.push(`- ${example.file}:${example.lines[0]}-${example.lines[1]}`);
      if (example.code) {
        lines.push('```', example.code, '```');
      }
    }
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

/**
 * Format a failure as markdown
 */
function formatFailure(failure: Failure): string {
  const lines: string[] = [
    `## Failure: ${failure.error_type}`,
    `- **ID**: ${failure.id}`,
    `- **Date**: ${failure.timestamp}`,
    `- **Resolved**: ${failure.resolved ? 'Yes' : 'No'}`,
    '',
    '### Error Message',
    failure.error_message,
  ];

  if (failure.stack_trace) {
    lines.push('', '### Stack Trace', '```', failure.stack_trace, '```');
  }
  if (failure.operation) {
    lines.push('', '### Operation', failure.operation);
  }
  if (failure.files && failure.files.length > 0) {
    lines.push('', '### Files', failure.files.map(f => `- ${f}`).join('\n'));
  }
  if (failure.root_cause) {
    lines.push('', '### Root Cause', failure.root_cause);
  }
  if (failure.resolution) {
    lines.push('', '### Resolution', failure.resolution);
  }
  if (failure.prevention) {
    lines.push('', '### Prevention', failure.prevention);
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

/**
 * Parse decisions from markdown content
 */
function parseDecisions(content: string): Decision[] {
  const decisions: Decision[] = [];
  const sections = content.split(/^## Decision:/gm).slice(1);

  for (const section of sections) {
    try {
      const idMatch = section.match(/\*\*ID\*\*:\s*(\S+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
      const categoryMatch = section.match(/\*\*Category\*\*:\s*(\S+)/);
      const confidenceMatch = section.match(/\*\*Confidence\*\*:\s*(\S+)/);
      const statusMatch = section.match(/\*\*Status\*\*:\s*(\S+)/);
      const whatMatch = section.match(/^(.+?)\n/);
      const whyMatch = section.match(/### Why\n([\s\S]*?)(?=\n###|$)/);

      if (idMatch?.[1] && whatMatch?.[1]) {
        decisions.push({
          id: idMatch[1],
          timestamp: dateMatch?.[1] || new Date().toISOString(),
          what: whatMatch[1].trim(),
          why: whyMatch?.[1]?.trim() || '',
          category: (categoryMatch?.[1] || 'architecture') as DecisionCategory,
          confidence: (confidenceMatch?.[1] || 'medium') as 'high' | 'medium' | 'low',
          status: (statusMatch?.[1] || 'active') as 'active' | 'superseded' | 'reverted',
        });
      }
    } catch {
      // Skip malformed entries
    }
  }

  return decisions;
}

/**
 * Parse patterns from markdown content
 */
function parsePatterns(content: string): Pattern[] {
  const patterns: Pattern[] = [];
  const sections = content.split(/^## Pattern:/gm).slice(1);

  for (const section of sections) {
    try {
      const idMatch = section.match(/\*\*ID\*\*:\s*(\S+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
      const usageMatch = section.match(/\*\*Usage Count\*\*:\s*(\d+)/);
      const nameMatch = section.match(/^(.+?)\n/);
      const descMatch = section.match(/### Description\n([\s\S]*?)(?=\n###|$)/);
      const whenMatch = section.match(/### When to Use\n([\s\S]*?)(?=\n###|$)/);

      if (idMatch?.[1] && nameMatch?.[1]) {
        patterns.push({
          id: idMatch[1],
          timestamp: dateMatch?.[1] || new Date().toISOString(),
          name: nameMatch[1].trim(),
          description: descMatch?.[1]?.trim() || '',
          examples: [],
          when_to_use: whenMatch?.[1]?.trim() || '',
          usage_count: parseInt(usageMatch?.[1] || '0', 10),
        });
      }
    } catch {
      // Skip malformed entries
    }
  }

  return patterns;
}

/**
 * Parse failures from markdown content
 */
function parseFailures(content: string): Failure[] {
  const failures: Failure[] = [];
  const sections = content.split(/^## Failure:/gm).slice(1);

  for (const section of sections) {
    try {
      const idMatch = section.match(/\*\*ID\*\*:\s*(\S+)/);
      const dateMatch = section.match(/\*\*Date\*\*:\s*(\S+)/);
      const resolvedMatch = section.match(/\*\*Resolved\*\*:\s*(\S+)/);
      const typeMatch = section.match(/^(.+?)\n/);
      const messageMatch = section.match(/### Error Message\n([\s\S]*?)(?=\n###|$)/);
      const resolutionMatch = section.match(/### Resolution\n([\s\S]*?)(?=\n###|$)/);

      if (idMatch?.[1] && typeMatch?.[1]) {
        failures.push({
          id: idMatch[1],
          timestamp: dateMatch?.[1] || new Date().toISOString(),
          error_type: typeMatch[1].trim(),
          error_message: messageMatch?.[1]?.trim() || '',
          resolved: resolvedMatch?.[1]?.toLowerCase() === 'yes',
          resolution: resolutionMatch?.[1]?.trim(),
        });
      }
    } catch {
      // Skip malformed entries
    }
  }

  return failures;
}

/**
 * MemoryManager implementation
 */
export class MemoryManagerImpl implements MemoryManager {
  private memory: Memory;
  private projectRoot: string;
  private changeCallbacks: Set<(memory: Memory) => void>;
  private index: MemoryIndex;

  constructor(projectRoot: string = process.cwd()) {
    this.memory = {
      decisions: [],
      patterns: [],
      failures: [],
      preferences: [],
    };
    this.projectRoot = projectRoot;
    this.changeCallbacks = new Set();
    this.index = { ...EMPTY_INDEX };
  }

  // =========================================================================
  // MemoryManager Extended Methods
  // =========================================================================

  getMemory(): Memory {
    return this.memory;
  }

  reset(): void {
    this.memory = {
      decisions: [],
      patterns: [],
      failures: [],
      preferences: [],
    };
    this.index = { ...EMPTY_INDEX, last_updated: new Date().toISOString() };
    this.notifyChange();
  }

  onMemoryChange(callback: (memory: Memory) => void): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  private notifyChange(): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(this.memory);
      } catch {
        // Ignore callback errors
      }
    }
  }

  // =========================================================================
  // Decision Methods
  // =========================================================================

  recordDecision(decision: Omit<Decision, 'id' | 'timestamp'>): Decision {
    const newDecision: Decision = {
      ...decision,
      id: generateId('dec'),
      timestamp: new Date().toISOString(),
    };

    this.memory.decisions.push(newDecision);
    this.updateIndex('decisions', newDecision);
    this.notifyChange();
    return newDecision;
  }

  getDecisions(filter?: DecisionFilter): Decision[] {
    let results = [...this.memory.decisions];

    if (filter) {
      if (filter.category) {
        const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
        results = results.filter(d => categories.includes(d.category));
      }
      if (filter.status) {
        results = results.filter(d => d.status === filter.status);
      }
      if (filter.confidence) {
        results = results.filter(d => d.confidence === filter.confidence);
      }
      if (filter.files && filter.files.length > 0) {
        results = results.filter(d => d.files?.some(f => filter.files!.includes(f)));
      }
      if (filter.symbols && filter.symbols.length > 0) {
        results = results.filter(d => d.symbols?.some(s => filter.symbols!.includes(s)));
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since);
        results = results.filter(d => new Date(d.timestamp) >= sinceDate);
      }
      if (filter.batch_id) {
        results = results.filter(d => d.batch_id === filter.batch_id);
      }
    }

    return results;
  }

  supersedDecision(id: string, new_decision_id: string): void {
    const decision = this.memory.decisions.find(d => d.id === id);
    if (decision) {
      decision.status = 'superseded';
      decision.superseded_by = new_decision_id;
      this.notifyChange();
    }
  }

  // =========================================================================
  // Pattern Methods
  // =========================================================================

  recordPattern(pattern: Omit<Pattern, 'id' | 'timestamp' | 'usage_count'>): Pattern {
    const newPattern: Pattern = {
      ...pattern,
      id: generateId('pat'),
      timestamp: new Date().toISOString(),
      usage_count: 0,
    };

    this.memory.patterns.push(newPattern);
    this.updateIndex('patterns', newPattern);
    this.notifyChange();
    return newPattern;
  }

  getPatterns(filter?: PatternFilter): Pattern[] {
    let results = [...this.memory.patterns];

    if (filter) {
      if (filter.name) {
        const nameLower = filter.name.toLowerCase();
        results = results.filter(p => p.name.toLowerCase().includes(nameLower));
      }
      if (filter.min_usage !== undefined) {
        results = results.filter(p => p.usage_count >= filter.min_usage!);
      }
      if (filter.discovered_in) {
        results = results.filter(p => p.discovered_in === filter.discovered_in);
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since);
        results = results.filter(p => new Date(p.timestamp) >= sinceDate);
      }
    }

    return results;
  }

  incrementPatternUsage(id: string): void {
    const pattern = this.memory.patterns.find(p => p.id === id);
    if (pattern) {
      pattern.usage_count++;
      this.notifyChange();
    }
  }

  // =========================================================================
  // Failure Methods
  // =========================================================================

  recordFailure(failure: Omit<Failure, 'id' | 'timestamp'>): Failure {
    const newFailure: Failure = {
      ...failure,
      id: generateId('fail'),
      timestamp: new Date().toISOString(),
    };

    this.memory.failures.push(newFailure);
    this.updateIndex('failures', newFailure);
    this.notifyChange();
    return newFailure;
  }

  getFailures(filter?: FailureFilter): Failure[] {
    let results = [...this.memory.failures];

    if (filter) {
      if (filter.error_type) {
        results = results.filter(f => f.error_type === filter.error_type);
      }
      if (filter.resolved !== undefined) {
        results = results.filter(f => f.resolved === filter.resolved);
      }
      if (filter.files && filter.files.length > 0) {
        results = results.filter(f => f.files?.some(file => filter.files!.includes(file)));
      }
      if (filter.since) {
        const sinceDate = new Date(filter.since);
        results = results.filter(f => new Date(f.timestamp) >= sinceDate);
      }
      if (filter.operation) {
        results = results.filter(f => f.operation === filter.operation);
      }
    }

    return results;
  }

  resolveFailure(id: string, resolution: string): void {
    const failure = this.memory.failures.find(f => f.id === id);
    if (failure) {
      failure.resolved = true;
      failure.resolution = resolution;
      this.notifyChange();
    }
  }

  // =========================================================================
  // Preference Methods
  // =========================================================================

  setPreference(key: string, value: unknown, scope: 'global' | 'project' | 'session' = 'project'): void {
    const existing = this.memory.preferences.findIndex(p => p.key === key && p.scope === scope);
    const preference: Preference = {
      id: generateId('pref'),
      timestamp: new Date().toISOString(),
      key,
      value,
      source: 'user',
      scope,
    };

    if (existing >= 0) {
      this.memory.preferences[existing] = preference;
    } else {
      this.memory.preferences.push(preference);
    }
    this.notifyChange();
  }

  getPreference(key: string): unknown {
    // Priority: session > project > global
    const session = this.memory.preferences.find(p => p.key === key && p.scope === 'session');
    if (session) return session.value;

    const project = this.memory.preferences.find(p => p.key === key && p.scope === 'project');
    if (project) return project.value;

    const global = this.memory.preferences.find(p => p.key === key && p.scope === 'global');
    return global?.value;
  }

  // =========================================================================
  // Search Methods
  // =========================================================================

  search(keywords: string[], kinds?: MemoryEntryKind[]): MemoryEntry[] {
    const results: MemoryEntry[] = [];
    const keywordsLower = keywords.map(k => k.toLowerCase());

    const shouldInclude = (kind: MemoryEntryKind) => !kinds || kinds.includes(kind);

    if (shouldInclude('decision')) {
      for (const decision of this.memory.decisions) {
        const text = `${decision.what} ${decision.why}`.toLowerCase();
        if (keywordsLower.some(kw => text.includes(kw))) {
          results.push({ kind: 'decision', entry: decision });
        }
      }
    }

    if (shouldInclude('pattern')) {
      for (const pattern of this.memory.patterns) {
        const text = `${pattern.name} ${pattern.description}`.toLowerCase();
        if (keywordsLower.some(kw => text.includes(kw))) {
          results.push({ kind: 'pattern', entry: pattern });
        }
      }
    }

    if (shouldInclude('failure')) {
      for (const failure of this.memory.failures) {
        const text = `${failure.error_type} ${failure.error_message}`.toLowerCase();
        if (keywordsLower.some(kw => text.includes(kw))) {
          results.push({ kind: 'failure', entry: failure });
        }
      }
    }

    if (shouldInclude('preference')) {
      for (const preference of this.memory.preferences) {
        if (keywordsLower.some(kw => preference.key.toLowerCase().includes(kw))) {
          results.push({ kind: 'preference', entry: preference });
        }
      }
    }

    return results;
  }

  getRelevant(context: BatchContext): Memory {
    const files = context.affected_files || [];
    const symbols = context.affected_symbols || [];

    return {
      decisions: this.memory.decisions.filter(d =>
        d.status === 'active' &&
        (d.files?.some(f => files.includes(f)) || d.symbols?.some(s => symbols.includes(s)))
      ),
      patterns: this.memory.patterns.filter(p =>
        p.examples.some(e => files.includes(e.file))
      ),
      failures: this.memory.failures.filter(f =>
        !f.resolved && f.files?.some(file => files.includes(file))
      ),
      preferences: this.memory.preferences.filter(p =>
        p.scope === 'session' || p.scope === 'project'
      ),
    };
  }

  // =========================================================================
  // Maintenance Methods
  // =========================================================================

  compact(): void {
    // Remove superseded/reverted decisions older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    this.memory.decisions = this.memory.decisions.filter(d =>
      d.status === 'active' || new Date(d.timestamp) > thirtyDaysAgo
    );

    // Remove resolved failures older than 30 days
    this.memory.failures = this.memory.failures.filter(f =>
      !f.resolved || new Date(f.timestamp) > thirtyDaysAgo
    );

    // Keep only session preferences (clear session on compact)
    this.memory.preferences = this.memory.preferences.filter(p => p.scope !== 'session');

    this.rebuildIndex();
    this.notifyChange();
  }

  export(): string {
    return JSON.stringify(this.memory, null, 2);
  }

  import(data: string): void {
    try {
      const imported = JSON.parse(data) as Memory;

      // Merge imported data with existing
      this.memory.decisions.push(...(imported.decisions || []));
      this.memory.patterns.push(...(imported.patterns || []));
      this.memory.failures.push(...(imported.failures || []));
      this.memory.preferences.push(...(imported.preferences || []));

      this.rebuildIndex();
      this.notifyChange();
    } catch {
      throw new Error('Failed to import memory data: Invalid JSON');
    }
  }

  // =========================================================================
  // Index Management
  // =========================================================================

  private updateIndex(kind: 'decisions' | 'patterns' | 'failures', entry: Decision | Pattern | Failure): void {
    const indexEntry: MemoryIndexEntry = {
      id: entry.id,
      keywords: this.extractIndexKeywords(kind, entry),
      timestamp: entry.timestamp,
      category: 'category' in entry ? entry.category : undefined,
    };

    this.index[kind].push(indexEntry);
    this.index.last_updated = new Date().toISOString();
  }

  private extractIndexKeywords(kind: string, entry: Decision | Pattern | Failure): string[] {
    switch (kind) {
      case 'decisions':
        return extractKeywords(`${(entry as Decision).what} ${(entry as Decision).why}`);
      case 'patterns':
        return extractKeywords(`${(entry as Pattern).name} ${(entry as Pattern).description}`);
      case 'failures':
        return extractKeywords(`${(entry as Failure).error_type} ${(entry as Failure).error_message}`);
      default:
        return [];
    }
  }

  private rebuildIndex(): void {
    this.index = {
      decisions: this.memory.decisions.map(d => ({
        id: d.id,
        keywords: this.extractIndexKeywords('decisions', d),
        timestamp: d.timestamp,
        category: d.category,
      })),
      patterns: this.memory.patterns.map(p => ({
        id: p.id,
        keywords: this.extractIndexKeywords('patterns', p),
        timestamp: p.timestamp,
      })),
      failures: this.memory.failures.map(f => ({
        id: f.id,
        keywords: this.extractIndexKeywords('failures', f),
        timestamp: f.timestamp,
      })),
      last_updated: new Date().toISOString(),
    };
  }

  // =========================================================================
  // Persistence Methods
  // =========================================================================

  async persist(): Promise<void> {
    await this.ensureMemoryDir();

    // Write decisions markdown
    const decisionsContent = '# Decisions\n\n' +
      this.memory.decisions.map(formatDecision).join('\n');
    await this.writeMemoryFile(MEMORY_PATHS.DECISIONS_FILE, decisionsContent);

    // Write patterns markdown
    const patternsContent = '# Patterns\n\n' +
      this.memory.patterns.map(formatPattern).join('\n');
    await this.writeMemoryFile(MEMORY_PATHS.PATTERNS_FILE, patternsContent);

    // Write failures markdown
    const failuresContent = '# Failures\n\n' +
      this.memory.failures.map(formatFailure).join('\n');
    await this.writeMemoryFile(MEMORY_PATHS.FAILURES_FILE, failuresContent);

    // Write preferences JSON
    const preferencesFile: PreferencesFile = {
      preferences: this.memory.preferences,
      last_updated: new Date().toISOString(),
    };
    await this.writeMemoryFile(MEMORY_PATHS.PREFERENCES_FILE, JSON.stringify(preferencesFile, null, 2));

    // Write index JSON
    await this.writeMemoryFile(MEMORY_PATHS.INDEX_FILE, JSON.stringify(this.index, null, 2));
  }

  async load(): Promise<void> {
    await this.ensureMemoryDir();

    // Load decisions
    const decisionsContent = await this.readMemoryFile(MEMORY_PATHS.DECISIONS_FILE);
    if (decisionsContent) {
      this.memory.decisions = parseDecisions(decisionsContent);
    }

    // Load patterns
    const patternsContent = await this.readMemoryFile(MEMORY_PATHS.PATTERNS_FILE);
    if (patternsContent) {
      this.memory.patterns = parsePatterns(patternsContent);
    }

    // Load failures
    const failuresContent = await this.readMemoryFile(MEMORY_PATHS.FAILURES_FILE);
    if (failuresContent) {
      this.memory.failures = parseFailures(failuresContent);
    }

    // Load preferences
    const preferencesContent = await this.readMemoryFile(MEMORY_PATHS.PREFERENCES_FILE);
    if (preferencesContent) {
      try {
        const preferencesFile = JSON.parse(preferencesContent) as PreferencesFile;
        this.memory.preferences = preferencesFile.preferences || [];
      } catch {
        this.memory.preferences = [];
      }
    }

    // Load index
    const indexContent = await this.readMemoryFile(MEMORY_PATHS.INDEX_FILE);
    if (indexContent) {
      try {
        this.index = JSON.parse(indexContent) as MemoryIndex;
      } catch {
        this.rebuildIndex();
      }
    } else {
      this.rebuildIndex();
    }

    this.notifyChange();
  }

  // =========================================================================
  // File System Helpers
  // =========================================================================

  private getAbsolutePath(relativePath: string): string {
    return path.join(this.projectRoot, relativePath);
  }

  private async ensureMemoryDir(): Promise<void> {
    const absPath = this.getAbsolutePath(MEMORY_PATHS.MEMORY_DIR);
    try {
      await fs.mkdir(absPath, { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  private async readMemoryFile(relativePath: MemoryPath): Promise<string | null> {
    const absPath = this.getAbsolutePath(relativePath);
    try {
      return await fs.readFile(absPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async writeMemoryFile(relativePath: MemoryPath, content: string): Promise<void> {
    const absPath = this.getAbsolutePath(relativePath);
    await fs.writeFile(absPath, content, 'utf-8');
  }
}

/**
 * Create a new MemoryManager instance
 */
export function createMemoryManager(projectRoot?: string): MemoryManager {
  return new MemoryManagerImpl(projectRoot);
}

/**
 * Singleton memory manager instance
 */
let globalMemoryManager: MemoryManager | null = null;

/**
 * Get the global MemoryManager instance
 */
export function getMemoryManager(projectRoot?: string): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = createMemoryManager(projectRoot);
  }
  return globalMemoryManager;
}

/**
 * Reset the global MemoryManager (useful for testing)
 */
export function resetGlobalMemoryManager(): void {
  globalMemoryManager = null;
}
