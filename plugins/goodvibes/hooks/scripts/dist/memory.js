/**
 * Persistent Memory System for GoodVibes
 *
 * Stores project-specific learnings in .goodvibes/memory/:
 * - decisions.md - Architectural decisions with rationale
 * - patterns.md - Project-specific code patterns
 * - failures.md - Approaches that failed (don't repeat)
 * - preferences.md - User preferences for this project
 *
 * All operations are lazy - directories/files only created when writing.
 *
 * This file is a THIN RE-EXPORT LAYER for backward compatibility.
 * The actual implementation lives in src/memory/
 */
// Re-export everything from the modular implementation
export * from './memory/index.js';
