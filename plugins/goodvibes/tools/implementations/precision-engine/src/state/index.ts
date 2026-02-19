/**
 * State management exports.
 */

export { sessionState } from './session-state.js';
export { commandHistory, CommandHistory, type CommandHistoryEntry } from './command-history.js';
export { processManager, ProcessManager, type BackgroundProcess, type BgStartResult } from './process-manager.js';
export { searchCache, SearchCache, type SearchCacheEntry, type RefinementContext } from './search-cache.js';
export { projectIndex, ProjectIndex, type ProjectFileIndex, type FileEntry } from './project-index.js';
export { getKvState, KVState, type SessionStateData } from './kv-state.js';
export { getTelemetry, Telemetry, type TelemetryRecord, type SessionSummary, type ToolStats, type TelemetryQueryFilter } from './telemetry.js';
// HooksManager is the Phase 4G hooks implementation. ModeManager is Phase 5.
export { HooksManager, HookAbortError, type HookEvent, type HookType, type HookConfig, type HookContext, type HookResult, type HookFilter } from './hooks.js';
export { ModeManager, capVerbosity, type ModeConfig, type VerbosityLevel, type ReadExtractMode, type GrepFormat } from './mode-manager.js';
export { PrecisionRuntime, type SessionInfo, extractMetadata, extractCacheHit } from './precision-runtime.js';
// Phase 5H: Agent dossier types
export {
  DossierGenerator,
  type AgentDossier,
  type DossierOptions,
  type DossierTask,
  type DossierConstraints,
  type DossierContext,
  type DossierProject,
  type DossierOutputFormat,
  type DossierDecision,
  type DossierPattern,
  type DossierFailure,
  type DossierKeyFile,
} from './dossier.js';
