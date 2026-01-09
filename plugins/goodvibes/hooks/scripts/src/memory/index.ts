/* v8 ignore file */
/**
 * Memory module - aggregates all memory subsystems.
 * Provides backward compatibility with the old memory.ts API.
 */

// Path utilities
export {
  GOODVIBES_DIR,
  MEMORY_DIR,
  MEMORY_FILES,
  getGoodVibesDir,
  getMemoryDir,
  getMemoryFilePath,
} from './paths.js';
/** Memory file type enumeration for different memory categories */
export type { MemoryFileType } from './paths.js';

// Directory management
export {
  fileExists,
  ensureMemoryDir,
  ensureSecurityGitignore,
} from './directories.js';

// Re-export ensureGoodVibesDir from shared (canonical implementation)
export { ensureGoodVibesDir } from '../shared/index.js';

// CRUD modules
export { readDecisions, writeDecision } from './decisions.js';
export { readPatterns, writePattern } from './patterns.js';
export { readFailures, writeFailure } from './failures.js';
export { readPreferences, writePreference } from './preferences.js';

// Search and utilities
export {
  loadProjectMemory,
  loadMemory,
  hasMemory,
  getMemorySummary,
  searchMemory,
  formatMemoryContext,
  getCurrentDate,
} from './search.js';

// Types
import type {
  MemoryDecision,
  MemoryPattern,
  MemoryFailure,
  MemoryPreference,
  ProjectMemory,
} from '../types/memory.js';

/** Aggregated project memory containing all memory types */
export type { ProjectMemory };

/** Type aliases for backward compatibility with legacy memory API */
export type {
  MemoryDecision as Decision,
  MemoryPattern as Pattern,
  MemoryFailure as Failure,
  MemoryPreference as Preference,
} from '../types/memory.js';
// Re-export security patterns for backward compatibility
export { SECURITY_GITIGNORE_PATTERNS } from '../shared/security-patterns.js';

// Backward compatibility wrappers (re-exported from ./wrappers.js)
export {
  appendDecision,
  appendPattern,
  appendFailure,
  appendPreference,
} from './wrappers.js';
