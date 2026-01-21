/**
 * Memory Files interfaces for Batch Engine
 * @see SPEC-v2 Sections 8.2-8.3
 */

import type {
  Decision,
  Pattern,
  Failure,
  Preference,
  DecisionCategory,
} from './memory.js';

// Re-export types from memory.ts for convenience
export type { Decision, Pattern, Failure, Preference, DecisionCategory };

/**
 * Memory file paths structure (Section 8.2):
 *
 * .goodvibes/
 * └── memory/
 *     ├── decisions.md           # Markdown with structured entries
 *     ├── patterns.md            # Markdown with structured entries
 *     ├── failures.md            # Markdown with structured entries
 *     ├── preferences.json       # JSON for preferences
 *     └── index.json             # Search index
 */
export const MEMORY_PATHS = {
  MEMORY_DIR: '.goodvibes/memory',
  DECISIONS_FILE: '.goodvibes/memory/decisions.md',
  PATTERNS_FILE: '.goodvibes/memory/patterns.md',
  FAILURES_FILE: '.goodvibes/memory/failures.md',
  PREFERENCES_FILE: '.goodvibes/memory/preferences.json',
  INDEX_FILE: '.goodvibes/memory/index.json',
} as const;

export type MemoryPath = typeof MEMORY_PATHS[keyof typeof MEMORY_PATHS];

/**
 * Memory format for markdown files (Section 8.3)
 *
 * Example decision format in decisions.md:
 *
 * # Decisions
 *
 * ## Decision: Use Zustand for state management
 * - **ID**: dec_20240120_001
 * - **Date**: 2024-01-20T14:30:22Z
 * - **Category**: library
 * - **Confidence**: high
 *
 * ### What
 * Use Zustand instead of Redux for client-side state management.
 *
 * ### Why
 * - Simpler API with less boilerplate
 * - Better TypeScript support out of the box
 * - Smaller bundle size (2KB vs 7KB)
 * - No need for middleware for async operations
 *
 * ### Scope
 * - Files: src/store/*.ts
 * - Symbols: useStore, createStore
 *
 * ### Status
 * Active
 *
 * ---
 */

/**
 * Index entry for fast memory search
 * @see SPEC-v2 Section 8.2
 */
export interface MemoryIndexEntry {
  id: string;
  keywords: string[];
  timestamp: string;
  category?: string;
}

/**
 * Search index stored in index.json
 * @see SPEC-v2 Section 8.2
 */
export interface MemoryIndex {
  decisions: MemoryIndexEntry[];
  patterns: MemoryIndexEntry[];
  failures: MemoryIndexEntry[];
  last_updated: string;
}

/**
 * Preferences file structure
 * @see SPEC-v2 Section 8.2
 */
export interface PreferencesFile {
  preferences: Preference[];
  last_updated: string;
}

/**
 * File manager for reading/writing memory files
 * @see SPEC-v2 Section 8.2
 */
export interface MemoryFileManager {
  /**
   * Ensure the memory directory structure exists
   */
  ensureMemoryDir(): Promise<void>;

  /**
   * Read content from a memory file
   * @param path - The memory file path
   * @returns File content or null if file doesn't exist
   */
  readMemoryFile(path: MemoryPath): Promise<string | null>;

  /**
   * Write content to a memory file (overwrites existing)
   * @param path - The memory file path
   * @param content - Content to write
   */
  writeMemoryFile(path: MemoryPath, content: string): Promise<void>;

  /**
   * Append content to a memory file
   * @param path - The memory file path
   * @param content - Content to append
   */
  appendToMemoryFile(path: MemoryPath, content: string): Promise<void>;

  /**
   * Get the current memory index
   * @returns The memory index or empty index if not exists
   */
  getIndex(): Promise<MemoryIndex>;

  /**
   * Update the memory index
   * @param index - The new index to save
   */
  updateIndex(index: MemoryIndex): Promise<void>;

  /**
   * Get preferences from the preferences file
   * @returns Preferences file content or empty preferences
   */
  getPreferences(): Promise<PreferencesFile>;

  /**
   * Update the preferences file
   * @param preferences - The preferences to save
   */
  updatePreferences(preferences: PreferencesFile): Promise<void>;
}

/**
 * Formatter for converting between TypeScript objects and markdown format
 * @see SPEC-v2 Section 8.3
 */
export interface MemoryFormatter {
  /**
   * Format a decision as markdown
   * @param decision - The decision to format
   * @returns Markdown string
   */
  formatDecision(decision: Decision): string;

  /**
   * Format a pattern as markdown
   * @param pattern - The pattern to format
   * @returns Markdown string
   */
  formatPattern(pattern: Pattern): string;

  /**
   * Format a failure as markdown
   * @param failure - The failure to format
   * @returns Markdown string
   */
  formatFailure(failure: Failure): string;

  /**
   * Parse decisions from markdown content
   * @param content - Markdown content
   * @returns Array of parsed decisions
   */
  parseDecisions(content: string): Decision[];

  /**
   * Parse patterns from markdown content
   * @param content - Markdown content
   * @returns Array of parsed patterns
   */
  parsePatterns(content: string): Pattern[];

  /**
   * Parse failures from markdown content
   * @param content - Markdown content
   * @returns Array of parsed failures
   */
  parseFailures(content: string): Failure[];

  /**
   * Format the full decisions file header
   * @returns Markdown header for decisions file
   */
  formatDecisionsHeader(): string;

  /**
   * Format the full patterns file header
   * @returns Markdown header for patterns file
   */
  formatPatternsHeader(): string;

  /**
   * Format the full failures file header
   * @returns Markdown header for failures file
   */
  formatFailuresHeader(): string;
}

/**
 * Confidence levels for decisions
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Decision status values
 */
export type DecisionStatus = 'active' | 'superseded' | 'reverted';

/**
 * Pattern example with file location
 */
export interface PatternExample {
  file: string;
  lines: [number, number];
  code?: string;
}

/**
 * Empty index for initialization
 */
export const EMPTY_INDEX: MemoryIndex = {
  decisions: [],
  patterns: [],
  failures: [],
  last_updated: new Date().toISOString(),
};

/**
 * Empty preferences file for initialization
 */
export const EMPTY_PREFERENCES: PreferencesFile = {
  preferences: [],
  last_updated: new Date().toISOString(),
};

/**
 * Memory file type mapping
 */
export const MEMORY_FILE_TYPES = {
  [MEMORY_PATHS.DECISIONS_FILE]: 'decisions',
  [MEMORY_PATHS.PATTERNS_FILE]: 'patterns',
  [MEMORY_PATHS.FAILURES_FILE]: 'failures',
  [MEMORY_PATHS.PREFERENCES_FILE]: 'preferences',
  [MEMORY_PATHS.INDEX_FILE]: 'index',
} as const;

export type MemoryFileType = typeof MEMORY_FILE_TYPES[keyof typeof MEMORY_FILE_TYPES];
