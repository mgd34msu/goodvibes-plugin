/**
 * Batch handlers
 *
 * Provides batch/bulk operations for efficient multi-file handling:
 * - batch_read: Read multiple files in a single call with per-file precision (offset/limit)
 * - smart_glob: Glob with intelligent filtering and output control
 * - grep_with_content: Search with configurable context output
 *
 * @module handlers/batch
 */

// Batch Read
export { handleBatchRead } from './batch-read.js';
export type {
  BatchReadArgs,
  OutputMode as BatchReadOutputMode,
  FileReadRequest,
  FileReadRange,
  FileReadResult,
} from './batch-read.js';

// Smart Glob
export { handleSmartGlob } from './smart-glob.js';
export type {
  SmartGlobArgs,
  OutputMode as SmartGlobOutputMode,
  PreviewConfig,
  FilePreview,
} from './smart-glob.js';

// Grep With Content
export { handleGrepWithContent } from './grep-with-content.js';
export type {
  GrepWithContentArgs,
  OutputMode as GrepWithContentOutputMode,
  LineRange,
} from './grep-with-content.js';
