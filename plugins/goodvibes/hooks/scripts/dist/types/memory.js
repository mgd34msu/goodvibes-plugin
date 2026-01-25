/**
 * Type definitions for project memory data.
 *
 * IMPORTANT: These types represent the MARKDOWN format for memory files.
 * The canonical memory system is in src/core/memory.ts with JSON format.
 *
 * Core types (JSON format):
 * - Decision: {id, date, category, what, why, scope, confidence, status}
 * - Pattern: {id, name, description, when_to_use, example_files, keywords}
 * - Failure: {id, date, error, context, root_cause, resolution, prevention, keywords}
 *
 * These hooks types are for markdown I/O only. They map to core types via:
 * - MemoryDecision.title -> Decision.what
 * - MemoryDecision.rationale -> Decision.why
 * - MemoryPattern -> Pattern (similar schema)
 * - MemoryFailure.approach -> Failure.error
 * - MemoryFailure.reason -> Failure.root_cause
 */
export {};
