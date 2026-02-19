/**
 * State management exports.
 */

export { sessionState } from './session-state.js';
export { commandHistory, CommandHistory, type CommandHistoryEntry } from './command-history.js';
export { processManager, ProcessManager, type BackgroundProcess, type BgStartResult } from './process-manager.js';
export { searchCache, SearchCache, type SearchCacheEntry, type RefinementContext } from './search-cache.js';
export { projectIndex, ProjectIndex, type ProjectFileIndex, type FileEntry } from './project-index.js';
export { kvState, KVState, type SessionStateData } from './kv-state.js';
export { getTelemetry, Telemetry, type TelemetryRecord, type SessionSummary, type ToolStats, type TelemetryQueryFilter } from './telemetry.js';
// HooksPlaceholder and ModePlaceholder are Phase 4/5 stubs — exported for type-safe forward references
export { PrecisionRuntime, type SessionInfo, type HooksPlaceholder, type ModePlaceholder, extractMetadata, extractCacheHit } from './precision-runtime.js';
