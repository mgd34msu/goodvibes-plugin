/**
 * State management exports.
 */

export { sessionState } from './session-state.js';
export { commandHistory, CommandHistory, type CommandHistoryEntry } from './command-history.js';
export { processManager, ProcessManager, type BackgroundProcess, type BgStartResult } from './process-manager.js';
export { searchCache, SearchCache, type SearchCacheEntry, type RefinementContext } from './search-cache.js';
export { projectIndex, ProjectIndex, type ProjectFileIndex, type FileEntry } from './project-index.js';
