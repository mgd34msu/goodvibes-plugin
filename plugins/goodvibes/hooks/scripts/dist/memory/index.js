/* v8 ignore file */
/**
 * Memory module - aggregates all memory subsystems.
 *
 * IMPORTANT: This module maintains markdown-based memory files for human readability.
 * The canonical memory system is in src/core/memory.ts which uses JSON format.
 *
 * This hooks memory system provides:
 * - Markdown-based read/write for decisions, patterns, failures (human-readable)
 * - Backward compatibility with existing markdown files
 * - Migration path to core Memory class
 *
 * For new code: Use src/core/memory.ts Memory class directly.
 * This module exists for:
 * - Legacy markdown file support
 * - Human-readable memory files in .goodvibes/memory/
 * - Hook scripts that need markdown output
 */
// Path utilities
/**
 * Name of the GoodVibes configuration directory.
 * @see {@link getGoodVibesDir}
 */
export { GOODVIBES_DIR } from './paths.js';
/**
 * Name of the memory subdirectory within .goodvibes.
 * @see {@link getMemoryDir}
 */
export { MEMORY_DIR } from './paths.js';
/**
 * Mapping of memory types to their file names.
 * @see {@link getMemoryFilePath}
 */
export { MEMORY_FILES } from './paths.js';
/**
 * Gets the path to the .goodvibes directory.
 * @see paths.ts for full documentation
 */
export { getGoodVibesDir } from './paths.js';
/**
 * Gets the path to the memory directory.
 * @see paths.ts for full documentation
 */
export { getMemoryDir } from './paths.js';
/**
 * Gets the path to a specific memory file.
 * @see paths.ts for full documentation
 */
export { getMemoryFilePath } from './paths.js';
// Directory management
/** Checks if a file exists at the given path. */
export { fileExists } from './directories.js';
/** Ensures the memory directory exists (lazy creation). */
export { ensureMemoryDir } from './directories.js';
/** Ensures .gitignore has comprehensive security patterns. */
export { ensureSecurityGitignore } from './directories.js';
// Re-export ensureGoodVibesDir from shared (canonical implementation)
/** Ensures the .goodvibes directory exists with all required subdirectories. */
export { ensureGoodVibesDir } from '../shared/index.js';
// CRUD modules
/** Reads all project decisions from the memory file. */
export { readDecisions } from './decisions.js';
/** Appends a new decision to the decisions memory file. */
export { writeDecision } from './decisions.js';
/** Reads all established patterns from the memory file. */
export { readPatterns } from './patterns.js';
/** Writes a new pattern to the patterns memory file. */
export { writePattern } from './patterns.js';
/** Reads all known failures from the memory file. */
export { readFailures } from './failures.js';
/** Appends a new failure record to the failures memory file. */
export { writeFailure } from './failures.js';
/** Reads all user preferences from the memory file. */
export { readPreferences } from './preferences.js';
/** Writes or updates a preference in the preferences memory file. */
export { writePreference } from './preferences.js';
// Search and utilities
/** Loads all project memory (decisions, patterns, failures, preferences). */
export { loadProjectMemory } from './search.js';
/** Alias for loadProjectMemory for backward compatibility. */
export { loadMemory } from './search.js';
/** Checks if memory exists for a project. */
export { hasMemory } from './search.js';
/** Gets a summary of the project memory with counts for each type. */
export { getMemorySummary } from './search.js';
/** Searches memory for entries matching any of the provided keywords. */
export { searchMemory } from './search.js';
/** Formats project memory into a human-readable context string. */
export { formatMemoryContext } from './search.js';
// Re-export security patterns for backward compatibility
/** Security-critical .gitignore patterns to prevent accidental secret commits. */
export { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';
// Backward compatibility wrappers (re-exported from ./wrappers.js)
/** @deprecated Use writeDecision instead. Wrapper for backward compatibility. */
export { appendDecision } from './wrappers.js';
/** @deprecated Use writePattern instead. Wrapper for backward compatibility. */
export { appendPattern } from './wrappers.js';
/** @deprecated Use writeFailure instead. Wrapper for backward compatibility. */
export { appendFailure } from './wrappers.js';
/** @deprecated Use writePreference instead. Wrapper for backward compatibility. */
export { appendPreference } from './wrappers.js';
